// =============================================================================
// voice-token — LiveKit access tokens for voice comms (MAF-070/071/074)
// =============================================================================
// The app calls this with its normal Supabase JWT. The function verifies the
// caller, checks they are allowed in the requested voice channel (same
// eligibility rules as the chat RLS), derives publish permissions from the
// game phase, and returns a short-lived LiveKit access token.
//
// Voice rooms (names namespaced so nothing collides):
//   lobby_<roomCode>       — everyone in the room, any status.
//   game_<gameId>_day      — participants; living players may speak. At night
//                            and role_reveal publish is withheld (MAF-074).
//   game_<gameId>_mafia    — mafia-only (alive or dead), mirrors chat RLS.
//   game_<gameId>_ghost    — dead players only.
//
// Secrets (set via `supabase secrets set`): LIVEKIT_URL, LIVEKIT_API_KEY,
// LIVEKIT_API_SECRET.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const TOKEN_TTL_SECONDS = 60 * 60 * 6; // 6h max; clients re-request on reconnect.

interface TokenRequest {
  room_id?: string; // rooms.id — required for lobby
  game_id?: string; // games.id — required for game channels
  channel?: 'lobby' | 'day' | 'mafia' | 'ghost';
}

// ---------------------------------------------------------------------------
// Minimal HS256 JWT for LiveKit access tokens (Web Crypto, no deps).
// LiveKit expects: iss = API key, sub = identity, video = { roomJoin, ... }.
// ---------------------------------------------------------------------------
function b64url(bytes: Uint8Array | ArrayBuffer): string {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for (const b of arr) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function b64urlString(s: string): string {
  return b64url(new TextEncoder().encode(s));
}

async function hmacSha256(secret: string, data: string): Promise<ArrayBuffer> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  return crypto.subtle.sign('HMAC', key, new TextEncoder().encode(data));
}

interface LiveKitVideoGrant {
  roomJoin: boolean;
  room: string;
  canPublish: boolean;
  canSubscribe: boolean;
  canPublishData: boolean;
  canPublishSources?: string[];
  roomAdmin?: boolean;
  hidden?: boolean;
}

async function createLiveKitToken(
  apiKey: string,
  apiSecret: string,
  identity: string,
  displayName: string,
  grant: LiveKitVideoGrant
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload = {
    iss: apiKey,
    sub: identity,
    name: displayName,
    iat: now,
    nbf: now - 10,
    exp: now + TOKEN_TTL_SECONDS,
    video: grant,
  };
  const signingInput = `${b64urlString(JSON.stringify(header))}.${b64urlString(JSON.stringify(payload))}`;
  const sig = await hmacSha256(apiSecret, signingInput);
  return `${signingInput}.${b64url(sig)}`;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

const NIGHT_PHASES = new Set(['night', 'role_reveal']);

function json(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed');
  }

  const livekitUrl = Deno.env.get('LIVEKIT_URL') ?? '';
  const apiKey = Deno.env.get('LIVEKIT_API_KEY') ?? '';
  const apiSecret = Deno.env.get('LIVEKIT_API_SECRET') ?? '';
  if (!livekitUrl || !apiKey || !apiSecret) {
    return jsonError(503, 'Voice is not configured');
  }

  // 1. Verify the caller's Supabase JWT.
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: userError,
  } = await userClient.auth.getUser();
  if (userError || !user) {
    return jsonError(401, 'Unauthorized');
  }

  let body: TokenRequest;
  try {
    body = (await req.json()) as TokenRequest;
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const channel = body.channel ?? 'lobby';
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  // 2. Eligibility + identity + publish rules per channel.
  let roomName: string;
  let canPublish = false;
  let identity = user.id;
  let displayName = 'Player';

  if (channel === 'lobby') {
    if (!body.room_id) return jsonError(400, 'room_id is required for lobby voice');

    const { data: membership } = await admin
      .from('room_players')
      .select('is_bot, bot_name, is_host, user_id')
      .eq('room_id', body.room_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!membership || membership.is_bot) {
      return jsonError(403, 'Not in this room');
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();
    displayName = profile?.username ?? 'Player';

    const { data: room } = await admin
      .from('rooms')
      .select('code, status')
      .eq('id', body.room_id)
      .maybeSingle();
    if (!room) return jsonError(404, 'Room not found');

    roomName = `lobby_${room.code}`;
    canPublish = true;
  } else {
    if (!body.game_id) return jsonError(400, 'game_id is required for game voice');
    if (channel !== 'day' && channel !== 'mafia' && channel !== 'ghost') {
      return jsonError(400, 'Unknown channel');
    }

    const { data: seat } = await admin
      .from('game_players')
      .select('id, is_bot, is_alive, role, bot_name')
      .eq('game_id', body.game_id)
      .eq('user_id', user.id)
      .maybeSingle();
    if (!seat || seat.is_bot) {
      return jsonError(403, 'Not a participant of this game');
    }

    const { data: profile } = await admin
      .from('profiles')
      .select('username')
      .eq('id', user.id)
      .maybeSingle();
    displayName = profile?.username ?? 'Player';

    const { data: game } = await admin
      .from('games')
      .select('phase')
      .eq('id', body.game_id)
      .maybeSingle();
    if (!game) return jsonError(404, 'Game not found');

    if (channel === 'day') {
      roomName = `game_${body.game_id}_day`;
      // Living players speak; dead players join to listen. Everyone muted
      // during night/role_reveal (MAF-074 phase-based rules).
      canPublish = seat.is_alive && !NIGHT_PHASES.has(game.phase);
    } else if (channel === 'mafia') {
      if (seat.role !== 'mafia') return jsonError(403, 'Mafia channel only');
      roomName = `game_${body.game_id}_mafia`;
      // Mafia coordinate at night too; dead mafia may listen.
      canPublish = seat.is_alive;
    } else {
      if (seat.is_alive) return jsonError(403, 'Ghost channel only');
      roomName = `game_${body.game_id}_ghost`;
      canPublish = true;
    }

    identity = `${user.id}:${channel}`; // allow simultaneous day + ghost rooms
  }

  // 3. Issue the token.
  const token = await createLiveKitToken(apiKey, apiSecret, identity, displayName, {
    roomJoin: true,
    room: roomName,
    canPublish,
    canSubscribe: true,
    canPublishData: canPublish,
  });

  return json({ url: livekitUrl, token, room: roomName, can_publish: canPublish });
});

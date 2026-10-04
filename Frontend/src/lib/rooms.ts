import { supabase } from './supabase';
import type { Database, RoomStatus } from '../types/database';

export type Room = Database['public']['Tables']['rooms']['Row'];
export type RoomPlayer = Database['public']['Tables']['room_players']['Row'];
export type RoomSettings = Database['public']['Tables']['room_settings']['Row'];

export interface LobbyPlayer extends RoomPlayer {
  // Joined from profiles; not columns on room_players. is_bot/bot_name/bot_avatar
  // are already on RoomPlayer (Row), so they must not be redeclared here.
  username?: string;
  avatar_url?: string | null;
}

export interface LobbyFriendItem {
  id: string;
  username: string;
  avatar_url: string | null;
}

export interface PublicRoomItem extends Room {
  player_count: number;
  host_username?: string;
}

export interface CreateRoomParams {
  name: string;
  isPublic: boolean;
  maxPlayers: number;
  settings?: Partial<RoomSettings>;
}

/** Generates a 5-character alphanumeric uppercase code (omits easily confused letters like 0/O, 1/I) */
export function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Creates a new game room, registers the host as the first player, and seeds default room settings.
 */
export async function createRoom({
  name,
  isPublic,
  maxPlayers,
  settings,
}: CreateRoomParams): Promise<{ room: Room; settings: RoomSettings }> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be signed in to create a room.');
  }

  // Generate unique room code
  let code = generateRoomCode();
  let attempts = 0;
  while (attempts < 5) {
    const { data: existing } = await supabase
      .from('rooms')
      .select('id')
      .eq('code', code)
      .maybeSingle();

    if (!existing) break;
    code = generateRoomCode();
    attempts++;
  }

  const trimmedName = name.trim() || `${user.user_metadata?.username || 'Operative'}'s Room`;
  const sanitizedMax = Math.min(Math.max(Number(maxPlayers) || 10, 4), 20);

  // 1. Insert room
  const { data: newRoom, error: roomError } = await supabase
    .from('rooms')
    .insert({
      code,
      name: trimmedName,
      host_id: user.id,
      is_public: isPublic,
      status: 'lobby' as RoomStatus,
      max_players: sanitizedMax,
    })
    .select()
    .single();

  if (roomError || !newRoom) {
    throw new Error(roomError?.message || 'Failed to initialize room.');
  }

  // 2. Insert host into room_players
  const { error: playerError } = await supabase.from('room_players').insert({
    room_id: newRoom.id,
    user_id: user.id,
    is_host: true,
    is_ready: true,
  });

  if (playerError) {
    // Attempt cleanup if player insertion failed
    await supabase.from('rooms').delete().eq('id', newRoom.id);
    throw new Error(playerError.message || 'Failed to join host to room.');
  }

  // 3. Insert default room settings
  const mafiaCount = Math.max(1, Math.floor(sanitizedMax / 4));
  // Defense-in-depth mafia_count validation. The backend is authoritative, but
  // avoid ever sending obviously invalid values: ensure 1 <= mafia_count <
  // player_capacity, and that mafia + enabled special town roles still leave
  // room for at least one villager.
  const doctorEnabled = settings?.doctor_enabled ?? true;
  const detectiveEnabled = settings?.detective_enabled ?? true;
  const enabledSpecialRoles = (doctorEnabled ? 1 : 0) + (detectiveEnabled ? 1 : 0);
  const maxMafia = Math.max(1, sanitizedMax - enabledSpecialRoles - 1);
  const requestedMafia = Math.floor(Number(settings?.mafia_count ?? mafiaCount) || mafiaCount);
  const safeMafiaCount = Math.min(Math.max(1, requestedMafia), maxMafia);
  const { data: newSettings, error: settingsError } = await supabase
    .from('room_settings')
    .insert({
      room_id: newRoom.id,
      mafia_count: safeMafiaCount,
      doctor_enabled: doctorEnabled,
      detective_enabled: detectiveEnabled,
      night_duration_seconds: settings?.night_duration_seconds ?? 30,
      discussion_duration_seconds: settings?.discussion_duration_seconds ?? 90,
      voting_duration_seconds: settings?.voting_duration_seconds ?? 30,
      narrator_enabled: settings?.narrator_enabled ?? true,
      voice_enabled: settings?.voice_enabled ?? true,
      reveal_role_on_death: settings?.reveal_role_on_death ?? true,
    })
    .select()
    .single();

  if (settingsError || !newSettings) {
    // Fallback: return default settings object
    return {
      room: newRoom,
      settings: {
        room_id: newRoom.id,
        mafia_count: safeMafiaCount,
        doctor_enabled: doctorEnabled,
        detective_enabled: detectiveEnabled,
        night_duration_seconds: 30,
        discussion_duration_seconds: 90,
        voting_duration_seconds: 30,
        narrator_enabled: true,
        voice_enabled: true,
        reveal_role_on_death: true,
        updated_at: new Date().toISOString(),
      },
    };
  }

  return { room: newRoom, settings: newSettings };
}

/**
 * Looks up an active room by code and joins the current authenticated user.
 */
export async function joinRoomByCode(rawCode: string): Promise<Room> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be signed in to join a room.');
  }

  const code = rawCode.trim().toUpperCase();
  if (code.length !== 5) {
    throw new Error('Room codes must be exactly 5 characters long.');
  }

  // Atomic server-side join. Capacity, lobby-status, and duplicate checks all
  // happen inside the RPC under a row lock, eliminating the client-side
  // fetch -> count -> capacity-check -> insert TOCTOU race. The RPC is
  // idempotent (returns the existing membership row if already joined) and
  // RAISES named errors that we map to the same friendly messages below.
  const { error: rpcError } = await supabase.rpc('join_room_atomic', {
    p_room_code: code,
  });

  if (rpcError) {
    const message = (rpcError.message || '').toLowerCase();
    if (message.includes('room_not_found')) {
      throw new Error('No active room found with this code.');
    }
    if (message.includes('not_in_lobby')) {
      throw new Error('This operation has already started or concluded.');
    }
    if (message.includes('room_full')) {
      throw new Error('This room is currently full.');
    }
    // 'already_joined' is not a failure from the UI's perspective (the original
    // client-side logic also treated being already in the room as success), so
    // we fall through and simply return the room below.
    if (!message.includes('already_joined')) {
      throw new Error('Failed to join room.');
    }
  }

  // Return the joined room so callers receive the unchanged Room shape.
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (roomError || !room) {
    throw new Error('No active room found with this code.');
  }

  return room;
}

/**
 * Fetches all public rooms waiting in lobby status along with live player counts.
 */
export async function fetchPublicRooms(): Promise<PublicRoomItem[]> {
  const { data: rooms, error: roomsError } = await supabase
    .from('rooms')
    .select('*, host:profiles!rooms_host_id_fkey(username)')
    .eq('is_public', true)
    .eq('status', 'lobby')
    .order('created_at', { ascending: false })
    .limit(20);

  // Distinguish a real fetch failure from a genuinely empty result: throw on
  // error so the UI can show a retry state instead of an empty list.
  if (roomsError) {
    throw new Error(roomsError.message || 'Failed to load public rooms.');
  }
  if (!rooms || rooms.length === 0) {
    return [];
  }

  // Fetch player counts for each public room
  const roomIds = rooms.map((r) => r.id);
  if (roomIds.length === 0) return [];

  const { data: playerRows, error: playersError } = await supabase
    .from('room_players')
    .select('room_id')
    .in('room_id', roomIds);

  if (playersError) {
    throw new Error(playersError.message || 'Failed to load room occupancy.');
  }

  const countMap: Record<string, number> = {};
  for (const row of playerRows ?? []) {
    countMap[row.room_id] = (countMap[row.room_id] || 0) + 1;
  }

  return rooms.map((r: any) => ({
    ...r,
    player_count: countMap[r.id] ?? 0,
    host_username: r.host?.username || 'Host',
  }));
}

/**
 * Fetches all players in a room along with their profiles and bot details.
 */
export async function fetchLobbyPlayers(roomId: string): Promise<LobbyPlayer[]> {
  const { data: players, error } = await supabase
    .from('room_players')
    .select('*, profile:profiles!room_players_user_id_fkey(username, avatar_url)')
    .eq('room_id', roomId)
    .order('joined_at', { ascending: true });

  if (error || !players) {
    return [];
  }

  return players.map((p: any) => ({
    id: p.id,
    room_id: p.room_id,
    user_id: p.user_id,
    is_ready: p.is_bot ? true : (p.is_ready ?? false),
    is_host: p.is_host ?? false,
    is_bot: p.is_bot ?? false,
    bot_name: p.bot_name || null,
    bot_avatar: p.bot_avatar || null,
    joined_at: p.joined_at,
    last_seen_at: p.last_seen_at,
    username: p.is_bot ? (p.bot_name || 'Bot Player') : (p.profile?.username || 'Player'),
    avatar_url: p.is_bot ? (p.bot_avatar || 'detective') : (p.profile?.avatar_url || null),
  }));
}

/**
 * Sets player ready state.
 */
export async function setPlayerReady(roomId: string, isReady: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  await supabase
    .from('room_players')
    .update({ is_ready: isReady, last_seen_at: new Date().toISOString() })
    .eq('room_id', roomId)
    .eq('user_id', user.id);
}

/**
 * Adds an AI/bot player to the room (Host only).
 */
export async function addBotToRoom(
  roomId: string,
  botName?: string,
  botAvatar?: string
): Promise<void> {
  // Atomic server-side validation (verifies caller is the host, capacity, etc.).
  const { error: rpcError } = await supabase.rpc('add_bot_to_room', {
    p_room_id: roomId,
    p_bot_name: botName || 'Bot Player',
    p_bot_avatar: botAvatar || 'detective',
  });

  // SECURITY: do NOT fall back to a raw room_players insert on RPC error — that
  // would bypass the server-side host authorization the RPC enforces. Surface
  // the failure instead.
  if (rpcError) {
    throw new Error(rpcError.message || 'Failed to add bot to room.');
  }
}

/**
 * Removes an AI/bot player from the room (Host only).
 */
export async function removeBotFromRoom(roomId: string, botPlayerId: string): Promise<void> {
  const { error: rpcError } = await supabase.rpc('remove_bot_from_room', {
    p_room_id: roomId,
    p_player_id: botPlayerId,
  });

  // SECURITY: do NOT fall back to a raw room_players delete on RPC error — that
  // would bypass the server-side host authorization the RPC enforces. Surface
  // the failure instead.
  if (rpcError) {
    throw new Error(rpcError.message || 'Failed to remove bot from room.');
  }
}

/**
 * Fetches user friends from friendships table for in-lobby invitations.
 */
export async function fetchUserFriends(): Promise<LobbyFriendItem[]> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Query friendships where user is user_id or friend_id
  const { data: friendships, error: friendError } = await supabase
    .from('friendships')
    .select('user_id, friend_id')
    .or(`user_id.eq.${user.id},friend_id.eq.${user.id}`);

  if (friendError || !friendships || friendships.length === 0) {
    return [];
  }

  const friendIds = Array.from(
    new Set(friendships.map((f) => (f.user_id === user.id ? f.friend_id : f.user_id)))
  );

  if (friendIds.length === 0) return [];

  const { data: profiles, error: profileError } = await supabase
    .from('profiles')
    .select('id, username, avatar_url')
    .in('id', friendIds);

  if (profileError || !profiles) return [];

  return profiles.map((p) => ({
    id: p.id,
    username: p.username || 'Friend',
    avatar_url: p.avatar_url || null,
  }));
}

/**
 * Leaves a room. If host leaves, passes host or closes room.
 */
export async function leaveRoom(roomId: string, isHost: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  // TODO(security/correctness): this performs several non-atomic writes (host
  // reassignment + self-removal) that can leave a room half-updated if one
  // fails. This should move to a SECURITY DEFINER RPC so the whole leave/
  // host-handoff runs atomically under a row lock. Until then, each write's
  // error is checked so failures surface loudly instead of being swallowed.
  if (isHost) {
    // If host leaves, check if there are other players to promote
    const { data: remaining } = await supabase
      .from('room_players')
      .select('id, user_id, is_bot')
      .eq('room_id', roomId)
      .neq('user_id', user.id)
      .eq('is_bot', false)
      .order('joined_at', { ascending: true })
      .limit(1);

    if (remaining && remaining.length > 0 && remaining[0].user_id) {
      const newHost = remaining[0];
      // Promote the new host BEFORE removing ourselves so a mid-sequence
      // failure never leaves the room hostless.
      const { error: roomUpdateError } = await supabase
        .from('rooms')
        .update({ host_id: newHost.user_id as string })
        .eq('id', roomId);
      if (roomUpdateError) {
        throw new Error(roomUpdateError.message || 'Failed to reassign host on leave.');
      }

      const { error: promoteError } = await supabase
        .from('room_players')
        .update({ is_host: true })
        .eq('id', newHost.id);
      if (promoteError) {
        throw new Error(promoteError.message || 'Failed to promote new host on leave.');
      }

      const { error: leaveError } = await supabase
        .from('room_players')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', user.id);
      if (leaveError) {
        throw new Error(leaveError.message || 'Failed to leave room.');
      }
    } else {
      // No other human players, mark room abandoned
      const { error: abandonError } = await supabase
        .from('rooms')
        .update({ status: 'abandoned' })
        .eq('id', roomId);
      if (abandonError) {
        throw new Error(abandonError.message || 'Failed to close room.');
      }

      const { error: leaveError } = await supabase
        .from('room_players')
        .delete()
        .eq('room_id', roomId)
        .eq('user_id', user.id);
      if (leaveError) {
        throw new Error(leaveError.message || 'Failed to leave room.');
      }
    }
  } else {
    const { error: leaveError } = await supabase
      .from('room_players')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', user.id);
    if (leaveError) {
      throw new Error(leaveError.message || 'Failed to leave room.');
    }
  }
}

/**
 * Transfers host leadership of a room to another player.
 */
export async function transferHost(
  roomId: string,
  currentHostId: string,
  newHostUserId: string
): Promise<void> {
  // TODO(security/correctness): the rooms update + two room_players flag updates
  // below are not atomic and should move to a SECURITY DEFINER RPC that performs
  // the whole host transfer under a row lock. Until then we (a) derive the
  // current host from the authenticated user rather than trusting the passed-in
  // currentHostId, (b) verify the guarded rooms update actually matched a row
  // before touching any is_host flags, and (c) check each write individually
  // instead of firing-and-forgetting via Promise.all.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    throw new Error('You must be signed in to transfer host.');
  }

  // The authenticated user is the source of truth for "who is the current host".
  // The passed-in currentHostId is intentionally NOT trusted for the ownership
  // guard (kept in the signature for caller compatibility only).
  const effectiveCurrentHostId = user.id;

  // Guarded ownership update: only matches when this user actually still owns
  // the room. Request the affected rows so we can detect a 0-row (no-op) update.
  const { data: updatedRooms, error: roomError } = await supabase
    .from('rooms')
    .update({ host_id: newHostUserId, updated_at: new Date().toISOString() })
    .eq('id', roomId)
    .eq('host_id', effectiveCurrentHostId)
    .select('id');

  if (roomError) throw new Error(roomError.message || 'Failed to transfer host.');

  // Zero rows matched -> caller is not the current host (or the room is gone).
  // ABORT without flipping any is_host flags to avoid a split-brain state.
  if (!updatedRooms || updatedRooms.length === 0) {
    throw new Error('Only the current host can transfer host, or the room no longer exists.');
  }

  // Ownership change confirmed applied — now flip the is_host flags, checking
  // each write individually.
  const { error: demoteError } = await supabase
    .from('room_players')
    .update({ is_host: false })
    .eq('room_id', roomId)
    .eq('user_id', effectiveCurrentHostId);

  if (demoteError) throw new Error(demoteError.message || 'Failed to update host flags.');

  const { error: promoteError } = await supabase
    .from('room_players')
    .update({ is_host: true })
    .eq('room_id', roomId)
    .eq('user_id', newHostUserId);

  if (promoteError) throw new Error(promoteError.message || 'Failed to update host flags.');
}

/**
 * Kicks/removes a player (or bot) from the room (Host only).
 */
export async function kickPlayer(
  roomId: string,
  targetUserId?: string | null,
  targetPlayerId?: string
): Promise<void> {
  if (targetUserId) {
    const { error } = await supabase
      .from('room_players')
      .delete()
      .eq('room_id', roomId)
      .eq('user_id', targetUserId);

    if (error) throw new Error(error.message || 'Failed to remove player.');
  } else if (targetPlayerId) {
    const { error } = await supabase
      .from('room_players')
      .delete()
      .eq('room_id', roomId)
      .eq('id', targetPlayerId);

    if (error) throw new Error(error.message || 'Failed to remove player.');
  }
}

/**
 * Fetches current room settings.
 */
export async function fetchRoomSettings(roomId: string): Promise<RoomSettings | null> {
  const { data, error } = await supabase
    .from('room_settings')
    .select('*')
    .eq('room_id', roomId)
    .maybeSingle();

  // Distinguish a real fetch failure from a room that genuinely has no settings
  // row yet: throw on error, return null only for the true empty case.
  if (error) throw new Error(error.message || 'Failed to load room settings.');
  return data ?? null;
}

/**
 * Updates room settings (Host only).
 */
export async function updateRoomSettings(
  roomId: string,
  settings: Partial<Omit<RoomSettings, 'room_id'>>
): Promise<RoomSettings> {
  const { ...updatePayload } = settings;
  const { data, error } = await supabase
    .from('room_settings')
    .update({
      ...updatePayload,
      updated_at: new Date().toISOString(),
    } as never)
    .eq('room_id', roomId)
    .select()
    .single();

  if (error || !data) throw new Error(error?.message || 'Failed to update game rules.');
  return data as RoomSettings;
}

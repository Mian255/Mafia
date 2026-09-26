import { supabase } from './supabase';
import type { Database, RoomStatus } from '../types/database';

export type Room = Database['public']['Tables']['rooms']['Row'];
export type RoomPlayer = Database['public']['Tables']['room_players']['Row'];
export type RoomSettings = Database['public']['Tables']['room_settings']['Row'];

export interface LobbyPlayer extends RoomPlayer {
  username?: string;
  avatar_url?: string | null;
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
  const { data: newSettings, error: settingsError } = await supabase
    .from('room_settings')
    .insert({
      room_id: newRoom.id,
      mafia_count: settings?.mafia_count ?? mafiaCount,
      doctor_enabled: settings?.doctor_enabled ?? true,
      detective_enabled: settings?.detective_enabled ?? true,
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
        mafia_count: mafiaCount,
        doctor_enabled: true,
        detective_enabled: true,
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

  // 1. Fetch the room
  const { data: room, error: roomError } = await supabase
    .from('rooms')
    .select('*')
    .eq('code', code)
    .maybeSingle();

  if (roomError || !room) {
    throw new Error('No active room found with this code.');
  }

  if (room.status !== 'lobby') {
    throw new Error('This operation has already started or concluded.');
  }

  // 2. Check current player count
  const { data: players, error: countError } = await supabase
    .from('room_players')
    .select('user_id')
    .eq('room_id', room.id);

  if (countError) {
    throw new Error('Unable to verify room occupancy.');
  }

  const alreadyInRoom = players.some((p) => p.user_id === user.id);
  if (!alreadyInRoom && players.length >= room.max_players) {
    throw new Error('This room is currently full.');
  }

  // 3. Join player if not already in room
  if (!alreadyInRoom) {
    const { error: joinError } = await supabase.from('room_players').insert({
      room_id: room.id,
      user_id: user.id,
      is_host: false,
      is_ready: false,
    });

    if (joinError) {
      throw new Error(joinError.message || 'Failed to join room.');
    }
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

  if (roomsError || !rooms) {
    return [];
  }

  // Fetch player counts for each public room
  const roomIds = rooms.map((r) => r.id);
  if (roomIds.length === 0) return [];

  const { data: playerRows } = await supabase
    .from('room_players')
    .select('room_id')
    .in('room_id', roomIds);

  const countMap: Record<string, number> = {};
  for (const row of playerRows ?? []) {
    countMap[row.room_id] = (countMap[row.room_id] || 0) + 1;
  }

  return rooms.map((r: any) => ({
    ...r,
    player_count: countMap[r.id] || 1,
    host_username: r.host?.username || 'Host',
  }));
}

/**
 * Fetches all players in a room along with their profiles.
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
    is_ready: p.is_ready,
    is_host: p.is_host,
    joined_at: p.joined_at,
    last_seen_at: p.last_seen_at,
    username: p.profile?.username || 'Operative',
    avatar_url: p.profile?.avatar_url || null,
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
 * Leaves a room. If host leaves, passes host or closes room.
 */
export async function leaveRoom(roomId: string, isHost: boolean): Promise<void> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;

  if (isHost) {
    // If host leaves, check if there are other players to promote
    const { data: remaining } = await supabase
      .from('room_players')
      .select('id, user_id')
      .eq('room_id', roomId)
      .neq('user_id', user.id)
      .order('joined_at', { ascending: true })
      .limit(1);

    if (remaining && remaining.length > 0) {
      const newHost = remaining[0];
      await Promise.all([
        supabase.from('rooms').update({ host_id: newHost.user_id }).eq('id', roomId),
        supabase.from('room_players').update({ is_host: true }).eq('id', newHost.id),
        supabase.from('room_players').delete().eq('room_id', roomId).eq('user_id', user.id),
      ]);
    } else {
      // No other players, mark room abandoned
      await Promise.all([
        supabase.from('rooms').update({ status: 'abandoned' }).eq('id', roomId),
        supabase.from('room_players').delete().eq('room_id', roomId).eq('user_id', user.id),
      ]);
    }
  } else {
    await supabase.from('room_players').delete().eq('room_id', roomId).eq('user_id', user.id);
  }
}

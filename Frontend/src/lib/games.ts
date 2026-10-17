import { supabase } from './supabase';
import type { Database, ChatChannel } from '../types/database';

// Row aliases derived from the generated Database types (mirrors src/lib/rooms.ts).
export type GameRow = Database['public']['Tables']['games']['Row'];
export type GamePlayerRow = Database['public']['Tables']['game_players']['Row'];
export type GamePlayerViewRow = Database['public']['Views']['game_players_view']['Row'];
export type MessageRow = Database['public']['Tables']['messages']['Row'];
export type GameEventRow = Database['public']['Tables']['game_events']['Row'];

/**
 * A seat in the game, from the role-masking game_players_view, enriched with the
 * player's display name/avatar. Bots (user_id === null) fall back to their
 * bot_name/bot_avatar, mirroring fetchLobbyPlayers in rooms.ts.
 */
export interface GamePlayerView extends GamePlayerViewRow {
  username: string;
  avatar_url: string | null;
}

/** A chat message enriched with the sender's display name/avatar. */
export interface ChatMessage extends MessageRow {
  username: string;
  avatar_url: string | null;
  /** True for AI bot messages (no profile behind them). */
  isBot: boolean;
}

// Maps a start_game RPC error (RAISEd named exceptions) to a friendly message,
// following the join_room_atomic error-mapping template in rooms.ts.
function mapStartGameError(rawMessage: string): string {
  const message = (rawMessage || '').toLowerCase();
  if (message.includes('not_authenticated')) return 'You must be signed in to start the game.';
  if (message.includes('room_not_found')) return 'This room no longer exists.';
  if (message.includes('not_host')) return 'Only the host can start the game.';
  if (message.includes('not_in_lobby')) return 'This game has already started or ended.';
  if (message.includes('not_enough_players')) return 'You need at least 4 players to start.';
  if (message.includes('invalid_role_config'))
    return 'The current role settings are invalid. Adjust the mafia count or roles and try again.';
  return 'Failed to start the game.';
}

/**
 * Host-only: assigns seats + roles and starts the game atomically via the
 * start_game RPC. Returns the newly created games row.
 */
export async function startGame(roomId: string): Promise<GameRow> {
  const { data, error } = await supabase.rpc('start_game', { p_room_id: roomId });
  if (error) throw new Error(mapStartGameError(error.message));
  if (!data) throw new Error('Failed to start the game.');
  return data as GameRow;
}

/**
 * Fetches the most recent game for a room, or null if none exists. Throws on a
 * real fetch failure so callers can distinguish it from "no game yet".
 */
export async function fetchActiveGame(roomId: string): Promise<GameRow | null> {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message || 'Failed to load the game.');
  return data ?? null;
}

/**
 * Fetches the full roster from the role-masking game_players_view and joins each
 * seat's display name/avatar. Best-effort: returns [] on failure. (The view has
 * no FK to embed through, so human names are resolved in a follow-up query.)
 */
export async function fetchGamePlayers(gameId: string): Promise<GamePlayerView[]> {
  const { data: seats, error } = await supabase
    .from('game_players_view')
    .select('*')
    .eq('game_id', gameId)
    .order('seat_number', { ascending: true });

  if (error || !seats) return [];

  const userIds = Array.from(
    new Set(seats.map((s) => s.user_id).filter((id): id is string => !!id))
  );

  const profileMap: Record<string, { username: string | null; avatar_url: string | null }> = {};
  if (userIds.length > 0) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, username, avatar_url')
      .in('id', userIds);
    for (const p of profiles ?? []) {
      profileMap[p.id] = { username: p.username, avatar_url: p.avatar_url };
    }
  }

  return seats.map((s) => {
    const profile = s.user_id ? profileMap[s.user_id] : undefined;
    return {
      ...s,
      username: s.is_bot ? s.bot_name || 'Bot Player' : profile?.username || 'Player',
      avatar_url: s.is_bot ? s.bot_avatar || 'detective' : profile?.avatar_url ?? null,
    };
  });
}

// Shared named-error mapping for the night-action and vote RPCs.
function mapActionError(rawMessage: string, fallback: string): string {
  const message = (rawMessage || '').toLowerCase();
  if (message.includes('not_night_phase')) return 'The night has already ended.';
  if (message.includes('not_voting_phase')) return 'Voting has already ended.';
  if (message.includes('actor_not_alive') || message.includes('voter_not_alive'))
    return 'Eliminated players cannot act.';
  if (message.includes('no_night_action')) return 'Your role has no night action.';
  if (message.includes('not_your_turn')) return "It's not your turn yet — please wait for the narrator to wake your role.";
  if (message.includes('target_not_alive')) return 'That player is already eliminated.';
  if (message.includes('invalid_target')) return 'That is not a valid target.';
  if (message.includes('not_participant')) return 'You are not part of this game.';
  return rawMessage || fallback;
}

/** Submits (or changes) the current player's night action against a living seat. */
export async function submitNightAction(gameId: string, targetSeatId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_night_action', {
    p_game_id: gameId,
    p_target_player_id: targetSeatId,
  });
  if (error) throw new Error(mapActionError(error.message, 'Failed to submit your action.'));
}

/** Casts (or changes) the current player's vote. Pass null to skip. */
export async function castVote(gameId: string, targetSeatId: string | null): Promise<void> {
  const { error } = await supabase.rpc('cast_vote', {
    p_game_id: gameId,
    p_target_player_id: targetSeatId,
  });
  if (error) throw new Error(mapActionError(error.message, 'Failed to cast your vote.'));
}

/** Posts a chat message on behalf of a living bot (SECURITY DEFINER RPC). */
export async function postBotMessage(
  gameId: string,
  channel: string,
  botName: string,
  content: string
): Promise<void> {
  const { error } = await supabase.rpc('post_bot_message', {
    p_game_id: gameId,
    p_channel: channel,
    p_bot_name: botName,
    p_content: content,
  });
  if (error) {
    console.warn('postBotMessage RPC failed:', error.message);
  }
}

/**
 * The server-authoritative tick. Every client calls this when its local
 * countdown to phase_deadline expires; the RPC no-ops unless the deadline has
 * passed (or all living humans acted). Best-effort: a losing race or transient
 * error is swallowed — realtime carries the resolved state and the next tick
 * retries — so a timer-driven call never surfaces a crash. Returns the current
 * games row, or null on error.
 */
export async function advancePhase(gameId: string): Promise<GameRow | null> {
  const { data, error } = await supabase.rpc('advance_game_phase', { p_game_id: gameId });
  if (error) return null;
  return (data as GameRow) ?? null;
}

/**
 * Detective-only: whether the seat they investigated that round is mafia. The
 * result travels via this private RPC (never a broadcast event). Returns null if
 * unavailable (no investigation that round, or caller is not the detective).
 */
export async function getInvestigationResult(
  gameId: string,
  roundNumber: number
): Promise<boolean | null> {
  const { data, error } = await supabase.rpc('get_investigation_result', {
    p_game_id: gameId,
    p_round_number: roundNumber,
  });
  if (error) return null;
  return typeof data === 'boolean' ? data : null;
}

/**
 * Fetches chat messages for a game channel, oldest first, with sender display
 * info. Best-effort: returns [] on failure (RLS also hides channels the caller
 * may not read).
 */
export async function fetchMessages(gameId: string, channel: ChatChannel): Promise<ChatMessage[]> {
  let query = supabase
    .from('messages')
    .select('*, sender:profiles!messages_sender_id_fkey(username, avatar_url)')
    .eq('game_id', gameId);

  if (channel === 'ghost') {
    query = query.in('channel', ['ghost', 'day']);
  } else {
    query = query.eq('channel', channel);
  }

  const { data, error } = await query
    .order('created_at', { ascending: true })
    .limit(100);

  if (error || !data) return [];

  return data.map((m: any) => ({
    id: m.id,
    room_id: m.room_id,
    game_id: m.game_id,
    sender_id: m.sender_id,
    channel: m.channel,
    content: m.content,
    created_at: m.created_at,
    sender_display: m.sender_display ?? null,
    username: m.sender?.username || m.sender_display || 'Player',
    avatar_url: m.sender?.avatar_url ?? null,
    isBot: !m.sender_id,
  }));
}

/**
 * Sends a chat message to a game channel. Channel permission (day = living
 * participants, mafia = mafia, ghost = dead) is enforced by RLS.
 */
export async function sendMessage(
  roomId: string,
  gameId: string,
  channel: ChatChannel,
  content: string
): Promise<void> {
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) throw new Error('You must be signed in to chat.');

  const trimmed = content.trim();
  if (!trimmed) return;

  const { error } = await supabase.from('messages').insert({
    room_id: roomId,
    game_id: gameId,
    sender_id: user.id,
    channel,
    content: trimmed.slice(0, 500),
  });
  if (error) throw new Error(error.message || 'Failed to send message.');
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import * as gameApi from '../lib/games';
import type { GameRow, GamePlayerView, ChatMessage, GameEventRow, InvestigationResultData } from '../lib/games';
import type { ChatChannel, GameRole, Json, NightStage } from '../types/database';
import { dispatchBotChat, dispatchMultiBotDiscussion, isBotCoordinator } from '../lib/botChat';

export interface NightResult {
  round: number;
  killedPlayerId: string | null;
  saved: boolean;
  role: GameRole | null;
}

export interface VoteResult {
  round: number;
  eliminatedPlayerId: string | null;
  role: GameRole | null;
}

export interface GameStateValue {
  loading: boolean;
  error: string | null;
  game: GameRow | null;
  players: GamePlayerView[];
  mySeat: GamePlayerView | null;
  myRole: GameRole | null;
  isAlive: boolean;
  timeRemaining: number;
  latestNightResult: NightResult | null;
  latestVoteResult: VoteResult | null;
  messages: ChatMessage[];
  activeChannel: ChatChannel | null;
  /** The awake role during 'night' (mafia -> doctor -> detective), else null. */
  nightStage: NightStage | null;
  latestInvestigation: InvestigationResultData | null;
  investigationHistory: InvestigationResultData[];
  mafiaWhisperMode: boolean;
  setMafiaWhisperMode: (enabled: boolean) => void;
  submitNightAction: (targetSeatId: string) => Promise<void>;
  castVote: (targetSeatId: string | null) => Promise<void>;
  sendChat: (content: string) => Promise<void>;
  getInvestigation: (round: number) => Promise<InvestigationResultData | null>;
  refresh: () => void;
}

// Narrows the untyped Json event payload without throwing on unexpected shapes.
function readPayload(payload: Json): Record<string, unknown> {
  return payload && typeof payload === 'object' && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function parseNightResult(payload: Json): NightResult {
  const p = readPayload(payload);
  return {
    round: typeof p.round === 'number' ? p.round : 0,
    killedPlayerId: typeof p.killed_player_id === 'string' ? p.killed_player_id : null,
    saved: p.saved === true,
    role: (typeof p.role === 'string' ? p.role : null) as GameRole | null,
  };
}

function parseVoteResult(payload: Json): VoteResult {
  const p = readPayload(payload);
  return {
    round: typeof p.round === 'number' ? p.round : 0,
    eliminatedPlayerId: typeof p.eliminated_player_id === 'string' ? p.eliminated_player_id : null,
    role: (typeof p.role === 'string' ? p.role : null) as GameRole | null,
  };
}

/**
 * Central state manager for an in-progress game. Fetches the active game + roster
 * + my seat, subscribes to `games`/`game_events`/`messages` realtime (refetching
 * the role-masked roster on each game/event, since game_players is not published),
 * runs a local countdown to phase_deadline, and calls the server-authoritative
 * advance_game_phase RPC on expiry (with jitter) so play survives host disconnect.
 */
export function useGameState(roomId: string, currentUserId: string): GameStateValue {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [game, setGame] = useState<GameRow | null>(null);
  const [players, setPlayers] = useState<GamePlayerView[]>([]);
  const [timeRemaining, setTimeRemaining] = useState(0);
  const [latestNightResult, setLatestNightResult] = useState<NightResult | null>(null);
  const [latestVoteResult, setLatestVoteResult] = useState<VoteResult | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [latestInvestigation, setLatestInvestigation] = useState<gameApi.InvestigationResultData | null>(null);
  const [investigationHistory, setInvestigationHistory] = useState<gameApi.InvestigationResultData[]>([]);
  const [mafiaWhisperMode, setMafiaWhisperMode] = useState(false);

  // Derived: my seat, role, alive state.
  const mySeat = useMemo(
    () => players.find((p) => p.user_id === currentUserId) ?? null,
    [players, currentUserId]
  );
  const myRole = mySeat?.role ?? null;
  const isAlive = mySeat?.is_alive ?? false;

  // Sequential night: which role is awake right now (mafia opens if unset).
  const nightStage: NightStage | null =
    game?.phase === 'night' ? (game.night_stage ?? 'mafia') : null;

  // Active chat channel for the current phase + my status (null = no chat now).
  const activeChannel = useMemo<ChatChannel | null>(() => {
    if (!game || !mySeat) return null;
    if (game.phase === 'game_over') return null;
    if (!mySeat.is_alive) return 'ghost';
    // Mafia coordinate privately throughout the entire night!
    if (game.phase === 'night') return myRole === 'mafia' ? 'mafia' : null;
    // In daytime discussion, mafia can toggle secret whisper mode with teammates
    if (myRole === 'mafia' && mafiaWhisperMode) return 'mafia';
    return 'day';
  }, [game, mySeat, myRole, mafiaWhisperMode]);

  // Refs mirror the latest values so the always-on timer/subscriptions and the
  // action callbacks can read them without re-subscribing (Lobby's pattern).
  const isMountedRef = useRef(true);
  const gameRef = useRef<GameRow | null>(null);
  const playersRef = useRef<GamePlayerView[]>([]);
  const activeChannelRef = useRef<ChatChannel | null>(null);
  const advancingRef = useRef(false);
  const lastAdvanceAtRef = useRef(0);

  // Mirror latest values post-commit (never during render) so the always-on
  // timer/subscriptions and action callbacks read them without re-subscribing.
  useEffect(() => {
    gameRef.current = game;
    playersRef.current = players;
    activeChannelRef.current = activeChannel;
  });

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const refetchPlayers = useCallback(async (gid: string) => {
    const roster = await gameApi.fetchGamePlayers(gid);
    if (isMountedRef.current) setPlayers(roster);
  }, []);

  const applyGame = useCallback(
    (updated: GameRow) => {
      if (!isMountedRef.current) return;
      setGame(updated);
      gameRef.current = updated;
      void refetchPlayers(updated.id);
    },
    [refetchPlayers]
  );

  // Fire the server-authoritative tick. `force` (after an action/vote) skips the
  // deadline check so the RPC can early-advance when all living humans have acted;
  // the timer path only calls once the local countdown reaches the deadline. A
  // short cooldown + in-flight guard keep concurrent ticks from spamming.
  const tryAdvance = useCallback((force = false) => {
    const g = gameRef.current;
    if (!g || g.phase === 'game_over') return;
    const now = Date.now();
    if (advancingRef.current) return;
    if (!force && now - lastAdvanceAtRef.current < 1500) return;
    advancingRef.current = true;
    lastAdvanceAtRef.current = now;
    // Small random delay so many clients don't all hit the RPC on the same tick.
    const jitter = force ? 0 : Math.floor(Math.random() * 500);
    setTimeout(async () => {
      try {
        const updated = await gameApi.advancePhase(g.id);
        if (updated && isMountedRef.current) applyGame(updated);
      } finally {
        advancingRef.current = false;
      }
    }, jitter);
  }, [applyGame]);

  // Local countdown to phase_deadline; calls tryAdvance() on expiry. One interval
  // per game (reads the live game from gameRef so phase changes don't restart it).
  useEffect(() => {
    if (!game?.id) return;
    const tick = () => {
      const g = gameRef.current;
      if (!g || g.phase === 'game_over' || !g.phase_deadline) {
        setTimeRemaining(0);
        return;
      }
      const ms = new Date(g.phase_deadline).getTime() - Date.now();
      setTimeRemaining(Math.max(0, Math.ceil(ms / 1000)));
      if (ms <= 0) tryAdvance();
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [game?.id, tryAdvance]);

  // Initial load + games/game_events subscriptions. game_players is not in the
  // realtime publication, so we refetch the masked view on every game/event.
  useEffect(() => {
    let isMounted = true;
    let gamesChannel: ReturnType<typeof supabase.channel> | null = null;
    let eventsChannel: ReturnType<typeof supabase.channel> | null = null;

    const seedEvents = (events: GameEventRow[]) => {
      for (const ev of events) {
        if (ev.event_type === 'night_result') setLatestNightResult(parseNightResult(ev.payload));
        else if (ev.event_type === 'vote_result') setLatestVoteResult(parseVoteResult(ev.payload));
      }
    };

    const init = async () => {
      try {
        setLoading(true);
        const g = await gameApi.fetchActiveGame(roomId);
        if (!isMounted) return;
        setGame(g);
        gameRef.current = g;
        setError(null);

        if (!g) {
          setLoading(false);
          return;
        }

        await refetchPlayers(g.id);

        // Seed result banners from history (a client landing on dawn/result needs
        // the event that fired during the transition, before it subscribed).
        const { data: history } = await supabase
          .from('game_events')
          .select('*')
          .eq('game_id', g.id)
          .order('created_at', { ascending: true })
          .limit(100);
        if (isMounted && history) seedEvents(history as GameEventRow[]);

        gamesChannel = supabase
          .channel(`game:${g.id}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'games', filter: `id=eq.${g.id}` },
            (payload) => {
              if (!isMountedRef.current) return;
              applyGame(payload.new as GameRow);
            }
          )
          .subscribe();

        eventsChannel = supabase
          .channel(`game_events:${g.id}`)
          .on(
            'postgres_changes',
            { event: 'INSERT', schema: 'public', table: 'game_events', filter: `game_id=eq.${g.id}` },
            (payload) => {
              if (!isMountedRef.current) return;
              const ev = payload.new as GameEventRow;
              if (ev.event_type === 'night_result') setLatestNightResult(parseNightResult(ev.payload));
              else if (ev.event_type === 'vote_result') setLatestVoteResult(parseVoteResult(ev.payload));
              if (['night_result', 'vote_result', 'game_over'].includes(ev.event_type)) {
                void refetchPlayers(ev.game_id);
              }
            }
          )
          .subscribe();

        setLoading(false);
      } catch (e) {
        if (isMounted) {
          setError(e instanceof Error ? e.message : 'Failed to load the game.');
          setLoading(false);
        }
      }
    };

    init();

    return () => {
      isMounted = false;
      if (gamesChannel) supabase.removeChannel(gamesChannel);
      if (eventsChannel) supabase.removeChannel(eventsChannel);
    };
  }, [roomId, refetchPlayers, applyGame]);

  // Chat: fetch + subscribe to the active channel's messages. Re-runs when the
  // channel changes (phase/alive transitions). Realtime `messages` inserts are
  // enriched with the sender's name/avatar from the current roster (playersRef).
  useEffect(() => {
    const gid = game?.id;
    const channel = activeChannel;
    // No active chat channel (e.g. a phase with no chat, or before load). Chat
    // is not rendered in that state, so leave `messages` untouched — the next
    // valid channel's load() overwrites it. Clearing here would setState in an
    // effect for no visible benefit.
    if (!gid || !channel) {
      return;
    }

    let isMounted = true;
    let msgChannel: ReturnType<typeof supabase.channel> | null = null;

    const load = async () => {
      const history = await gameApi.fetchMessages(gid, channel);
      if (isMounted) setMessages(history);

      msgChannel = supabase
        .channel(`messages:${gid}:${channel}`)
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'messages', filter: `game_id=eq.${gid}` },
          (payload) => {
            if (!isMountedRef.current) return;
            const row = payload.new as ChatMessage;
            // The filter can't scope to a channel, so drop other channels here.
            const currChannel = activeChannelRef.current;
            if (currChannel === 'ghost') {
              if (row.channel !== 'ghost' && row.channel !== 'day') return;
            } else if (row.channel !== currChannel) {
              return;
            }
            const sender = playersRef.current.find((p) => p.user_id === row.sender_id);
            const enriched: ChatMessage = {
              ...row,
              username: sender?.username ?? row.sender_display ?? 'Player',
              avatar_url: sender?.avatar_url ?? null,
              isBot: !row.sender_id,
            };
            setMessages((prev) => {
              const updated = prev.some((m) => m.id === enriched.id) ? prev : [...prev, enriched];
              if (currChannel === 'day' || currChannel === 'mafia') {
                if (isBotCoordinator(currentUserId, playersRef.current)) {
                  void dispatchBotChat({
                    gameId: gid,
                    channel: currChannel,
                    phase: gameRef.current?.phase || '',
                    round: gameRef.current?.round_number || 1,
                    players: playersRef.current,
                    recentMessages: updated,
                    triggerContent: row.content,
                    triggerSender: enriched.username,
                    delayMs: Math.floor(Math.random() * 1500) + 1200,
                  });
                }
              }
              return updated;
            });
          }
        )
        .subscribe();
    };

    load();

    return () => {
      isMounted = false;
      if (msgChannel) supabase.removeChannel(msgChannel);
    };
  }, [game?.id, activeChannel, currentUserId]);

  // Autonomous interactive multi-bot banter when town discussion phase begins
  const prevPhaseForBotRef = useRef<string | null>(null);
  useEffect(() => {
    const p = game?.phase;
    if (!p || !game?.id) return;
    const changed = prevPhaseForBotRef.current !== p;
    prevPhaseForBotRef.current = p;

    if (changed && p === 'day_discussion') {
      if (isBotCoordinator(currentUserId, playersRef.current)) {
        void dispatchMultiBotDiscussion({
          gameId: game.id,
          round: game.round_number,
          players: playersRef.current,
          recentMessages: messages,
        });
      }
    }
  }, [game?.phase, game?.id, game?.round_number, currentUserId, messages]);

  // Action wrappers.
  const submitNightAction = useCallback(async (targetSeatId: string) => {
    const g = gameRef.current;
    if (!g) return;
    await gameApi.submitNightAction(g.id, targetSeatId);

    // If detective, immediately evaluate and record the investigation result!
    if (myRole === 'detective') {
      try {
        const res = await gameApi.getInvestigationResult(g.id, g.round_number);
        if (res) {
          setLatestInvestigation(res);
          setInvestigationHistory((prev) => {
            const withoutCurrent = prev.filter((item) => item.round !== res.round);
            return [...withoutCurrent, res];
          });
        }
      } catch (err) {
        console.warn('Could not fetch immediate investigation result:', err);
      }
    }

    tryAdvance(true);
  }, [myRole, tryAdvance]);

  const castVote = useCallback(async (targetSeatId: string | null) => {
    const g = gameRef.current;
    if (!g) return;
    await gameApi.castVote(g.id, targetSeatId);
    tryAdvance(true);
  }, [tryAdvance]);

  const sendChat = useCallback(async (content: string) => {
    const g = gameRef.current;
    const channel = activeChannelRef.current;
    if (!g || !channel) return;
    await gameApi.sendMessage(g.room_id, g.id, channel, content);
  }, []);

  const getInvestigation = useCallback(async (round: number) => {
    const g = gameRef.current;
    if (!g) return null;
    return gameApi.getInvestigationResult(g.id, round);
  }, []);

  const refresh = useCallback(() => {
    const g = gameRef.current;
    if (g) void refetchPlayers(g.id);
  }, [refetchPlayers]);

  return {
    loading,
    error,
    game,
    players,
    mySeat,
    myRole,
    isAlive,
    timeRemaining,
    latestNightResult,
    latestVoteResult,
    messages,
    activeChannel,
    nightStage,
    latestInvestigation,
    investigationHistory,
    mafiaWhisperMode,
    setMafiaWhisperMode,
    submitNightAction,
    castVote,
    sendChat,
    getInvestigation,
    refresh,
  };
}

// =============================================================================
// ai-bot-chat v2 — AI banter for Mafia bots (grounded accusations edition)
// =============================================================================
// Invoked server-side by the narrator triggers (20260927000004) over pg_net
// with the service-role JWT. Flow:
//
//   1. Verify the caller is the service role (only pg_net/narrator may call).
//   2. Load the game, roster and last chat messages for the trigger channel.
//   3. Build a GROUNDED persona prompt per bot: real game history (round,
//      eliminations, current leader accusation, quiet players) — but a bot
//      NEVER learns its true role or anyone else's hidden role. Mafia bots
//      additionally know the mafia roster (they're teammates) and are
//      instructed to deflect/defend like a real mafia player would.
//   4. Call OpenRouter (model from OPENROUTER_MODEL, default
//      openai/gpt-oss-20b:free) for each selected bot sequentially.
//   5. Insert the replies into `messages` as the bot seat (sender_id NULL,
//      sender_display = bot name) with 400ms–2s jitter between rows.
//   6. Release the per-game ai_chat_state guard (status -> idle).
//
// Secrets (set via `supabase secrets set`): OPENROUTER_API_KEY. Optional:
// OPENROUTER_MODEL.
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b:free';
const MAX_REPLIES_PER_TURN = 2;
const MIN_DELAY_MS = 400;
const MAX_DELAY_MS = 2000;
const CONTEXT_MESSAGE_LIMIT = 25;

interface NarratorPayload {
  game_id?: string;
  channel?: string;
  trigger_message_id?: string | null;
  trigger_sender?: string;
  event?: string;
  round?: number | string;
}

interface BotSeat {
  id: string;
  user_id: string | null;
  role: string; // server-side truth; used ONLY to know mafia teammates
  bot_name: string;
  bot_avatar: string | null;
}

interface SeatInfo {
  id: string;
  username: string;
  is_bot: boolean;
  is_alive: boolean;
  role: string | null;
  death_reason: string | null;
  death_round: number | null;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function pickBots(bots: BotSeat[], max: number): BotSeat[] {
  // Deterministic rotation with slight shuffle so different bots speak across
  // turns: sort by a per-run random offset, then take the first `max`.
  const offset = Math.floor(Math.random() * bots.length);
  return [...bots.slice(offset), ...bots.slice(0, offset)].slice(0, max);
}

// -----------------------------------------------------------------------------
// Grounded context builder — real facts the bot is allowed to "know"
// (everything here is observable in-game: roster, deaths, votes, chat).
// Hidden info (true roles of others, own role unless mafia teammate mapping)
// never enters the prompt.
// -----------------------------------------------------------------------------
function buildRosterContext(seats: SeatInfo[], botId: string, isMafiaBot: boolean): string {
  const lines: string[] = [];
  for (const s of seats) {
    if (s.id === botId) continue; // don't describe self in third person
    let line: string;
    if (s.is_alive) {
      line = `${s.username} is alive.`;
    } else {
      const reason =
        s.death_reason === 'voted_out'
          ? 'was voted out'
          : 'was eliminated during the night';
      const revealed =
        s.role === 'mafia' || s.role === 'doctor' || s.role === 'detective';
      line = `${s.username} ${reason}${revealed ? ` and was the ${s.role}` : ''}.`;
    }
    lines.push(line);
  }
  // Mafia bots legitimately know who the mafia are (teammates) — but only the
  // living ones that are still hidden; revealed mafia are already public.
  if (isMafiaBot) {
    const teammates = seats.filter(
      (s) => s.role === 'mafia' && s.is_alive && s.id !== botId
    );
    if (teammates.length > 0) {
      lines.push(`Your mafia teammates: ${teammates.map((t) => t.username).join(', ')}.`);
    }
  }
  return lines.join(' ');
}

// Current vote-leader (accusation target the bots should react to).
function buildLeaderContext(humanVotes: { username: string; count: number }[]): string {
  if (humanVotes.length === 0) return 'No votes cast yet this round.';
  const sorted = [...humanVotes].sort((a, b) => b.count - a.count);
  const [top, second] = sorted;
  if (second && second.count === top.count) {
    return `The vote is currently TIED between ${top.username} and ${second.username}.`;
  }
  return `${top.username} currently has the most suspicion votes (${top.count}).`;
}

// Who has stayed silent this round — classic Mafia tell the bots can react to.
function buildQuietContext(seats: SeatInfo[], speakers: Set<string>, botId: string): string {
  const quiet = seats.filter(
    (s) => s.is_alive && s.id !== botId && !speakers.has(s.username)
  );
  if (quiet.length === 0) return 'Everyone has been talking.';
  const names = quiet.slice(0, 3).map((q) => q.username);
  return `${names.join(', ')} ${quiet.length === 1 ? 'has' : 'have'} been quiet this round.`;
}

const ROLE_SUBTLETY_TOWN = [
  'You are a regular town participant; you do NOT know any player\'s secret role, including your own.',
  'Reason from VISIBLE behavior only: who is quiet, who deflects, who jumped on a bandwagon.',
  'When you accuse, reference a concrete observation (e.g. quietness, a fumbled defense, vote history).',
].join(' ');

const ROLE_SUBTLETY_MAFIA = [
  'You ARE secretly mafia. You know your teammates. NOBODY ELSE knows this, and you must keep it that way.',
  'Deflect suspicion LATERALLY: cast mild doubt on town-colleagues, keep your teammates alive without looking coordinated.',
  'If a teammate is accused, you may defend them ONCE with a plausible alternative theory, then drop it.',
  'Never accuse yourself. Occasionally vote with the flow so you blend in.',
].join(' ');

async function generateBotReply(
  apiKey: string,
  model: string,
  botName: string,
  rosterContext: string,
  leaderContext: string,
  quietContext: string,
  transcript: string,
  event: string | undefined,
  isMafiaBot: boolean,
  channel: string
): Promise<string | null> {
  const isNight = channel === 'mafia';
  const basePrompt = [
    'You are roleplaying a player in a casual online game of Mafia (social deduction).',
    isMafiaBot ? ROLE_SUBTLETY_MAFIA : ROLE_SUBTLETY_TOWN,
    'Stay fully in character as a witty, slightly paranoid player. Never mention being an AI.',
    'Never state or invent facts about hidden roles, night actions, or vote tallies you have not seen.',
    'Keep each reply to 1-2 short sentences, natural chat style, no emojis, no quotes around your message.',
    isNight
      ? 'This is SECRET mafia night chat: coordinate briefly and quietly with your teammates, no roleplay of sleeping players.'
      : 'This is the OPEN day channel: everyone sees what you write.',
  ].join(' ');

  const persona = [
    { role: 'system', content: basePrompt },
    {
      role: 'system',
      content:
        `Your chat name is "${botName}". Reply ONLY with the next chat message from ${botName}. ` +
        'If the transcript is empty, open the discussion with a short observation or accusation.',
    },
    {
      role: 'user',
      content: [
        rosterContext && `Game state: ${rosterContext}`,
        leaderContext && `Current accusation target: ${leaderContext}`,
        quietContext && `Quiet players: ${quietContext}`,
        event && `Phase event just happened: ${event}.`,
        '',
        `Chat so far:\n${transcript || '(no messages yet)'}`,
        '',
        `Write ${botName}'s next message.`,
      ]
        .filter(Boolean)
        .join('\n'),
    },
  ];

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        // Optional headers OpenRouter uses for attribution/rankings.
        'HTTP-Referer': 'https://github.com/Mian255/mafia',
        'X-Title': 'Mafia Game Bot Chat',
      },
      body: JSON.stringify({
        model,
        messages: persona,
        max_tokens: 60,
        temperature: 0.9,
      }),
    });

    if (!res.ok) {
      console.error('openrouter error', res.status, await res.text());
      return null;
    }

    const data = await res.json();
    const choice = data?.choices?.[0]?.message?.content;
    if (typeof choice !== 'string') return null;

    const cleaned = choice.trim().replace(/^["“](.*)["”]$/s, '$1').slice(0, 500);
    return cleaned.length > 0 ? cleaned : null;
  } catch (err) {
    console.error('openrouter fetch failed', err);
    return null;
  }
}

// -----------------------------------------------------------------------------
// Server
// -----------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method !== 'POST') {
    return jsonError(405, 'Method not allowed');
  }

  // Service-role gate: the narrator trigger calls with the service JWT. This
  // endpoint is never called by the app.
  const authHeader = req.headers.get('Authorization') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (!serviceKey || authHeader !== `Bearer ${serviceKey}`) {
    return jsonError(401, 'Unauthorized');
  }

  let payload: NarratorPayload;
  try {
    payload = (await req.json()) as NarratorPayload;
  } catch {
    return jsonError(400, 'Invalid JSON body');
  }

  const gameId = payload.game_id;
  const channel = payload.channel === 'mafia' ? 'mafia' : 'day';
  if (!gameId) {
    return jsonError(400, 'game_id is required');
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabase = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  try {
    // 1. Game must be in an active phase.
    const { data: game, error: gameError } = await supabase
      .from('games')
      .select('id, room_id, phase, round_number')
      .eq('id', gameId)
      .maybeSingle();
    if (gameError || !game) throw new Error('game_not_found');
    if (game.phase === 'game_over') {
      await supabase
        .from('ai_chat_state')
        .update({ status: 'idle', updated_at: new Date().toISOString() })
        .eq('game_id', gameId);
      return new Response(JSON.stringify({ ok: true, skipped: 'game_over' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 2. Full roster (service role: unmasked). Needed for grounded context.
    const { data: seats, error: seatsError } = await supabase
      .from('game_players')
      .select('id, user_id, role, is_alive, is_bot, bot_name, bot_avatar, death_reason, death_round')
      .eq('game_id', gameId)
      .order('seat_number', { ascending: true });
    if (seatsError) throw seatsError;
    const seatRows = (seats ?? []) as SeatInfo[];

    // Living bot seats — bots only speak while alive.
    const botSeats = seatRows.filter(
      (s): s is SeatInfo & { bot_name: string } =>
        s.is_bot && s.is_alive && typeof (s as { bot_name?: unknown }).bot_name === 'string'
    );
    if (botSeats.length === 0) {
      await supabase
        .from('ai_chat_state')
        .update({ status: 'idle', updated_at: new Date().toISOString() })
        .eq('game_id', gameId);
      return new Response(JSON.stringify({ ok: true, skipped: 'no_bots' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // 3. Recent transcript for the channel.
    const { data: recent, error: recentError } = await supabase
      .from('messages')
      .select('sender_display, sender_id, content')
      .eq('game_id', gameId)
      .eq('channel', channel)
      .order('created_at', { ascending: false })
      .limit(CONTEXT_MESSAGE_LIMIT);
    if (recentError) throw recentError;

    // Human senders resolve via the FK join the client uses; for the transcript
    // we need usernames, so fetch profiles for the recent human senders.
    const humanIds = [...new Set((recent ?? []).map((m) => m.sender_id).filter(Boolean))] as string[];
    let names = new Map<string, string>();
    if (humanIds.length > 0) {
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, username')
        .in('id', humanIds);
      names = new Map((profiles ?? []).map((p) => [p.id, p.username]));
    }

    const transcript = (recent ?? [])
      .reverse()
      .map((m) => `${m.sender_display ?? names.get(m.sender_id ?? '') ?? 'Player'}: ${m.content}`)
      .join('\n');

    // Speakers set (this round's chat) for the quiet-player heuristic.
    const speakers = new Set((recent ?? []).map((m) =>
      m.sender_display ?? names.get(m.sender_id ?? '') ?? ''
    ));

    // 4. Grounded, per-seat vote tally for the CURRENT round (humans + bots
    //    ministers). Used to build accusations like "X has 3 suspicion votes".
    const roundNumber = typeof game.round_number === 'number' ? game.round_number : 1;
    const { data: votes } = await supabase
      .from('votes')
      .select('voter_id, target_player_id')
      .eq('game_id', gameId)
      .eq('round_number', roundNumber);

    const seatById = new Map(seatRows.map((s) => [s.id, s]));
    const voteCounts = new Map<string, number>();
    for (const v of votes ?? []) {
      if (!v.target_player_id) continue;
      voteCounts.set(v.target_player_id, (voteCounts.get(v.target_player_id) ?? 0) + 1);
    }
    const humanVotes: { username: string; count: number }[] = [];
    for (const [seatId, count] of voteCounts.entries()) {
      const seat = seatById.get(seatId);
      if (seat && count > 0) humanVotes.push({ username: seat.username, count });
    }

    // 5. Generate and insert replies.
    const selected = pickBots(botSeats as unknown as BotSeat[], MAX_REPLIES_PER_TURN);
    let inserted = 0;
    for (const bot of selected) {
      const isMafiaBot = bot.role === 'mafia';
      const reply = await generateBotReply(
        Deno.env.get('OPENROUTER_API_KEY') ?? '',
        Deno.env.get('OPENROUTER_MODEL') ?? DEFAULT_MODEL,
        bot.bot_name,
        buildRosterContext(seatRows, bot.id, isMafiaBot),
        buildLeaderContext(humanVotes),
        buildQuietContext(seatRows, speakers, bot.id),
        transcript,
        payload.event,
        isMafiaBot,
        channel
      );
      if (!reply) continue;

      const { error: insertError } = await supabase.from('messages').insert({
        room_id: game.room_id,
        game_id: gameId,
        sender_id: null,
        sender_display: bot.bot_name,
        channel,
        content: reply.slice(0, 500),
      });
      if (insertError) {
        console.error('bot message insert failed', insertError);
        continue;
      }
      inserted += 1;

      // Humanlike pacing; also lets realtime deliver messages progressively.
      await sleep(MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));
    }

    // 6. Release the guard.
    await supabase
      .from('ai_chat_state')
      .update({ status: 'idle', updated_at: new Date().toISOString() })
      .eq('game_id', gameId);

    return new Response(JSON.stringify({ ok: true, inserted }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('ai-bot-chat failed', err);
    // Always release the guard or the game would never get bot chat again.
    await supabase
      .from('ai_chat_state')
      .update({ status: 'idle', updated_at: new Date().toISOString() })
      .eq('game_id', gameId)
      .maybeSingle();
    return jsonError(500, 'Internal Server Error');
  }
});

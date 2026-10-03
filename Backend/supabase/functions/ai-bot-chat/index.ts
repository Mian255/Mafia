// =============================================================================
// ai-bot-chat — AI banter for Mafia bots (MAF-042 half 2, "bots that talk")
// =============================================================================
// Invoked server-side by the narrator triggers (20260927000004) over pg_net
// with the service-role JWT. Flow:
//
//   1. Verify the caller is the service role (only pg_net/narrator may call).
//   2. Load the game, roster and last chat messages for the trigger channel.
//   3. For up to N bot seats (default 2), build a hidden-info-safe persona
//      prompt — a bot NEVER learns its true role or anyone else's; it plays a
//      generic, suspicion-flavoured persona so nothing leaks through the LLM.
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

const SYSTEM_PROMPT = [
  'You are roleplaying a player in a casual online game of Mafia (social deduction).',
  'You are a regular participant: you do NOT know any player\'s secret role, including your own.',
  'Stay fully in character as a witty, slightly paranoid player. Never mention being an AI.',
  'Never state or invent facts about hidden roles, night actions, or vote tallies you have not seen.',
  'Keep each reply to 1-2 short sentences, natural chat style, no emojis, no quotes around your message.',
].join(' ');

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
  bot_name: string;
  bot_avatar: string | null;
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

async function generateBotReply(
  apiKey: string,
  model: string,
  botName: string,
  transcript: string
): Promise<string | null> {
  const persona = [
    { role: 'system', content: SYSTEM_PROMPT },
    {
      role: 'system',
      content:
        `Your chat name is "${botName}". Reply ONLY with the next chat message from ${botName}. ` +
        'If the transcript is empty, open the discussion with a short observation or accusation.',
    },
    {
      role: 'user',
      content: `Chat so far:\n${transcript || '(no messages yet)'}\n\nWrite ${botName}'s next message.`,
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
    // 1. Game must be in an active discussion/voting phase for day channel, or
    //    any in-progress phase for the mafia channel.
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

    // 2. Living bot seats. Bots only speak while alive.
    const { data: bots, error: botsError } = await supabase
      .from('game_players')
      .select('id, bot_name, bot_avatar')
      .eq('game_id', gameId)
      .eq('is_alive', true)
      .eq('is_bot', true);
    if (botsError) throw botsError;
    const botSeats = (bots ?? []) as BotSeat[];
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

    // 3. Recent transcript for the channel (service role bypasses RLS here by
    //    design; humans only see their permitted channels via RLS).
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

    // 4. Generate and insert replies.
    const selected = pickBots(botSeats, MAX_REPLIES_PER_TURN);
    let inserted = 0;
    for (const bot of selected) {
      const reply = await generateBotReply(
        Deno.env.get('OPENROUTER_API_KEY') ?? '',
        Deno.env.get('OPENROUTER_MODEL') ?? DEFAULT_MODEL,
        bot.bot_name,
        transcript
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

    // 5. Release the guard.
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

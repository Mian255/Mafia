import { postBotMessage } from './games';
import type { GamePlayerView, ChatMessage } from './games';
import type { ChatChannel } from '../types/database';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'liquid/lfm-2.5-2.6b:free';

const DEFAULT_OPENROUTER_KEY =
  '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';
const API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || DEFAULT_OPENROUTER_KEY;

/** Strip markdown, symbols, and formatting for clean chat bubbles */
function cleanChatBubble(text: string): string {
  if (!text) return '';
  return text
    .replace(/^#+\s+/gm, '')
    .replace(/[*_~`"“”]/g, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

// Track recently spoken lines to prevent repetition across all bots
const recentlySpoken = new Set<string>();
function rememberLine(line: string) {
  recentlySpoken.add(line);
  if (recentlySpoken.size > 40) {
    const oldest = recentlySpoken.values().next().value;
    if (oldest) recentlySpoken.delete(oldest);
  }
}

/** Rich contextual dialogue bank for instant, lag-free bot interactions */
const HEURISTIC_BANTER = {
  discussion_openers: [
    "Another night has passed... we need to find who among us is lying.",
    "Look at everyone's actions. The Mafia is trying to blend in right now.",
    "Let's not rush our votes today. We need to hear everyone out.",
    "We have to work together and listen carefully to everyone's defense.",
    "Listen up everyone. We need to look closely at who is deflecting.",
    "The town cannot afford a wrong vote today. Let's analyze carefully.",
    "Who seems nervous? Watch how people react to questions.",
    "Townies, stay sharp. The Mafia will try to steer the narrative.",
    "Check the previous voting patterns. That's where the truth is.",
    "I have my eyes on a few people today. Let's see who speaks first.",
    "Don't let anyone push an easy target without solid reasoning.",
    "Let's review what happened last night before jumping to conclusions.",
  ],
  accused_defenses: [
    "Why are you pointing fingers at me? I've been helping the town all along!",
    "Accusing me is a classic Mafia distraction. Look at the real evidence!",
    "I'm completely innocent! If you vote me out, the town loses a good citizen.",
    "Don't fall for this trap. The Mafia wants you to vote out honest players!",
    "That accusation is baseless. What makes you suspect me over anyone else?",
    "Look at my voting record. I'm fighting for the town!",
    "You're jumping to conclusions. Ask yourself who benefits from my elimination.",
    "I'm on the town's side. If you eliminate me, you're helping the Mafia win.",
    "I have nothing to hide. Focus on the players who are deflecting!",
  ],
  general_suspicions: [
    "Someone here is voting in lockstep. We need to pay attention.",
    "I'm suspicious of anyone who rushed the vote earlier.",
    "Notice how quickly the blame shifted? That's suspicious.",
    "Let's see who defends who before we lock in our final votes.",
    "Rushing votes only helps the Mafia. Let's think this through.",
    "Whoever stays too quiet is usually trying to hide something.",
    "Pay attention to who started that accusation out of nowhere.",
    "The Mafia always tries to create chaos during discussion.",
    "Voting without giving a reason is a massive red flag.",
    "I'm noticing a pattern here and it doesn't look innocent.",
    "Defending a suspect too eagerly makes you just as suspicious.",
    "Let's make sure we question everyone before locking in votes.",
  ],
  human_replies: [
    "I agree with that. We need to look into this further.",
    "That's a fair point, but let's consider all angles first.",
    "I'm not convinced yet. We need stronger proof before voting.",
    "Good catch. Let's see how they react to that.",
    "Careful, that might be what the Mafia wants us to think.",
    "I see what you mean. Who else supports that theory?",
    "You might be onto something there. Let's press them on it.",
  ],
  mafia_night_banter: [
    "We need to eliminate the detective before they find us out.",
    "Who seems most dangerous to our team?",
    "Let's stay coordinated and act together tonight.",
    "Targeting a strong voice will throw the town into confusion tomorrow.",
    "Keep our stories aligned for tomorrow morning.",
    "Don't vote together too early tomorrow, it looks suspicious.",
  ],
};

function getRandom<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

interface GenerateParams {
  botName: string;
  gameId: string;
  channel: ChatChannel;
  phase: string;
  round: number;
  players: GamePlayerView[];
  recentMessages: ChatMessage[];
  triggerContent?: string;
  triggerSender?: string;
}

/**
 * Generates an in-character message for a bot using OpenRouter (LLM)
 * with an immediate contextual fallback so bots NEVER fail to chat.
 */
export async function generateBotMessage(params: GenerateParams): Promise<string> {
  const { botName, channel, phase, players, recentMessages, triggerContent, triggerSender } = params;

  const livingPlayers = players.filter((p) => p.is_alive).map((p) => p.username).join(', ');
  const deadPlayers = players.filter((p) => !p.is_alive).map((p) => `${p.username} (${p.death_reason || 'eliminated'})`).join(', ');

  const otherLiving = players
    .filter((p) => p.is_alive && p.username !== botName)
    .map((p) => p.username);
  const targetPlayer = otherLiving.length > 0 ? getRandom(otherLiving) : 'someone';

  const isNamed =
    triggerContent &&
    botName &&
    triggerContent.toLowerCase().includes(botName.replace(/^bot\s*/i, '').toLowerCase());

  // Fast offline / heuristic fallback with dynamic player mentions
  const getFallback = (): string => {
    let pool: string[];
    if (channel === 'mafia') {
      pool = HEURISTIC_BANTER.mafia_night_banter;
    } else if (isNamed) {
      const def = getRandom(HEURISTIC_BANTER.accused_defenses);
      const res = triggerSender ? `${triggerSender}, ${def.toLowerCase()}` : def;
      rememberLine(res);
      return res;
    } else if (triggerSender && !triggerSender.toLowerCase().startsWith('bot')) {
      // Human player spoke in chat — respond contextually!
      pool = [
        ...HEURISTIC_BANTER.human_replies,
        `${triggerSender}, do you have solid evidence or is that a gut feeling?`,
        `Good point, ${triggerSender}. What do you think, ${targetPlayer}?`,
        `I hear you, ${triggerSender}. Let's see what ${targetPlayer} has to say.`,
      ];
    } else if (recentMessages.length <= 1) {
      pool = HEURISTIC_BANTER.discussion_openers;
    } else {
      pool = [
        ...HEURISTIC_BANTER.general_suspicions,
        `I'm watching ${targetPlayer} very closely today.`,
        `${targetPlayer}, you've been quiet. What are your thoughts?`,
        `Does anyone else find ${targetPlayer}'s behavior suspicious?`,
        `Let's hear ${targetPlayer}'s explanation before we vote.`,
        `${targetPlayer}, who are you suspecting right now?`,
      ];
    }

    // Filter out recently used lines to avoid repetition
    const freshLines = pool.filter((line) => !recentlySpoken.has(line));
    const chosen = freshLines.length > 0 ? getRandom(freshLines) : getRandom(pool);
    rememberLine(chosen);
    return chosen;
  };

  // If no API key is available, use heuristic immediately
  if (!API_KEY) {
    return getFallback();
  }

  const systemPrompt = [
    `You are ${botName}, a player in an intense multiplayer Mafia party game.`,
    `Current Game Phase: ${phase}.`,
    `Living players: ${livingPlayers}.`,
    deadPlayers ? `Eliminated players: ${deadPlayers}.` : '',
    channel === 'mafia'
      ? 'You are chatting secretly on the Mafia night channel. Discuss who to eliminate concisely.'
      : 'You are chatting in the public Town Discussion. Defend yourself, question suspects, and debate.',
    'RULES:',
    '1. Speak in first person, in 1 short sentence (maximum 15 words).',
    '2. ONLY plain text: NO emojis, NO quotes, NO hashtags, NO role revelations.',
    isNamed ? `A player accused or mentioned you directly (${triggerContent}). Defend yourself persuasively!` : '',
  ]
    .filter(Boolean)
    .join(' ');

  const recentTranscript = recentMessages
    .slice(-6)
    .map((m) => `${m.username}: ${m.content}`)
    .join('\n');

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 2500); // 2.5s tight timeout

    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/Mian255/mafia',
        'X-Title': 'Mafia Game Bot Banter',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: `Recent chat:\n${recentTranscript || 'Discussion has just begun.'}\n\nSay your quick in-character remark:`,
          },
        ],
        max_tokens: 35,
        temperature: 0.85,
      }),
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const choice = data?.choices?.[0]?.message?.content;
      if (typeof choice === 'string' && choice.trim().length > 0) {
        const cleaned = cleanChatBubble(choice);
        rememberLine(cleaned);
        return cleaned;
      }
    }
  } catch {
    // OpenRouter error or timeout — seamless fallback
  }

  return getFallback();
}

/**
 * Checks if the current local user should act as the bot coordinator.
 * Elects the room host, or the lowest user_id among living humans if host disconnected.
 */
export function isBotCoordinator(currentUserId: string, players: GamePlayerView[]): boolean {
  const livingHumans = players
    .filter((p) => p.is_alive && !p.is_bot && p.user_id)
    .map((p) => p.user_id as string)
    .sort();
  return livingHumans[0] === currentUserId;
}

// In-flight guard to avoid double-posting
const recentBotDispatches = new Set<string>();
const lastBotPostTime: Record<string, number> = {};
const lastSpokenBot: Record<string, string> = {};

/**
 * Triggers a natural bot reply to a human message or phase event.
 * Dispatches via the secure `post_bot_message` RPC.
 */
export async function dispatchBotChat(params: {
  gameId: string;
  channel: ChatChannel;
  phase: string;
  round: number;
  players: GamePlayerView[];
  recentMessages: ChatMessage[];
  triggerContent?: string;
  triggerSender?: string;
  delayMs?: number;
}): Promise<void> {
  const { gameId, channel, phase, round, players, recentMessages, triggerContent, triggerSender, delayMs = 2500 } = params;

  // CRITICAL: If the trigger was from a bot, NEVER respond! (Prevents bot-to-bot recursion)
  if (triggerSender && (triggerSender.toLowerCase().startsWith('bot') || players.some((p) => p.is_bot && p.bot_name === triggerSender))) {
    return;
  }

  // Enforce a minimum cooldown of 4 seconds between ANY bot posts in this game
  const now = Date.now();
  if (now - (lastBotPostTime[gameId] || 0) < 4000) {
    return;
  }

  // Filter living bots eligible for this channel
  const eligibleBots = players.filter((p) => {
    if (!p.is_alive || !p.is_bot || !p.bot_name) return false;
    if (channel === 'mafia') return p.role === 'mafia';
    return true;
  });

  if (eligibleBots.length === 0) return;

  // If a specific bot was named (e.g. "Sherlock"), pick that bot if living!
  const selectedNamedBot = eligibleBots.find(
    (b) =>
      triggerContent &&
      b.bot_name &&
      triggerContent.toLowerCase().includes(b.bot_name.replace(/^bot\s*/i, '').toLowerCase())
  );

  let selectedBot = selectedNamedBot;
  if (!selectedBot) {
    // Rotate speakers: exclude the bot that spoke last if possible
    const others = eligibleBots.filter((b) => b.bot_name !== lastSpokenBot[gameId]);
    const pool = others.length > 0 ? others : eligibleBots;
    selectedBot = getRandom(pool);
  }

  const botName = selectedBot.bot_name || 'Bot Player';
  const dispatchKey = `${gameId}:${channel}:${round}:${triggerContent ?? 'auto'}:${botName}`;
  if (recentBotDispatches.has(dispatchKey)) return;
  recentBotDispatches.add(dispatchKey);

  // Expire dispatch lock after 15 seconds
  setTimeout(() => recentBotDispatches.delete(dispatchKey), 15000);

  // Humanlike jitter before replying
  setTimeout(async () => {
    try {
      const content = await generateBotMessage({
        botName,
        gameId,
        channel,
        phase,
        round,
        players,
        recentMessages,
        triggerContent,
        triggerSender,
      });

      if (content && content.length > 0) {
        lastBotPostTime[gameId] = Date.now();
        lastSpokenBot[gameId] = botName;
        await postBotMessage(gameId, channel, botName, content);
      }
    } catch (e) {
      console.warn('Bot chat dispatch error:', e);
    }
  }, delayMs);
}

/**
 * Triggers interactive multi-bot banter during town discussion.
 * All living bots chime in sequentially with natural humanlike delays,
 * debating, accusing, and defending so the room feels fully alive.
 */
export async function dispatchMultiBotDiscussion(params: {
  gameId: string;
  round: number;
  players: GamePlayerView[];
  recentMessages: ChatMessage[];
}): Promise<void> {
  const { gameId, round, players, recentMessages } = params;
  const livingBots = players.filter((p) => p.is_alive && p.is_bot && p.bot_name);
  if (livingBots.length === 0) return;

  // Stagger all living bots across the discussion window with natural pacing:
  // Bot 1: 3-5s, Bot 2: 11-14s, Bot 3: 20-23s, Bot 4: 29-33s
  livingBots.forEach((bot, index) => {
    const botName = bot.bot_name as string;
    const delayMs = 3500 + index * 8500 + Math.floor(Math.random() * 2000);
    const dispatchKey = `${gameId}:discussion_wave:${round}:${botName}`;
    if (recentBotDispatches.has(dispatchKey)) return;
    recentBotDispatches.add(dispatchKey);
    setTimeout(() => recentBotDispatches.delete(dispatchKey), 70000);

    setTimeout(async () => {
      try {
        const content = await generateBotMessage({
          botName,
          gameId,
          channel: 'day',
          phase: 'day_discussion',
          round,
          players,
          recentMessages,
        });
        if (content && content.length > 0) {
          lastBotPostTime[gameId] = Date.now();
          lastSpokenBot[gameId] = botName;
          await postBotMessage(gameId, 'day', botName, content);
        }
      } catch (err) {
        console.warn('Multi-bot discussion error for', botName, err);
      }
    }, delayMs);
  });
}

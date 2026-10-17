import { postBotMessage } from './games';
import type { GamePlayerView, ChatMessage } from './games';
import type { ChatChannel } from '../types/database';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b:free';

const API_KEY =
  process.env.EXPO_PUBLIC_OPENROUTER_API_KEY ||
  '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';

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

/** Rich contextual dialogue bank for instant, lag-free bot interactions */
const HEURISTIC_BANTER: Record<string, string[]> = {
  discussion_openers: [
    "Another night has passed... we need to find who among us is lying.",
    "Look at everyone's actions. The Mafia is trying to blend in right now.",
    "Let's not rush our votes today. Who seems the most quiet?",
    "We have to work together and listen carefully to everyone's defense.",
    "I'm keeping a close eye on the quiet ones today.",
  ],
  accused_defenses: [
    "Why are you pointing fingers at me? I've been helping the town all along!",
    "Accusing me is a classic Mafia distraction. Look at the real evidence!",
    "I'm completely innocent! If you vote me out, the town loses a citizen.",
    "Don't fall for this trap. The Mafia wants you to vote out honest players!",
    "That accusation is baseless. What makes you suspect me over anyone else?",
  ],
  general_suspicions: [
    "Someone here is voting in lockstep. We need to pay attention.",
    "I'm suspicious of anyone who rushed the vote earlier.",
    "Notice how quickly the blame shifted? That's suspicious.",
    "Let's see who defends who before we lock in our final votes.",
  ],
  mafia_night_banter: [
    "We need to eliminate the detective before they find us out.",
    "Who seems most dangerous to our team?",
    "Let's stay coordinated and act together tonight.",
    "Targeting a strong voice will throw the town into confusion tomorrow.",
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

  const isNamed =
    triggerContent &&
    botName &&
    triggerContent.toLowerCase().includes(botName.replace(/^bot\s*/i, '').toLowerCase());

  // Fast offline / heuristic fallback if needed
  const getFallback = (): string => {
    if (channel === 'mafia') {
      return getRandom(HEURISTIC_BANTER.mafia_night_banter);
    }
    if (isNamed) {
      const def = getRandom(HEURISTIC_BANTER.accused_defenses);
      return triggerSender ? `${triggerSender}, ${def.toLowerCase()}` : def;
    }
    if (recentMessages.length <= 1) {
      return getRandom(HEURISTIC_BANTER.discussion_openers);
    }
    return getRandom(HEURISTIC_BANTER.general_suspicions);
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
    const timeoutId = setTimeout(() => controller.abort(), 4000); // 4s timeout

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
        max_tokens: 45,
        temperature: 0.85,
      }),
    });
    clearTimeout(timeoutId);

    if (res.ok) {
      const data = await res.json();
      const choice = data?.choices?.[0]?.message?.content;
      if (typeof choice === 'string' && choice.trim().length > 0) {
        return cleanChatBubble(choice);
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
  const { gameId, channel, phase, round, players, recentMessages, triggerContent, triggerSender, delayMs = 1500 } = params;

  // Filter living bots eligible for this channel
  const eligibleBots = players.filter((p) => {
    if (!p.is_alive || !p.is_bot || !p.bot_name) return false;
    if (channel === 'mafia') return p.role === 'mafia';
    return true;
  });

  if (eligibleBots.length === 0) return;

  // If a specific bot was named (e.g. "Sherlock"), pick that bot if living!
  let selectedBot = eligibleBots.find(
    (b) =>
      triggerContent &&
      b.bot_name &&
      triggerContent.toLowerCase().includes(b.bot_name.replace(/^bot\s*/i, '').toLowerCase())
  );

  if (!selectedBot) {
    selectedBot = getRandom(eligibleBots);
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
        await postBotMessage(gameId, channel, botName, content);
      }
    } catch (e) {
      console.warn('Bot chat dispatch error:', e);
    }
  }, delayMs);
}

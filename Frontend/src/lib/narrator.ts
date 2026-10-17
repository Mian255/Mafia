const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const DEFAULT_MODEL = 'openai/gpt-oss-20b:free';

// API key from environment
const API_KEY = process.env.EXPO_PUBLIC_OPENROUTER_API_KEY || '';

/**
 * Strips all markdown formatting, bold/italics, quotes, headers, and emojis
 * to guarantee pure, clean plain text for narration and text-to-speech.
 */
export function cleanPlainText(text: string): string {
  if (!text) return '';
  return text
    // Remove markdown headers
    .replace(/^#+\s+/gm, '')
    // Remove bold/italics/strikethrough (*, _, ~)
    .replace(/[*_~]+/g, '')
    // Remove inline code or quotes
    .replace(/[`"'“”]/g, '')
    // Remove bullet points/dashes at start of line
    .replace(/^[-*+]\s+/gm, '')
    // Remove emojis
    .replace(/[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F700}-\u{1F77F}\u{1F780}-\u{1F7FF}\u{1F800}-\u{1F8FF}\u{1F900}-\u{1F9FF}\u{1FA00}-\u{1FA6F}\u{1FA70}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]/gu, '')
    // Collapse multiple whitespace/newlines
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Core AI Narrator generator using OpenRouter.
 * Generates short, engaging, plain text narration without any markdown or formatting.
 */
export async function generateNarratorScript(eventDescription: string): Promise<string> {
  const systemPrompt = [
    'You are a dramatic, captivating narrator for an online Mafia game.',
    'Generate a short, engaging, high-suspense story snippet for the players.',
    'CRITICAL RULES:',
    '1. Keep it brief: maximum 1 to 2 short sentences.',
    '2. Use ONLY PLAIN TEXT. Do NOT use any bolding, italics, asterisks, hashtags, quotation marks, or emojis.',
    '3. Make it atmospheric and engaging for audio narration.',
  ].join(' ');

  try {
    const res = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/Mian255/mafia',
        'X-Title': 'Mafia Game Narrator',
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Game Event: ${eventDescription}\n\nNarrate this event:` },
        ],
        max_tokens: 60,
        temperature: 0.8,
      }),
    });

    if (!res.ok) {
      console.warn('OpenRouter Narrator request failed:', res.status);
      return cleanPlainText(eventDescription);
    }

    const data = await res.json();
    const rawContent = data?.choices?.[0]?.message?.content;
    if (typeof rawContent === 'string' && rawContent.trim().length > 0) {
      return cleanPlainText(rawContent);
    }
  } catch (err) {
    console.warn('OpenRouter Narrator error:', err);
  }

  return cleanPlainText(eventDescription);
}

/** Generates engaging nightfall narration */
export async function generateNightNarration(round: number): Promise<string> {
  const prompt = `Night ${round} falls over the town. The Mafia wakes up in secrecy while innocent townsfolk close their eyes.`;
  return generateNarratorScript(prompt);
}

/** Generates dawn breaking narration with elimination result */
export async function generateDawnNarration(
  eliminatedPlayerName: string | null,
  roleName: string | null
): Promise<string> {
  const prompt = eliminatedPlayerName
    ? `Dawn arrives. The town gathers to find ${eliminatedPlayerName} was eliminated during the night. They were the ${roleName || 'Town Member'}.`
    : `Dawn arrives. The morning sun shines bright and thankfully everyone survived the quiet night.`;

  return generateNarratorScript(prompt);
}

/** Generates voting execution narration */
export async function generateVotingNarration(targetPlayerName: string | null): Promise<string> {
  const prompt = targetPlayerName
    ? `The town has spoken. By majority vote, ${targetPlayerName} has been exiled from the town.`
    : `The votes were tied. No one was exiled today.`;

  return generateNarratorScript(prompt);
}

/** Generates game over victory narration */
export async function generateGameOverNarration(winningFaction: 'mafia' | 'town'): Promise<string> {
  const prompt =
    winningFaction === 'mafia'
      ? `Shadows take over. The Mafia has gained control and claimed victory!`
      : `Justice prevails! The innocent townsfolk have eliminated all Mafia members and saved their town!`;

  return generateNarratorScript(prompt);
}

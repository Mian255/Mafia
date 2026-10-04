import { supabase } from './supabase';

/**
 * Voice comms client (MAF-070/071/072). Talks to the `voice-token` edge
 * function to obtain a short-lived LiveKit access token, then hands it to
 * @livekit/react-native's AudioSession + LiveKitRoom (see useVoiceRoom hook).
 *
 * Voice rooms (server-side naming):
 *   lobby_<code>          everyone in the room
 *   game_<id>_day         living players talk (muted at night/role_reveal)
 *   game_<id>_mafia       mafia-only coordination channel
 *   game_<id>_ghost       dead players only
 */

export type VoiceChannel = 'lobby' | 'day' | 'mafia' | 'ghost';

export interface VoiceTokenResponse {
  url: string;
  token: string;
  room: string;
  can_publish: boolean;
}

export interface VoiceIdentity {
  roomId?: string;
  gameId?: string;
}

function functionName(): string {
  return 'voice-token';
}

/**
 * Requests a LiveKit token from the edge function. Throws with a friendly
 * message on any failure (not configured / not eligible / network).
 */
export async function requestVoiceToken(
  channel: VoiceChannel,
  ids: VoiceIdentity
): Promise<VoiceTokenResponse> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error('You must be signed in to use voice.');

  const { data, error } = await supabase.functions.invoke(functionName(), {
    body: { channel, room_id: ids.roomId, game_id: ids.gameId },
  });

  if (error) {
    const raw = error.message || '';
    if (raw.includes('503') || raw.toLowerCase().includes('not configured')) {
      throw new Error('Voice chat is not configured yet.');
    }
    if (raw.includes('403') || raw.toLowerCase().includes('not')) {
      throw new Error('You cannot join this voice channel.');
    }
    throw new Error('Voice is unavailable right now.');
  }

  const res = data as VoiceTokenResponse;
  if (!res?.url || !res?.token) throw new Error('Voice is unavailable right now.');
  return res;
}

/**
 * Best-effort teardown of the WebRTC audio session. Safe to call repeatedly.
 */
export async function stopAudioSession(): Promise<void> {
  try {
    const { AudioSession } = await import('@livekit/react-native');
    await AudioSession.stopAudioSession();
  } catch {
    // Session already stopped or native module unavailable (e.g. web).
  }
}

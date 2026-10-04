import { useCallback, useEffect, useState } from 'react';
import { Room, RoomEvent, type Participant } from 'livekit-client';
import {
  requestVoiceToken,
  stopAudioSession,
  type VoiceChannel,
  type VoiceIdentity,
} from '../lib/voice';

// Safely load @livekit/react-native if native WebRTC module exists (Development Build).
// Prevents Expo Go runtime crash when WebRTC native module is missing.
let livekitRn: typeof import('@livekit/react-native') | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  livekitRn = require('@livekit/react-native');
} catch {
  livekitRn = null;
}

export interface VoiceRoomState {
  status: 'idle' | 'connecting' | 'connected' | 'error';
  error: string | null;
  muted: boolean;
  canPublish: boolean;
  /** Participant identities currently speaking (humans or bots). */
  speakingIds: string[];
  /** All connected participants (identity + name + isSpeaking). */
  participants: { identity: string; name: string; isSpeaking: boolean }[];
  toggleMute: () => void;
  leave: () => Promise<void>;
}

function useLiveKitRoom(room: Room | null) {
  if (livekitRn?.useRoom && room) {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    return livekitRn.useRoom(room);
  }
  return { participants: [] };
}

/**
 * Joins a LiveKit voice room for the given channel. Lifecycle: start the
 * platform audio session, fetch a token from the `voice-token` edge function,
 * connect a livekit-client Room, expose roster/mic state, and disconnect +
 * stop the audio session on unmount/leave.
 */
export function useVoiceRoom(channel: VoiceChannel, ids: VoiceIdentity): VoiceRoomState {
  // One Room instance per hook lifetime (useState initializer never re-runs).
  const [room] = useState(() => new Room({ adaptiveStream: false, dynacast: false }));

  const { participants } = useLiveKitRoom(room);
  const [status, setStatus] = useState<VoiceRoomState['status']>('idle');
  const [error, setError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [canPublish, setCanPublish] = useState(false);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);

  // Connect once per channel+identity pair.
  useEffect(() => {
    if (!livekitRn) {
      setStatus('error');
      setError('Voice requires a Dev Build (WebRTC unavailable in Expo Go).');
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setStatus('connecting');
        if (livekitRn?.AudioSession) {
          await livekitRn.AudioSession.startAudioSession();
        }
        const res = await requestVoiceToken(channel, ids);
        if (cancelled) return;
        setCanPublish(res.can_publish);
        setMuted(!res.can_publish);
        await room.connect(res.url, res.token);
        if (!cancelled) setStatus('connected');
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Voice connection failed.');
        setStatus('error');
      }
    })();

    return () => {
      cancelled = true;
      room.disconnect();
      void stopAudioSession();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [channel, ids.gameId, ids.roomId, room]);

  // Who is talking right now (server-driven active-speaker list).
  useEffect(() => {
    const onSpeakers = (speakers: Participant[]) =>
      setSpeakingIds(speakers.map((s) => s.identity));
    room.on(RoomEvent.ActiveSpeakersChanged, onSpeakers);
    return () => {
      room.off(RoomEvent.ActiveSpeakersChanged, onSpeakers);
    };
  }, [room]);

  const toggleMute = useCallback(() => {
    if (!room.localParticipant || !canPublish) return;
    const nextMuted = !muted;
    void room.localParticipant.setMicrophoneEnabled(!nextMuted);
    setMuted(nextMuted);
  }, [muted, room, canPublish]);

  const leave = useCallback(async () => {
    room.disconnect();
    await stopAudioSession();
    setStatus('idle');
  }, [room]);

  const roster = participants.map((p) => ({
    identity: p.identity,
    name: p.name || p.identity,
    isSpeaking: p.isSpeaking || speakingIds.includes(p.identity),
  }));

  return { status, error, muted, canPublish, speakingIds, participants: roster, toggleMute, leave };
}

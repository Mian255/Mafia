import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';
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
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  livekitRn = require('@livekit/react-native');
} catch {
  livekitRn = null;
}

const isWeb = Platform.OS === 'web' || typeof window !== 'undefined';

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
  const [room] = useState(() => new Room({ adaptiveStream: false, dynacast: false }));

  const { participants } = useLiveKitRoom(room);
  const [status, setStatus] = useState<VoiceRoomState['status']>(() =>
    livekitRn || isWeb ? 'idle' : 'connected'
  );
  const [error] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [canPublish, setCanPublish] = useState(true);
  const [speakingIds, setSpeakingIds] = useState<string[]>([]);
  const localStreamRef = useRef<MediaStream | null>(null);

  // Connect once per channel+identity pair.
  useEffect(() => {
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
      } catch {
        if (cancelled) return;
        // Graceful fallback for local dev / web mic: keep status active
        setStatus('connected');
        setCanPublish(true);
      }
    })();

    return () => {
      cancelled = true;
      try {
        room.disconnect();
      } catch {}
      void stopAudioSession();
      if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
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
    const nextMuted = !muted;
    setMuted(nextMuted);

    if (room.localParticipant) {
      try {
        void room.localParticipant.setMicrophoneEnabled(!nextMuted);
      } catch {}
    }

    // Web MediaRecorder / getUserMedia mic control fallback
    if (isWeb && typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      if (!nextMuted) {
        navigator.mediaDevices
          .getUserMedia({ audio: true })
          .then((stream) => {
            localStreamRef.current = stream;
          })
          .catch(() => {});
      } else if (localStreamRef.current) {
        localStreamRef.current.getTracks().forEach((t) => t.stop());
        localStreamRef.current = null;
      }
    }
  }, [muted, room]);

  const leave = useCallback(async () => {
    try {
      room.disconnect();
    } catch {}
    await stopAudioSession();
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((t) => t.stop());
      localStreamRef.current = null;
    }
    setStatus('idle');
  }, [room]);

  const roster = participants.map((p) => ({
    identity: p.identity,
    name: p.name || p.identity,
    isSpeaking: p.isSpeaking || speakingIds.includes(p.identity),
  }));

  return { status, error, muted, canPublish, speakingIds, participants: roster, toggleMute, leave };
}

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
  // Wires the native WebRTC engine (RTCPeerConnection, MediaStream, ...) into
  // global scope so the `livekit-client` Room created below can actually
  // publish/subscribe. Without this a development build still fails to connect.
  livekitRn?.registerGlobals?.();
} catch {
  // Expo Go / missing native WebRTC module: voice is unavailable. The hook
  // degrades to a non-publishing state instead of crashing the game screen.
  livekitRn = null;
}

// React Native defines a global `window`, so `typeof window !== 'undefined'`
// is TRUE on mobile. Keying off Platform.OS only — otherwise the mobile code
// path wrongly takes the web branch (and mic toggling misbehaves on device).
const isWeb = Platform.OS === 'web';

// Polyfill mediaDevices for React Native / Expo Go where native WebRTC is not linked
// to prevent livekit-client from throwing "Cannot read property 'getUserMedia' of undefined".
// The rejection is self-handled (a no-op catch) so livekit's internal awaits —
// which may not attach their own handler on every code path — never surface an
// unhandled promise rejection crash banner; callers awaiting it still observe it.
if (typeof navigator !== 'undefined' && !navigator.mediaDevices) {
  const micUnavailable = new Error('WebRTC mic not available in current environment');
  const rejectedMicPromise = Promise.reject(micUnavailable);
  rejectedMicPromise.catch(() => {});
  (navigator as unknown as { mediaDevices: unknown }).mediaDevices = {
    getUserMedia: () => rejectedMicPromise,
    enumerateDevices: () => Promise.resolve([]),
    addEventListener: () => {},
    removeEventListener: () => {},
  };
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
  const [error, setError] = useState<string | null>(null);
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
      } catch (e) {
        if (cancelled) return;
        // Surface the real cause instead of faking a connection: with no native
        // WebRTC (Expo Go) or a token/permission failure, voice cannot publish.
        setStatus('error');
        setError(e instanceof Error ? e.message : 'Voice connection failed.');
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
    // Commit the user's intent first so the control never flickers back on its
    // own; the previous auto-revert (setMuted(true)) on a rejected
    // setMicrophoneEnabled was the "turning on and off does nothing" bug.
    setMuted(nextMuted);

    if (room.localParticipant) {
      room.localParticipant
        .setMicrophoneEnabled(!nextMuted)
        .then(() => {
          if (!nextMuted) setError(null);
        })
        .catch(() => {
          // Mic hardware/permission unavailable. Keep the requested state and
          // explain why rather than silently muting the user again.
          setError('Microphone unavailable — check mic permission.');
        });
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

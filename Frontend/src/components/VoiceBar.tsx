import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useVoiceRoom, type VoiceRoomState } from '../hooks/useVoiceRoom';
import type { VoiceChannel, VoiceIdentity } from '../lib/voice';

interface VoiceBarProps {
  channel: VoiceChannel;
  ids: VoiceIdentity;
  /** Compact variant for in-game headers. */
  compact?: boolean;
}

/**
 * Drop-in voice strip for a channel. Renders connection status, a mic toggle
 * (only when the server granted publish rights), and who is speaking.
 */
export default function VoiceBar({ channel, ids, compact = false }: VoiceBarProps) {
  const voice: VoiceRoomState = useVoiceRoom(channel, ids);

  if (voice.status === 'error') {
    return (
      <View style={[styles.wrap, compact && styles.compact]}>
        <Text style={styles.errorText} numberOfLines={1}>
          🎙️ {voice.error ?? 'Voice unavailable'}
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrap, compact && styles.compact]}>
      {voice.status === 'connecting' || voice.status === 'idle' ? (
        <ActivityIndicator size="small" color="#38bdf8" />
      ) : (
        <View style={[styles.dot, voice.status === 'connected' ? styles.dotOn : null]} />
      )}

      <Text style={styles.label}>
        {voice.status === 'connected' ? 'VOICE ON' : 'CONNECTING…'}
      </Text>

      {voice.participants.length > 0 && (
        <Text style={styles.speakers} numberOfLines={1}>
          {voice.participants.map((p) => `${p.isSpeaking ? '🔊 ' : ''}${p.name}`).join('  ')}
        </Text>
      )}

      {voice.canPublish ? (
        <TouchableOpacity
          style={[styles.micButton, voice.muted ? styles.micMuted : styles.micLive]}
          onPress={voice.toggleMute}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={styles.micText}>{voice.muted ? '🔇 MUTED' : '🎤 LIVE'}</Text>
        </TouchableOpacity>
      ) : (
        <Text style={styles.listenOnly}>LISTEN ONLY</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#0d1420',
    borderWidth: 1,
    borderColor: '#1e293b',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  compact: {
    paddingVertical: 6,
    borderRadius: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#64748b',
  },
  dotOn: {
    backgroundColor: '#22c55e',
  },
  label: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  speakers: {
    flex: 1,
    color: '#64748b',
    fontSize: 11,
  },
  micButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  micLive: {
    backgroundColor: 'rgba(34, 197, 94, 0.12)',
    borderColor: '#22c55e',
  },
  micMuted: {
    backgroundColor: 'rgba(100, 116, 139, 0.12)',
    borderColor: '#475569',
  },
  micText: {
    color: '#e2e8f0',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
  },
  listenOnly: {
    color: '#475569',
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: 1,
  },
  errorText: {
    flex: 1,
    color: '#f87171',
    fontSize: 11,
  },
});

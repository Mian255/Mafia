import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { ChatPanel, GameShell, PlayerAvatar, type PhaseScreenProps } from './gameUi';
import VoiceBar from '../../components/VoiceBar';
import { colors, fontSize, radius, spacing } from '../../theme/tokens';

/**
 * Day discussion. Living players debate in the town chat and voice channel.
 * If the user is Mafia, they can toggle to their secret syndicate channel to whisper privately.
 * If the user is Detective, their verified investigation records are displayed for reference.
 */
export default function DayDiscussionScreen({ state, currentUserId, narratorMessage }: PhaseScreenProps) {
  const {
    game,
    players,
    messages,
    sendChat,
    activeChannel,
    timeRemaining,
    myRole,
    investigationHistory,
    latestInvestigation,
    mafiaWhisperMode,
    setMafiaWhisperMode,
  } = state;

  const living = players.filter((p) => p.is_alive);
  const isMafia = myRole === 'mafia';
  const isDetective = myRole === 'detective';

  // Gather all unique investigations for detective
  const allIntel = investigationHistory.length > 0
    ? investigationHistory
    : latestInvestigation
      ? [latestInvestigation]
      : [];

  const currentVoiceChannel = isMafia && mafiaWhisperMode ? 'mafia' : 'day';

  return (
    <GameShell
      phaseLabel="Discussion"
      round={game?.round_number}
      timeRemaining={timeRemaining}
      accent={isMafia && mafiaWhisperMode ? colors.mafia : colors.civilian}
      narratorMessage={narratorMessage}
    >
      {/* Living players horizontal strip */}
      <View style={styles.rosterWrap}>
        <Text style={styles.rosterLabel}>{living.length} ALIVE</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.roster}>
          {living.map((p) => (
            <View key={p.id} style={styles.rosterItem}>
              <PlayerAvatar player={p} size={40} />
              <Text style={styles.rosterName} numberOfLines={1}>
                {p.username}
              </Text>
            </View>
          ))}
        </ScrollView>
      </View>

      {/* Detective Investigation Dossier: Displays verified intel */}
      {isDetective && allIntel.length > 0 && (
        <View style={styles.intelWrap}>
          <Text style={styles.intelHeader}>🕵️ DETECTIVE INTEL — YOUR EVIDENCE</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.intelList}>
            {allIntel.map((item, idx) => (
              <View
                key={`${item.round}-${item.targetName || idx}`}
                style={[
                  styles.intelBadge,
                  { borderColor: item.isMafia ? colors.mafia : colors.doctor },
                ]}
              >
                <Text style={styles.intelRound}>R{item.round}</Text>
                <Text style={styles.intelTarget} numberOfLines={1}>
                  {item.targetName || 'Suspect'}
                </Text>
                <Text style={[styles.intelStatus, { color: item.isMafia ? colors.mafia : colors.doctor }]}>
                  {item.isMafia ? '🚨 MAFIA' : '🕊️ INNOCENT'}
                </Text>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Mafia Secret Channel Selector: Allows multiple mafias to communicate privately */}
      {isMafia && (
        <View style={styles.channelToggleBar}>
          <TouchableOpacity
            style={[styles.toggleTab, !mafiaWhisperMode && styles.toggleTabActiveTown]}
            onPress={() => setMafiaWhisperMode(false)}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleTabText, !mafiaWhisperMode && styles.toggleTabTextActive]}>
              📢 Town Discussion
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleTab, mafiaWhisperMode && styles.toggleTabActiveMafia]}
            onPress={() => setMafiaWhisperMode(true)}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleTabText, mafiaWhisperMode && styles.toggleTabTextActive]}>
              🤫 Secret Mafia Channel
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Voice comms: Dynamic channel based on player selection */}
      {game && (
        <View style={styles.voiceWrap}>
          <VoiceBar channel={currentVoiceChannel} ids={{ gameId: game.id }} compact />
        </View>
      )}

      {/* Multi-channel Chat Panel */}
      <ChatPanel
        messages={messages}
        currentUserId={currentUserId}
        onSend={sendChat}
        accent={isMafia && mafiaWhisperMode ? '#ef4444' : colors.civilian}
        placeholder={
          isMafia && mafiaWhisperMode
            ? 'Whisper secretly to your fellow Mafia teammates…'
            : 'Share your suspicions and debate with the town…'
        }
        disabled={!activeChannel}
      />
    </GameShell>
  );
}

const styles = StyleSheet.create({
  rosterWrap: {
    paddingVertical: spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  rosterLabel: {
    color: colors.textDim,
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: spacing.lg,
    marginBottom: spacing.sm,
  },
  roster: {
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  rosterItem: {
    alignItems: 'center',
    width: 56,
  },
  rosterName: {
    color: colors.textMuted,
    fontSize: fontSize.xs,
    marginTop: spacing.xs,
    maxWidth: 56,
  },
  intelWrap: {
    backgroundColor: colors.surfaceRaised,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderStrong,
  },
  intelHeader: {
    color: colors.detective,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.2,
    marginBottom: spacing.xs,
  },
  intelList: {
    gap: spacing.sm,
  },
  intelBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  intelRound: {
    color: colors.textDim,
    fontSize: fontSize.xs,
    fontWeight: '700',
  },
  intelTarget: {
    color: colors.textPrimary,
    fontSize: fontSize.xs,
    fontWeight: '800',
    maxWidth: 90,
  },
  intelStatus: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  channelToggleBar: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    backgroundColor: colors.surfaceAlt,
  },
  toggleTab: {
    flex: 1,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  toggleTabActiveTown: {
    backgroundColor: 'rgba(56, 189, 248, 0.15)',
    borderColor: colors.detective,
  },
  toggleTabActiveMafia: {
    backgroundColor: 'rgba(239, 68, 68, 0.15)',
    borderColor: colors.mafia,
  },
  toggleTabText: {
    color: colors.textDim,
    fontSize: fontSize.xs,
    fontWeight: '800',
  },
  toggleTabTextActive: {
    color: colors.textPrimary,
  },
  voiceWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
  },
});

import React, { useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import type { GamePlayerView } from '../../lib/games';
import VoiceBar from '../../components/VoiceBar';
import NightMaze from '../../components/NightMaze';
import { ChatPanel, GameShell, PrimaryButton, ROLE_COLOR, SeatTile, type PhaseScreenProps } from './gameUi';
import { colors, fontSize, radius, spacing } from '../../theme/tokens';

const ACTION_PROMPT: Record<string, string> = {
  mafia: 'Choose a citizen to eliminate.',
  doctor: 'Choose someone to protect tonight.',
  detective: 'Choose someone to investigate.',
};

const STAGE_ACTOR: Record<string, string> = {
  mafia: 'The Mafia',
  doctor: 'The Doctor',
  detective: 'The Detective',
};

/**
 * Night phase.
 * Special roles (Mafia, Doctor, Detective) can plan, inspect the town, and take their action.
 * Mafias can communicate privately via text and voice throughout the night.
 * Detective immediately sees the verification of their suspect upon confirming their choice.
 * Civilians and waiting players can watch the animated 2D Night Maze so they never get bored!
 */
export default function NightScreen({ state, currentUserId, narratorMessage, speakCustom }: PhaseScreenProps) {
  const {
    game,
    myRole,
    mySeat,
    players,
    timeRemaining,
    submitNightAction,
    getInvestigation,
    messages,
    sendChat,
    nightStage,
    latestInvestigation,
  } = state;

  const accent = myRole ? ROLE_COLOR[myRole] : colors.detective;
  const isSpecialRole = mySeat?.is_alive === true && (myRole === 'mafia' || myRole === 'doctor' || myRole === 'detective');
  const myTurn = isSpecialRole && nightStage != null && nightStage === myRole;

  // Default to 'action' if it's currently my turn to pick, else 'maze' for fun spectating
  const [viewMode, setViewMode] = useState<'maze' | 'action'>(() => (myTurn ? 'action' : 'maze'));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [localInvestigation, setLocalInvestigation] = useState<{ isMafia: boolean; targetName: string } | null>(null);

  // Targets filter based on active role
  const targets = useMemo<GamePlayerView[]>(
    () =>
      players.filter((p) => {
        if (!p.is_alive) return false;
        if (myRole === 'doctor') return true; // may protect anyone, including self
        if (p.id === mySeat?.id) return false; // mafia/detective can't target self
        if (myRole === 'mafia' && p.role === 'mafia') return false; // spare teammates
        return true;
      }),
    [players, myRole, mySeat?.id]
  );

  // Living mafia teammates for syndicate display
  const mafiaTeammates = useMemo<GamePlayerView[]>(
    () => players.filter((p) => p.role === 'mafia'),
    [players]
  );

  const selectedPlayer = useMemo(
    () => players.find((p) => p.id === selectedId) ?? null,
    [players, selectedId]
  );

  const handleConfirmAction = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await submitNightAction(selectedId);
      setSubmitted(true);

      if (myRole === 'detective') {
        speakCustom?.('Detective, investigation complete. Review your intel.');
        // Query investigation result immediately
        const res = await getInvestigation(game?.round_number || 1);
        if (res) {
          setLocalInvestigation({
            isMafia: res.isMafia,
            targetName: res.targetName || selectedPlayer?.username || 'Suspect',
          });
        }
      } else if (myRole === 'mafia') {
        speakCustom?.('Mafia, target locked. Plan quietly with your team.');
      } else if (myRole === 'doctor') {
        speakCustom?.('Doctor, patient protected tonight.');
      }
    } catch (e) {
      Alert.alert('Action failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const activeInvestigation = localInvestigation || (latestInvestigation ? {
    isMafia: latestInvestigation.isMafia,
    targetName: latestInvestigation.targetName || 'Suspect',
  } : null);

  return (
    <GameShell phaseLabel="Night" round={game?.round_number} timeRemaining={timeRemaining} accent={accent} narratorMessage={narratorMessage}>
      {/* Mafia Private Voice Comms: Active throughout the entire Night for all living Mafia */}
      {game && myRole === 'mafia' && (
        <View style={styles.commsWrap}>
          <View style={styles.syndicateBanner}>
            <Text style={styles.syndicateTitle}>🩸 MAFIA SYNDICATE ({mafiaTeammates.length} Members)</Text>
            <Text style={styles.syndicateMembers}>
              {mafiaTeammates.map((m) => `${m.username}${m.id === mySeat?.id ? ' (You)' : ''}`).join(' • ')}
            </Text>
          </View>
          <VoiceBar channel="mafia" ids={{ gameId: game.id }} compact />
        </View>
      )}

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {/* Detective Investigation Result Reveal: Immediate feedback when guess is confirmed */}
        {myRole === 'detective' && activeInvestigation && (
          <View
            style={[
              styles.investigationCard,
              { borderColor: activeInvestigation.isMafia ? colors.mafia : colors.doctor },
            ]}
          >
            <Text style={styles.investigationBadge}>
              {activeInvestigation.isMafia ? '🚨 GUILTY — MAFIA FOUND' : '🕊️ INNOCENT — CITIZEN'}
            </Text>
            <Text style={styles.investigationTitle}>
              {activeInvestigation.targetName}
            </Text>
            <Text style={[styles.investigationDetail, { color: activeInvestigation.isMafia ? '#fca5a5' : '#86efac' }]}>
              {activeInvestigation.isMafia
                ? 'Your investigation confirmed: This player is a member of the Mafia!'
                : 'Your investigation confirmed: This player is NOT Mafia. They belong to the Town.'}
            </Text>
          </View>
        )}

        {/* View Switcher: 2D Animated Sleepwalking Maze vs Town / Role Action */}
        <View style={styles.viewToggleBar}>
          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'maze' && styles.toggleBtnActive]}
            onPress={() => setViewMode('maze')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleBtnText, viewMode === 'maze' && styles.toggleBtnTextActive]}>
              🗺️ Night Maze Spectate
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.toggleBtn, viewMode === 'action' && styles.toggleBtnActive]}
            onPress={() => setViewMode('action')}
            activeOpacity={0.8}
          >
            <Text style={[styles.toggleBtnText, viewMode === 'action' && styles.toggleBtnTextActive]}>
              {myTurn ? '🎯 Select Target' : isSpecialRole ? '📋 Town Roster' : '👥 Sleeping Town'}
            </Text>
          </TouchableOpacity>
        </View>

        {viewMode === 'maze' ? (
          <NightMaze
            key={players.map((p) => `${p.id}:${p.is_alive}`).join(',')}
            players={players}
            currentUserId={currentUserId}
          />
        ) : myTurn ? (
          /* When it IS my turn: Active selection grid and action controls */
          <View style={styles.actionSection}>
            <Text style={styles.prompt}>{ACTION_PROMPT[myRole ?? '']}</Text>
            {submitted && (
              <View style={[styles.submittedBanner, { borderColor: accent }]}>
                <Text style={[styles.submittedText, { color: accent }]}>
                  ✓ Choice locked in: {selectedPlayer?.username ?? 'Target selected'}. You can still change it before dawn.
                </Text>
              </View>
            )}
            <View style={styles.grid}>
              {targets.map((p) => (
                <SeatTile
                  key={p.id}
                  player={p}
                  accent={accent}
                  selected={selectedId === p.id}
                  onPress={(sel) => setSelectedId(sel.id)}
                  subtitle={p.role === 'mafia' && myRole === 'mafia' ? 'Ally' : undefined}
                />
              ))}
            </View>
          </View>
        ) : isSpecialRole ? (
          /* When it is NOT my turn yet: Show rich preparation state with town roster so the screen is never blank */
          <View style={styles.prepSection}>
            <View style={styles.prepCard}>
              <Text style={styles.prepHeader}>🌙 NIGHT IN PROGRESS</Text>
              <Text style={styles.prepStageText}>
                {nightStage
                  ? `${STAGE_ACTOR[nightStage]} is currently taking their turn.`
                  : 'Special roles are acting under cover of darkness.'}
              </Text>
              <Text style={styles.prepInstruction}>
                You are the <Text style={{ color: accent, fontWeight: '800' }}>{myRole?.toUpperCase()}</Text>.
                {' '}Inspect the town below to prepare your choice when the narrator calls you.
              </Text>
            </View>

            <Text style={styles.prepRosterTitle}>Town Roster ({players.filter((p) => p.is_alive).length} Alive)</Text>
            <View style={styles.grid}>
              {targets.map((p) => (
                <SeatTile
                  key={p.id}
                  player={p}
                  accent={accent}
                  selected={selectedId === p.id}
                  onPress={(sel) => setSelectedId(sel.id)}
                  subtitle={p.role === 'mafia' && myRole === 'mafia' ? 'Ally' : 'Candidate'}
                />
              ))}
            </View>
          </View>
        ) : (
          /* Civilians: Atmospheric sleeping town display */
          <View style={styles.civilianSection}>
            <View style={styles.civilianCard}>
              <Text style={styles.civilianMoon}>🌙</Text>
              <Text style={styles.civilianTitle}>The Town Sleeps…</Text>
              <Text style={styles.civilianText}>
                You are a peaceful citizen resting in your home. Special roles are moving through the shadows. Listen closely to the night sounds and prepare for dawn.
              </Text>
            </View>

            <Text style={styles.prepRosterTitle}>Surviving Town ({players.filter((p) => p.is_alive).length} Citizens)</Text>
            <View style={styles.grid}>
              {players.filter((p) => p.is_alive).map((p) => (
                <SeatTile key={p.id} player={p} accent={colors.civilian} disabled />
              ))}
            </View>
          </View>
        )}

        {/* Secret Mafia Text Chat: Always visible to Mafia players throughout the Night */}
        {myRole === 'mafia' && (
          <View style={styles.nightChatWrap}>
            <Text style={styles.nightChatLabel}>🔒 SECRET MAFIA CHAT — TEAM ONLY</Text>
            <ChatPanel
              messages={messages}
              currentUserId={currentUserId}
              onSend={sendChat}
              accent="#ef4444"
              placeholder="Coordinate secretly with your fellow Mafia…"
            />
          </View>
        )}
      </ScrollView>

      {/* Confirmation footer button when it's the player's turn */}
      {myTurn && (
        <View style={styles.footer}>
          <PrimaryButton
            label={submitting ? 'Confirming…' : submitted ? 'Update Choice' : 'Confirm Night Choice'}
            onPress={handleConfirmAction}
            disabled={!selectedId || submitting}
            accent={accent}
          />
        </View>
      )}
    </GameShell>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    paddingBottom: spacing.xxl * 2,
  },
  commsWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  syndicateBanner: {
    backgroundColor: 'rgba(220, 38, 38, 0.12)',
    borderColor: 'rgba(220, 38, 38, 0.4)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.sm,
  },
  syndicateTitle: {
    color: '#ef4444',
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  syndicateMembers: {
    color: colors.textSecondary,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  investigationCard: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 2,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.xl,
    alignItems: 'center',
  },
  investigationBadge: {
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: colors.textPrimary,
    marginBottom: spacing.xs,
  },
  investigationTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: '900',
    marginBottom: spacing.xs,
  },
  investigationDetail: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 18,
  },
  actionSection: {
    marginBottom: spacing.xl,
  },
  prompt: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  submittedBanner: {
    backgroundColor: 'rgba(16, 185, 129, 0.1)',
    borderWidth: 1,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.lg,
    alignItems: 'center',
  },
  submittedText: {
    fontSize: fontSize.sm,
    fontWeight: '700',
    textAlign: 'center',
  },
  prepSection: {
    marginBottom: spacing.xl,
  },
  prepCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.borderStrong,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  prepHeader: {
    color: colors.textDim,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
  },
  prepStageText: {
    color: colors.textPrimary,
    fontSize: fontSize.md,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  prepInstruction: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 18,
    textAlign: 'center',
  },
  prepRosterTitle: {
    color: colors.textDim,
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
    marginBottom: spacing.md,
  },
  civilianSection: {
    marginBottom: spacing.xl,
  },
  civilianCard: {
    backgroundColor: colors.surfaceAlt,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.xl,
    alignItems: 'center',
    marginBottom: spacing.xl,
  },
  civilianMoon: {
    fontSize: 36,
    marginBottom: spacing.sm,
  },
  civilianTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '800',
    marginBottom: spacing.xs,
  },
  civilianText: {
    color: colors.textMuted,
    fontSize: fontSize.sm,
    lineHeight: 20,
    textAlign: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  nightChatWrap: {
    marginTop: spacing.xl,
    height: 270,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.4)',
    borderRadius: radius.md,
    backgroundColor: 'rgba(239, 68, 68, 0.05)',
    padding: spacing.md,
  },
  nightChatLabel: {
    color: '#ef4444',
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  viewToggleBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginBottom: spacing.md,
    backgroundColor: '#0d1424',
    padding: 4,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: '#1e293b',
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    borderRadius: radius.sm,
  },
  toggleBtnActive: {
    backgroundColor: '#1e293b',
    borderColor: '#38bdf8',
    borderWidth: 1,
  },
  toggleBtnText: {
    color: colors.textDim,
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  toggleBtnTextActive: {
    color: '#ffffff',
  },
});

import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';
import type { GamePlayerView } from '../../lib/games';
import VoiceBar from '../../components/VoiceBar';
import { ChatPanel, GameShell, PrimaryButton, ROLE_COLOR, SeatTile, type PhaseScreenProps } from './gameUi';
import { colors, fontSize, radius, spacing } from '../../theme/tokens';

const ACTION_PROMPT: Record<string, string> = {
  mafia: 'Choose a citizen to eliminate.',
  doctor: 'Choose someone to protect tonight.',
  detective: 'Choose someone to investigate.',
};

// Human label for whoever is currently awake, shown in the waiting state.
const STAGE_ACTOR: Record<string, string> = {
  mafia: 'The Mafia',
  doctor: 'The Doctor',
  detective: 'The Detective',
};

/**
 * Night phase. Mafia / doctor / detective pick a living seat; everyone else
 * waits. The detective also sees their previous-round investigation result via
 * the private get_investigation_result RPC.
 */
export default function NightScreen({ state, currentUserId, narratorMessage, speakCustom }: PhaseScreenProps) {
  const { game, myRole, mySeat, players, timeRemaining, submitNightAction, getInvestigation, messages, sendChat, nightStage } = state;
  const accent = myRole ? ROLE_COLOR[myRole] : colors.detective;
  const canAct = mySeat?.is_alive === true && (myRole === 'mafia' || myRole === 'doctor' || myRole === 'detective');
  // Sequential turns: you may act only while the narrator has woken YOUR role.
  const myTurn = canAct && nightStage != null && nightStage === myRole;

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [investigation, setInvestigation] = useState<boolean | null>(null);

  // Fetch the previous round's detective result (private; never broadcast).
  useEffect(() => {
    let active = true;
    if (myRole === 'detective' && game && game.round_number > 1) {
      getInvestigation(game.round_number - 1).then((res) => {
        if (active) setInvestigation(res);
      });
    }
    return () => {
      active = false;
    };
  }, [myRole, game?.round_number, getInvestigation, game]);

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

  const handleSubmit = async () => {
    if (!selectedId) return;
    setSubmitting(true);
    try {
      await submitNightAction(selectedId);
      setSubmitted(true);
      if (myRole === 'mafia') {
        speakCustom?.('Mafia, target chosen. Close your eyes.');
      } else if (myRole === 'doctor') {
        speakCustom?.('Doctor, protection chosen. Close your eyes.');
      } else if (myRole === 'detective') {
        speakCustom?.('Detective, investigation chosen. Close your eyes.');
      }
    } catch (e) {
      Alert.alert('Action failed', e instanceof Error ? e.message : 'Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <GameShell phaseLabel="Night" round={game?.round_number} timeRemaining={timeRemaining} accent={accent} narratorMessage={narratorMessage}>
      {/* Mafia coordinate by voice AND secret text chat, but only during their
          own night stage (once they close their eyes the channel goes quiet). */}
      {game && myRole === 'mafia' && nightStage === 'mafia' && (
        <View style={styles.commsWrap}>
          <VoiceBar channel="mafia" ids={{ gameId: game.id }} compact />
        </View>
      )}
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {myRole === 'detective' && investigation !== null && (
          <View style={[styles.resultBanner, { borderColor: investigation ? colors.mafia : colors.doctor }]}>
            <Text style={styles.resultLabel}>LAST INVESTIGATION</Text>
            <Text style={[styles.resultValue, { color: investigation ? colors.mafia : colors.doctor }]}>
              {investigation ? 'Your suspect is MAFIA' : 'Your suspect is NOT mafia'}
            </Text>
          </View>
        )}

        {myTurn ? (
          <>
            <Text style={styles.prompt}>{ACTION_PROMPT[myRole ?? '']}</Text>
            {submitted && (
              <Text style={[styles.submittedNote, { color: accent }]}>
                Choice locked in — you can still change it before dawn.
              </Text>
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
          </>
        ) : (
          <View style={styles.waitBlock}>
            <Text style={styles.waitTitle}>The town sleeps…</Text>
            <Text style={styles.waitText}>
              {nightStage
                ? `${STAGE_ACTOR[nightStage]} is making their move. Sit tight until the narrator calls you.`
                : 'Special roles are making their move under the cover of darkness. Sit tight until dawn.'}
            </Text>
          </View>
        )}

        {/* Secret mafia text chat at night: living mafia coordinate like in
            tabletop Mafia, alongside the voice bar. Realtime stream comes from
            useGameState (activeChannel === 'mafia' during night for mafia). */}
        {myRole === 'mafia' && nightStage === 'mafia' && (
          <View style={styles.nightChatWrap}>
            <Text style={styles.nightChatLabel}>MAFIA CHANNEL — SECRET</Text>
            <ChatPanel
              messages={messages}
              currentUserId={currentUserId}
              onSend={sendChat}
              accent="#ef4444"
              placeholder="Plan quietly with your team…"
            />
          </View>
        )}
      </ScrollView>

      {myTurn && (
        <View style={styles.footer}>
          <PrimaryButton
            label={submitting ? 'Submitting…' : submitted ? 'Change Choice' : 'Confirm'}
            onPress={handleSubmit}
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
  },
  commsWrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
  },
  nightChatWrap: {
    marginTop: spacing.xl,
    height: 260,
    borderWidth: 1,
    borderColor: 'rgba(239, 68, 68, 0.35)',
    borderRadius: radius.md,
    backgroundColor: 'rgba(239, 68, 68, 0.06)',
    padding: spacing.md,
  },
  nightChatLabel: {
    color: '#ef4444',
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: spacing.sm,
  },
  prompt: {
    color: colors.textSecondary,
    fontSize: fontSize.lg,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: spacing.lg,
  },
  submittedNote: {
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginBottom: spacing.md,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: spacing.md,
  },
  waitBlock: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
  },
  waitTitle: {
    color: colors.textPrimary,
    fontSize: fontSize.xl,
    fontWeight: '800',
    marginBottom: spacing.md,
  },
  waitText: {
    color: colors.textMuted,
    fontSize: fontSize.md,
    lineHeight: 20,
    textAlign: 'center',
  },
  resultBanner: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    padding: spacing.md,
    marginBottom: spacing.xl,
    backgroundColor: colors.surface,
  },
  resultLabel: {
    color: colors.textDim,
    fontSize: fontSize.xs,
    fontWeight: '800',
    letterSpacing: 1,
  },
  resultValue: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    marginTop: spacing.xs,
  },
  footer: {
    padding: spacing.xl,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
});

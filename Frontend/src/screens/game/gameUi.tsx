import React, { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Image,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { CHARACTER_IMAGES, type RoleId } from '../../components/RoleCard';
import { colors, fontSize, radius, spacing } from '../../theme/tokens';
import type { GameRole } from '../../types/database';
import type { ChatMessage, GamePlayerView } from '../../lib/games';
import type { GameStateValue } from '../../hooks/useGameState';

// Shared props every phase sub-screen receives from the GameScreen container.
export interface PhaseScreenProps {
  state: GameStateValue;
  currentUserId: string;
  onExit: () => void;
}

// Role accent colours + labels reused across the game screens.
export const ROLE_COLOR: Record<GameRole, string> = {
  mafia: colors.mafia,
  detective: colors.detective,
  doctor: colors.doctor,
  civilian: colors.civilian,
};

export const ROLE_LABEL: Record<GameRole, string> = {
  mafia: 'Mafia',
  detective: 'Detective',
  doctor: 'Doctor',
  civilian: 'Civilian',
};

type AvatarSource =
  | { type: 'uri'; uri: string }
  | { type: 'local'; source: ImageSourcePropType }
  | null;

// Mirrors HomeScreen/LobbyScreen: avatar_url is a real uploaded URL, a RoleId key
// into CHARACTER_IMAGES (bots + role avatars), or empty -> initial-letter fallback.
export function resolveAvatarSource(avatarUrl: string | null | undefined): AvatarSource {
  if (!avatarUrl) return null;
  if (avatarUrl.startsWith('http')) return { type: 'uri', uri: avatarUrl };
  if (avatarUrl in CHARACTER_IMAGES) {
    return { type: 'local', source: CHARACTER_IMAGES[avatarUrl as RoleId] };
  }
  return null;
}

/** Formats a second count as m:ss (e.g. 65 -> "1:05"). */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return `${m}:${rem.toString().padStart(2, '0')}`;
}

interface PlayerAvatarProps {
  player: GamePlayerView;
  size?: number;
}

/** Circular avatar for a seat; dims when the player is dead, falls back to an initial. */
export function PlayerAvatar({ player, size = 56 }: PlayerAvatarProps) {
  const source = resolveAvatarSource(player.avatar_url);
  const initial = (player.username?.trim()?.[0] ?? '?').toUpperCase();
  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          opacity: player.is_alive ? 1 : 0.4,
        },
      ]}
    >
      {source ? (
        <Image
          source={source.type === 'uri' ? { uri: source.uri } : source.source}
          style={{ width: size, height: size }}
          resizeMode="cover"
        />
      ) : (
        <Text style={[styles.avatarInitial, { fontSize: size * 0.4 }]}>{initial}</Text>
      )}
    </View>
  );
}

interface SeatTileProps {
  player: GamePlayerView;
  selected?: boolean;
  disabled?: boolean;
  onPress?: (player: GamePlayerView) => void;
  subtitle?: string;
  accent?: string;
}

/** Tappable roster tile used by night/voting; non-interactive when dead/disabled. */
export function SeatTile({
  player,
  selected,
  disabled,
  onPress,
  subtitle,
  accent = colors.accent,
}: SeatTileProps) {
  const dead = !player.is_alive;
  const interactive = !!onPress && !disabled && !dead;
  return (
    <TouchableOpacity
      style={[
        styles.seat,
        selected && { borderColor: accent, backgroundColor: colors.surfaceRaised },
        (disabled || dead) && styles.seatDisabled,
      ]}
      activeOpacity={interactive ? 0.8 : 1}
      disabled={!interactive}
      onPress={() => onPress?.(player)}
      accessibilityRole={interactive ? 'button' : undefined}
      accessibilityState={{ selected: !!selected, disabled: !interactive }}
      accessibilityLabel={`${player.username}${dead ? ', eliminated' : ''}`}
    >
      <PlayerAvatar player={player} size={44} />
      <Text style={styles.seatName} numberOfLines={1}>
        {player.username}
      </Text>
      {dead ? (
        <Text style={styles.seatOut}>OUT</Text>
      ) : subtitle ? (
        <Text style={[styles.seatSubtitle, { color: accent }]} numberOfLines={1}>
          {subtitle}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

interface PrimaryButtonProps {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  accent?: string;
  variant?: 'solid' | 'outline';
}

/** The shared call-to-action button (Submit action, Skip vote, Back to Home). */
export function PrimaryButton({
  label,
  onPress,
  disabled,
  accent = colors.accent,
  variant = 'solid',
}: PrimaryButtonProps) {
  const outline = variant === 'outline';
  return (
    <TouchableOpacity
      style={[
        styles.button,
        outline
          ? { backgroundColor: 'transparent', borderColor: accent, borderWidth: 1 }
          : { backgroundColor: accent },
        disabled && styles.buttonDisabled,
      ]}
      activeOpacity={0.85}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
    >
      <Text style={[styles.buttonText, outline && { color: accent }]}>{label}</Text>
    </TouchableOpacity>
  );
}

interface GameShellProps {
  phaseLabel: string;
  round?: number;
  timeRemaining?: number;
  accent?: string;
  children: React.ReactNode;
}

/** Dark screen shell + header (phase label, round, countdown) shared by all phases. */
export function GameShell({
  phaseLabel,
  round,
  timeRemaining,
  accent = colors.accent,
  children,
}: GameShellProps) {
  return (
    <View style={styles.shell}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={styles.headerTitleGroup}>
          <Text style={[styles.phaseLabel, { color: accent }]} numberOfLines={1}>
            {phaseLabel}
          </Text>
          {typeof round === 'number' && <Text style={styles.roundLabel}>Round {round}</Text>}
        </View>
        {typeof timeRemaining === 'number' && (
          <View style={[styles.timerPill, { borderColor: accent }]}>
            <Text style={[styles.timerText, { color: accent }]}>{formatTime(timeRemaining)}</Text>
          </View>
        )}
      </View>
      <View style={styles.body}>{children}</View>
    </View>
  );
}

interface ChatPanelProps {
  messages: ChatMessage[];
  currentUserId: string;
  onSend: (content: string) => Promise<void>;
  accent?: string;
  placeholder?: string;
  disabled?: boolean;
}

/** Reusable chat feed + composer (day / mafia / ghost channels). */
export function ChatPanel({
  messages,
  currentUserId,
  onSend,
  accent = colors.accent,
  placeholder = 'Say something…',
  disabled,
}: ChatPanelProps) {
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const listRef = useRef<FlatList<ChatMessage>>(null);

  const submit = useCallback(async () => {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setDraft('');
    try {
      await onSend(text);
    } catch {
      setDraft(text); // restore on failure so the user can retry
    } finally {
      setSending(false);
    }
  }, [draft, sending, onSend]);

  return (
    <KeyboardAvoidingView
      style={styles.chatWrap}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={80}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.chatList}
        showsVerticalScrollIndicator={false}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={<Text style={styles.chatEmpty}>No messages yet. Start the discussion.</Text>}
        renderItem={({ item }) => {
          const mine = item.sender_id === currentUserId;
          return (
            <View style={[styles.bubbleRow, mine && styles.bubbleRowMine]}>
              <View style={[styles.bubble, mine && { backgroundColor: accent }, item.isBot && styles.bubbleBot]}>
                {!mine && (
                  <Text style={[styles.bubbleName, item.isBot && styles.bubbleNameBot]}>
                    {item.isBot ? '🤖 ' : ''}
                    {item.username}
                  </Text>
                )}
                <Text style={styles.bubbleText}>{item.content}</Text>
              </View>
            </View>
          );
        }}
      />
      <View style={styles.composer}>
        <TextInput
          style={styles.input}
          value={draft}
          onChangeText={setDraft}
          placeholder={disabled ? 'Chat unavailable' : placeholder}
          placeholderTextColor={colors.textFaint}
          editable={!disabled}
          maxLength={500}
          onSubmitEditing={submit}
          returnKeyType="send"
          accessibilityLabel="Message input"
        />
        <TouchableOpacity
          style={[styles.sendBtn, { backgroundColor: accent }, (disabled || !draft.trim()) && styles.sendDisabled]}
          onPress={submit}
          disabled={disabled || !draft.trim() || sending}
          accessibilityRole="button"
          accessibilityLabel="Send message"
        >
          <Text style={styles.sendText}>Send</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  shell: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 54,
    paddingBottom: spacing.lg,
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  headerTitleGroup: {
    flex: 1,
    marginRight: spacing.md,
  },
  phaseLabel: {
    fontSize: fontSize.xl,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  roundLabel: {
    color: colors.textDim,
    fontSize: fontSize.sm,
    fontWeight: '600',
    marginTop: 2,
  },
  timerPill: {
    minWidth: 56,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: 1.5,
    alignItems: 'center',
  },
  timerText: {
    fontSize: fontSize.lg,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  body: {
    flex: 1,
  },
  avatar: {
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarInitial: {
    color: colors.textBright,
    fontWeight: '800',
  },
  seat: {
    width: '30%',
    alignItems: 'center',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xs,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  seatDisabled: {
    opacity: 0.55,
  },
  seatName: {
    color: colors.textSecondary,
    fontSize: fontSize.sm,
    fontWeight: '700',
    marginTop: spacing.sm,
    maxWidth: '100%',
  },
  seatOut: {
    color: colors.accent,
    fontSize: fontSize.xs,
    fontWeight: '900',
    letterSpacing: 1,
    marginTop: 2,
  },
  seatSubtitle: {
    fontSize: fontSize.xs,
    fontWeight: '700',
    marginTop: 2,
  },
  button: {
    paddingVertical: spacing.lg,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: colors.textPrimary,
    fontSize: fontSize.lg,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  chatWrap: {
    flex: 1,
  },
  chatList: {
    padding: spacing.lg,
    flexGrow: 1,
  },
  chatEmpty: {
    color: colors.textFaint,
    fontSize: fontSize.sm,
    textAlign: 'center',
    marginTop: spacing.xxl,
  },
  bubbleRow: {
    flexDirection: 'row',
    marginBottom: spacing.sm,
  },
  bubbleRowMine: {
    justifyContent: 'flex-end',
  },
  bubble: {
    maxWidth: '80%',
    backgroundColor: colors.surfaceRaised,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bubbleName: {
    color: colors.textDim,
    fontSize: fontSize.xs,
    fontWeight: '800',
    marginBottom: 2,
  },
  bubbleBot: {
    borderWidth: 1,
    borderColor: 'rgba(56, 189, 248, 0.35)',
  },
  bubbleNameBot: {
    color: '#38bdf8',
  },
  bubbleText: {
    color: colors.textBright,
    fontSize: fontSize.md,
    lineHeight: 18,
  },
  composer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.md,
    gap: spacing.sm,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surfaceAlt,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.textPrimary,
    fontSize: fontSize.md,
  },
  sendBtn: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.pill,
  },
  sendDisabled: {
    opacity: 0.5,
  },
  sendText: {
    color: colors.textPrimary,
    fontSize: fontSize.sm,
    fontWeight: '800',
  },
});

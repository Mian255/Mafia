import React, { useCallback, useEffect, useState } from 'react';
import {
  Image,
  LayoutChangeEvent,
  StyleSheet,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import type { GamePlayerView } from '../lib/games';
import { resolveAvatarSource } from '../screens/game/gameUi';
import { colors, fontSize, radius, spacing } from '../theme/tokens';

// Maze Grid Layout (0 = Walkable Corridor, 1 = Wall)
// 9 columns x 11 rows with open loop corridors and multiple intersections
const MAZE_GRID = [
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 1, 0, 0, 0, 1, 0, 1],
  [1, 0, 0, 1, 0, 1, 0, 0, 1],
  [1, 0, 0, 0, 0, 0, 0, 0, 1],
  [1, 0, 0, 1, 0, 1, 0, 0, 1],
  [1, 0, 1, 0, 0, 0, 1, 0, 1],
  [1, 0, 1, 0, 1, 0, 1, 0, 1],
  [1, 0, 0, 0, 1, 0, 0, 0, 1],
  [1, 1, 1, 1, 1, 1, 1, 1, 1],
];

const ROWS = MAZE_GRID.length; // 11
const COLS = MAZE_GRID[0].length; // 9

interface Cell {
  r: number;
  c: number;
}

// Pre-gather all walkable corridor cells
const WALKABLE_CELLS: Cell[] = [];
for (let r = 0; r < ROWS; r++) {
  for (let c = 0; c < COLS; c++) {
    if (MAZE_GRID[r][c] === 0) {
      WALKABLE_CELLS.push({ r, c });
    }
  }
}

// Neighbor offsets: Up, Down, Left, Right
const DIRECTIONS = [
  { dr: -1, dc: 0, name: 'up' },
  { dr: 1, dc: 0, name: 'down' },
  { dr: 0, dc: -1, name: 'left' },
  { dr: 0, dc: 1, name: 'right' },
];

const THOUGHT_BUBBLES = [
  'Zzz… 😴',
  'Who’s there? 👀',
  'Footsteps?! 👣',
  'Shhh… 🤫',
  'Is it dawn yet? 🌅',
  'Walking in circles…',
  'Cold draft! 💨',
  'Looking for tea ☕',
  'Did someone whisper?',
  'I’m totally innocent 😇',
  'Just sleepwalking…',
  'Watch your back! 🕵️',
  'Lost in the dark… 🕯️',
  'Creaky floorboards!',
];

interface AvatarState {
  playerId: string;
  username: string;
  avatarUrl: string | null;
  isMe: boolean;
  currR: number;
  currC: number;
  targetR: number;
  targetC: number;
  progress: number; // 0 to 1 between curr and target
  speed: number;
  lastDr: number;
  lastDc: number;
  thought: string | null;
  thoughtUntil: number;
  bouncing: boolean;
}

interface Candle {
  id: string;
  r: number;
  c: number;
  expiresAt: number;
}

export interface NightMazeProps {
  players: GamePlayerView[];
  currentUserId: string;
}

function buildInitialAvatars(players: GamePlayerView[], currentUserId: string): AvatarState[] {
  if (WALKABLE_CELLS.length === 0) return [];
  const list = players.filter((p) => p.is_alive);
  const activePlayers = list.length > 0 ? list : players;

  return activePlayers.map((player, idx) => {
    // Space them out evenly across available corridor cells
    const startCell = WALKABLE_CELLS[(idx * 7 + 3) % WALKABLE_CELLS.length];
    const isMe = player.user_id === currentUserId;

    return {
      playerId: player.id,
      username: player.username || 'Player',
      avatarUrl: player.avatar_url,
      isMe,
      currR: startCell.r,
      currC: startCell.c,
      targetR: startCell.r,
      targetC: startCell.c,
      progress: 1, // Ready to pick next neighbor immediately
      speed: 0.035 + Math.random() * 0.02, // Pleasant wandering speed
      lastDr: 0,
      lastDc: 0,
      thought: idx === 0 ? 'Quiet night… 🌙' : null,
      thoughtUntil: idx === 0 ? Date.now() + 4000 : 0,
      bouncing: false,
    };
  });
}

export default function NightMaze({ players, currentUserId }: NightMazeProps) {
  const [boardWidth, setBoardWidth] = useState(0);
  const [candles, setCandles] = useState<Candle[]>([]);
  const [avatars, setAvatars] = useState<AvatarState[]>(() =>
    buildInitialAvatars(players, currentUserId)
  );

  // Calculate cell size dynamically from container width
  const cellWidth = boardWidth > 0 ? boardWidth / COLS : 36;
  const cellHeight = cellWidth; // square cells
  const avatarSize = Math.max(22, cellWidth * 0.78);

  // Main simulation tick loop (running at ~40ms / 25fps for silky smooth motion)
  useEffect(() => {
    const animId = setInterval(() => {
      const now = Date.now();

      // Clean up expired candles
      setCandles((prev) => prev.filter((c) => c.expiresAt > now));

      setAvatars((prev) => {
        if (prev.length === 0) return prev;

        let changed = false;
        const next = prev.map((a) => {
          const updated = { ...a };

          // Clear expired thoughts
          if (updated.thought && now > updated.thoughtUntil) {
            updated.thought = null;
            changed = true;
          }

          // Randomly trigger spontaneous funny thought bubble (rare)
          if (!updated.thought && Math.random() < 0.003) {
            updated.thought = THOUGHT_BUBBLES[Math.floor(Math.random() * THOUGHT_BUBBLES.length)];
            updated.thoughtUntil = now + 3500;
            changed = true;
          }

          // Advance movement progress
          if (updated.progress < 1) {
            updated.progress = Math.min(1, updated.progress + updated.speed);
            changed = true;
          } else {
            // Reached destination cell: adopt it as current cell
            updated.currR = updated.targetR;
            updated.currC = updated.targetC;

            // Find available corridor neighbors (where MAZE_GRID is 0)
            const validMoves: { r: number; c: number; dr: number; dc: number }[] = [];
            for (const d of DIRECTIONS) {
              const nr = updated.currR + d.dr;
              const nc = updated.currC + d.dc;
              if (nr >= 0 && nr < ROWS && nc >= 0 && nc < COLS && MAZE_GRID[nr][nc] === 0) {
                validMoves.push({ r: nr, c: nc, dr: d.dr, dc: d.dc });
              }
            }

            if (validMoves.length > 0) {
              // Filter out exact opposite direction to prevent jarring twitching, unless dead end
              const forwardMoves = validMoves.filter(
                (m) => !(m.dr === -updated.lastDr && m.dc === -updated.lastDc)
              );
              const candidates = forwardMoves.length > 0 ? forwardMoves : validMoves;

              // Pick a next cell
              const nextCell = candidates[Math.floor(Math.random() * candidates.length)];
              updated.targetR = nextCell.r;
              updated.targetC = nextCell.c;
              updated.lastDr = nextCell.dr;
              updated.lastDc = nextCell.dc;
              updated.progress = 0;
              changed = true;
            }
          }

          return updated;
        });

        return changed ? next : prev;
      });
    }, 40);

    return () => clearInterval(animId);
  }, []);

  const handleLayout = (e: LayoutChangeEvent) => {
    const width = e.nativeEvent.layout.width;
    if (width > 0 && Math.abs(width - boardWidth) > 2) {
      setBoardWidth(width);
    }
  };

  // Tap an avatar to pop a thought bubble and give a cheerful bounce
  const handleAvatarTap = useCallback((playerId: string) => {
    const now = Date.now();
    setAvatars((prev) =>
      prev.map((avatar) => {
        if (avatar.playerId !== playerId) return avatar;
        return {
          ...avatar,
          bouncing: true,
          thought: avatar.isMe
            ? 'Hey, that’s me! 🙋‍♂️'
            : THOUGHT_BUBBLES[Math.floor(Math.random() * THOUGHT_BUBBLES.length)],
          thoughtUntil: now + 4000,
        };
      })
    );
    setTimeout(() => {
      setAvatars((prev) =>
        prev.map((avatar) =>
          avatar.playerId === playerId ? { ...avatar, bouncing: false } : avatar
        )
      );
    }, 500);
  }, []);

  // Tap maze floor to drop an amber candle 🕯️
  const handleMazeTap = useCallback((e: any) => {
    const { locationX, locationY } = e.nativeEvent;
    if (cellWidth <= 0 || cellHeight <= 0) return;

    const c = Math.floor(locationX / cellWidth);
    const r = Math.floor(locationY / cellHeight);

    if (r >= 0 && r < ROWS && c >= 0 && c < COLS && MAZE_GRID[r][c] === 0) {
      const newCandle: Candle = {
        id: `${r}-${c}-${Date.now()}`,
        r,
        c,
        expiresAt: Date.now() + 6000,
      };
      setCandles((prev) => [...prev.slice(-3), newCandle]);
    }
  }, [cellWidth, cellHeight]);

  return (
    <View style={styles.container}>
      {/* Maze Header */}
      <View style={styles.header}>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>🌙 Night Wanderer Maze</Text>
          <View style={styles.livePill}>
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>LIVE</Text>
          </View>
        </View>
        <Text style={styles.headerSubtitle}>
          Avatars sleepwalking through the dark… Tap any head or drop a candle 🕯️!
        </Text>
      </View>

      {/* The 2D Maze Canvas */}
      <TouchableWithoutFeedback onPress={handleMazeTap}>
        <View
          style={[styles.mazeBoard, { height: cellHeight * ROWS }]}
          onLayout={handleLayout}
        >
          {/* Maze Grid Walls & Corridors */}
          {boardWidth > 0 &&
            MAZE_GRID.map((row, r) => (
              <View key={`row-${r}`} style={[styles.gridRow, { height: cellHeight }]}>
                {row.map((cellType, c) => (
                  <View
                    key={`cell-${r}-${c}`}
                    style={[
                      styles.cell,
                      { width: cellWidth, height: cellHeight },
                      cellType === 1 ? styles.wallCell : styles.corridorCell,
                    ]}
                  >
                    {/* Subtle corridor stone path dots */}
                    {cellType === 0 && <View style={styles.corridorDot} />}
                  </View>
                ))}
              </View>
            ))}

          {/* Dropped Candles */}
          {boardWidth > 0 &&
            candles.map((candle) => (
              <View
                key={candle.id}
                style={[
                  styles.candleMarker,
                  {
                    left: candle.c * cellWidth + cellWidth / 2 - 12,
                    top: candle.r * cellHeight + cellHeight / 2 - 12,
                  },
                ]}
              >
                <Text style={styles.candleEmoji}>🕯️</Text>
              </View>
            ))}

          {/* Wandering Avatar Heads */}
          {boardWidth > 0 &&
            avatars.map((avatar) => {
              // Interpolate smooth continuous position between current cell and target cell
              const posX =
                (avatar.currC + (avatar.targetC - avatar.currC) * avatar.progress) * cellWidth +
                (cellWidth - avatarSize) / 2;
              const posY =
                (avatar.currR + (avatar.targetR - avatar.currR) * avatar.progress) * cellHeight +
                (cellHeight - avatarSize) / 2;

              const source = resolveAvatarSource(avatar.avatarUrl);
              const initial = (avatar.username?.[0] ?? '?').toUpperCase();

              return (
                <View
                  key={avatar.playerId}
                  style={[
                    styles.avatarWrapper,
                    {
                      left: posX,
                      top: posY,
                      width: avatarSize,
                      height: avatarSize,
                      transform: [{ scale: avatar.bouncing ? 1.25 : 1 }],
                      zIndex: avatar.isMe ? 50 : 20,
                    },
                  ]}
                >
                  {/* Speech/Thought Bubble */}
                  {avatar.thought && (
                    <View style={styles.thoughtBubble}>
                      <Text style={styles.thoughtText} numberOfLines={1}>
                        {avatar.thought}
                      </Text>
                    </View>
                  )}

                  {/* Avatar Head Circle */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleAvatarTap(avatar.playerId)}
                    style={[
                      styles.avatarHead,
                      {
                        width: avatarSize,
                        height: avatarSize,
                        borderRadius: avatarSize / 2,
                        borderColor: avatar.isMe ? '#38bdf8' : '#64748b',
                      },
                      avatar.isMe && styles.myAvatarGlow,
                    ]}
                  >
                    {source ? (
                      <Image
                        source={source.type === 'uri' ? { uri: source.uri } : source.source}
                        style={{ width: avatarSize - 4, height: avatarSize - 4, borderRadius: (avatarSize - 4) / 2 }}
                        resizeMode="cover"
                      />
                    ) : (
                      <View
                        style={[
                          styles.avatarInitialBubble,
                          {
                            width: avatarSize - 4,
                            height: avatarSize - 4,
                            borderRadius: (avatarSize - 4) / 2,
                            backgroundColor: avatar.isMe ? '#0284c7' : '#334155',
                          },
                        ]}
                      >
                        <Text style={[styles.avatarInitialText, { fontSize: avatarSize * 0.42 }]}>
                          {initial}
                        </Text>
                      </View>
                    )}

                    {/* "YOU" mini indicator */}
                    {avatar.isMe && (
                      <View style={styles.youBadge}>
                        <Text style={styles.youBadgeText}>YOU</Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  {/* Miniature Name Label */}
                  <View style={styles.nameBadge}>
                    <Text style={styles.nameBadgeText} numberOfLines={1}>
                      {avatar.username}
                    </Text>
                  </View>
                </View>
              );
            })}
        </View>
      </TouchableWithoutFeedback>

      {/* Legend Footer */}
      <View style={styles.footerLegend}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#38bdf8' }]} />
          <Text style={styles.legendText}>Your Avatar</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: '#94a3b8' }]} />
          <Text style={styles.legendText}>Town Avatars</Text>
        </View>
        <View style={styles.legendItem}>
          <Text style={styles.legendEmoji}>🕯️</Text>
          <Text style={styles.legendText}>Tap floor to light candle</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#0a0f1d',
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: '#1e293b',
    padding: spacing.md,
    marginVertical: spacing.lg,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 6,
  },
  header: {
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.xs,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    color: '#f8fafc',
    fontSize: fontSize.md,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  livePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderColor: 'rgba(34, 197, 94, 0.4)',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#22c55e',
  },
  liveText: {
    color: '#22c55e',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    color: colors.textDim,
    fontSize: fontSize.xs,
    marginTop: 2,
  },
  mazeBoard: {
    width: '100%',
    backgroundColor: '#070a12',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: '#1e293b',
    overflow: 'hidden',
    position: 'relative',
  },
  gridRow: {
    flexDirection: 'row',
    width: '100%',
  },
  cell: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  wallCell: {
    backgroundColor: '#121929',
    borderColor: '#1a243b',
    borderWidth: 0.5,
    borderRadius: 3,
  },
  corridorCell: {
    backgroundColor: '#070a14',
  },
  corridorDot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: 'rgba(148, 163, 184, 0.15)',
  },
  candleMarker: {
    position: 'absolute',
    width: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 15,
  },
  candleEmoji: {
    fontSize: 16,
  },
  avatarWrapper: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarHead: {
    borderWidth: 2,
    backgroundColor: '#0f172a',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  myAvatarGlow: {
    borderColor: '#38bdf8',
    borderWidth: 2.5,
    shadowColor: '#38bdf8',
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  avatarInitialBubble: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarInitialText: {
    color: '#ffffff',
    fontWeight: '900',
  },
  youBadge: {
    position: 'absolute',
    top: -6,
    backgroundColor: '#0284c7',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#38bdf8',
  },
  youBadgeText: {
    color: '#ffffff',
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  nameBadge: {
    position: 'absolute',
    bottom: -11,
    backgroundColor: 'rgba(15, 23, 42, 0.9)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    maxWidth: 55,
  },
  nameBadgeText: {
    color: '#cbd5e1',
    fontSize: 8,
    fontWeight: '700',
  },
  thoughtBubble: {
    position: 'absolute',
    top: -26,
    backgroundColor: 'rgba(30, 41, 59, 0.95)',
    borderColor: '#475569',
    borderWidth: 1,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.sm,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 3,
    elevation: 5,
    minWidth: 44,
    alignItems: 'center',
  },
  thoughtText: {
    color: '#f8fafc',
    fontSize: 9,
    fontWeight: '800',
  },
  footerLegend: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    marginTop: spacing.sm,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: '#1e293b',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  legendEmoji: {
    fontSize: 11,
  },
  legendText: {
    color: colors.textDim,
    fontSize: 10,
    fontWeight: '600',
  },
});

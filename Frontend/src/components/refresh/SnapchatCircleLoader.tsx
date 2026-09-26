import React, { memo, useEffect, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { CHARACTER_IMAGES, RoleId } from '../RoleCard';

// 4 authentic in-game character avatars
export const SNAPCHAT_AVATARS: { id: RoleId; source: any }[] = [
  { id: 'detective', source: CHARACTER_IMAGES.detective },
  { id: 'mafia', source: CHARACTER_IMAGES.mafia },
  { id: 'doctor', source: CHARACTER_IMAGES.doctor },
  { id: 'civilian', source: CHARACTER_IMAGES.civilian },
];

const CIRCLE_SIZE = 56;
const RADIUS = 25;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS; // ~157.08

interface SnapchatCircleLoaderProps {
  /** Current pull progress from 0 (top) to 1 (threshold met) */
  progress: number;
  /** Whether refresh operation is actively running */
  refreshing: boolean;
  /** Index of the character in SNAPCHAT_AVATARS */
  characterIndex: number;
}

export const SnapchatCircleLoader = memo(function SnapchatCircleLoader({
  progress,
  refreshing,
  characterIndex,
}: SnapchatCircleLoaderProps) {
  const activeAvatar = SNAPCHAT_AVATARS[Math.abs(characterIndex) % SNAPCHAT_AVATARS.length];

  // 360-degree continuous spin animation for active refresh state
  const [spinAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    if (!refreshing) {
      spinAnim.setValue(0);
      return;
    }

    const spinLoop = Animated.loop(
      Animated.timing(spinAnim, {
        toValue: 1,
        duration: 750,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    spinLoop.start();
    return () => spinLoop.stop();
  }, [refreshing, spinAnim]);

  const spinInterpolate = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Clamped stroke progress (0 to 1)
  const clampedProgress = Math.min(Math.max(progress, 0), 1);
  const strokeDashoffset = CIRCUMFERENCE * (1 - clampedProgress);

  return (
    <View style={styles.container}>
      {/* Background Track & Pull Progress Ring */}
      {!refreshing && (
        <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE} style={styles.svgRing}>
          {/* Subtle background track */}
          <Circle
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={RADIUS}
            stroke="rgba(225, 29, 72, 0.25)"
            strokeWidth={3.5}
            fill="#090d16"
          />
          {/* Active Crimson Red Progress Stroke (draws clockwise as user pulls down) */}
          <Circle
            cx={CIRCLE_SIZE / 2}
            cy={CIRCLE_SIZE / 2}
            r={RADIUS}
            stroke="#e11d48"
            strokeWidth={3.5}
            strokeDasharray={CIRCUMFERENCE}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            fill="transparent"
            rotation="-90"
            origin={`${CIRCLE_SIZE / 2}, ${CIRCLE_SIZE / 2}`}
          />
        </Svg>
      )}

      {/* Active Spinning Red Loader Ring (Snapchat Spinner) */}
      {refreshing && (
        <Animated.View
          style={[
            styles.spinnerWrapper,
            { transform: [{ rotate: spinInterpolate }] },
          ]}
        >
          <Svg width={CIRCLE_SIZE} height={CIRCLE_SIZE}>
            {/* Base track */}
            <Circle
              cx={CIRCLE_SIZE / 2}
              cy={CIRCLE_SIZE / 2}
              r={RADIUS}
              stroke="rgba(225, 29, 72, 0.2)"
              strokeWidth={3.5}
              fill="#090d16"
            />
            {/* Spinning red arc segment */}
            <Circle
              cx={CIRCLE_SIZE / 2}
              cy={CIRCLE_SIZE / 2}
              r={RADIUS}
              stroke="#e11d48"
              strokeWidth={3.5}
              strokeDasharray={`${CIRCUMFERENCE * 0.38} ${CIRCUMFERENCE * 0.62}`}
              strokeLinecap="round"
              fill="transparent"
            />
          </Svg>
        </Animated.View>
      )}

      {/* Inner Circular Avatar with Character Face */}
      <View style={styles.avatarCircle}>
        <Image
          source={activeAvatar.source}
          style={styles.avatarImg}
          resizeMode="cover"
        />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    shadowColor: '#e11d48',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 8,
    elevation: 10,
  },
  svgRing: {
    position: 'absolute',
    top: 0,
    left: 0,
  },
  spinnerWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: CIRCLE_SIZE,
    height: CIRCLE_SIZE,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#090d16',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-start',
    position: 'relative',
  },
  avatarImg: {
    width: 76,
    height: 104,
    position: 'absolute',
    top: -4,
  },
});

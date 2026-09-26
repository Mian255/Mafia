import React, { memo, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Image,
  StyleSheet,
  View,
} from 'react-native';
import { CHARACTER_IMAGES, RoleId } from '../RoleCard';

// 4 authentic in-game avatars with exact attire and facial features preserved
const CHARACTERS: { id: RoleId; source: any }[] = [
  { id: 'detective', source: CHARACTER_IMAGES.detective },
  { id: 'mafia', source: CHARACTER_IMAGES.mafia },
  { id: 'doctor', source: CHARACTER_IMAGES.doctor },
  { id: 'civilian', source: CHARACTER_IMAGES.civilian },
];

interface PeekingRefreshHeaderProps {
  refreshing: boolean;
}

/**
 * Snapchat-Style Pull-Down Peeking Character:
 * - Shows ONLY the pure character avatar (NO card, NO box, NO text blocks).
 * - Smoothly peeks down from the top edge with spring physics.
 * - 100% GPU Native Driver transforms (useNativeDriver: true) for lag-free 60/120fps performance.
 * - Switches to a DIFFERENT character on each pull-down refresh.
 */
export const PeekingRefreshHeader = memo(function PeekingRefreshHeader({
  refreshing,
}: PeekingRefreshHeaderProps) {
  // Rotate character index on each refresh
  const [charIndex, setCharIndex] = useState(0);
  const wasRefreshing = useRef(false);

  // Native driver animated values (GPU accelerated, zero layout lag)
  const translateY = useRef(new Animated.Value(-100)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.9)).current;
  const bobAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (refreshing && !wasRefreshing.current) {
      // Pick next character to guarantee a different avatar every pull
      setCharIndex((prev) => (prev + 1) % CHARACTERS.length);

      // Instant & fluid Snapchat-like spring peek
      Animated.parallel([
        Animated.spring(translateY, {
          toValue: 24,
          friction: 7,
          tension: 70,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.spring(scale, {
          toValue: 1,
          friction: 6.5,
          tension: 65,
          useNativeDriver: true,
        }),
      ]).start();
    } else if (!refreshing && wasRefreshing.current) {
      // Swift retraction back up above the top edge
      Animated.parallel([
        Animated.timing(translateY, {
          toValue: -100,
          duration: 200,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scale, {
          toValue: 0.9,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
    }
    wasRefreshing.current = refreshing;
  }, [refreshing, translateY, opacity, scale]);

  // Subtle living peek bob while waiting for network refresh
  useEffect(() => {
    if (!refreshing) {
      bobAnim.setValue(0);
      return;
    }

    const bobLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(bobAnim, {
          toValue: 4,
          duration: 500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(bobAnim, {
          toValue: -3,
          duration: 500,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );

    bobLoop.start();
    return () => bobLoop.stop();
  }, [refreshing, bobAnim]);

  const activeCharacter = CHARACTERS[charIndex];

  return (
    <View style={styles.anchorContainer} pointerEvents="none">
      <Animated.View
        style={[
          styles.peekerWrapper,
          {
            opacity,
            transform: [
              { translateY },
              { translateY: bobAnim },
              { scale },
            ],
          },
        ]}
      >
        {/* Pure Character Avatar with exact facial features & clothes */}
        <Image
          source={activeCharacter.source}
          style={styles.characterImg}
          resizeMode="contain"
        />
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  anchorContainer: {
    width: '100%',
    height: 0,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
    zIndex: 9999,
  },
  peekerWrapper: {
    width: 80,
    height: 80,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
    top: 0,
  },
  characterImg: {
    width: 76,
    height: 86,
  },
});

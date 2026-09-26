import React, { useEffect, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Easing,
  Image,
  Platform,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import Svg, { Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';
import { StatusBar } from 'expo-status-bar';

const splashBgImage = require('../../../assets/splash_clean_test.jpg');

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

interface SplashScreenProps {
  onFinish?: () => void;
  durationMs?: number;
}

export default function SplashScreen({ onFinish, durationMs = 3000 }: SplashScreenProps) {
  const [screenOpacity] = useState(() => new Animated.Value(0));
  const [contentFadeAnim] = useState(() => new Animated.Value(0));
  const [contentSlideAnim] = useState(() => new Animated.Value(20));
  const [progressAnim] = useState(() => new Animated.Value(0));
  const [progressPercent, setProgressPercent] = useState(0);

  // Keep the latest onFinish in a ref: the parent re-renders during the splash (session check),
  // and a new onFinish identity must not restart the whole animation sequence and exit timer.
  const onFinishRef = useRef(onFinish);
  useEffect(() => {
    onFinishRef.current = onFinish;
  }, [onFinish]);

  useEffect(() => {
    // Track numeric percentage for live text display
    const listenerId = progressAnim.addListener(({ value }) => {
      // Functional update that bails out when the integer percent hasn't changed.
      const next = Math.min(100, Math.floor(value * 100));
      setProgressPercent((prev) => (prev === next ? prev : next));
    });

    // 1. Initial smooth entrance animation
    const entrance = Animated.sequence([
      Animated.timing(screenOpacity, {
        toValue: 1,
        duration: 600,
        easing: Easing.out(Easing.ease),
        useNativeDriver: true,
      }),
      Animated.parallel([
        Animated.timing(contentFadeAnim, {
          toValue: 1,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(contentSlideAnim, {
          toValue: 0,
          duration: 700,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(progressAnim, {
          toValue: 1,
          duration: durationMs - 800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: false,
        }),
      ]),
    ]);
    entrance.start();

    // 2. Smooth fade-out exit when loading completes
    let exit: Animated.CompositeAnimation | null = null;
    const exitTimer = setTimeout(() => {
      exit = Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 500,
        easing: Easing.in(Easing.ease),
        useNativeDriver: true,
      });
      exit.start(({ finished }) => {
        if (finished) onFinishRef.current?.();
      });
    }, durationMs - 450);

    return () => {
      progressAnim.removeListener(listenerId);
      clearTimeout(exitTimer);
      entrance.stop();
      exit?.stop();
    };
  }, [durationMs, screenOpacity, contentFadeAnim, contentSlideAnim, progressAnim]);

  return (
    <Animated.View style={[styles.container, { opacity: screenOpacity }]}>
      <StatusBar style="light" />

      {/* Full-Screen Split Artwork Background (Cleaned of static text) */}
      <Image source={splashBgImage} style={styles.backgroundImage} resizeMode="cover" />

      {/* Subtle Bottom Ambient Gradient for Perfect Text Legibility */}
      <View style={styles.bottomGradientWrap} pointerEvents="none">
        <Svg width="100%" height="100%" preserveAspectRatio="none">
          <Defs>
            <LinearGradient id="bottomFade" x1="0%" y1="0%" x2="0%" y2="100%">
              <Stop offset="0%" stopColor="#000000" stopOpacity="0" />
              <Stop offset="40%" stopColor="#000000" stopOpacity="0.35" />
              <Stop offset="100%" stopColor="#000000" stopOpacity="0.85" />
            </LinearGradient>
          </Defs>
          <Rect x="0" y="0" width="100%" height="100%" fill="url(#bottomFade)" />
        </Svg>
      </View>

      {/* Animated Branding & Live Progress Bar Section */}
      <Animated.View
        style={[
          styles.brandingContainer,
          {
            opacity: contentFadeAnim,
            transform: [{ translateY: contentSlideAnim }],
          },
        ]}
      >
        {/* Ornate Art Deco Top Border with Diamond Crest */}
        <View style={styles.artDecoHeader}>
          <View style={styles.artDecoLine} />
          <View style={styles.artDecoCrest}>
            <Svg width="36" height="14" viewBox="0 0 36 14">
              <Path d="M 18 1 L 23 7 L 18 13 L 13 7 Z" fill="#fde68a" />
              <Path
                d="M 8 7 L 12 7 M 24 7 L 28 7 M 4 7 L 6 7 M 30 7 L 32 7"
                stroke="#fde68a"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
              <Path d="M 18 3 L 21 7 L 18 11 L 15 7 Z" fill="#d97706" />
            </Svg>
          </View>
          <View style={styles.artDecoLine} />
        </View>

        {/* Main Title: NOIR & CRIME */}
        <Text style={styles.mainTitleText}>NOIR & CRIME</Text>

        {/* Subtitle: MOBILE DETECTIVE ADVENTURE */}
        <Text style={styles.subtitleText}>MOBILE DETECTIVE ADVENTURE</Text>

        {/* Dynamic Animated Progress Bar */}
        <View style={styles.progressBarContainer}>
          <View style={styles.progressBarTrack}>
            <Animated.View
              style={[
                styles.progressBarFill,
                {
                  width: progressAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: ['0%', '100%'],
                  }),
                },
              ]}
            >
              <Svg width="100%" height="100%" preserveAspectRatio="none">
                <Defs>
                  <LinearGradient id="goldProgressGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                    <Stop offset="0%" stopColor="#d97706" />
                    <Stop offset="50%" stopColor="#fde68a" />
                    <Stop offset="100%" stopColor="#fef08a" />
                  </LinearGradient>
                </Defs>
                <Rect x="0" y="0" width="100%" height="100%" fill="url(#goldProgressGrad)" />
              </Svg>
            </Animated.View>

            {/* Centered Percentage Display */}
            <View style={styles.percentTextContainer} pointerEvents="none">
              <Text style={styles.percentText}>{progressPercent}%</Text>
            </View>
          </View>
        </View>
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
    position: 'relative',
  },
  backgroundImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT,
    position: 'absolute',
    top: 0,
    left: 0,
  },
  bottomGradientWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: SCREEN_HEIGHT * 0.45,
  },

  /* Branding & Progress Section */
  brandingContainer: {
    position: 'absolute',
    bottom: SCREEN_HEIGHT * 0.05,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: SCREEN_WIDTH * 0.08,
    zIndex: 10,
  },

  /* Art Deco Header Accent */
  artDecoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '90%',
    marginBottom: 4,
  },
  artDecoLine: {
    flex: 1,
    height: 1.5,
    backgroundColor: 'rgba(253, 230, 138, 0.65)',
  },
  artDecoCrest: {
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Main Title: NOIR & CRIME */
  mainTitleText: {
    color: '#fef3c7',
    fontSize: SCREEN_WIDTH * 0.115,
    fontWeight: '900',
    letterSpacing: 4,
    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
    textAlign: 'center',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.9)',
    textShadowOffset: { width: 0, height: 3 },
    textShadowRadius: 8,
    marginVertical: 2,
  },

  /* Subtitle: MOBILE DETECTIVE ADVENTURE */
  subtitleText: {
    color: '#fde68a',
    fontSize: SCREEN_WIDTH * 0.033,
    fontWeight: '800',
    letterSpacing: 3,
    textAlign: 'center',
    textTransform: 'uppercase',
    textShadowColor: 'rgba(0, 0, 0, 0.95)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 6,
    marginBottom: 16,
  },

  /* Progress Bar Container */
  progressBarContainer: {
    width: '85%',
    alignItems: 'center',
  },
  progressBarTrack: {
    width: '100%',
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    borderWidth: 1.5,
    borderColor: '#fde68a',
    overflow: 'hidden',
    position: 'relative',
    justifyContent: 'center',
    shadowColor: '#d97706',
    shadowOpacity: 0.35,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  progressBarFill: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    borderRadius: 9,
    overflow: 'hidden',
  },
  percentTextContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 5,
  },
  percentText: {
    color: '#1a1005',
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    textShadowColor: 'rgba(255, 255, 255, 0.4)',
    textShadowOffset: { width: 0, height: 0.5 },
    textShadowRadius: 2,
  },
});

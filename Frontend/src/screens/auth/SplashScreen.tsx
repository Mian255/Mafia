import React, { useEffect, useState } from 'react';
import { Animated, Dimensions, Easing, Image, StyleSheet, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SplashScreenProps {
  onFinish?: () => void;
  durationMs?: number;
}

export default function SplashScreen({ onFinish, durationMs = 2800 }: SplashScreenProps) {
  // Master opacity
  const [screenOpacity] = useState(() => new Animated.Value(0));

  // Character slide animations
  const [mafiaSlide] = useState(() => new Animated.Value(-30));
  const [detectiveSlide] = useState(() => new Animated.Value(30));
  const [charScale] = useState(() => new Animated.Value(0.96));

  // Glow & divider pulse
  const [glowAnim] = useState(() => new Animated.Value(0.3));
  const [progressAnim] = useState(() => new Animated.Value(0));

  useEffect(() => {
    // 1. Entrance animation
    Animated.parallel([
      Animated.timing(screenOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(mafiaSlide, {
        toValue: 0,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(detectiveSlide, {
        toValue: 0,
        duration: 900,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(charScale, {
        toValue: 1,
        duration: 1000,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: durationMs - 500,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: false,
      }),
    ]).start();

    // 2. Continuous pulse
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(glowAnim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(glowAnim, {
          toValue: 0.3,
          duration: 1000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    pulseLoop.start();

    // 3. Exit transition
    const exitTimer = setTimeout(() => {
      Animated.timing(screenOpacity, {
        toValue: 0,
        duration: 500,
        easing: Easing.in(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        pulseLoop.stop();
        if (onFinish) {
          onFinish();
        }
      });
    }, durationMs - 500);

    return () => {
      clearTimeout(exitTimer);
      pulseLoop.stop();
    };
  }, [
    durationMs,
    screenOpacity,
    mafiaSlide,
    detectiveSlide,
    charScale,
    glowAnim,
    progressAnim,
    onFinish,
  ]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Animated.View
        style={[
          styles.contentWrapper,
          {
            opacity: screenOpacity,
            transform: [{ scale: charScale }],
          },
        ]}
      >
        {/* Side-by-Side Character Cards Split */}
        <View style={styles.splitSceneContainer}>
          {/* Left: Mafia Character */}
          <Animated.View
            style={[
              styles.characterHalf,
              styles.mafiaHalf,
              { transform: [{ translateX: mafiaSlide }] },
            ]}
          >
            <Image
              source={require('../../../assets/characters/mafia.png')}
              style={styles.characterImage}
              resizeMode="cover"
            />
            {/* Crimson atmospheric overlay */}
            <View style={styles.mafiaOverlay} />
          </Animated.View>

          {/* Right: Detective Character */}
          <Animated.View
            style={[
              styles.characterHalf,
              styles.detectiveHalf,
              { transform: [{ translateX: detectiveSlide }] },
            ]}
          >
            <Image
              source={require('../../../assets/characters/detective.png')}
              style={styles.characterImage}
              resizeMode="cover"
            />
            {/* Midnight blue atmospheric overlay */}
            <View style={styles.detectiveOverlay} />
          </Animated.View>

          {/* Central Vertical Neon Divider */}
          <View style={styles.dividerContainer}>
            <View style={styles.dividerMafiaGlow} />
            <View style={styles.dividerLine} />
            <View style={styles.dividerDetectiveGlow} />
          </View>
        </View>

        {/* Ambient Pulsing Glow behind Titles */}
        <Animated.View style={[styles.centerGlow, { opacity: glowAnim }]} />

        {/* Bottom Section: Branding & Progress Indicator */}
        <View style={styles.footerContainer}>
          <View style={styles.titleBadgeRow}>
            <Text style={styles.mafiaTitle}>MAFIA</Text>
            <View style={styles.vsBadge}>
              <Text style={styles.vsBadgeText}>VS</Text>
            </View>
            <Text style={styles.detectiveTitle}>DETECTIVE</Text>
          </View>

          <Text style={styles.tagline}>A GAME OF DECEPTION & LOGIC</Text>

          {/* Animated Progress Bar */}
          <View style={styles.progressBarBg}>
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
            />
          </View>
          <Text style={styles.loadingText}>INITIALIZING CITY...</Text>
        </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#07090e',
  },
  contentWrapper: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  splitSceneContainer: {
    flex: 1,
    flexDirection: 'row',
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  characterHalf: {
    flex: 1,
    height: '100%',
    overflow: 'hidden',
    position: 'relative',
  },
  mafiaHalf: {
    borderRightWidth: 1,
    borderRightColor: 'rgba(225, 29, 72, 0.4)',
  },
  detectiveHalf: {
    borderLeftWidth: 1,
    borderLeftColor: 'rgba(56, 189, 248, 0.4)',
  },
  characterImage: {
    width: '100%',
    height: '100%',
  },
  mafiaOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(159, 18, 57, 0.1)',
  },
  detectiveOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(14, 116, 144, 0.1)',
  },
  dividerContainer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: SCREEN_WIDTH / 2 - 2,
    width: 4,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  dividerLine: {
    width: 2,
    height: '100%',
    backgroundColor: '#ffffff',
    shadowColor: '#ffffff',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 8,
  },
  dividerMafiaGlow: {
    position: 'absolute',
    left: -3,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: 'rgba(225, 29, 72, 0.7)',
  },
  dividerDetectiveGlow: {
    position: 'absolute',
    right: -3,
    top: 0,
    bottom: 0,
    width: 3,
    backgroundColor: 'rgba(56, 189, 248, 0.7)',
  },
  centerGlow: {
    position: 'absolute',
    bottom: 110,
    alignSelf: 'center',
    width: 260,
    height: 60,
    backgroundColor: 'rgba(225, 29, 72, 0.2)',
    borderRadius: 30,
    shadowColor: '#38bdf8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 25,
    pointerEvents: 'none',
  },
  footerContainer: {
    position: 'absolute',
    bottom: 40,
    left: 0,
    right: 0,
    alignItems: 'center',
    paddingHorizontal: 20,
    zIndex: 20,
  },
  titleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  mafiaTitle: {
    color: '#ff1744',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2.5,
    textShadowColor: 'rgba(225, 29, 72, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  vsBadge: {
    marginHorizontal: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#475569',
  },
  vsBadgeText: {
    color: '#f8fafc',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1.5,
  },
  detectiveTitle: {
    color: '#38bdf8',
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 2.5,
    textShadowColor: 'rgba(56, 189, 248, 0.8)',
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 12,
  },
  tagline: {
    color: '#cbd5e1',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 2,
    marginBottom: 20,
    textShadowColor: '#000000',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },
  progressBarBg: {
    width: '75%',
    height: 4,
    backgroundColor: 'rgba(30, 41, 59, 0.8)',
    borderRadius: 2,
    overflow: 'hidden',
    marginBottom: 8,
    borderWidth: 0.5,
    borderColor: '#334155',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#e11d48',
    borderRadius: 2,
  },
  loadingText: {
    color: '#94a3b8',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 1.5,
  },
});

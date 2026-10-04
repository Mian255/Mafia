import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Platform,
  ScrollView,
  ScrollViewProps,
  StyleSheet,
  View,
} from 'react-native';
import { SnapchatCircleLoader, SNAPCHAT_AVATARS } from './SnapchatCircleLoader';

const REFRESH_THRESHOLD = 65; // Pull distance needed to trigger refresh
const REFRESH_HOLD_OFFSET = 68; // Height at which screen stays during refresh

export interface SnapchatPullRefreshScrollViewProps extends ScrollViewProps {
  refreshing: boolean;
  onRefresh: () => void;
  children?: React.ReactNode;
}

/**
 * Snapchat-Style Pull-Down Refresh ScrollView:
 * - Positioned at top of screen.
 * - Entire screen content moves down with finger pull.
 * - Circular character face with clockwise red ring progress.
 * - Active 360° spinning red loader during refresh.
 * - Works smoothly on all devices (iOS & Android).
 * - Rotates character on every refresh.
 */
export const SnapchatPullRefreshScrollView = forwardRef<
  ScrollView,
  SnapchatPullRefreshScrollViewProps
>(function SnapchatPullRefreshScrollView(
  {
    refreshing,
    onRefresh,
    children,
    onScroll,
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
    style,
    contentContainerStyle,
    ...rest
  },
  ref
) {
  const scrollRef = useRef<ScrollView>(null);
  useImperativeHandle(ref, () => scrollRef.current as ScrollView);

  // Character rotation index
  const [characterIndex, setCharacterIndex] = useState(0);
  const wasRefreshing = useRef(false);

  // Animated pull translation
  const [pullAnim] = useState(() => new Animated.Value(0));
  const [pullProgress, setPullProgress] = useState(0);

  // Touch tracking state
  const scrollOffsetY = useRef(0);
  const startTouchY = useRef<number | null>(null);
  const isPullingRef = useRef(false);
  const isRefreshingRef = useRef(refreshing);
  const onRefreshRef = useRef(onRefresh);

  useEffect(() => {
    isRefreshingRef.current = refreshing;
    onRefreshRef.current = onRefresh;
  }, [refreshing, onRefresh]);

  // Handle refresh lifecycle transitions
  useEffect(() => {
    if (refreshing && !wasRefreshing.current) {
      // Advance to next character
      setCharacterIndex((prev) => (prev + 1) % SNAPCHAT_AVATARS.length);
      setPullProgress(1);

      // Snap content down to hold position
      Animated.spring(pullAnim, {
        toValue: REFRESH_HOLD_OFFSET,
        friction: 7,
        tension: 65,
        useNativeDriver: true,
      }).start();
    } else if (!refreshing && wasRefreshing.current) {
      // Spring back up to top
      Animated.timing(pullAnim, {
        toValue: 0,
        duration: 250,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start(() => {
        setPullProgress(0);
        isPullingRef.current = false;
        startTouchY.current = null;
      });
    }
    wasRefreshing.current = refreshing;
  }, [refreshing, pullAnim]);

  // Scroll offset listener
  const handleScroll = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const y = e.nativeEvent.contentOffset.y;
      scrollOffsetY.current = y;

      // iOS rubber-band overscroll support
      if (Platform.OS === 'ios' && y < 0 && !isRefreshingRef.current) {
        const pull = Math.abs(y);
        pullAnim.setValue(pull);
        setPullProgress(pull / REFRESH_THRESHOLD);
      }

      if (onScroll) {
        onScroll(e);
      }
    },
    [onScroll, pullAnim]
  );

  // Touch handlers for fluid Android & iOS pull gesture
  const handleTouchStart = useCallback(
    (e: GestureResponderEvent) => {
      if (isRefreshingRef.current) return;
      if (scrollOffsetY.current <= 2) {
        startTouchY.current = e.nativeEvent.pageY;
      }
      if (onTouchStart) onTouchStart(e);
    },
    [onTouchStart]
  );

  const handleTouchMove = useCallback(
    (e: GestureResponderEvent) => {
      if (isRefreshingRef.current) return;

      if (startTouchY.current !== null && scrollOffsetY.current <= 2) {
        const deltaY = e.nativeEvent.pageY - startTouchY.current;
        if (deltaY > 0) {
          isPullingRef.current = true;
          const rawPull = deltaY * 0.48; // Rubber-band resistance
          const clampedPull = Math.min(rawPull, 115);
          pullAnim.setValue(clampedPull);
          setPullProgress(clampedPull / REFRESH_THRESHOLD);
        } else if (isPullingRef.current) {
          // User pulling back up
          pullAnim.setValue(0);
          setPullProgress(0);
        }
      }

      if (onTouchMove) onTouchMove(e);
    },
    [onTouchMove, pullAnim]
  );

  const handleTouchEnd = useCallback(
    (e: GestureResponderEvent) => {
      if (isRefreshingRef.current) return;

      if (isPullingRef.current && startTouchY.current !== null) {
        const deltaY = e.nativeEvent.pageY - startTouchY.current;
        const rawPull = deltaY * 0.48;

        if (rawPull >= REFRESH_THRESHOLD) {
          // Trigger reload
          onRefreshRef.current();
        } else {
          // Spring back to top
          Animated.spring(pullAnim, {
            toValue: 0,
            friction: 7,
            tension: 70,
            useNativeDriver: true,
          }).start(() => {
            setPullProgress(0);
          });
        }
      }

      isPullingRef.current = false;
      startTouchY.current = null;
      if (onTouchEnd) onTouchEnd(e);
    },
    [onTouchEnd, pullAnim]
  );

  const handleTouchCancel = useCallback(
    (e: GestureResponderEvent) => {
      if (!isRefreshingRef.current) {
        Animated.spring(pullAnim, {
          toValue: 0,
          friction: 7,
          tension: 70,
          useNativeDriver: true,
        }).start(() => {
          setPullProgress(0);
        });
      }
      isPullingRef.current = false;
      startTouchY.current = null;
      if (onTouchCancel) onTouchCancel(e);
    },
    [onTouchCancel, pullAnim]
  );

  // Top circle loader transforms
  const loaderTranslateY = pullAnim.interpolate({
    inputRange: [0, REFRESH_THRESHOLD, 115],
    outputRange: [-35, 16, 32],
    extrapolate: 'clamp',
  });

  const loaderOpacity = pullAnim.interpolate({
    inputRange: [0, 10, REFRESH_THRESHOLD],
    outputRange: [0, 0.4, 1],
    extrapolate: 'clamp',
  });

  const loaderScale = pullAnim.interpolate({
    inputRange: [0, 15, REFRESH_THRESHOLD],
    outputRange: [0.65, 0.85, 1],
    extrapolate: 'clamp',
  });

  return (
    <View
      style={styles.outerContainer}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
    >
      {/* Top Floating Snapchat-Style Circle Loader */}
      <Animated.View
        style={[
          styles.loaderContainer,
          {
            opacity: loaderOpacity,
            transform: [
              { translateY: loaderTranslateY },
              { scale: loaderScale },
            ],
          },
        ]}
        pointerEvents="none"
      >
        <SnapchatCircleLoader
          progress={pullProgress}
          refreshing={refreshing}
          characterIndex={characterIndex}
        />
      </Animated.View>

      {/* Screen Content Translating Down with Pull */}
      <Animated.View
        style={[
          styles.contentWrapper,
          {
            transform: [{ translateY: pullAnim }],
          },
        ]}
      >
        <ScrollView
          ref={scrollRef}
          style={style}
          contentContainerStyle={contentContainerStyle}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          bounces={Platform.OS === 'ios'}
          showsVerticalScrollIndicator={false}
          {...rest}
        >
          {children}
        </ScrollView>
      </Animated.View>
    </View>
  );
});

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  loaderContainer: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  contentWrapper: {
    flex: 1,
  },
});

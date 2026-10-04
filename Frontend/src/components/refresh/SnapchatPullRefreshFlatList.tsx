import React, {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  Easing,
  FlatList,
  FlatListProps,
  NativeScrollEvent,
  NativeSyntheticEvent,
  PanResponder,
  PanResponderGestureState,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SnapchatCircleLoader, SNAPCHAT_AVATARS } from './SnapchatCircleLoader';

const REFRESH_THRESHOLD = 62;
const REFRESH_HOLD_OFFSET = 82;

export interface SnapchatPullRefreshFlatListProps<T> extends FlatListProps<T> {
  refreshing: boolean;
  onRefresh: () => void;
  /** Optional top header component that translates down when pulled */
  renderHeader?: () => React.ReactNode;
}

export const SnapchatPullRefreshFlatList = forwardRef<FlatList<any>, SnapchatPullRefreshFlatListProps<any>>(
  function SnapchatPullRefreshFlatList(
    {
      refreshing,
      onRefresh,
      renderHeader,
      onScroll,
      onScrollEndDrag,
      style,
      contentContainerStyle,
      ...rest
    },
    ref
  ) {
    const insets = useSafeAreaInsets();
    const listRef = useRef<FlatList<any>>(null);
    useImperativeHandle(ref, () => listRef.current as FlatList<any>);

    const [characterIndex, setCharacterIndex] = useState(0);
    const [pullProgress, setPullProgress] = useState(0);
    const [pullAnim] = useState(() => new Animated.Value(0));

    const scrollOffsetY = useRef(0);
    const isRefreshingRef = useRef(refreshing);
    const onRefreshRef = useRef(onRefresh);
    const wasRefreshingRef = useRef(false);

    useEffect(() => {
      onRefreshRef.current = onRefresh;
    }, [onRefresh]);

    const triggerRefresh = useCallback(() => {
      if (isRefreshingRef.current) return;
      isRefreshingRef.current = true;
      setCharacterIndex((prev) => (prev + 1) % SNAPCHAT_AVATARS.length);
      setPullProgress(1);

      Animated.spring(pullAnim, {
        toValue: REFRESH_HOLD_OFFSET,
        friction: 7,
        tension: 65,
        useNativeDriver: true,
      }).start();

      onRefreshRef.current();
    }, [pullAnim]);

    const resetPull = useCallback(() => {
      Animated.spring(pullAnim, {
        toValue: 0,
        friction: 7,
        tension: 70,
        useNativeDriver: true,
      }).start(() => {
        setPullProgress(0);
      });
    }, [pullAnim]);

    useEffect(() => {
      isRefreshingRef.current = refreshing;

      if (refreshing) {
        wasRefreshingRef.current = true;
        setPullProgress(1);
        Animated.spring(pullAnim, {
          toValue: REFRESH_HOLD_OFFSET,
          friction: 7,
          tension: 65,
          useNativeDriver: true,
        }).start();
      } else if (wasRefreshingRef.current) {
        wasRefreshingRef.current = false;
        Animated.timing(pullAnim, {
          toValue: 0,
          duration: 250,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }).start(() => {
          setPullProgress(0);
          isRefreshingRef.current = false;
        });
      }
    }, [refreshing, pullAnim]);

    const handleScroll = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = e.nativeEvent.contentOffset.y;
        scrollOffsetY.current = y;

        if (Platform.OS === 'ios' && y < 0 && !isRefreshingRef.current) {
          const pull = Math.abs(y);
          const dampenedPull = Math.min(pull * 0.9, 120);
          pullAnim.setValue(dampenedPull);
          setPullProgress(Math.min(dampenedPull / REFRESH_THRESHOLD, 1));
        }

        if (onScroll) {
          onScroll(e);
        }
      },
      [onScroll, pullAnim]
    );

    const handleScrollEndDrag = useCallback(
      (e: NativeSyntheticEvent<NativeScrollEvent>) => {
        const y = e.nativeEvent.contentOffset.y;
        if (Platform.OS === 'ios' && y < -REFRESH_THRESHOLD && !isRefreshingRef.current) {
          triggerRefresh();
        } else if (Platform.OS === 'ios' && y < 0 && !isRefreshingRef.current) {
          resetPull();
        }

        if (onScrollEndDrag) {
          onScrollEndDrag(e);
        }
      },
      [onScrollEndDrag, triggerRefresh, resetPull]
    );

    const headerPanResponder = useMemo(
      () =>
        PanResponder.create({
          onStartShouldSetPanResponder: () => false,
          onStartShouldSetPanResponderCapture: () => false,

          onMoveShouldSetPanResponder: (_, gestureState: PanResponderGestureState) => {
            if (isRefreshingRef.current) return false;
            return gestureState.dy > 3 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.1;
          },

          onMoveShouldSetPanResponderCapture: (_, gestureState: PanResponderGestureState) => {
            if (isRefreshingRef.current) return false;
            return gestureState.dy > 3 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx) * 1.1;
          },

          onPanResponderGrant: () => {},

          onPanResponderMove: (_, gestureState: PanResponderGestureState) => {
            if (isRefreshingRef.current) return;
            const rawPull = Math.max(0, gestureState.dy);
            const dampenedPull = Math.min(rawPull * 0.55, 125);
            pullAnim.setValue(dampenedPull);
            setPullProgress(Math.min(dampenedPull / REFRESH_THRESHOLD, 1));
          },

          onPanResponderRelease: (_, gestureState: PanResponderGestureState) => {
            if (isRefreshingRef.current) return;

            const rawPull = Math.max(0, gestureState.dy);
            const dampenedPull = rawPull * 0.55;

            if (dampenedPull >= REFRESH_THRESHOLD) {
              triggerRefresh();
            } else {
              resetPull();
            }
          },

          onPanResponderTerminate: () => {
            if (!isRefreshingRef.current) {
              resetPull();
            }
          },

          onPanResponderTerminationRequest: () => false,
        }),
      [pullAnim, triggerRefresh, resetPull]
    );

    const handleNativeRefresh = useCallback(() => {
      triggerRefresh();
    }, [triggerRefresh]);

    const loaderTranslateY = pullAnim.interpolate({
      inputRange: [0, REFRESH_THRESHOLD, 140],
      outputRange: [-42, 42, 68],
      extrapolate: 'clamp',
    });

    const loaderOpacity = pullAnim.interpolate({
      inputRange: [0, 6, 35],
      outputRange: [0, 0.6, 1],
      extrapolate: 'clamp',
    });

    const loaderScale = pullAnim.interpolate({
      inputRange: [0, 12, REFRESH_THRESHOLD],
      outputRange: [0.55, 0.85, 1.05],
      extrapolate: 'clamp',
    });

    const safeTop = Math.max(insets.top, 16);

    return (
      <View style={styles.outerContainer}>
        {/* Top Floating Snapchat-style Circle Loader */}
        <Animated.View
          style={[
            styles.loaderContainer,
            {
              top: safeTop + 4,
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
          {renderHeader && (
            <View {...headerPanResponder.panHandlers}>
              {renderHeader()}
            </View>
          )}

          <FlatList
            ref={listRef}
            style={style}
            contentContainerStyle={contentContainerStyle}
            onScroll={handleScroll}
            onScrollEndDrag={handleScrollEndDrag}
            scrollEventThrottle={16}
            bounces={true}
            overScrollMode="always"
            showsVerticalScrollIndicator={false}
            refreshControl={
              Platform.OS === 'android' ? (
                <RefreshControl
                  refreshing={false}
                  onRefresh={handleNativeRefresh}
                  colors={['transparent']}
                  tintColor="transparent"
                  progressBackgroundColor="transparent"
                  progressViewOffset={-9999}
                />
              ) : undefined
            }
            {...rest}
          />
        </Animated.View>
      </View>
    );
  }
) as <T = any>(
  props: SnapchatPullRefreshFlatListProps<T> & { ref?: React.ForwardedRef<FlatList<T>> }
) => React.ReactElement;

const styles = StyleSheet.create({
  outerContainer: {
    flex: 1,
    position: 'relative',
    overflow: 'hidden',
  },
  loaderContainer: {
    position: 'absolute',
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

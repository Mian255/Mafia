import { useMemo } from 'react';
import { Platform, StatusBar as RNStatusBar, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const CHARACTERS_ASPECT_RATIO = 1042 / 499;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export interface AuthLayout {
  paddingTop: number;
  paddingBottom: number;
  paddingHorizontal: number;
  titleFontSize: number;
  titleLetterSpacing: number;
  titleGap: number;
  dividerWidth: number;
  subtitleFontSize: number;
  subtitleLetterSpacing: number;
  charactersWidth: number;
  charactersHeight: number;
}

export function useAuthLayout(compactCharacters = false): AuthLayout {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  return useMemo(() => {
    const scale = clamp(width / 390, 0.82, 1.35);
    const statusBarInset =
      Platform.OS === 'android' ? (RNStatusBar.currentHeight ?? 24) : height / width > 2 ? 47 : 20;
    const topGap = clamp(height * (compactCharacters ? 0.02 : 0.035), 10, 36);
    const titleFontSize = Math.round(clamp((compactCharacters ? 34 : 38) * scale, 28, 50));
    
    const charWidthFactor = compactCharacters ? 0.65 : 0.74;
    const charHeightFactor = compactCharacters ? 0.16 : 0.22;
    const charactersWidth = Math.round(
      Math.min(
        clamp(width * charWidthFactor, 180, 360),
        clamp(height * charHeightFactor, 90, 240) * CHARACTERS_ASPECT_RATIO
      )
    );

    return {
      paddingTop: Math.max(statusBarInset + topGap, insets.top + 8),
      paddingBottom: Math.max(insets.bottom + 28, clamp(height * 0.04, 32, 60)),
      paddingHorizontal: clamp(width * 0.06, 16, 40),
      titleFontSize,
      titleLetterSpacing: Math.round(titleFontSize * 0.16),
      titleGap: clamp(height * (compactCharacters ? 0.015 : 0.02), 6, 22),
      dividerWidth: clamp(140 * scale, 110, 200),
      subtitleFontSize: clamp(10.5 * scale, 9.5, 14),
      subtitleLetterSpacing: clamp(2.5 * scale, 1.5, 3.5),
      charactersWidth,
      charactersHeight: Math.round(charactersWidth / CHARACTERS_ASPECT_RATIO),
    };
  }, [width, height, compactCharacters, insets]);
}

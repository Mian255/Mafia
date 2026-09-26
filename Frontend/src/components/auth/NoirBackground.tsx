import React, { memo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

export const NoirBackground = memo(function NoirBackground() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <Svg width="100%" height="100%" preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="bgGrad" x1="0%" y1="0%" x2="0%" y2="100%">
            <Stop offset="0%" stopColor="#081220" />
            <Stop offset="40%" stopColor="#060c16" />
            <Stop offset="100%" stopColor="#04070d" />
          </LinearGradient>
          <LinearGradient id="ambientRed" x1="0%" y1="0%" x2="100%" y2="0%">
            <Stop offset="0%" stopColor="#991b1b" stopOpacity="0.32" />
            <Stop offset="45%" stopColor="#000000" stopOpacity="0" />
          </LinearGradient>
          <LinearGradient id="ambientBlue" x1="100%" y1="0%" x2="0%" y2="0%">
            <Stop offset="0%" stopColor="#0284c7" stopOpacity="0.30" />
            <Stop offset="45%" stopColor="#000000" stopOpacity="0" />
          </LinearGradient>
        </Defs>
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#bgGrad)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambientRed)" />
        <Rect x="0" y="0" width="100%" height="100%" fill="url(#ambientBlue)" />
      </Svg>
    </View>
  );
});

import React, { memo } from 'react';
import { Image, StyleSheet, View } from 'react-native';

const mafiaVsDetective = require('../../../assets/characters_transparent.png');

interface CharactersStageProps {
  width: number;
  height: number;
}

export const CharactersStage = memo(function CharactersStage({
  width,
  height,
}: CharactersStageProps) {
  return (
    <View style={styles.charactersStage} pointerEvents="none">
      <Image source={mafiaVsDetective} style={{ width, height }} resizeMode="contain" />
    </View>
  );
});

const styles = StyleSheet.create({
  charactersStage: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: -1,
    zIndex: 10,
  },
});

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

export default function UIShowcaseScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>UI Showcase Screen</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#000000',
  },
});

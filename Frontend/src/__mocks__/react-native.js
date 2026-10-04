module.exports = {
  Platform: {
    OS: 'ios',
    select: (objs) => objs.ios || objs.default,
  },
  AppState: {
    addEventListener: () => ({ remove: () => {} }),
  },
  StatusBar: {
    currentHeight: 24,
  },
  Dimensions: {
    get: () => ({ width: 390, height: 844 }),
  },
  useWindowDimensions: () => ({ width: 390, height: 844 }),
  StyleSheet: {
    create: (styles) => styles,
    absoluteFill: {},
  },
};

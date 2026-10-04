module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/?(*.)+(spec|test).ts'],
  setupFiles: ['<rootDir>/src/__mocks__/jest.setup.js'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: {
          rootDir: '.',
          jsx: 'react-jsx',
          types: ['jest', 'node'],
        },
      },
    ],
  },
  moduleNameMapper: {
    '^react-native$': '<rootDir>/src/__mocks__/react-native.js',
    '^@react-native-async-storage/async-storage$': '<rootDir>/src/__mocks__/@react-native-async-storage/async-storage.js',
  },
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
};

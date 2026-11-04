/** Pure TypeScript only (no React Native, no DOM), so it runs under plain Node ts-jest. */
const path = require('path');

module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: {
          esModuleInterop: true,
          skipLibCheck: true,
          types: ['jest', 'node'],
          typeRoots: [path.resolve(__dirname, '../../node_modules/@types')],
        },
      },
    ],
  },
};

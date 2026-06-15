/**
 * Unit tests for the customer app's PURE logic (lib/reorder.ts) — no native
 * imports — run in plain Node via ts-jest. Screens are validated by typecheck.
 */
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

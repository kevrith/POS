/**
 * Tests only the PURE routing logic (src/routing.ts) — no native imports — so it
 * runs under plain Node ts-jest. The native client (src/client.ts) is exercised
 * inside each app via typecheck + EAS/device builds, not here.
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

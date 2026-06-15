/**
 * Unit tests for the Manage section's PURE logic (lib/roles.ts, lib/manage-helpers.ts).
 *
 * These helpers deliberately import nothing from React Native / Expo, so they run
 * in a plain Node environment with ts-jest — no native mocks, fast and reliable.
 * Screen components are validated by `npm run typecheck`, not here.
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
          // @types/jest is hoisted to the repo-root node_modules; point typeRoots
          // there so the jest globals (describe/it/expect) resolve.
          types: ['jest', 'node'],
          typeRoots: [path.resolve(__dirname, '../../node_modules/@types')],
        },
      },
    ],
  },
};

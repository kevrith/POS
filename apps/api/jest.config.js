module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: ['**/*.(t|j)s'],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  watchman: false,
  // Jest defaults to (cores - 1) workers, which on a 20-core machine spawns 19.
  // Each one runs ts-jest AND loads the whole Nest + Prisma graph, so the suite
  // exhausted system RAM and the OOM killer took the editor down with it
  // ("window terminated unexpectedly", launch-failed 1002). The suite is ~200
  // fast unit tests, so a small fixed pool is both safe and quicker than the
  // default in practice.
  maxWorkers: 4,
  // Recycle any worker that balloons, so one leaky suite cannot creep back up
  // to the same failure mode.
  workerIdleMemoryLimit: '512MB',
  moduleNameMapper: {
    '^@pos/shared$': '<rootDir>/../../../packages/shared/index.ts',
  },
  modulePaths: ['<rootDir>'],
  globals: {
    'ts-jest': {
      tsconfig: {
        esModuleInterop: true,
        allowSyntheticDefaultImports: true,
      },
    },
  },
};

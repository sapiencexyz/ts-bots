module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    '!packages/*/src/**/*.d.ts',
  ],
  moduleNameMapping: {
    '^@ts-bots/shared$': '<rootDir>/packages/shared/src',
    '^@ts-bots/shared/(.*)$': '<rootDir>/packages/shared/src/$1',
  },
};

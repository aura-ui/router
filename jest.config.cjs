/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: [
    '<rootDir>/src/modules/aura-routing-engine/test',
    '<rootDir>/src/modules/aura-dom/test',
    '<rootDir>/src/modules/aura-outlet/test',
    '<rootDir>/src/modules/aura-route/test',
  ],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: 'tsconfig.jest.json',
      },
    ],
  },
};

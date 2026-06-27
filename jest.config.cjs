/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  roots: [
    '<rootDir>/src/modules/aura-routing-engine/test',
    '<rootDir>/src/modules/aura-dom/test',
    '<rootDir>/src/modules/aura-outlet/test',
    '<rootDir>/src/modules/aura-route/test',
    '<rootDir>/src/modules/aura-route-2/test',
    '<rootDir>/src/modules/aura-cache-store/test',
    '<rootDir>/src/modules/aura-route-hooks/test',
    '<rootDir>/src/modules/aura-utils/test',
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

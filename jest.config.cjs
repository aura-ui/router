/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  setupFiles: [
    '<rootDir>/src/modules/aura-routing-engine/test/_helpers/jest/urlpattern-setup.ts',
    '<rootDir>/src/modules/aura-routing-engine/test/_helpers/jest/jsdom-scroll-setup.ts',
  ],
  roots: [
    '<rootDir>/src/modules/aura-routing-engine/test',
    '<rootDir>/src/modules/aura-dom/test',
    '<rootDir>/src/modules/aura-outlet/test',
    '<rootDir>/src/modules/aura-route/test',
    '<rootDir>/src/modules/aura-router/test',
    '<rootDir>/src/modules/aura-cache/test',
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

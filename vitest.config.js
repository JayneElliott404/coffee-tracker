import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    env: {
      SESSION_SECRET: 'test-session-secret-not-for-production',
    },
    testTimeout: 30_000,
    // First run downloads the MongoDB binary used by mongodb-memory-server.
    hookTimeout: 300_000,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/server.js'],
      reporter: ['text', 'lcov'],
      thresholds: { lines: 80 },
    },
  },
});

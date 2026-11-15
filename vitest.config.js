import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.js'],
    env: {
      SESSION_SECRET: 'test-session-secret-not-for-production',
      RESEND_API_KEY: 'test-resend-key',
      APP_URL: 'http://app.test',
    },
    setupFiles: ['tests/setup.js'],
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

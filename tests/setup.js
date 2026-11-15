import { beforeEach, vi } from 'vitest';

// Replaces the Resend client so tests can read the emails the app tries to send.
globalThis.__outbox = [];

vi.mock('resend', () => ({
  Resend: class {
    emails = {
      send: async (message) => {
        if (globalThis.__failNextSend) {
          globalThis.__failNextSend = false;
          return { data: null, error: { message: 'simulated failure' } };
        }
        globalThis.__outbox.push(message);
        return { data: { id: 'test-id' }, error: null };
      },
    };
  },
}));

beforeEach(() => {
  globalThis.__outbox.length = 0;
  globalThis.__failNextSend = false;
});

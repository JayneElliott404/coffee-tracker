import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { EmailToken } from '../../src/models/EmailToken.js';
import { User } from '../../src/models/User.js';
import { hashToken } from '../../src/services/emailTokens.js';
import {
  linkPath,
  loginAs,
  outbox,
  PASSWORD,
  registerAndLogin,
  registerUnconfirmed,
  setupTestDb,
  submit,
  waitForEmail,
} from '../helpers.js';

setupTestDb();

let app;
beforeAll(() => {
  app = createApp({ authRateLimit: 1000 });
});

const NEW_PASSWORD = 'new-password-456';
const tokenOf = (path) => path.split('/').pop();

async function requestReset(email = 'jayne@example.com', agent = request.agent(app)) {
  return submit(agent, '/forgot-password', { username: email }, '/forgot-password');
}

describe('confirm email', () => {
  it('refuses login until the email is confirmed, then lets the user in after confirming', async () => {
    await registerUnconfirmed(app, 'jayne');
    const welcome = await waitForEmail();
    expect(welcome.from).toBe('Nespresso Tracker <noreply@nespresso-tracker.com>');
    expect(welcome.subject).toMatch(/confirm/i);

    const refused = await loginAs(app, 'jayne');
    expect(refused.res.status).toBe(403);
    expect(refused.res.text).toContain('confirm your email address');

    const path = linkPath(welcome);
    expect(path).toMatch(/^\/confirm-email\/[\w-]{43}$/);
    const agent = request.agent(app);
    const page = await agent.get(path);
    expect(page.status).toBe(200);
    // Opening the link alone must not confirm anything: scanners prefetch links.
    expect((await User.findOne({ username: 'jayne@example.com' })).emailConfirmed).toBe(false);

    const done = await submit(agent, path, {}, path);
    expect(done.headers.location).toBe('/login');
    expect((await User.findOne({ username: 'jayne@example.com' })).emailConfirmed).toBe(true);
    expect((await loginAs(app, 'jayne')).res.status).toBe(302);
  });

  it('uses the confirmation link only once', async () => {
    await registerUnconfirmed(app, 'jayne');
    const path = linkPath(await waitForEmail());
    const agent = request.agent(app);
    await submit(agent, path, {}, path);
    expect((await agent.get(path)).status).toBe(400);
    expect((await submit(agent, path, {}, '/login')).status).toBe(400);
  });

  it('rejects expired and made-up confirmation links', async () => {
    await registerUnconfirmed(app, 'jayne');
    const path = linkPath(await waitForEmail());
    await EmailToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    expect((await request(app).get(path)).status).toBe(400);
    expect((await request(app).get(`/confirm-email/${'a'.repeat(43)}`)).status).toBe(400);
    expect((await request(app).get('/confirm-email/short')).status).toBe(400);
  });

  it('sends a fresh confirmation email when an unconfirmed user tries to log in, but not more than once a minute', async () => {
    await registerUnconfirmed(app, 'jayne');
    await waitForEmail();
    await loginAs(app, 'jayne');
    await loginAs(app, 'jayne');
    expect(outbox()).toHaveLength(1);

    await EmailToken.updateMany({}, { createdAt: new Date(Date.now() - 2 * 60 * 1000) });
    await loginAs(app, 'jayne');
    expect(await waitForEmail(2)).toBeTruthy();
  });

  it('resends the confirmation email without revealing whether the account exists', async () => {
    await registerUnconfirmed(app, 'jayne');
    await waitForEmail();
    await EmailToken.deleteMany({});

    const known = await submit(request.agent(app), '/confirm-email/resend', { username: 'jayne@example.com' }, '/confirm-email/resend');
    const unknown = await submit(request.agent(app), '/confirm-email/resend', { username: 'nobody@example.com' }, '/confirm-email/resend');
    expect(known.status).toBe(200);
    expect(known.text).toContain('Check your inbox');
    expect(unknown.text).toContain('Check your inbox');
    await waitForEmail(2);
    expect(outbox()).toHaveLength(2);
  });

  it('signs out an existing user who has not confirmed and prompts them to', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    // Accounts that predate confirmation have no emailConfirmed field at all.
    await User.collection.updateOne({ username: 'jayne@example.com' }, { $unset: { emailConfirmed: '', emailConfirmedAt: '' } });
    outbox().length = 0;

    const res = await agent.get('/pods');
    expect(res.headers.location).toBe('/login');
    expect((await agent.get('/login')).text).toContain('Please confirm your email address');
    expect((await waitForEmail()).to).toBe('jayne@example.com');
    expect((await loginAs(app, 'jayne')).res.status).toBe(403);
  });
});

describe('forgot password', () => {
  it('gives the same answer for known and unknown accounts', async () => {
    await registerAndLogin(app, 'jayne');
    const strip = (html) => html.replace(/(csrf-token" content=|name="_csrf" value=)"[^"]+"/g, '$1""');
    const known = await requestReset('jayne@example.com');
    const unknown = await requestReset('nobody@example.com');
    expect(known.status).toBe(200);
    expect(unknown.status).toBe(200);
    expect(strip(known.text)).toBe(strip(unknown.text));
  });

  it('emails a reset link to a real account and stores only the hash of the token', async () => {
    await registerAndLogin(app, 'jayne');
    await requestReset();
    const message = await waitForEmail();
    expect(message.to).toBe('jayne@example.com');
    expect(message.from).toBe('Nespresso Tracker <noreply@nespresso-tracker.com>');
    expect(message.text).toContain('http://app.test/reset-password/');

    const token = tokenOf(linkPath(message));
    const stored = await EmailToken.findOne({ type: 'reset-password' });
    expect(stored.tokenHash).toBe(hashToken(token));
    expect(stored.tokenHash).not.toBe(token);
    const lifetime = stored.expiresAt.getTime() - Date.now();
    expect(lifetime).toBeGreaterThan(55 * 60 * 1000);
    expect(lifetime).toBeLessThanOrEqual(60 * 60 * 1000);
  });

  it('does not email unknown or disabled accounts', async () => {
    await registerAndLogin(app, 'jayne');
    await User.updateOne({ username: 'jayne@example.com' }, { disabled: true });
    await requestReset('jayne@example.com');
    await requestReset('nobody@example.com');
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(outbox()).toHaveLength(0);
    expect(await EmailToken.countDocuments()).toBe(0);
  });

  it('limits reset emails to one a minute per account and invalidates the older link', async () => {
    await registerAndLogin(app, 'jayne');
    await requestReset();
    const first = await waitForEmail();
    await requestReset();
    await new Promise((resolve) => setTimeout(resolve, 200));
    expect(outbox()).toHaveLength(1);

    await EmailToken.updateMany({}, { createdAt: new Date(Date.now() - 2 * 60 * 1000) });
    await requestReset();
    const second = await waitForEmail(2);
    expect(linkPath(second)).not.toBe(linkPath(first));
    expect((await request(app).get(linkPath(first))).status).toBe(400);
    expect((await request(app).get(linkPath(second))).status).toBe(200);
  });

  it('validates the email address', async () => {
    const res = await requestReset('not-an-email');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Enter a valid email address');
  });

  it('rate limits requests', async () => {
    const limitedApp = createApp({ authRateLimit: 2 });
    const agent = request.agent(limitedApp);
    const statuses = [];
    for (let i = 0; i < 3; i++) statuses.push((await requestReset('nobody@example.com', agent)).status);
    expect(statuses).toEqual([200, 200, 429]);
  });

  it('still responds if the email provider fails', async () => {
    await registerAndLogin(app, 'jayne');
    globalThis.__failNextSend = true;
    const res = await requestReset();
    expect(res.status).toBe(200);
  });
});

describe('reset password', () => {
  async function resetLink() {
    await registerAndLogin(app, 'jayne');
    await requestReset();
    return linkPath(await waitForEmail());
  }

  it('sets a new password, uses the token up and lets the user log in with it', async () => {
    const path = await resetLink();
    const agent = request.agent(app);
    expect((await agent.get(path)).text).toContain('Choose a new password');

    const res = await submit(agent, path, { password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }, path);
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/login');
    expect((await loginAs(app, 'jayne', PASSWORD)).res.status).toBe(401);
    expect((await loginAs(app, 'jayne', NEW_PASSWORD)).res.status).toBe(302);

    expect((await agent.get(path)).status).toBe(400);
    expect((await submit(agent, path, { password: 'another-pass-789', confirmPassword: 'another-pass-789' }, '/login')).status).toBe(400);
    expect(await EmailToken.countDocuments()).toBe(0);
  });

  it('signs the user out everywhere', async () => {
    const other = await registerAndLogin(app, 'jayne');
    expect((await other.get('/pods')).status).toBe(200);
    await requestReset();
    const path = linkPath(await waitForEmail());
    await submit(request.agent(app), path, { password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }, path);
    expect((await other.get('/pods')).headers.location).toBe('/login');
  });

  it('keeps the token when the new password is rejected', async () => {
    const path = await resetLink();
    const agent = request.agent(app);
    const short = await submit(agent, path, { password: 'short', confirmPassword: 'short' }, path);
    expect(short.status).toBe(422);
    expect(short.text).toContain('at least 8 characters');
    const mismatch = await submit(agent, path, { password: NEW_PASSWORD, confirmPassword: 'different-456' }, path);
    expect(mismatch.status).toBe(422);
    expect(mismatch.text).toContain('Passwords do not match');
    expect((await agent.get(path)).status).toBe(200);
  });

  it('rejects expired links', async () => {
    const path = await resetLink();
    await EmailToken.updateMany({}, { expiresAt: new Date(Date.now() - 1000) });
    const agent = request.agent(app);
    expect((await agent.get(path)).status).toBe(400);
    expect((await submit(agent, path, { password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }, '/login')).status).toBe(400);
    expect((await loginAs(app, 'jayne', PASSWORD)).res.status).toBe(302);
  });

  it("won't accept a confirmation link as a reset link, or the reverse", async () => {
    await registerUnconfirmed(app, 'jayne');
    const confirmPath = linkPath(await waitForEmail());
    const asReset = `/reset-password/${tokenOf(confirmPath)}`;
    expect((await request(app).get(asReset)).status).toBe(400);
  });

  it('confirms the email address and clears a forced password change', async () => {
    await registerUnconfirmed(app, 'jayne');
    await User.updateOne({ username: 'jayne@example.com' }, { mustChangePassword: true });
    await requestReset();
    const path = linkPath(await waitForEmail(2));
    await submit(request.agent(app), path, { password: NEW_PASSWORD, confirmPassword: NEW_PASSWORD }, path);
    const user = await User.findOne({ username: 'jayne@example.com' });
    expect(user.emailConfirmed).toBe(true);
    expect(user.mustChangePassword).toBe(false);
    expect((await loginAs(app, 'jayne', NEW_PASSWORD)).res.status).toBe(302);
  });

  it('is linked from the login page', async () => {
    expect((await request(app).get('/login')).text).toContain('href="/forgot-password"');
  });
});

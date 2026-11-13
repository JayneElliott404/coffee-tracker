import { beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { loginAs, PASSWORD, registerAndLogin, setupTestDb, submit } from '../helpers.js';

setupTestDb();

let app;
beforeAll(() => {
  app = createApp({ authRateLimit: 1000 });
});

describe('authentication', () => {
  it('redirects logged-out visitors to the login page', async () => {
    for (const url of ['/', '/pods', '/stats', '/account/password', '/admin/users']) {
      const res = await request(app).get(url);
      expect(res.status, url).toBe(302);
      expect(res.headers.location, url).toBe('/login');
    }
  });

  it('serves the health check without a session', async () => {
    const res = await request(app).get('/healthz');
    expect(res.body).toEqual({ ok: true });
    expect(res.headers['set-cookie']).toBeUndefined();
  });

  it('registers a user, hashes the password and logs them in', async () => {
    const agent = await registerAndLogin(app, 'Jayne');
    const user = await User.findOne({ username: 'jayne' });
    expect(user.passwordHash).not.toBe(PASSWORD);
    expect(user.role).toBe('user');

    const res = await agent.get('/pods');
    expect(res.status).toBe(200);
    expect(res.text).toContain('jayne');
  });

  it('rejects a duplicate username', async () => {
    await registerAndLogin(app, 'jayne');
    const res = await submit(request.agent(app), '/register', { username: 'JAYNE', password: PASSWORD, confirmPassword: PASSWORD }, '/register');
    expect(res.status).toBe(422);
    expect(res.text).toContain('already taken');
  });

  it('shows validation errors on registration', async () => {
    const res = await submit(request.agent(app), '/register', { username: 'a', password: 'x', confirmPassword: 'y' }, '/register');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Username must be 3–30 characters');
    expect(res.text).toContain('Passwords do not match');
  });

  it('logs in with correct credentials and rejects wrong ones with the same message', async () => {
    await registerAndLogin(app, 'jayne');

    const ok = await loginAs(app, 'jayne');
    expect(ok.res.status).toBe(302);
    expect(ok.res.headers.location).toBe('/pods');

    const wrongPassword = await loginAs(app, 'jayne', 'wrong-password');
    const unknownUser = await loginAs(app, 'nobody', 'wrong-password');
    expect(wrongPassword.res.status).toBe(401);
    expect(unknownUser.res.status).toBe(401);
    expect(wrongPassword.res.text).toContain('Incorrect username or password.');
    expect(unknownUser.res.text).toContain('Incorrect username or password.');
  });

  it('refuses login for disabled accounts', async () => {
    await registerAndLogin(app, 'jayne');
    await User.updateOne({ username: 'jayne' }, { disabled: true });
    const { res } = await loginAs(app, 'jayne');
    expect(res.status).toBe(401);
    expect(res.text).toContain('disabled');
  });

  it('logs out and ends the session', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const res = await submit(agent, '/logout');
    expect(res.headers.location).toBe('/login');
    expect((await agent.get('/pods')).status).toBe(302);
  });

  it('rejects form posts without a valid CSRF token', async () => {
    const agent = request.agent(app);
    await agent.get('/login');
    const res = await agent.post('/login').type('form').send({ username: 'jayne', password: PASSWORD });
    expect(res.status).toBe(403);
    expect(res.text).toContain('Form expired');
  });

  it('rate limits repeated failed logins', async () => {
    const limitedApp = createApp({ authRateLimit: 2 });
    const statuses = [];
    for (let i = 0; i < 3; i++) {
      statuses.push((await loginAs(limitedApp, 'jayne', 'wrong-password')).res.status);
    }
    expect(statuses).toEqual([401, 401, 429]);
  });

  it('sets hardened session cookies', async () => {
    const res = await request(app).get('/login');
    const cookie = res.headers['set-cookie'].find((c) => c.startsWith('podcafe.sid='));
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Lax/i);
  });
});

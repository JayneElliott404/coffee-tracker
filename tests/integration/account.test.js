import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { User } from '../../src/models/User.js';
import { loginAs, PASSWORD, registerAndLogin, setupTestDb, submit } from '../helpers.js';

setupTestDb();

let app;
beforeAll(() => {
  app = createApp({ authRateLimit: 1000 });
});

const NEW_PASSWORD = 'new-password-456';

describe('change password', () => {
  it('changes the password', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const res = await submit(
      agent,
      '/account/password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      '/account/password',
    );
    expect(res.status).toBe(302);
    expect((await loginAs(app, 'jayne', PASSWORD)).res.status).toBe(401);
    expect((await loginAs(app, 'jayne', NEW_PASSWORD)).res.status).toBe(302);
  });

  it('rejects a wrong current password', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const res = await submit(
      agent,
      '/account/password',
      { currentPassword: 'not-my-password', newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      '/account/password',
    );
    expect(res.status).toBe(422);
    expect(res.text).toContain('Current password is incorrect');
  });

  it('forces a password change when mustChangePassword is set', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    await User.updateOne({ username: 'jayne' }, { mustChangePassword: true });

    for (const url of ['/pods', '/stats', '/pods/new']) {
      const res = await agent.get(url);
      expect(res.headers.location, url).toBe('/account/password');
    }
    expect((await agent.get('/account/password')).text).toContain('temporary password');

    await submit(
      agent,
      '/account/password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      '/account/password',
    );
    expect((await agent.get('/pods')).status).toBe(200);
    expect((await User.findOne({ username: 'jayne' })).mustChangePassword).toBe(false);
  });
});

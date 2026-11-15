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

describe('account settings', () => {
  it('sends the old change password URL to the settings page', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const res = await agent.get('/account/password');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/account');
    const page = (await agent.get('/account')).text;
    expect(page).toContain('Account settings');
    expect(page).toContain('Change password');
  });

  it("changes the default machine and preselects it on the new pod form", async () => {
    const agent = await registerAndLogin(app, 'jayne', PASSWORD, 'original');
    expect((await agent.get('/account')).text).toMatch(/value="original" autocomplete="off" checked/);

    const res = await submit(agent, '/account/machine', { machineType: 'vertuo' }, '/account');
    expect(res.status).toBe(302);
    expect((await User.findOne({ username: 'jayne@example.com' })).machineType).toBe('vertuo');
    expect((await agent.get('/account')).text).toMatch(/value="vertuo" autocomplete="off" checked/);
    expect((await agent.get('/pods/new')).text).toMatch(/value="vertuo" autocomplete="off" checked/);
  });

  it('rejects an unknown machine', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const res = await submit(agent, '/account/machine', { machineType: 'moka' }, '/account');
    expect(res.status).toBe(422);
    expect(res.text).toContain('Choose Original or Vertuo');
    expect((await User.findOne({ username: 'jayne@example.com' })).machineType).toBe('original');
  });

  it('treats an account saved before machine types existed as Original', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    await User.collection.updateOne({ username: 'jayne@example.com' }, { $unset: { machineType: '' } });
    expect((await agent.get('/account')).text).toMatch(/value="original" autocomplete="off" checked/);
    expect((await agent.get('/pods/new')).text).toMatch(/value="original" autocomplete="off" checked/);
  });
});

describe('change password', () => {
  it('changes the password', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const res = await submit(
      agent,
      '/account/password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      '/account',
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
      '/account',
    );
    expect(res.status).toBe(422);
    expect(res.text).toContain('Current password is incorrect');
  });

  it('forces a password change when mustChangePassword is set', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    await User.updateOne({ username: 'jayne@example.com' }, { mustChangePassword: true });

    for (const url of ['/pods', '/stats', '/pods/new']) {
      const res = await agent.get(url);
      expect(res.headers.location, url).toBe('/account');
    }
    expect((await agent.get('/account')).text).toContain('temporary password');

    await submit(
      agent,
      '/account/password',
      { currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmPassword: NEW_PASSWORD },
      '/account',
    );
    expect((await agent.get('/pods')).status).toBe(200);
    expect((await User.findOne({ username: 'jayne@example.com' })).mustChangePassword).toBe(false);
  });
});

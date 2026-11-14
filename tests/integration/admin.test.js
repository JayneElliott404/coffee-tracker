import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../../src/app.js';
import { Pod } from '../../src/models/Pod.js';
import { User } from '../../src/models/User.js';
import { createPod, loginAs, makeAdmin, registerAndLogin, setupTestDb, submit } from '../helpers.js';

setupTestDb();

let app;
beforeAll(() => {
  app = createApp({ authRateLimit: 1000 });
});

async function setup() {
  const member = await registerAndLogin(app, 'member');
  await createPod(member, { name: 'Member Pod' });
  const admin = await registerAndLogin(app, 'boss');
  await makeAdmin('boss');
  const target = await User.findOne({ username: 'member@example.com' });
  const self = await User.findOne({ username: 'boss@example.com' });
  return { member, admin, target, self };
}

describe('admin', () => {
  it('blocks non-admins with 403 and hides the nav link', async () => {
    const agent = await registerAndLogin(app, 'member');
    expect((await agent.get('/admin/users')).status).toBe(403);
    expect((await agent.get('/pods')).text).not.toContain('href="/admin/users"');
  });

  it('lists and searches users with pod counts', async () => {
    const { admin } = await setup();
    const list = await admin.get('/admin/users');
    expect(list.status).toBe(200);
    expect(list.text).toContain('member');
    expect(list.text).toContain('boss');

    const search = await admin.get('/admin/users?q=mem');
    expect(search.text).toContain('>member@example.com</a>');
    expect(search.text).not.toContain('>boss@example.com</a>');
  });

  it("shows a user's pods read-only", async () => {
    const { admin, target } = await setup();
    const res = await admin.get(`/admin/users/${target._id}`);
    expect(res.status).toBe(200);
    expect(res.text).toContain('Member Pod');
    expect(res.text).not.toContain('/edit"');
    expect((await admin.get('/admin/users/not-an-id')).status).toBe(404);
  });

  it('promotes and demotes users', async () => {
    const { admin, target } = await setup();
    const page = `/admin/users/${target._id}`;
    await submit(admin, `${page}/role`, { role: 'admin' }, page);
    expect((await User.findById(target._id)).role).toBe('admin');
    await submit(admin, `${page}/role`, { role: 'user' }, page);
    expect((await User.findById(target._id)).role).toBe('user');
  });

  it('cannot change their own account', async () => {
    const { admin, self } = await setup();
    const page = `/admin/users/${self._id}`;
    for (const action of ['role', 'disable', 'delete', 'temp-password']) {
      const res = await submit(admin, `${page}/${action}`, { role: 'user' }, page);
      expect(res.status, action).toBe(302);
    }
    const after = await User.findById(self._id);
    expect(after.role).toBe('admin');
    expect(after.disabled).toBe(false);
    expect(after.mustChangePassword).toBe(false);
  });

  it("disabling a user ends their existing session and enabling restores access", async () => {
    const { admin, member, target } = await setup();
    const page = `/admin/users/${target._id}`;

    await submit(admin, `${page}/disable`, {}, page);
    const blocked = await member.get('/pods');
    expect(blocked.headers.location).toBe('/login');

    await submit(admin, `${page}/enable`, {}, page);
    expect((await loginAs(app, 'member')).res.status).toBe(302);
  });

  it('deletes a user and their pods', async () => {
    const { admin, member, target } = await setup();
    const page = `/admin/users/${target._id}`;
    const res = await submit(admin, `${page}/delete`, {}, page);
    expect(res.headers.location).toBe('/admin/users');
    expect(await User.findById(target._id)).toBeNull();
    expect(await Pod.countDocuments({ user: target._id })).toBe(0);
    expect((await member.get('/pods')).headers.location).toBe('/login');
  });

  it('sets a temporary password that must be changed on next login', async () => {
    const { admin, target } = await setup();
    const page = `/admin/users/${target._id}`;
    const res = await submit(admin, `${page}/temp-password`, {}, page);
    expect(res.status).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const tempPassword = res.text.match(/<code class="fs-5 user-select-all">([^<]+)<\/code>/)[1];
    expect(tempPassword.length).toBeGreaterThanOrEqual(12);

    const stored = await User.findById(target._id);
    expect(stored.passwordHash).not.toContain(tempPassword);
    expect(stored.mustChangePassword).toBe(true);

    const { agent, res: login } = await loginAs(app, 'member', tempPassword);
    expect(login.headers.location).toBe('/account/password');
    expect((await agent.get('/pods')).headers.location).toBe('/account/password');
  });
});

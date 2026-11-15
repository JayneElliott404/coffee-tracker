import { afterAll, afterEach, beforeAll, expect, vi } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { Pod } from '../src/models/Pod.js';
import { User } from '../src/models/User.js';
import { EmailToken } from '../src/models/EmailToken.js';

export const PASSWORD = 'password123';

export function setupTestDb() {
  let mongod;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await Promise.all([User.init(), Pod.init(), EmailToken.init()]);
  });
  afterEach(async () => {
    await Promise.all([
      User.deleteMany({}),
      Pod.deleteMany({}),
      EmailToken.deleteMany({}),
      mongoose.connection.db.collection('sessions').deleteMany({}),
    ]);
  });
  afterAll(async () => {
    await mongoose.disconnect();
    await mongod?.stop();
  });
}

export async function getCsrf(agent, page = '/login') {
  const res = await agent.get(page);
  const match = res.text.match(/<meta name="csrf-token" content="([^"]+)">/);
  if (!match) throw new Error(`No CSRF token on ${page} (status ${res.status})`);
  return match[1];
}

export async function submit(agent, url, data = {}, page = '/pods/new') {
  const _csrf = await getCsrf(agent, page);
  return agent.post(url).type('form').send({ ...data, _csrf });
}

// Accounts are identified by email; tests can pass a short name like 'jayne' for 'jayne@example.com'.
export const emailFor = (name) => (name.includes('@') ? name : `${name.toLowerCase()}@example.com`);

export async function registerUnconfirmed(app, name, password = PASSWORD, machineType) {
  const agent = request.agent(app);
  const res = await submit(agent, '/register', { name: name.split('@')[0], username: emailFor(name), password, confirmPassword: password, machineType }, '/register');
  expect(res.status).toBe(302);
  return agent;
}

// Registers, confirms the email directly in the database, then logs in.
export async function registerAndLogin(app, name, password = PASSWORD, machineType) {
  await registerUnconfirmed(app, name, password, machineType);
  await User.updateOne({ username: emailFor(name) }, { $set: { emailConfirmed: true, emailConfirmedAt: new Date() } });
  // Drop the confirmation email and token that registration produced so tests start clean.
  await EmailToken.deleteMany({});
  globalThis.__outbox.length = 0;
  const { agent, res } = await loginAs(app, name, password);
  expect(res.status).toBe(302);
  return agent;
}

export async function loginAs(app, name, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await submit(agent, '/login', { username: emailFor(name), password }, '/login');
  return { agent, res };
}

// Mail that the app sent via the mocked Resend client (see tests/setup.js).
export const outbox = () => globalThis.__outbox;

export async function waitForEmail(count = 1) {
  await vi.waitFor(() => expect(outbox().length).toBeGreaterThanOrEqual(count));
  return outbox()[count - 1];
}

// Pulls the /reset-password/... or /confirm-email/... path out of an email.
export const linkPath = (message) => new URL(message.text.match(/https?:\/\/\S+/)[0]).pathname;

export function makeAdmin(name) {
  return User.updateOne({ username: emailFor(name) }, { $set: { role: 'admin' } });
}

export async function createPod(agent, overrides = {}) {
  return submit(agent, '/pods', { name: 'Arpeggio', intensity: '9', score: '8.5', flavour: 'Cocoa', notes: '', ...overrides });
}

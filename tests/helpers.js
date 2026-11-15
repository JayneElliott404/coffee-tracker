import { afterAll, afterEach, beforeAll, expect } from 'vitest';
import { MongoMemoryServer } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import request from 'supertest';
import { Pod } from '../src/models/Pod.js';
import { User } from '../src/models/User.js';

export const PASSWORD = 'password123';

export function setupTestDb() {
  let mongod;
  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    await mongoose.connect(mongod.getUri());
    await Promise.all([User.init(), Pod.init()]);
  });
  afterEach(async () => {
    await Promise.all([User.deleteMany({}), Pod.deleteMany({}), mongoose.connection.db.collection('sessions').deleteMany({})]);
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

export async function registerAndLogin(app, name, password = PASSWORD, machineType) {
  const agent = request.agent(app);
  const res = await submit(agent, '/register', { name: name.split('@')[0], username: emailFor(name), password, confirmPassword: password, machineType }, '/register');
  expect(res.status).toBe(302);
  return agent;
}

export async function loginAs(app, name, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await submit(agent, '/login', { username: emailFor(name), password }, '/login');
  return { agent, res };
}

export function makeAdmin(name) {
  return User.updateOne({ username: emailFor(name) }, { $set: { role: 'admin' } });
}

export async function createPod(agent, overrides = {}) {
  return submit(agent, '/pods', { name: 'Arpeggio', intensity: '9', score: '8.5', flavour: 'Cocoa', notes: '', ...overrides });
}

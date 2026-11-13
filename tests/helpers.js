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

export async function registerAndLogin(app, username, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await submit(agent, '/register', { username, password, confirmPassword: password }, '/register');
  expect(res.status).toBe(302);
  return agent;
}

export async function loginAs(app, username, password = PASSWORD) {
  const agent = request.agent(app);
  const res = await submit(agent, '/login', { username, password }, '/login');
  return { agent, res };
}

export function makeAdmin(username) {
  return User.updateOne({ username }, { $set: { role: 'admin' } });
}

export async function createPod(agent, overrides = {}) {
  return submit(agent, '/pods', { name: 'Arpeggio', intensity: '9', score: '8.5', flavour: 'Cocoa', notes: '', ...overrides });
}

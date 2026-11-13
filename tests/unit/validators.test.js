import { describe, expect, it } from 'vitest';
import { validationResult } from 'express-validator';
import { podRules } from '../../src/validators/pod.js';
import { changePasswordRules, registerRules } from '../../src/validators/auth.js';

async function validate(rules, body) {
  const req = { body: { ...body } };
  await Promise.all(rules.map((rule) => rule.run(req)));
  return { errors: validationResult(req).mapped(), body: req.body };
}

const validPod = { name: 'Arpeggio', intensity: '9', score: '8.5', flavour: 'Cocoa', notes: '' };

describe('podRules', () => {
  it('accepts a valid pod and converts numbers', async () => {
    const { errors, body } = await validate(podRules, validPod);
    expect(errors).toEqual({});
    expect(body.intensity).toBe(9);
    expect(body.score).toBe(8.5);
  });

  it.each(['0', '10', '7.5', '9.95', '0.1'])('accepts score %s', async (score) => {
    const { errors } = await validate(podRules, { ...validPod, score });
    expect(errors.score).toBeUndefined();
  });

  it.each(['-0.1', '10.1', 'abc', ''])('rejects score %j', async (score) => {
    const { errors } = await validate(podRules, { ...validPod, score });
    expect(errors.score).toBeDefined();
  });

  it.each(['1', '13'])('accepts intensity %s', async (intensity) => {
    const { errors } = await validate(podRules, { ...validPod, intensity });
    expect(errors.intensity).toBeUndefined();
  });

  it.each(['0', '14', '7.5', 'strong'])('rejects intensity %j', async (intensity) => {
    const { errors } = await validate(podRules, { ...validPod, intensity });
    expect(errors.intensity).toBeDefined();
  });

  it('rejects a blank name', async () => {
    const { errors } = await validate(podRules, { ...validPod, name: '   ' });
    expect(errors.name.msg).toBe('Enter the pod name');
  });

  it('rejects an invalid date but allows a blank one', async () => {
    expect((await validate(podRules, { ...validPod, dateTried: 'not-a-date' })).errors.dateTried).toBeDefined();
    expect((await validate(podRules, { ...validPod, dateTried: '' })).errors.dateTried).toBeUndefined();
  });
});

describe('registerRules', () => {
  const valid = { username: 'Jayne', password: 'password123', confirmPassword: 'password123' };

  it('accepts and lowercases a valid username', async () => {
    const { errors, body } = await validate(registerRules, valid);
    expect(errors).toEqual({});
    expect(body.username).toBe('jayne');
  });

  it.each(['ab', 'has space', 'semi;colon', 'x'.repeat(31)])('rejects username %j', async (username) => {
    expect((await validate(registerRules, { ...valid, username })).errors.username).toBeDefined();
  });

  it('rejects short passwords and mismatched confirmation', async () => {
    const { errors } = await validate(registerRules, { ...valid, password: 'short', confirmPassword: 'other' });
    expect(errors.password).toBeDefined();
    expect(errors.confirmPassword).toBeDefined();
  });

  it('rejects passwords longer than 72 bytes', async () => {
    const password = 'é'.repeat(40);
    expect((await validate(registerRules, { ...valid, password, confirmPassword: password })).errors.password).toBeDefined();
  });
});

describe('changePasswordRules', () => {
  it('rejects reusing the current password', async () => {
    const { errors } = await validate(changePasswordRules, {
      currentPassword: 'password123',
      newPassword: 'password123',
      confirmPassword: 'password123',
    });
    expect(errors.newPassword).toBeDefined();
  });
});

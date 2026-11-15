import crypto from 'node:crypto';
import mongoose from 'mongoose';
import { EmailToken } from '../models/EmailToken.js';

export const CONFIRM_EMAIL = 'confirm-email';
export const RESET_PASSWORD = 'reset-password';

const LIFETIME_MS = {
  [CONFIRM_EMAIL]: 24 * 60 * 60 * 1000,
  [RESET_PASSWORD]: 60 * 60 * 1000,
};

// A user can't be sent another email of the same type within this window.
export const RESEND_COOLDOWN_MS = 60 * 1000;

export const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// Returns the raw token (only ever sent by email), or null if one was issued too recently.
export async function issueToken(userId, type, { cooldown = true } = {}) {
  if (cooldown) {
    const recent = await EmailToken.exists({ user: userId, type, createdAt: { $gt: new Date(Date.now() - RESEND_COOLDOWN_MS) } });
    if (recent) return null;
  }
  await EmailToken.deleteMany({ user: userId, type });
  const token = crypto.randomBytes(32).toString('base64url');
  await EmailToken.create({ user: userId, type, tokenHash: hashToken(token), expiresAt: new Date(Date.now() + LIFETIME_MS[type]) });
  return token;
}

const validShape = (token) => typeof token === 'string' && /^[A-Za-z0-9_-]{43}$/.test(token);

// Checks a token without using it up, so email-scanner prefetches of the link can't burn it.
export async function peekToken(token, type) {
  if (!validShape(token)) return null;
  return EmailToken.findOne({ tokenHash: hashToken(token), type, expiresAt: { $gt: new Date() } });
}

// Atomic, so a token can only ever be used once.
export async function consumeToken(token, type) {
  if (!validShape(token)) return null;
  return EmailToken.findOneAndDelete({ tokenHash: hashToken(token), type, expiresAt: { $gt: new Date() } });
}

export function revokeTokens(userId, type) {
  return EmailToken.deleteMany({ user: userId, ...(type ? { type } : {}) });
}

// Deletes every session belonging to the user so a stolen session can't outlive a password reset.
export async function destroyUserSessions(userId) {
  await mongoose.connection.db.collection('sessions').deleteMany({ session: { $regex: `"userId":"${userId}"` } });
}

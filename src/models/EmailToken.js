import mongoose from 'mongoose';

export const TOKEN_TYPES = ['confirm-email', 'reset-password'];

const emailTokenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  type: { type: String, enum: TOKEN_TYPES, required: true },
  // Only the SHA-256 hash is stored, so a database leak doesn't expose usable links.
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// MongoDB removes expired tokens in the background.
emailTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailToken = mongoose.model('EmailToken', emailTokenSchema);

import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';

const BCRYPT_ROUNDS = 12;

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 254,
      match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
    },
    passwordHash: { type: String, required: true },
    name: { type: String, required: true, trim: true, maxlength: 50 },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    disabled: { type: Boolean, default: false },
    mustChangePassword: { type: Boolean, default: false },
    lastLoginAt: Date,
  },
  { timestamps: true },
);

userSchema.statics.hashPassword = function hashPassword(password) {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
};

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.virtual('isAdmin').get(function isAdmin() {
  return this.role === 'admin';
});

export const User = mongoose.model('User', userSchema);

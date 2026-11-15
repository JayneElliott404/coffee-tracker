import mongoose from 'mongoose';
import { DEFAULT_MACHINE, MACHINE_TYPES } from '../utils/machine.js';

export const MIN_INTENSITY = 1;
export const MAX_INTENSITY = 13;
export const MIN_SCORE = 0;
export const MAX_SCORE = 10;

// Exponent-string rounding avoids float drift (e.g. 9.95 -> 10, not 9.9).
export function roundScore(value) {
  if (value === null || value === undefined || value === '') return value;
  const n = Number(value);
  if (!Number.isFinite(n)) return value;
  return Number(`${Math.round(Number(`${n}e1`))}e-1`);
}

const podSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Optional so pods created before brands existed stay valid without a migration.
    brand: { type: String, trim: true, maxlength: 100, default: '' },
    // Pods created before machine types existed read back as the default without a migration.
    machineType: { type: String, enum: MACHINE_TYPES, default: DEFAULT_MACHINE },
    name: { type: String, required: true, trim: true, maxlength: 100 },
    intensity: {
      type: Number,
      required: true,
      min: MIN_INTENSITY,
      max: MAX_INTENSITY,
      validate: { validator: Number.isInteger, message: 'Intensity must be a whole number' },
    },
    flavour: { type: String, trim: true, maxlength: 200, default: '' },
    score: { type: Number, required: true, min: MIN_SCORE, max: MAX_SCORE, set: roundScore },
    notes: { type: String, trim: true, maxlength: 2000, default: '' },
    dateTried: { type: Date, default: Date.now },
  },
  { timestamps: true },
);

podSchema.index({ user: 1, name: 1 });

export const Pod = mongoose.model('Pod', podSchema);

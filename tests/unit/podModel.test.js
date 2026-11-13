import { describe, expect, it } from 'vitest';
import mongoose from 'mongoose';
import { Pod, roundScore } from '../../src/models/Pod.js';
import { formatDate, formatScore, scoreClass, toDateInput } from '../../src/utils/format.js';

describe('roundScore', () => {
  it.each([
    [7.25, 7.3],
    [9.95, 10],
    [8.04, 8],
    [1.005, 1],
    ['6.66', 6.7],
  ])('rounds %j to %j', (input, expected) => {
    expect(roundScore(input)).toBe(expected);
  });

  it('passes through empty and non-numeric values for the validator to reject', () => {
    expect(roundScore(undefined)).toBeUndefined();
    expect(roundScore('abc')).toBe('abc');
  });
});

describe('Pod model', () => {
  const base = { user: new mongoose.Types.ObjectId(), name: 'Volluto', intensity: 4, score: 7.25 };

  it('stores the score rounded to one decimal place', async () => {
    const pod = new Pod(base);
    expect(pod.score).toBe(7.3);
    await expect(pod.validate()).resolves.toBeUndefined();
  });

  it('rejects out-of-range scores and fractional intensity', async () => {
    const err = await new Pod({ ...base, score: 10.5, intensity: 4.5 }).validate().catch((e) => e);
    expect(err.errors.score).toBeDefined();
    expect(err.errors.intensity).toBeDefined();
  });
});

describe('format helpers', () => {
  it('formats scores with one decimal place', () => {
    expect(formatScore(8)).toBe('8.0');
    expect(formatScore(7.3)).toBe('7.3');
  });

  it('picks a score colour class', () => {
    expect(scoreClass(9)).toBe('score-high');
    expect(scoreClass(6.5)).toBe('score-mid');
    expect(scoreClass(2)).toBe('score-low');
  });

  it('formats dates for display and date inputs', () => {
    const date = new Date('2026-11-13T00:00:00Z');
    expect(formatDate(date)).toBe('13 Nov 2026');
    expect(formatDate(null)).toBe('');
    expect(toDateInput(date)).toBe('2026-11-13');
    expect(toDateInput('2026-01-02')).toBe('2026-01-02');
    expect(toDateInput(undefined)).toBe('');
  });
});

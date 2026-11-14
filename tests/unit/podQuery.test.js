import { describe, expect, it } from 'vitest';
import { buildPodQuery, DEFAULT_SORT, escapeRegex, SORT_OPTIONS } from '../../src/utils/podQuery.js';

describe('escapeRegex', () => {
  it('escapes every regex metacharacter', () => {
    const escaped = escapeRegex('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o');
    expect(new RegExp(escaped).test('a.b*c+d?e^f$g{h}i(j)k|l[m]n\\o')).toBe(true);
    expect(escaped).toBe('a\\.b\\*c\\+d\\?e\\^f\\$g\\{h\\}i\\(j\\)k\\|l\\[m\\]n\\\\o');
  });

  it('leaves plain text alone', () => {
    expect(escapeRegex('Ristretto')).toBe('Ristretto');
  });
});

describe('buildPodQuery', () => {
  const userId = 'user-1';

  it('always scopes to the user and uses the default sort', () => {
    const { filter, sort, values } = buildPodQuery(userId);
    expect(filter).toEqual({ user: userId });
    expect(sort).toEqual(SORT_OPTIONS[DEFAULT_SORT].sort);
    expect(values.sort).toBe(DEFAULT_SORT);
  });

  it.each(Object.keys(SORT_OPTIONS))('accepts sort key %s', (key) => {
    expect(buildPodQuery(userId, { sort: key }).sort).toEqual(SORT_OPTIONS[key].sort);
  });

  it.each(['bogus', '__proto__', 'constructor', 'toString'])('falls back to the default for invalid sort %j', (sort) => {
    expect(buildPodQuery(userId, { sort }).values.sort).toBe(DEFAULT_SORT);
  });

  it('falls back to the default when sort is an array', () => {
    expect(buildPodQuery(userId, { sort: ['score_desc'] }).values.sort).toBe(DEFAULT_SORT);
  });

  it('builds a case-insensitive escaped name search', () => {
    const { filter } = buildPodQuery(userId, { q: '  Vanilla (Eclair) ' });
    expect(filter.name).toEqual({ $regex: 'Vanilla \\(Eclair\\)', $options: 'i' });
  });

  it('builds a brand contains filter', () => {
    expect(buildPodQuery(userId, { brand: ' nespr(' }).filter.brand).toEqual({ $regex: 'nespr\\(', $options: 'i' });
  });

  it('builds a flavour contains filter', () => {
    expect(buildPodQuery(userId, { flavour: 'cocoa' }).filter.flavour).toEqual({ $regex: 'cocoa', $options: 'i' });
  });

  it('ignores non-string search values (e.g. arrays or operator objects)', () => {
    const { filter } = buildPodQuery(userId, { q: ['a', 'b'], brand: ['x'], flavour: { $ne: null } });
    expect(filter).toEqual({ user: userId });
  });

  it('builds an intensity range', () => {
    expect(buildPodQuery(userId, { minIntensity: '5', maxIntensity: '10' }).filter.intensity).toEqual({ $gte: 5, $lte: 10 });
    expect(buildPodQuery(userId, { minIntensity: '8' }).filter.intensity).toEqual({ $gte: 8 });
    expect(buildPodQuery(userId, { maxIntensity: '4' }).filter.intensity).toEqual({ $lte: 4 });
  });

  it.each(['0', '14', '5.5', 'abc', '-1', ''])('ignores invalid intensity %j', (value) => {
    const { filter, values } = buildPodQuery(userId, { minIntensity: value, maxIntensity: value });
    expect(filter.intensity).toBeUndefined();
    expect(values.minIntensity).toBe('');
  });
});

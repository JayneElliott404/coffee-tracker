import { MAX_INTENSITY, MIN_INTENSITY } from '../models/Pod.js';

export const SORT_OPTIONS = {
  date_desc: { label: 'Recently tried', sort: { dateTried: -1, _id: -1 } },
  score_desc: { label: 'Highest score', sort: { score: -1, name: 1 } },
  score_asc: { label: 'Lowest score', sort: { score: 1, name: 1 } },
  intensity_desc: { label: 'Strongest', sort: { intensity: -1, name: 1 } },
  intensity_asc: { label: 'Mildest', sort: { intensity: 1, name: 1 } },
  name: { label: 'Name (A–Z)', sort: { name: 1 } },
};

export const DEFAULT_SORT = 'date_desc';

export function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function cleanText(value) {
  return typeof value === 'string' ? value.trim().slice(0, 100) : '';
}

function parseIntensity(value) {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return undefined;
  const n = Number(value);
  return n >= MIN_INTENSITY && n <= MAX_INTENSITY ? n : undefined;
}

export function buildPodQuery(userId, query = {}) {
  const filter = { user: userId };
  const brand = cleanText(query.brand);
  const q = cleanText(query.q);
  const flavour = cleanText(query.flavour);
  const minIntensity = parseIntensity(query.minIntensity);
  const maxIntensity = parseIntensity(query.maxIntensity);

  if (brand) filter.brand = { $regex: escapeRegex(brand), $options: 'i' };
  if (q) filter.name = { $regex: escapeRegex(q), $options: 'i' };
  if (flavour) filter.flavour = { $regex: escapeRegex(flavour), $options: 'i' };
  if (minIntensity !== undefined || maxIntensity !== undefined) {
    filter.intensity = {};
    if (minIntensity !== undefined) filter.intensity.$gte = minIntensity;
    if (maxIntensity !== undefined) filter.intensity.$lte = maxIntensity;
  }

  const sortKey =
    typeof query.sort === 'string' && Object.hasOwn(SORT_OPTIONS, query.sort) ? query.sort : DEFAULT_SORT;

  return {
    filter,
    sort: SORT_OPTIONS[sortKey].sort,
    values: {
      brand,
      q,
      flavour,
      minIntensity: minIntensity ?? '',
      maxIntensity: maxIntensity ?? '',
      sort: sortKey,
    },
  };
}

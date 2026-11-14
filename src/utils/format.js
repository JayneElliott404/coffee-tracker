export function formatScore(score) {
  return Number(score).toFixed(1);
}

export function formatDate(value) {
  if (!value) return '';
  return new Date(value).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

export function toDateInput(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return new Date(value).toISOString().slice(0, 10);
}

export function podLabel(pod) {
  return [pod.brand, pod.name].filter(Boolean).join(' ');
}

export function scoreClass(score) {
  if (score >= 8) return 'score-high';
  if (score >= 5) return 'score-mid';
  return 'score-low';
}

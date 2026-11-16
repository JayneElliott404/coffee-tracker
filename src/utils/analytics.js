// Accepts GTM-, G- and GT- IDs and returns null for anything else, so a typo in the environment can't inject markup.
export function validGoogleTagId(value) {
  const id = String(value ?? '').trim();
  return /^(?:GTM|G|GT)-[A-Z0-9]{4,20}$/.test(id) ? id : null;
}

// Content Security Policy sources a Google tag needs; only added when analytics is configured.
export const GOOGLE_TAG_SOURCES = {
  script: ['https://www.googletagmanager.com'],
  img: ['https://*.google-analytics.com', 'https://*.googletagmanager.com'],
  connect: ['https://*.google-analytics.com', 'https://*.analytics.google.com', 'https://*.googletagmanager.com'],
};

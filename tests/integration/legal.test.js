import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { registerAndLogin, setupTestDb } from '../helpers.js';

setupTestDb();

const PAGES = ['/', '/register', '/login', '/cookies', '/forgot-password', '/does-not-exist'];

describe('analytics configured', () => {
  let app;
  beforeAll(() => {
    vi.stubEnv('GOOGLE_TAG_ID', 'GTM-57Q86CSF');
    app = createApp({ authRateLimit: 1000 });
  });
  afterAll(() => vi.unstubAllEnvs());

  it('never puts the Google tag in server-rendered HTML, so nothing loads before consent', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    for (const url of PAGES) {
      const html = (await request(app).get(url)).text;
      expect(html, url).not.toMatch(/googletagmanager\.com|google-analytics\.com|gtag\(/);
    }
    for (const url of ['/pods', '/stats', '/account']) expect((await agent.get(url)).text, url).not.toMatch(/googletagmanager\.com|gtag\(/);
  });

  it('renders a hidden, accessible banner, the tag ID meta and the consent script on every page', async () => {
    for (const url of PAGES) {
      const html = (await request(app).get(url)).text;
      expect(html, url).toContain('<meta name="google-tag-id" content="GTM-57Q86CSF">');
      expect(html, url).toMatch(/<section id="cookie-banner"[^>]*role="region"[^>]*hidden>/);
      expect(html, url).toContain('data-consent-choice="granted"');
      expect(html, url).toContain('data-consent-choice="denied"');
      expect(html, url).toContain('<script type="module" src="/js/consent.js"></script>');
      expect(html, url).toContain('data-consent-open');
    }
  });

  it('gives Accept and Reject equal prominence', async () => {
    const html = (await request(app).get('/')).text;
    const accept = html.match(/<button[^>]*data-consent-choice="granted"/)[0].match(/class="([^"]*)"/)[1];
    const reject = html.match(/<button[^>]*data-consent-choice="denied"/)[0].match(/class="([^"]*)"/)[1];
    expect(accept).toBe(reject);
  });

  it('allows Google sources in the Content Security Policy and keeps the existing ones', async () => {
    const csp = (await request(app).get('/')).headers['content-security-policy'];
    const directive = (name) => csp.split(';').find((d) => d.startsWith(`${name} `));
    expect(directive('script-src')).toContain('https://www.googletagmanager.com');
    expect(directive('script-src')).toContain('https://cdnjs.buymeacoffee.com');
    expect(directive('script-src')).not.toContain("'unsafe-inline'");
    expect(directive('connect-src')).toContain("'self'");
    expect(directive('connect-src')).toContain('https://*.google-analytics.com');
    expect(directive('img-src')).toContain('https://*.google-analytics.com');
  });

  it('lets users change their choice on the cookie policy page', async () => {
    const html = (await request(app).get('/cookies')).text;
    expect(html).toContain('id="cookie-choice"');
    expect(html).toContain('<code>_ga</code>');
    expect(html).toContain('<code>nt_consent</code>');
  });
});

describe('analytics not configured', () => {
  let app;
  beforeAll(() => {
    vi.stubEnv('GOOGLE_TAG_ID', '');
    app = createApp({ authRateLimit: 1000 });
  });
  afterAll(() => vi.unstubAllEnvs());

  it('has no banner, meta, consent script, Google CSP sources or cookie settings link', async () => {
    const res = await request(app).get('/');
    expect(res.text).not.toMatch(/cookie-banner|google-tag-id|consent\.js|data-consent-open/);
    expect(res.headers['content-security-policy']).not.toMatch(/googletagmanager|google-analytics/);
  });

  it('says there are no optional cookies on the cookie policy', async () => {
    const html = (await request(app).get('/cookies')).text;
    expect(html).toContain('We do not currently use any analytics or other optional cookies');
    expect(html).not.toContain('cookie-choice');
  });

  it('ignores a malformed tag ID', async () => {
    vi.stubEnv('GOOGLE_TAG_ID', '"><script>alert(1)</script>');
    const html = (await request(createApp({ authRateLimit: 1000 })).get('/')).text;
    expect(html).not.toMatch(/google-tag-id|alert\(1\)/);
  });
});

describe('cookie policy page', () => {
  let app;
  beforeAll(() => {
    app = createApp({ authRateLimit: 1000 });
  });

  it('is indexable and lists the necessary cookies', async () => {
    const res = await request(app).get('/cookies');
    expect(res.status).toBe(200);
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(res.text).toContain('nespresso-tracker.sid');
    expect(res.text).toContain('x-csrf-token');
  });

  it('is reachable from the footer', async () => {
    const home = (await request(app).get('/')).text;
    expect(home).toContain('<a href="/cookies" class="footer-link">Cookie policy</a>');
  });

  it('is listed in the sitemap, and there is no privacy page', async () => {
    expect((await request(app).get('/sitemap.xml')).text).toContain('<loc>http://app.test/cookies</loc>');
    expect((await request(app).get('/privacy')).status).toBe(404);
  });
});


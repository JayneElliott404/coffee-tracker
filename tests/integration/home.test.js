import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../../src/app.js';
import { registerAndLogin, setupTestDb } from '../helpers.js';

setupTestDb();

let app;
beforeAll(() => {
  vi.stubEnv('APP_URL', 'https://nespresso-tracker.example/');
  app = createApp({ authRateLimit: 1000 });
});
afterAll(() => vi.unstubAllEnvs());

const count = (html, pattern) => (html.match(pattern) || []).length;

describe('public homepage', () => {
  it('renders a content page for logged-out visitors instead of redirecting to login', async () => {
    const res = await request(app).get('/');
    expect(res.status).toBe(200);
    expect(res.text).toContain('<title>Nespresso Pod Tracker – Track, Rate &amp; Review Your Coffee Pods</title>');
    expect(res.text).toContain('<meta name="description" content="Discover Nespresso Tracker, your personal coffee pod tracker.');
    expect(res.text).toContain('<link rel="canonical" href="https://nespresso-tracker.example/">');
    expect(res.text).toContain('<meta property="og:image" content="https://nespresso-tracker.example/img/home-og.jpg">');
    expect(count(res.text, /<h1[ >]/g)).toBe(1);
    expect(res.text).toContain('Your Personal Nespresso Pod Tracker');
    expect(res.text).toMatch(/<a href="\/register"[^>]*>[^<]*<i[^>]*><\/i>Start Tracking Your Coffee Pods<\/a>/);
    expect(res.headers['x-robots-tag']).toBeUndefined();
    expect(res.text).not.toContain('name="robots"');
  });

  it('embeds valid JSON-LD for the website and web application', async () => {
    const html = (await request(app).get('/')).text;
    const block = html.match(/<script type="application\/ld\+json">(.+?)<\/script>/s);
    const data = JSON.parse(block[1]);
    expect(data.map((item) => item['@type'])).toEqual(['WebSite', 'WebApplication']);
    expect(data[0].url).toBe('https://nespresso-tracker.example/');
  });

  it('gives every image alt text and dimensions, and lazy-loads only below the fold', async () => {
    const html = (await request(app).get('/')).text;
    const images = html.match(/<img[^>]*>/gs);
    expect(images.length).toBeGreaterThan(0);
    for (const img of images) {
      if (img.includes('/img/logo.svg')) continue;
      expect(img).toMatch(/alt="[^"]+"/);
      expect(img).toMatch(/width="\d+"/);
      expect(img).toMatch(/height="\d+"/);
    }
    const hero = images.find((img) => img.includes('home-hero'));
    expect(hero).toContain('fetchpriority="high"');
    expect(hero).not.toContain('loading="lazy"');
    expect(images.find((img) => img.includes('home-cta'))).toContain('loading="lazy"');
  });

  it('offers log in and create account links to logged-out visitors, and the non-affiliation note', async () => {
    const html = (await request(app).get('/')).text;
    const nav = html.slice(html.indexOf('<nav'), html.indexOf('</nav>'));
    expect(nav).toContain('href="/login"');
    expect(nav).toContain('href="/register"');
    expect(html).toContain('not affiliated with or endorsed by');
  });

  it('still sends logged-in users to their pods', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    const res = await agent.get('/');
    expect(res.status).toBe(302);
    expect(res.headers.location).toBe('/pods');
  });

  it('serves the images referenced by the page', async () => {
    const html = (await request(app).get('/')).text;
    const sources = [...new Set([...html.matchAll(/\/img\/home-[\w-]+\.(?:webp|jpg)/g)].map((m) => m[0]))];
    expect(sources.length).toBeGreaterThanOrEqual(6);
    for (const src of sources) expect((await request(app).get(src)).status, src).toBe(200);
  });
});

describe('crawler controls', () => {
  it('serves robots.txt that hides personal areas and points to the sitemap', async () => {
    const res = await request(app).get('/robots.txt');
    expect(res.status).toBe(200);
    expect(res.type).toBe('text/plain');
    for (const path of ['/pods', '/stats', '/account', '/admin']) expect(res.text).toContain(`Disallow: ${path}\n`);
    expect(res.text).toContain('Sitemap: https://nespresso-tracker.example/sitemap.xml');
    expect(res.text).not.toMatch(/Disallow: \/\s/);
  });

  it('serves a sitemap that lists only the public pages', async () => {
    const res = await request(app).get('/sitemap.xml');
    expect(res.status).toBe(200);
    expect(res.type).toBe('application/xml');
    expect([...res.text.matchAll(/<loc>(.+?)<\/loc>/g)].map((m) => m[1])).toEqual([
      'https://nespresso-tracker.example/',
      'https://nespresso-tracker.example/register',
    ]);
  });

  it('does not create a session for robots.txt or sitemap.xml requests', async () => {
    for (const url of ['/robots.txt', '/sitemap.xml']) expect((await request(app).get(url)).headers['set-cookie'], url).toBeUndefined();
  });

  it('noindexes login, recovery, private and error pages but keeps register indexable', async () => {
    const agent = await registerAndLogin(app, 'jayne');
    for (const url of ['/login', '/forgot-password', '/confirm-email/resend', '/reset-password/abc', '/does-not-exist']) {
      const res = await request(app).get(url);
      expect(res.headers['x-robots-tag'], url).toBe('noindex, nofollow');
      expect(res.text, url).toContain('<meta name="robots" content="noindex, nofollow">');
    }
    for (const url of ['/pods', '/stats', '/account']) {
      const res = await agent.get(url);
      expect(res.headers['x-robots-tag'], url).toBe('noindex, nofollow');
      expect(res.text, url).toContain('<meta name="robots" content="noindex, nofollow">');
    }

    const register = await request(app).get('/register');
    expect(register.status).toBe(200);
    expect(register.headers['x-robots-tag']).toBeUndefined();
    expect(register.text).not.toContain('name="robots"');
    expect(register.text).toContain('<link rel="canonical" href="https://nespresso-tracker.example/register">');
    expect(register.text).toContain('<meta name="description"');
  });
});

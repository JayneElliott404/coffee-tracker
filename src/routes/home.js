import { Router } from 'express';
import { PUBLIC_PATHS, baseUrlOf } from '../middleware/seo.js';

const TITLE = 'Nespresso Pod Tracker – Track, Rate & Review Your Coffee Pods';
const DESCRIPTION =
  "Discover Nespresso Tracker, your personal coffee pod tracker. Record capsules you've tried, rate your favourites and keep track of your coffee collection.";

// Personal areas only. Auth pages stay crawlable so Google can read their noindex header.
const DISALLOWED = ['/pods', '/stats', '/account', '/admin', '/logout'];

const escapeXml = (value) => value.replace(/[<>&'"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[c]);

export function homeRouter() {
  const router = Router();

  router.get('/', (req, res) => {
    if (req.user) return res.redirect('/pods');

    const { baseUrl } = res.locals;
    res.render('home', {
      fullTitle: TITLE,
      metaDescription: DESCRIPTION,
      canonicalPath: '/',
      ogImage: '/img/home-og.jpg',
      ogImageAlt: 'An espresso in a white cup on a sunlit wooden table',
      jsonLd: [
        {
          '@context': 'https://schema.org',
          '@type': 'WebSite',
          name: 'Nespresso Tracker',
          url: `${baseUrl}/`,
          description: DESCRIPTION,
          inLanguage: 'en-GB',
        },
        {
          '@context': 'https://schema.org',
          '@type': 'WebApplication',
          name: 'Nespresso Tracker',
          url: `${baseUrl}/`,
          description: DESCRIPTION,
          applicationCategory: 'LifestyleApplication',
          operatingSystem: 'Any',
          browserRequirements: 'Requires a modern web browser',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'GBP' },
        },
      ],
    });
  });

  return router;
}

// Mounted before the session middleware so crawlers fetching these files don't create sessions.
export function crawlerFilesRouter() {
  const router = Router();

  router.get('/robots.txt', (req, res) => {
    const lines = ['User-agent: *', ...DISALLOWED.map((path) => `Disallow: ${path}`), '', `Sitemap: ${baseUrlOf(req)}/sitemap.xml`, ''];
    res.type('text/plain').send(lines.join('\n'));
  });

  router.get('/sitemap.xml', (req, res) => {
    const urls = PUBLIC_PATHS.map((path) => `  <url><loc>${escapeXml(baseUrlOf(req) + path)}</loc></url>`);
    res
      .type('application/xml')
      .send(`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`);
  });

  return router;
}

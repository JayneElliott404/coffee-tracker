import { Router } from 'express';

export const POLICY_LAST_UPDATED = '16 November 2026';
export const PRIVACY_CONTACT = 'support@nespresso-tracker.com';

export function legalRouter() {
  const router = Router();

  router.get('/privacy', (req, res) => {
    res.render('legal/privacy', {
      title: 'Privacy policy',
      metaDescription: 'How Nespresso Tracker collects and uses your personal data, your rights under UK GDPR, and how analytics cookies work.',
      canonicalPath: '/privacy',
      lastUpdated: POLICY_LAST_UPDATED,
      contactEmail: PRIVACY_CONTACT,
    });
  });

  router.get('/cookies', (req, res) => {
    res.render('legal/cookies', {
      title: 'Cookie policy',
      metaDescription: 'The cookies Nespresso Tracker uses, why we use them, and how to change your cookie choices at any time.',
      canonicalPath: '/cookies',
      lastUpdated: POLICY_LAST_UPDATED,
    });
  });

  return router;
}

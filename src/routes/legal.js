import { Router } from 'express';

export const POLICY_LAST_UPDATED = '16 November 2026';

export function legalRouter() {
  const router = Router();

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

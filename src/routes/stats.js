import { Router } from 'express';
import { Pod } from '../models/Pod.js';
import { requireAuth } from '../middleware/auth.js';

export function statsRouter() {
  const router = Router();

  router.get('/', requireAuth, async (req, res) => {
    const match = { $match: { user: req.user._id } };
    const [[summary], buckets, topRated, recent] = await Promise.all([
      Pod.aggregate([
        match,
        {
          $group: {
            _id: null,
            count: { $sum: 1 },
            avgScore: { $avg: '$score' },
            avgIntensity: { $avg: '$intensity' },
          },
        },
      ]),
      Pod.aggregate([match, { $group: { _id: { $floor: '$score' }, count: { $sum: 1 } } }]),
      Pod.find({ user: req.user._id }).sort({ score: -1, name: 1 }).limit(5).lean(),
      Pod.find({ user: req.user._id }).sort({ dateTried: -1, _id: -1 }).limit(5).lean(),
    ]);

    const counts = new Map(buckets.map((b) => [b._id, b.count]));
    const distribution = Array.from({ length: 11 }, (_, score) => ({ score, count: counts.get(score) ?? 0 }));
    const maxBucket = Math.max(1, ...distribution.map((d) => d.count));

    res.render('stats', {
      title: 'Stats',
      summary: summary ?? { count: 0, avgScore: 0, avgIntensity: 0 },
      distribution,
      maxBucket,
      topRated,
      recent,
    });
  });

  return router;
}

import crypto from 'node:crypto';
import { Router } from 'express';
import mongoose from 'mongoose';
import { Pod } from '../models/Pod.js';
import { User } from '../models/User.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { escapeRegex } from '../utils/podQuery.js';

const PAGE_SIZE = 20;

async function loadTarget(req, res, next) {
  if (!mongoose.isValidObjectId(req.params.id)) return next('route');
  const target = await User.findById(req.params.id);
  if (!target) return next('route');
  req.target = target;
  next();
}

function forbidSelf(req, res, next) {
  if (req.target._id.equals(req.user._id)) {
    req.flash('error', 'You cannot change your own account from the admin area.');
    return res.redirect(`/admin/users/${req.target._id}`);
  }
  next();
}

async function renderUser(req, res, extra = {}) {
  const pods = await Pod.find({ user: req.target._id }).sort({ dateTried: -1, _id: -1 }).lean();
  res.render('admin/user', { title: `Admin · ${req.target.username}`, target: req.target, pods, ...extra });
}

export function adminRouter() {
  const router = Router();
  router.use(requireAuth, requireAdmin);

  router.get('/', (req, res) => res.redirect('/admin/users'));

  router.get('/users', async (req, res) => {
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 30) : '';
    const page = Math.max(1, Number.parseInt(req.query.page, 10) || 1);
    const filter = q ? { username: { $regex: escapeRegex(q), $options: 'i' } } : {};

    const [users, total] = await Promise.all([
      User.find(filter).sort({ username: 1 }).skip((page - 1) * PAGE_SIZE).limit(PAGE_SIZE).lean(),
      User.countDocuments(filter),
    ]);
    const podCounts = await Pod.aggregate([
      { $match: { user: { $in: users.map((u) => u._id) } } },
      { $group: { _id: '$user', count: { $sum: 1 } } },
    ]);
    const countByUser = new Map(podCounts.map((c) => [c._id.toString(), c.count]));

    res.render('admin/users', {
      title: 'Admin · Users',
      users: users.map((u) => ({ ...u, podCount: countByUser.get(u._id.toString()) ?? 0 })),
      q,
      page,
      totalPages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  });

  router.get('/users/:id', loadTarget, (req, res) => renderUser(req, res));

  router.post('/users/:id/role', loadTarget, forbidSelf, async (req, res) => {
    const role = req.body.role === 'admin' ? 'admin' : 'user';
    req.target.role = role;
    await req.target.save();
    req.flash('success', `${req.target.username} is now ${role === 'admin' ? 'an admin' : 'a standard user'}.`);
    res.redirect(`/admin/users/${req.target._id}`);
  });

  router.post('/users/:id/disable', loadTarget, forbidSelf, async (req, res) => {
    req.target.disabled = true;
    await req.target.save();
    req.flash('success', `${req.target.username} has been disabled.`);
    res.redirect(`/admin/users/${req.target._id}`);
  });

  router.post('/users/:id/enable', loadTarget, forbidSelf, async (req, res) => {
    req.target.disabled = false;
    await req.target.save();
    req.flash('success', `${req.target.username} has been enabled.`);
    res.redirect(`/admin/users/${req.target._id}`);
  });

  router.post('/users/:id/delete', loadTarget, forbidSelf, async (req, res) => {
    await Pod.deleteMany({ user: req.target._id });
    await req.target.deleteOne();
    req.flash('success', `Deleted ${req.target.username} and their pods.`);
    res.redirect('/admin/users');
  });

  router.post('/users/:id/temp-password', loadTarget, forbidSelf, async (req, res) => {
    const tempPassword = crypto.randomBytes(9).toString('base64url');
    req.target.passwordHash = await User.hashPassword(tempPassword);
    req.target.mustChangePassword = true;
    await req.target.save();
    // Shown once in this response only; never stored in plain text or the session.
    res.set('Cache-Control', 'no-store');
    await renderUser(req, res, { tempPassword });
  });

  return router;
}

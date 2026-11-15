import { Router } from 'express';
import mongoose from 'mongoose';
import { matchedData, validationResult } from 'express-validator';
import { Pod } from '../models/Pod.js';
import { requireAuth } from '../middleware/auth.js';
import { buildPodQuery, SORT_OPTIONS } from '../utils/podQuery.js';
import { podRules } from '../validators/pod.js';
import { MACHINE_TYPES } from '../utils/machine.js';

function findOwnedPod(req) {
  if (!mongoose.isValidObjectId(req.params.id)) return null;
  return Pod.findOne({ _id: req.params.id, user: req.user._id });
}

function renderForm(res, { pod, errors = {}, status = 200 }) {
  const isEdit = Boolean(pod._id);
  res.status(status).render('pods/form', {
    title: isEdit ? `Edit ${pod.name}` : 'Add a pod',
    pod,
    machineType: MACHINE_TYPES.includes(pod.machineType) ? pod.machineType : res.req.user.machineType,
    errors,
    action: isEdit ? `/pods/${pod._id}` : '/pods',
  });
}

export function podsRouter() {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res) => {
    const { filter, sort, values } = buildPodQuery(req.user._id, req.query);
    const [pods, total] = await Promise.all([
      Pod.find(filter).sort(sort).lean(),
      Pod.countDocuments({ user: req.user._id }),
    ]);
    res.render('pods/index', { title: 'My Pods', pods, total, values, sortOptions: SORT_OPTIONS });
  });

  router.get('/new', (req, res) => {
    renderForm(res, { pod: { dateTried: new Date(), intensity: 7 } });
  });

  router.post('/', podRules, async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return renderForm(res, { pod: req.body, errors: result.mapped(), status: 422 });
    }
    const pod = await Pod.create({ machineType: req.user.machineType, ...matchedData(req), user: req.user._id });
    req.flash('success', `Added ${pod.name}.`);
    res.redirect('/pods');
  });

  router.get('/:id/edit', async (req, res, next) => {
    const pod = await findOwnedPod(req);
    if (!pod) return next();
    renderForm(res, { pod });
  });

  router.post('/:id', podRules, async (req, res, next) => {
    const pod = await findOwnedPod(req);
    if (!pod) return next();

    const result = validationResult(req);
    if (!result.isEmpty()) {
      return renderForm(res, { pod: { ...req.body, _id: pod._id }, errors: result.mapped(), status: 422 });
    }
    pod.set(matchedData(req));
    await pod.save();
    req.flash('success', `Updated ${pod.name}.`);
    res.redirect('/pods');
  });

  router.post('/:id/delete', async (req, res, next) => {
    const pod = await findOwnedPod(req);
    if (!pod) return next();
    await pod.deleteOne();
    req.flash('success', `Deleted ${pod.name}.`);
    res.redirect('/pods');
  });

  return router;
}

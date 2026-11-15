import { Router } from 'express';
import { matchedData, validationResult } from 'express-validator';
import { requireAuth, startSession } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { changePasswordRules } from '../validators/auth.js';
import { machineSettingsRules } from '../validators/machine.js';

export function accountRouter() {
  const router = Router();
  router.use(requireAuth);

  const render = (req, res, { errors = {}, machineType = req.user.machineType, status = 200 } = {}) =>
    res.status(status).render('account/settings', {
      title: 'Account settings',
      forced: req.user.mustChangePassword,
      machineType,
      errors,
    });

  router.get('/', (req, res) => render(req, res));

  router.get('/password', (req, res) => res.redirect('/account'));

  router.post('/machine', machineSettingsRules, async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) return render(req, res, { errors: result.mapped(), status: 422 });

    req.user.machineType = matchedData(req).machineType;
    await req.user.save();
    req.flash('success', 'Your default machine has been updated.');
    res.redirect('/account');
  });

  router.post('/password', changePasswordRules, async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) return render(req, res, { errors: result.mapped(), status: 422 });

    const { currentPassword, newPassword } = matchedData(req);
    if (!(await req.user.verifyPassword(currentPassword))) {
      return render(req, res, { errors: { currentPassword: { msg: 'Current password is incorrect' } }, status: 422 });
    }

    req.user.passwordHash = await User.hashPassword(newPassword);
    req.user.mustChangePassword = false;
    await req.user.save();
    await startSession(req, req.user._id);

    req.flash('success', 'Your password has been changed.');
    res.redirect('/pods');
  });

  return router;
}

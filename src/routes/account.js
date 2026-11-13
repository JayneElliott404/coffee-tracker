import { Router } from 'express';
import { matchedData, validationResult } from 'express-validator';
import { requireAuth, startSession } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { changePasswordRules } from '../validators/auth.js';

export function accountRouter() {
  const router = Router();
  router.use(requireAuth);

  const render = (req, res, errors = {}, status = 200) =>
    res.status(status).render('account/password', {
      title: 'Change password',
      forced: req.user.mustChangePassword,
      errors,
    });

  router.get('/password', (req, res) => render(req, res));

  router.post('/password', changePasswordRules, async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) return render(req, res, result.mapped(), 422);

    const { currentPassword, newPassword } = matchedData(req);
    if (!(await req.user.verifyPassword(currentPassword))) {
      return render(req, res, { currentPassword: { msg: 'Current password is incorrect' } }, 422);
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

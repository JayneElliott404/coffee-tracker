import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { matchedData, validationResult } from 'express-validator';
import { User } from '../models/User.js';
import { redirectIfLoggedIn } from '../middleware/auth.js';
import { sendConfirmation, sendPasswordResetEmail } from '../services/email.js';
import {
  CONFIRM_EMAIL,
  RESET_PASSWORD,
  consumeToken,
  destroyUserSessions,
  issueToken,
  peekToken,
  revokeTokens,
} from '../services/emailTokens.js';
import { emailOnlyRules, resetPasswordRules } from '../validators/auth.js';

const invalidLink = (res, kind) =>
  res.status(400).render('auth/link-invalid', {
    title: 'Link not valid',
    kind,
  });

export function accountRecoveryRouter({ authRateLimit = 10 } = {}) {
  const router = Router();

  // Unlike the login limiter this counts every request, because these pages send email.
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authRateLimit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).render('error', {
        title: 'Too many attempts',
        status: 429,
        message: 'Too many attempts. Please wait 15 minutes and try again.',
      }),
  });

  router.use(['/forgot-password', '/confirm-email/resend'], redirectIfLoggedIn);

  // Forgot password

  router.get('/forgot-password', (req, res) => {
    res.render('auth/forgot-password', { title: 'Forgot your password?', values: {}, errors: {}, sent: false });
  });

  router.post('/forgot-password', limiter, emailOnlyRules, async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(422).render('auth/forgot-password', {
        title: 'Forgot your password?',
        values: { username: req.body.username },
        errors: result.mapped(),
        sent: false,
      });
    }

    const { username } = matchedData(req);
    // The same page is shown whether or not the account exists, and the work happens after responding.
    res.render('auth/forgot-password', { title: 'Check your inbox', values: {}, errors: {}, sent: true });

    try {
      const user = await User.findOne({ username });
      if (!user || user.disabled) return;
      const token = await issueToken(user._id, RESET_PASSWORD);
      if (token) await sendPasswordResetEmail(user, token);
    } catch (err) {
      console.error('Could not send password reset email:', err);
    }
  });

  // Reset password: the emailed link only shows the form; submitting it uses the token up.

  router.get('/reset-password/:token', async (req, res) => {
    if (!(await peekToken(req.params.token, RESET_PASSWORD))) return invalidLink(res, 'reset');
    res.set('Cache-Control', 'no-store');
    res.render('auth/reset-password', { title: 'Choose a new password', token: req.params.token, errors: {} });
  });

  router.post('/reset-password/:token', limiter, resetPasswordRules, async (req, res) => {
    const { token } = req.params;
    const result = validationResult(req);
    if (!result.isEmpty()) {
      if (!(await peekToken(token, RESET_PASSWORD))) return invalidLink(res, 'reset');
      return res.status(422).render('auth/reset-password', { title: 'Choose a new password', token, errors: result.mapped() });
    }

    const record = await consumeToken(token, RESET_PASSWORD);
    if (!record) return invalidLink(res, 'reset');
    const user = await User.findById(record.user);
    if (!user || user.disabled) return invalidLink(res, 'reset');

    user.passwordHash = await User.hashPassword(matchedData(req).password);
    user.mustChangePassword = false;
    // Following the emailed link proves they own the inbox.
    if (!user.emailConfirmed) {
      user.emailConfirmed = true;
      user.emailConfirmedAt = new Date();
    }
    await user.save();
    await revokeTokens(user._id);
    await destroyUserSessions(user._id);

    req.flash('success', 'Your password has been changed. Please log in.');
    res.redirect('/login');
  });

  // Confirm email

  router.get('/confirm-email/resend', (req, res) => {
    res.render('auth/resend-confirmation', { title: 'Confirm your email', values: {}, errors: {}, sent: false });
  });

  router.post('/confirm-email/resend', limiter, emailOnlyRules, async (req, res) => {
    const result = validationResult(req);
    if (!result.isEmpty()) {
      return res.status(422).render('auth/resend-confirmation', {
        title: 'Confirm your email',
        values: { username: req.body.username },
        errors: result.mapped(),
        sent: false,
      });
    }

    const { username } = matchedData(req);
    res.render('auth/resend-confirmation', { title: 'Check your inbox', values: {}, errors: {}, sent: true });

    try {
      const user = await User.findOne({ username });
      if (user && !user.disabled && !user.emailConfirmed) await sendConfirmation(user);
    } catch (err) {
      console.error('Could not resend confirmation email:', err);
    }
  });

  router.get('/confirm-email/:token', async (req, res) => {
    if (!(await peekToken(req.params.token, CONFIRM_EMAIL))) return invalidLink(res, 'confirm');
    res.set('Cache-Control', 'no-store');
    res.render('auth/confirm-email', { title: 'Confirm your email', token: req.params.token });
  });

  router.post('/confirm-email/:token', limiter, async (req, res) => {
    const record = await consumeToken(req.params.token, CONFIRM_EMAIL);
    if (!record) return invalidLink(res, 'confirm');

    await User.updateOne({ _id: record.user }, { $set: { emailConfirmed: true, emailConfirmedAt: new Date() } });
    req.flash('success', 'Your email address is confirmed. You can now log in.');
    res.redirect('/login');
  });

  return router;
}

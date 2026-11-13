import bcrypt from 'bcryptjs';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { matchedData, validationResult } from 'express-validator';
import { User } from '../models/User.js';
import { redirectIfLoggedIn, startSession } from '../middleware/auth.js';
import { loginRules, registerRules } from '../validators/auth.js';

// Compared against when the username doesn't exist so response timing doesn't reveal valid usernames.
const DUMMY_HASH = await User.hashPassword('not-a-real-password');

export function authRouter({ authRateLimit = 10 } = {}) {
  const router = Router();

  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: authRateLimit,
    skipSuccessfulRequests: true,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (req, res) =>
      res.status(429).render('error', {
        title: 'Too many attempts',
        status: 429,
        message: 'Too many attempts. Please wait 15 minutes and try again.',
      }),
  });

  router.get('/login', redirectIfLoggedIn, (req, res) => {
    res.render('auth/login', { title: 'Log in', values: {}, errors: {} });
  });

  router.post('/login', limiter, redirectIfLoggedIn, loginRules, async (req, res) => {
    const renderError = (message) =>
      res.status(401).render('auth/login', {
        title: 'Log in',
        values: { username: req.body.username },
        errors: { form: { msg: message } },
      });

    if (!validationResult(req).isEmpty()) return renderError('Enter your username and password.');

    const { username, password } = matchedData(req);
    const user = await User.findOne({ username });
    const valid = (await bcrypt.compare(password, user?.passwordHash ?? DUMMY_HASH)) && user !== null;

    if (!valid) return renderError('Incorrect username or password.');
    if (user.disabled) return renderError('This account has been disabled. Contact an admin.');

    user.lastLoginAt = new Date();
    await user.save();
    await startSession(req, user._id);

    if (user.mustChangePassword) return res.redirect('/account/password');
    req.flash('success', `Welcome back, ${user.username}!`);
    res.redirect('/pods');
  });

  router.get('/register', redirectIfLoggedIn, (req, res) => {
    res.render('auth/register', { title: 'Create an account', values: {}, errors: {} });
  });

  router.post('/register', limiter, redirectIfLoggedIn, registerRules, async (req, res) => {
    const renderErrors = (errors) =>
      res.status(422).render('auth/register', {
        title: 'Create an account',
        values: { username: req.body.username },
        errors,
      });

    const result = validationResult(req);
    if (!result.isEmpty()) return renderErrors(result.mapped());

    const { username, password } = matchedData(req);
    const taken = { username: { msg: 'That username is already taken' } };
    if (await User.exists({ username })) return renderErrors(taken);

    let user;
    try {
      user = await User.create({ username, passwordHash: await User.hashPassword(password), lastLoginAt: new Date() });
    } catch (err) {
      if (err.code === 11000) return renderErrors(taken);
      throw err;
    }

    await startSession(req, user._id);
    req.flash('success', `Welcome to The Pod Café, ${user.username}!`);
    res.redirect('/pods');
  });

  router.post('/logout', (req, res, next) => {
    req.session.destroy((err) => {
      if (err) return next(err);
      res.clearCookie('podcafe.sid');
      res.redirect('/login');
    });
  });

  return router;
}

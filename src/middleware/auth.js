import { User } from '../models/User.js';
import { sendConfirmation } from '../services/email.js';

const PASSWORD_CHANGE_ALLOWED = new Set(['/account', '/account/password', '/logout']);

// Reloaded on every request so role changes, disables and deletions take effect immediately.
export async function loadUser(req, res, next) {
  res.locals.currentUser = null;
  const { userId } = req.session;
  if (!userId) return next();

  const user = await User.findById(userId);
  if (!user || user.disabled || !user.emailConfirmed) {
    delete req.session.userId;
    // Covers accounts that existed before email confirmation was introduced.
    if (user && !user.disabled) {
      req.flash('error', 'Please confirm your email address to keep using Nespresso Tracker. We have emailed you a link.');
      await sendConfirmation(user);
    } else {
      req.flash('error', user ? 'Your account has been disabled.' : 'Please log in again.');
    }
    return next();
  }

  req.user = user;
  res.locals.currentUser = user;

  if (user.mustChangePassword && !PASSWORD_CHANGE_ALLOWED.has(req.path)) {
    return res.redirect('/account');
  }
  next();
}

export function requireAuth(req, res, next) {
  if (!req.user) return res.redirect('/login');
  next();
}

export function requireAdmin(req, res, next) {
  if (!req.user?.isAdmin) {
    return res.status(403).render('error', {
      title: 'Not allowed',
      status: 403,
      message: 'You need an admin account to see this page.',
    });
  }
  next();
}

export function redirectIfLoggedIn(req, res, next) {
  if (req.user) return res.redirect('/pods');
  next();
}

export function startSession(req, userId) {
  return new Promise((resolve, reject) => {
    req.session.regenerate((err) => {
      if (err) return reject(err);
      req.session.userId = userId.toString();
      req.session.save((saveErr) => (saveErr ? reject(saveErr) : resolve()));
    });
  });
}

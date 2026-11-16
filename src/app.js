import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import session from 'express-session';
import { MongoStore } from 'connect-mongo';
import mongoose from 'mongoose';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { doubleCsrf } from 'csrf-csrf';
import { loadUser } from './middleware/auth.js';
import { flash } from './middleware/flash.js';
import { noindex, seo } from './middleware/seo.js';
import { validGoogleTagId, GOOGLE_TAG_SOURCES } from './utils/analytics.js';
import { homeRouter, crawlerFilesRouter } from './routes/home.js';
import { legalRouter } from './routes/legal.js';
import { accountRouter } from './routes/account.js';
import { accountRecoveryRouter } from './routes/accountRecovery.js';
import { adminRouter } from './routes/admin.js';
import { authRouter } from './routes/auth.js';
import { podsRouter } from './routes/pods.js';
import { statsRouter } from './routes/stats.js';
import { formatDate, formatScore, podLabel, scoreClass, toDateInput } from './utils/format.js';
import { MACHINE_TYPES, machineLabel } from './utils/machine.js';

const srcDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(srcDir, '..');

export function createApp({ authRateLimit } = {}) {
  const isProd = process.env.NODE_ENV === 'production';
  const secret = process.env.SESSION_SECRET;
  if (!secret) throw new Error('SESSION_SECRET is not set. Copy .env.example to .env and fill it in.');
  if (isProd && !process.env.RESEND_API_KEY) throw new Error('RESEND_API_KEY is not set. Emails cannot be sent without it.');
  if (isProd && !process.env.APP_URL) throw new Error('APP_URL is not set. It is used to build the links in emails.');

  const googleTagId = validGoogleTagId(process.env.GOOGLE_TAG_ID);

  const app = express();
  app.set('views', path.join(srcDir, 'views'));
  app.set('view engine', 'ejs');
  // Render terminates TLS at its proxy; needed for secure cookies and correct client IPs.
  app.set('trust proxy', 1);

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          // Buy Me a Coffee widget: external script, and it writes an inline <style> block.
          // Google domains are only allowed when analytics is configured; the tag itself loads only after consent.
          'script-src': ["'self'", 'https://cdnjs.buymeacoffee.com', ...(googleTagId ? GOOGLE_TAG_SOURCES.script : [])],
          'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
          'font-src': ["'self'", 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:', ...(googleTagId ? GOOGLE_TAG_SOURCES.img : [])],
          'connect-src': ["'self'", ...(googleTagId ? GOOGLE_TAG_SOURCES.connect : [])],
          'upgrade-insecure-requests': isProd ? [] : null,
        },
      },
    }),
  );

  app.use(express.static(path.join(rootDir, 'public'), { maxAge: isProd ? '1d' : 0 }));
  app.use('/vendor/bootstrap', express.static(path.join(rootDir, 'node_modules/bootstrap/dist')));
  app.use('/vendor/bootstrap-icons', express.static(path.join(rootDir, 'node_modules/bootstrap-icons/font')));
  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use(crawlerFilesRouter());

  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  app.use(cookieParser());
  app.use(
    session({
      name: 'nespresso-tracker.sid',
      secret,
      resave: false,
      // Anonymous sessions must persist so CSRF tokens on the login/register forms stay valid.
      saveUninitialized: true,
      store: MongoStore.create({
        client: mongoose.connection.getClient(),
        collectionName: 'sessions',
        touchAfter: 24 * 60 * 60,
      }),
      cookie: { httpOnly: true, sameSite: 'lax', secure: isProd, maxAge: 7 * 24 * 60 * 60 * 1000 },
    }),
  );
  app.use(flash);

  const { generateCsrfToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => secret,
    getSessionIdentifier: (req) => req.session.id,
    cookieName: isProd ? '__Host-nespresso-tracker.x-csrf-token' : 'nespresso-tracker.x-csrf-token',
    cookieOptions: { sameSite: 'lax', secure: isProd, path: '/' },
    getCsrfTokenFromRequest: (req) => req.body?._csrf,
  });

  app.use((req, res, next) => {
    res.locals.csrfToken = generateCsrfToken(req, res);
    res.locals.path = req.path;
    res.locals.googleTagId = googleTagId;
    res.locals.getFlash = (type) => req.flash(type);
    Object.assign(res.locals, { formatDate, formatScore, podLabel, scoreClass, toDateInput, MACHINE_TYPES, machineLabel });
    next();
  });
  app.use(seo);
  app.use(loadUser);
  app.use(doubleCsrfProtection);

  app.use(homeRouter());
  app.use(legalRouter());
  app.use(authRouter({ authRateLimit }));
  app.use(accountRecoveryRouter({ authRateLimit }));
  app.use('/pods', podsRouter());
  app.use('/stats', statsRouter());
  app.use('/account', accountRouter());
  app.use('/admin', adminRouter());

  app.use((req, res) => {
    noindex(res);
    res.status(404).render('error', {
      title: 'Not found',
      status: 404,
      message: "We couldn't find that page. Maybe it was drunk already?",
    });
  });

  // Express identifies error handlers by their four parameters.
  app.use((err, req, res, next) => {
    noindex(res);
    if (err.code === 'EBADCSRFTOKEN') {
      return res.status(403).render('error', {
        title: 'Form expired',
        status: 403,
        message: 'Your form expired. Please go back, refresh the page and try again.',
      });
    }
    console.error(err);
    res.status(500).render('error', {
      title: 'Something went wrong',
      status: 500,
      message: 'Something went wrong on our side. Please try again.',
    });
  });

  return app;
}

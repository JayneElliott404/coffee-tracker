const PRIVATE_PREFIXES = [
  '/login',
  '/logout',
  '/forgot-password',
  '/reset-password',
  '/confirm-email',
  '/pods',
  '/stats',
  '/account',
  '/admin',
];

// Pages that should appear in search results and in sitemap.xml.
export const PUBLIC_PATHS = ['/', '/register'];

const isPrivate = (path) => PRIVATE_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));

export function noindex(res) {
  res.locals.noindex = true;
  res.set('X-Robots-Tag', 'noindex, nofollow');
}

export function baseUrlOf(req) {
  const configured = process.env.APP_URL;
  return (configured || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
}

// Auth and personal pages must never be indexed; error pages are noindexed by the 404/500 handlers.
export function seo(req, res, next) {
  res.locals.baseUrl = baseUrlOf(req);
  if (isPrivate(req.path)) noindex(res);
  next();
}

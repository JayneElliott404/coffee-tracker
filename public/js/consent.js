const CONSENT_COOKIE = 'nt_consent';
// Bump the version to ask everyone for consent again, e.g. after the policy changes in a way that matters.
const CONSENT_VERSION = 'v1';
const SIX_MONTHS_IN_SECONDS = 60 * 60 * 24 * 182;
const GOOGLE_COOKIE = /^(?:_ga|_gid|_gat|_gcl)/;
const TAG_ID = /^(?:GTM|G|GT)-[A-Z0-9]{4,20}$/;

export function readConsent() {
  const match = document.cookie.split('; ').find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
  const [version, choice] = (match ? decodeURIComponent(match.slice(CONSENT_COOKIE.length + 1)) : '').split(':');
  if (version !== CONSENT_VERSION) return null;
  return choice === 'granted' || choice === 'denied' ? choice : null;
}

export function writeConsent(choice) {
  const secure = window.location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${CONSENT_COOKIE}=${CONSENT_VERSION}:${choice}; Max-Age=${SIX_MONTHS_IN_SECONDS}; Path=/; SameSite=Lax${secure}`;
}

const tagScript = () => document.querySelector('script[data-google-tag]');

function gtag() {
  window.dataLayer.push(arguments);
}

// Runs Google's snippet (dataLayer + gtag('js')) and then loads the tag. Called only after consent.
export function loadGoogleTag(id) {
  if (!TAG_ID.test(id) || tagScript()) return;
  window.dataLayer = window.dataLayer || [];
  gtag('consent', 'default', { analytics_storage: 'denied', ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  gtag('consent', 'update', { analytics_storage: 'granted' });
  gtag('js', new Date());
  const script = document.createElement('script');
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  script.dataset.googleTag = id;
  document.head.append(script);
}

// Google sets its cookies on the site's domain or a parent of it, so every candidate domain is tried.
export function removeGoogleCookies() {
  const hostParts = window.location.hostname.split('.');
  const domains = [undefined, ...hostParts.map((_, i) => `.${hostParts.slice(i).join('.')}`).filter((d) => d.includes('.', 1))];
  for (const cookie of document.cookie.split('; ')) {
    const name = cookie.split('=')[0];
    if (!GOOGLE_COOKIE.test(name)) continue;
    for (const domain of domains) {
      document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`;
    }
  }
}

export function setConsent(choice, { reload = () => window.location.reload() } = {}) {
  const wasLoaded = Boolean(tagScript());
  writeConsent(choice);
  if (choice === 'granted') return loadGoogleTag(document.querySelector('meta[name="google-tag-id"]')?.content);
  if (wasLoaded) {
    gtag('consent', 'update', { analytics_storage: 'denied' });
    removeGoogleCookies();
    // A loaded script can't be unloaded, so reloading is what guarantees tracking has stopped.
    reload();
  } else {
    removeGoogleCookies();
  }
}

export function init({ reload } = {}) {
  const tagId = document.querySelector('meta[name="google-tag-id"]')?.content;
  if (!tagId) return;

  const banner = document.getElementById('cookie-banner');
  const showStatus = () => {
    const choice = readConsent();
    for (const el of document.querySelectorAll('[data-consent-status]')) {
      el.textContent = choice === 'granted' ? 'Analytics cookies are on.' : choice === 'denied' ? 'Analytics cookies are off.' : 'You have not made a choice yet. Analytics cookies are off.';
    }
  };
  const openBanner = () => {
    if (!banner) return;
    banner.hidden = false;
    banner.focus();
  };

  for (const button of document.querySelectorAll('[data-consent-choice]')) {
    button.addEventListener('click', () => {
      setConsent(button.dataset.consentChoice, { reload });
      if (banner) banner.hidden = true;
      showStatus();
    });
  }
  for (const button of document.querySelectorAll('[data-consent-open]')) button.addEventListener('click', openBanner);

  const stored = readConsent();
  if (stored === 'granted') loadGoogleTag(tagId);
  else removeGoogleCookies();
  if (stored === null && banner) banner.hidden = false;
  showStatus();
}

init();

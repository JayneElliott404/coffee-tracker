// @vitest-environment jsdom
// @vitest-environment-options {"url": "https://www.example.com/"}
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { init, loadGoogleTag, readConsent, removeGoogleCookies, setConsent } from '../../public/js/consent.js';

const TAG = 'GTM-57Q86CSF';
const tagScripts = () => document.querySelectorAll('script[src*="googletagmanager.com"]');
const cookieNames = () => document.cookie.split('; ').filter(Boolean).map((c) => c.split('=')[0]);

function setUpPage() {
  document.head.innerHTML = `<meta name="google-tag-id" content="${TAG}">`;
  document.body.innerHTML = `
    <section id="cookie-banner" tabindex="-1" hidden>
      <button data-consent-choice="denied">Reject</button>
      <button data-consent-choice="granted">Accept</button>
    </section>
    <button data-consent-open>Cookie settings</button>
    <p data-consent-status></p>`;
}

const click = (selector) => document.querySelector(selector).click();

beforeEach(() => {
  for (const name of cookieNames()) {
    document.cookie = `${name}=; Max-Age=0; Path=/`;
    document.cookie = `${name}=; Max-Age=0; Path=/; Domain=.example.com`;
  }
  delete window.dataLayer;
  setUpPage();
});

describe('before consent', () => {
  it('shows the banner and loads nothing when no choice is stored', () => {
    init();
    expect(document.getElementById('cookie-banner').hidden).toBe(false);
    expect(tagScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
  });

  it('loads nothing when no tag ID is configured', () => {
    document.head.innerHTML = '';
    init();
    expect(document.getElementById('cookie-banner').hidden).toBe(true);
  });

  it('ignores a stored choice from another policy version and asks again', () => {
    document.cookie = 'nt_consent=v0:granted; Path=/';
    init();
    expect(readConsent()).toBeNull();
    expect(tagScripts()).toHaveLength(0);
    expect(document.getElementById('cookie-banner').hidden).toBe(false);
  });

  it('refuses tag IDs that are not valid', () => {
    loadGoogleTag('GTM-X"></script><script>alert(1)</script>');
    expect(tagScripts()).toHaveLength(0);
  });
});

describe('accepting', () => {
  it('stores the choice, hides the banner, and loads the tag exactly once', () => {
    init();
    click('[data-consent-choice="granted"]');
    click('[data-consent-choice="granted"]');
    expect(readConsent()).toBe('granted');
    expect(document.getElementById('cookie-banner').hidden).toBe(true);
    const scripts = tagScripts();
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe(`https://www.googletagmanager.com/gtm.js?id=${TAG}`);
    expect(scripts[0].async).toBe(true);
    const commands = window.dataLayer.map((entry) => entry[0]);
    expect(commands).toEqual(['consent', 'consent', 'js']);
    expect(window.dataLayer[0][1]).toBe('default');
    expect(window.dataLayer[0][2].ad_storage).toBe('denied');
  });

  it('loads the tag on later page views when consent was already given', () => {
    document.cookie = 'nt_consent=v1:granted; Path=/';
    init();
    expect(tagScripts()).toHaveLength(1);
    expect(document.getElementById('cookie-banner').hidden).toBe(true);
  });
});

describe('rejecting', () => {
  it('stores the choice and never loads the tag', () => {
    init();
    click('[data-consent-choice="denied"]');
    expect(readConsent()).toBe('denied');
    expect(document.getElementById('cookie-banner').hidden).toBe(true);
    expect(tagScripts()).toHaveLength(0);
    expect(window.dataLayer).toBeUndefined();
    expect(document.querySelector('[data-consent-status]').textContent).toBe('Analytics cookies are off.');
  });

  it('removes any Google cookies left over from before', () => {
    document.cookie = '_ga=GA1.1.1; Path=/';
    document.cookie = 'nt_consent=v1:denied; Path=/';
    init();
    expect(cookieNames()).not.toContain('_ga');
    expect(document.getElementById('cookie-banner').hidden).toBe(true);
  });
});

describe('changing your mind', () => {
  it('reopens the banner from the Cookie settings button', () => {
    document.cookie = 'nt_consent=v1:denied; Path=/';
    init();
    click('[data-consent-open]');
    expect(document.getElementById('cookie-banner').hidden).toBe(false);
  });

  it('withdrawing consent denies Google, deletes its cookies on every domain, and reloads', () => {
    const reload = vi.fn();
    document.cookie = 'nt_consent=v1:granted; Path=/';
    init({ reload });
    document.cookie = '_ga=GA1.1.1; Path=/; Domain=.example.com';
    document.cookie = '_ga_ABC123=GS1.1; Path=/';
    document.cookie = 'nespresso-tracker.sid=keep-me; Path=/';

    click('[data-consent-choice="denied"]');

    expect(readConsent()).toBe('denied');
    expect(cookieNames()).toEqual(expect.arrayContaining(['nespresso-tracker.sid', 'nt_consent']));
    expect(cookieNames().filter((name) => name.startsWith('_ga'))).toEqual([]);
    const last = window.dataLayer.at(-1);
    expect([last[0], last[1], last[2].analytics_storage]).toEqual(['consent', 'update', 'denied']);
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('can grant consent again after withdrawing', () => {
    const reload = vi.fn();
    setConsent('granted', { reload });
    setConsent('denied', { reload });
    document.querySelector('script[data-google-tag]').remove();
    setConsent('granted', { reload });
    expect(readConsent()).toBe('granted');
    expect(tagScripts()).toHaveLength(1);
  });

  it('does not reload when rejecting while nothing was loaded', () => {
    const reload = vi.fn();
    setConsent('denied', { reload });
    expect(reload).not.toHaveBeenCalled();
  });
});

describe('removeGoogleCookies', () => {
  it('only touches Google analytics cookies', () => {
    document.cookie = '_ga=1; Path=/';
    document.cookie = '_gid=1; Path=/';
    document.cookie = 'theme=dark; Path=/';
    removeGoogleCookies();
    expect(cookieNames()).toEqual(['theme']);
    document.cookie = 'theme=; Max-Age=0; Path=/';
  });
});

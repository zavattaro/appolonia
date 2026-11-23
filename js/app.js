// Appolonia — rdzeń: marka, routing, nawigacja, service worker
import { loadLocale, t } from './i18n.js';
import { isOnboarded, getConsent, getSettings } from './storage.js';
import { esc } from './ui.js';
import { state, applyTextSize } from './state.js';
import { renderOnboarding, renderConsent } from './screens/onboarding.js';
import { renderHome, renderLibrary, renderSession, renderFavorites, renderProgress } from './screens/browse.js';
import { renderPlayer } from './screens/play.js';
import { renderSettings } from './screens/settings.js';
import { renderPaywall } from './screens/paywall.js';
import { renderActivate } from './screens/activate.js';
import { loadPaymentsConfig, checkLicenseOnLoad, setPendingCode, peekPendingCode } from './license.js';
import { toast } from './ui.js';

const routes = {
  onboarding: renderOnboarding,
  'privacy-consent': renderConsent,
  home: renderHome,
  library: renderLibrary,
  session: renderSession,
  player: renderPlayer,
  favorites: renderFavorites,
  progress: renderProgress,
  settings: renderSettings,
  paywall: renderPaywall,
  activate: renderActivate,
};

const TAB_ROUTES = ['home', 'library', 'session', 'favorites', 'progress', 'settings', 'paywall', 'activate'];
let cleanup = null;

export function parseHash(hash = location.hash) {
  const raw = (hash || '').replace(/^#\/?/, '');
  const [path, qs = ''] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map((p) => decodeURIComponent(p));
  const query = Object.fromEntries(new URLSearchParams(qs));
  return { name: parts[0] || 'home', param: parts[1] || null, query };
}

function applyBrand(brand) {
  if (!brand || !brand.colors) return;
  const map = { primary: '--primary', primaryDark: '--primary-dark', accent: '--accent', bg: '--bg', surface: '--surface', text: '--text', muted: '--muted' };
  const decl = (cols) => Object.entries(map).filter(([k]) => cols && cols[k]).map(([k, v]) => `${v}:${cols[k]};`).join('');
  let css = `:root{${decl(brand.colors)}${brand.fontStack ? `--font:${brand.fontStack};` : ''}}`;
  if (brand.colorsDark) css += `@media (prefers-color-scheme: dark){:root{${decl(brand.colorsDark)}}}`;
  let el = document.getElementById('brand-vars');
  if (!el) { el = document.createElement('style'); el.id = 'brand-vars'; document.head.appendChild(el); }
  el.textContent = css;
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta && brand.colors.primary) meta.setAttribute('content', brand.colors.primary);
}

function renderTabbar(active) {
  const bar = document.getElementById('tabbar');
  const tabs = [
    ['home', '🏠', t('nav.home')],
    ['library', '📖', t('nav.library')],
    ['favorites', '♥', t('nav.favorites')],
    ['progress', '🕯️', t('nav.progress')],
    ['settings', '⚙️', t('nav.settings')],
  ];
  const current = active === 'session' || active === 'paywall' ? 'library' : active === 'activate' ? 'settings' : active;
  bar.setAttribute('aria-label', t('nav.label'));
  bar.innerHTML = tabs.map(([id, icon, label]) =>
    `<a href="#/${id}"${id === current ? ' aria-current="page"' : ''}><span class="i" aria-hidden="true">${icon}</span><span>${esc(label)}</span></a>`
  ).join('');
}

async function route() {
  if (typeof cleanup === 'function') { try { cleanup(); } catch (e) { console.warn(e); } }
  cleanup = null;

  let r = parseHash();
  // Link aktywacyjny z e-maila: zapamiętaj kod, zanim strażnicy przekierują na wprowadzenie/zgodę
  if (r.name === 'activate' && r.query.code) setPendingCode(r.query.code);
  // Strażnicy: najpierw wprowadzenie, potem zgoda RODO
  if (!isOnboarded()) {
    if (r.name !== 'onboarding') { location.replace('#/onboarding'); return; }
  } else if (!(getConsent() && getConsent().accepted)) {
    if (r.name !== 'privacy-consent') { location.replace('#/privacy-consent'); return; }
  } else if (r.name === 'onboarding' || r.name === 'privacy-consent') {
    location.replace('#/home'); return;
  }
  if (!routes[r.name]) { location.replace('#/home'); return; }
  if (!['activate', 'onboarding', 'privacy-consent'].includes(r.name) && peekPendingCode()) { location.replace('#/activate'); return; }

  const app = document.getElementById('app');
  const bar = document.getElementById('tabbar');
  const withTabs = TAB_ROUTES.includes(r.name);
  bar.hidden = !withTabs;
  document.body.classList.toggle('has-tabbar', withTabs);
  document.body.classList.toggle('player-mode', r.name === 'player');
  if (withTabs) renderTabbar(r.name);

  try {
    cleanup = (await routes[r.name](app, r)) || null;
  } catch (e) {
    console.error('[route]', e);
    app.innerHTML = `<div class="empty"><span class="e" aria-hidden="true">🕊️</span><p>${esc(t('common.error'))}</p><a class="btn" href="#/home">${esc(t('common.back_home'))}</a></div>`;
  }
  const h1 = app.querySelector('h1');
  document.title = h1 && r.name !== 'home' ? `${h1.textContent} — ${state.brand?.appName || 'Appolonia'}` : (state.brand?.appName || 'Appolonia');
  window.scrollTo(0, 0);
  if (h1 && r.name !== 'player') { h1.setAttribute('tabindex', '-1'); h1.focus({ preventScroll: true }); }
}

async function boot() {
  const [brand, content] = await Promise.all([
    fetch('config/brand.json').then((r) => r.json()).catch(() => null),
    fetch('content/sessions.json').then((r) => r.json()).catch((e) => { console.error('[content]', e); return { categories: [], sessions: [] }; }),
    loadLocale('pl'),
    loadPaymentsConfig(),
  ]);
  state.brand = brand;
  state.categories = content.categories || [];
  state.sessions = content.sessions || [];
  applyBrand(brand);
  applyTextSize(getSettings().textSize);
  const skip = document.getElementById('skip-link');
  if (skip) skip.textContent = t('common.skip');

  // Wygasła licencja (plan miesięczny/roczny) → wersja darmowa + komunikat
  const lic = checkLicenseOnLoad();

  window.addEventListener('hashchange', route);
  await route();
  if (lic.expired) toast(t('license.expired_notice'));

  if ('serviceWorker' in navigator && location.protocol !== 'file:') {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('[sw]', e));
  }
}

boot();

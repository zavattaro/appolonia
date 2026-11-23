// Appolonia — service worker: cache-first, pełne działanie offline
// UWAGA: nigdy nie dodawaj tu keys/ ani scripts/ (klucz prywatny licencji!).
// cdn.paddle.com (checkout) jest spoza origin → nie jest cache'owany, działa tylko online.
const CACHE_VERSION = 'appolonia-v13';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/app.css',
  './js/app.js',
  './js/i18n.js',
  './js/state.js',
  './js/ui.js',
  './js/screens/onboarding.js',
  './js/screens/browse.js',
  './js/screens/play.js',
  './js/screens/settings.js',
  './js/screens/paywall.js',
  './js/screens/activate.js',
  './js/license.js',
  './js/promo.js',
  './js/checkout.js',
  './js/storage.js',
  './js/audio.js',
  './js/player.js',
  './config/brand.json',
  './config/payments.json',
  './locales/pl.json',
  './content/sessions.json',
  './legal/privacy.html',
  './legal/terms.html',
  './legal/refund.html',
  './legal/en/terms.html',
  './legal/en/privacy.html',
  './legal/en/refund.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('appolonia-') && k !== CACHE_VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (res && res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(CACHE_VERSION).then((cache) => cache.put(req, copy));
        }
        return res;
      }).catch(() => {
        if (req.mode === 'navigate') return caches.match('./index.html');
        return new Response('', { status: 504, statusText: 'Offline' });
      });
    })
  );
});

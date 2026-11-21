const CACHE_NAME = 'bread-finance-v8';
const PRECACHE_URLS = [
  './',
  './index.html',
  './admin-chat.html',
  './manifest.webmanifest',
  './admin-chat-manifest.webmanifest',
  './pwa-192x192.png',
  './pwa-512x512.png',
  './apple-touch-icon.png',
  './client-portal-hero.jpg',
  './images/hero-sunny-couple.jpg',
  './images/benefits-laptop-planning.jpg',
  './images/personal-home-upgrade.jpg',
  './images/business-shop-owner.jpg',
  './images/knowledge-financial-guide.jpg',
  './images/about-corporate-hq.jpg',
  './images/digital-ekyc-mobile.jpg',
  './images/credit-approval-team.jpg',
  './images/wallet-bank-transfer.jpg',
  './images/hero-digital-loans.jpg',
  './images/personal-finance.jpg',
  './images/business-growth.jpg',
  './images/family-protection.jpg'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  const reqUrl = event.request.url || '';
  event.respondWith(
    fetch(event.request).catch(() =>
      caches.match(event.request).then((res) => {
        if (res) return res;
        if (reqUrl.includes('admin-chat.html')) return caches.match('./admin-chat.html');
        return caches.match('./index.html');
      })
    )
  );
});

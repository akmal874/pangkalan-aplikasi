// =====================================================================
// Service worker: halaman tetap bisa dibuka tanpa internet.
// - File aplikasi dan pustaka CDN: disajikan dari cache, diperbarui di belakang layar.
// - Panggilan ke Supabase TIDAK pernah di-cache (selalu langsung ke server).
// Naikkan VERSION setiap kali Anda mengubah file aplikasi agar pengguna mendapat versi baru.
// =====================================================================
const VERSION = 'v1';
const CACHE = 'pangkalan-' + VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './js/app.js',
  './js/api.js',
  './js/config.js',
  './js/store.js',
  './js/utils.js'
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    // Pustaka CDN: gagal satu tidak membatalkan pemasangan
    await Promise.all(CDN.map(u => cache.add(new Request(u, { mode: 'cors' })).catch(() => {})));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k.startsWith('pangkalan-') && k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // Supabase (data & login): selalu langsung ke server
  if (url.hostname.endsWith('.supabase.co') || url.pathname.includes('/auth/v1/') || url.pathname.includes('/rest/v1/')) return;

  const sameOrigin = url.origin === self.location.origin;
  const isCdn = url.hostname === 'cdn.jsdelivr.net';
  if (!sameOrigin && !isCdn) return;

  // Halaman utama: coba jaringan dulu agar selalu terbaru, cadangan dari cache
  if (req.mode === 'navigate') {
    event.respondWith((async () => {
      try {
        const res = await fetch(req);
        const cache = await caches.open(CACHE); cache.put('./index.html', res.clone());
        return res;
      } catch (e) {
        return (await caches.match('./index.html')) || (await caches.match('./')) || Response.error();
      }
    })());
    return;
  }

  // File lain: sajikan dari cache, perbarui di belakang layar (stale-while-revalidate)
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const cached = await cache.match(req);
    const network = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return cached || (await network) || Response.error();
  })());
});

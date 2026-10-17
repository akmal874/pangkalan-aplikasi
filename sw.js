// =====================================================================
// Service worker: halaman tetap bisa dibuka tanpa internet.
// - File aplikasi (html, js, css, config): diambil dari server dulu, cache hanya saat offline.
// - Pustaka CDN (versi terkunci): disajikan dari cache, diperbarui di belakang layar.
// - Panggilan ke Supabase TIDAK pernah di-cache (selalu langsung ke server).
// Naikkan VERSION jika daftar file di bawah atau versi pustaka CDN berubah.
// =====================================================================
const VERSION = 'v4';
const CACHE = 'pangkalan-' + VERSION;

const APP_SHELL = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/app.css',
  './assets/icons/favicon.svg',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  './js/boot.js',
  './js/app.js',
  './js/api.js',
  './js/config.js',
  './js/store.js',
  './js/utils.js',
  './assets/vendor/qrcode/qrcode.js'
];
// Pustaka di assets/vendor (ada setelah workflow "Unduh pustaka ke repositori" dijalankan)
const VENDOR = [
  './assets/vendor/bootstrap/bootstrap.min.css',
  './assets/vendor/bootstrap/bootstrap.bundle.min.js',
  './assets/vendor/bootstrap-icons/bootstrap-icons.min.css',
  './assets/vendor/bootstrap-icons/fonts/bootstrap-icons.woff2',
  './assets/vendor/sortablejs/Sortable.min.js',
  './assets/vendor/supabase/supabase.js'
];
const CDN = [
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/sortablejs@1.15.2/Sortable.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.110.1/dist/umd/supabase.js'
];

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(APP_SHELL);
    // Pustaka lokal: jika belum ada (workflow belum dijalankan), lewati saja
    await Promise.all(VENDOR.map(u => cache.add(u).catch(() => {})));
    // Pustaka CDN (cadangan): gagal satu tidak membatalkan pemasangan
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

  // File aplikasi sendiri (js, css, config): jaringan dulu agar perubahan langsung terpakai,
  // cache hanya dipakai saat tidak ada internet
  if (sameOrigin) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req, { cache: 'no-cache' });
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch (e) {
        return (await cache.match(req)) || Response.error();
      }
    })());
    return;
  }

  // Pustaka CDN (versi terkunci, tidak berubah): sajikan dari cache, perbarui di belakang layar
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

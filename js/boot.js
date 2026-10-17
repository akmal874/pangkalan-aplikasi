// =====================================================================
// Dijalankan paling awal (di <head>), sebelum halaman tampil.
// 1. Memasang tema terang/gelap agar halaman tidak berkedip.
// 2. Memuat pustaka dari folder assets/vendor. Jika file lokal belum ada
//    (workflow "Unduh pustaka ke repositori" belum dijalankan), otomatis
//    memakai CDN jsDelivr sebagai cadangan.
// =====================================================================
(function () {
  'use strict';

  // ----- Tema -----
  var theme = null;
  try { theme = localStorage.getItem('pa-theme'); } catch (e) {}
  if (!theme) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.setAttribute('data-bs-theme', theme);

  // ----- Cadangan CDN untuk stylesheet -----
  // <link rel="stylesheet" href="assets/vendor/..." data-cdn="https://cdn.jsdelivr.net/...">
  // Jika file lokal gagal dimuat, alamat diganti ke CDN.
  document.addEventListener('error', function (e) {
    var el = e.target;
    if (el && el.tagName === 'LINK' && el.getAttribute('data-cdn') && !el.getAttribute('data-fallback')) {
      el.setAttribute('data-fallback', '1');
      el.href = el.getAttribute('data-cdn');
    }
  }, true);

  // ----- Pemuat skrip: lokal dulu, CDN jika gagal -----
  function addScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = function () { resolve(src); };
      s.onerror = function () { s.remove(); reject(new Error('Gagal memuat ' + src)); };
      document.head.appendChild(s);
    });
  }
  var cache = {};
  window.paLoadScript = function (local, cdn) {
    if (!cache[local]) {
      cache[local] = addScript(local).catch(function () {
        if (!cdn) throw new Error('Gagal memuat ' + local);
        return addScript(cdn);
      });
    }
    return cache[local];
  };

  var CDN = 'https://cdn.jsdelivr.net/npm/';
  window.paVendor = {
    bootstrap: ['assets/vendor/bootstrap/bootstrap.bundle.min.js', CDN + 'bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js'],
    sortable:  ['assets/vendor/sortablejs/Sortable.min.js',         CDN + 'sortablejs@1.15.2/Sortable.min.js'],
    supabase:  ['assets/vendor/supabase/supabase.js',               CDN + '@supabase/supabase-js@2.110.1/dist/umd/supabase.js'],
    qrcode:    ['assets/vendor/qrcode/qrcode.js',                   null]
  };

  // Bootstrap wajib ada sebelum aplikasi berjalan; SortableJS boleh menyusul.
  window.paReady = Promise.all([
    window.paLoadScript.apply(null, window.paVendor.bootstrap),
    window.paLoadScript.apply(null, window.paVendor.sortable).catch(function () { return null; })
  ]);
})();

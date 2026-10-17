// =====================================================================
// Penyimpanan di perangkat (localStorage)
// - Salinan data terakhir: tetap tampil saat Supabase tidak bisa dihubungi
// - Riwayat "Terakhir dibuka" dan kelompok yang dilipat (khusus perangkat ini)
// =====================================================================

const KEY_CACHE = 'pa-cache-v1';
const KEY_RECENT = 'pa-recent';
const KEY_TAB = 'pa-tab';
const KEY_COLLAPSED = 'pa-collapsed';

export function lsGet(k, d) { try { const v = localStorage.getItem(k); return v === null ? d : v; } catch (e) { return d; } }
export function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
function lsJson(k, d) { try { const v = JSON.parse(lsGet(k, 'null')); return v ?? d; } catch (e) { return d; } }

// ----- Salinan data -----
export function loadCache() {
  const c = lsJson(KEY_CACHE, null);
  if (c && Array.isArray(c.categories) && Array.isArray(c.links)) return c;
  return null;
}
export function saveCache(db) {
  lsSet(KEY_CACHE, JSON.stringify({ categories: db.categories, links: db.links, settings: db.settings || {}, savedAt: db.savedAt || new Date().toISOString() }));
}
/** Saat keluar: link privat dihapus dari salinan di perangkat ini. */
export function stripPrivateFromCache() {
  const c = loadCache(); if (!c) return;
  c.links = c.links.filter(l => !l.is_private);
  // Tab Link Lain yang diprivatkan: kategori dan link-nya juga dihapus dari salinan
  if (c.settings && c.settings.links_tab_private) {
    const hidden = new Set(c.categories.filter(x => x.tab === 'links').map(x => x.id));
    c.categories = c.categories.filter(x => !hidden.has(x.id));
    c.links = c.links.filter(l => !hidden.has(l.category_id));
  }
  lsSet(KEY_CACHE, JSON.stringify(c));
}

// ----- Terakhir dibuka -----
export function loadRecent() { const r = lsJson(KEY_RECENT, []); return Array.isArray(r) ? r.filter(x => typeof x === 'string') : []; }
export function pushRecent(list, id) { const r = [id, ...list.filter(x => x !== id)].slice(0, 16); lsSet(KEY_RECENT, JSON.stringify(r)); return r; }
export function saveRecent(list) { lsSet(KEY_RECENT, JSON.stringify(list)); }

// ----- Kelompok yang dilipat -----
export function loadCollapsed() { const r = lsJson(KEY_COLLAPSED, []); return new Set(Array.isArray(r) ? r : []); }
export function saveCollapsed(set) { lsSet(KEY_COLLAPSED, JSON.stringify([...set])); }

// ----- Tab terakhir yang dibuka -----
export function loadTab() { return lsGet(KEY_TAB, 'apps'); }
export function saveTab(t) { lsSet(KEY_TAB, t); }

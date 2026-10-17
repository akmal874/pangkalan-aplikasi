// =====================================================================
// Semua komunikasi dengan Supabase (login dan data)
// supabase-js dimuat saat dibutuhkan (dari assets/vendor, cadangan CDN),
// jadi halaman tetap tampil dari salinan lokal meskipun pustaka atau server tidak bisa dijangkau.
// =====================================================================
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';
import { normUrl } from './utils.js';

const CAT_COLS = 'id,name,color,icon,sort_order,tab';
const LINK_COLS = 'id,category_id,name,url,icon,note,is_favorite,is_private,sort_order';

export const isConfigured = !SUPABASE_URL.includes('GANTI') && !SUPABASE_ANON_KEY.includes('GANTI');

let clientPromise = null;
export function getClient() {
  if (!isConfigured) return Promise.reject(new Error('Supabase belum diatur. Isi js/config.js terlebih dahulu.'));
  if (!clientPromise) {
    clientPromise = window.paLoadScript(...window.paVendor.supabase)
      .then(() => window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
      }))
      .catch(err => { clientPromise = null; throw err; });
  }
  return clientPromise;
}

/** Pesan galat yang mudah dipahami. */
export function friendly(err) {
  const m = (err && (err.message || err.error_description)) || String(err || '');
  const code = err && err.code;
  if (/failed to fetch|networkerror|load failed|fetch dynamically imported module|gagal memuat/i.test(m)) return 'Tidak bisa terhubung ke server. Periksa koneksi internet lalu coba lagi.';
  if (/invalid login credentials/i.test(m)) return 'Email atau password salah. Periksa kembali lalu coba lagi.';
  if (/email not confirmed/i.test(m)) return 'Email akun belum dikonfirmasi. Tandai akun sebagai terkonfirmasi di dashboard Supabase.';
  if (code === '23505') return 'Nama kategori itu sudah dipakai. Gunakan nama lain.';
  if (code === '23514') return 'Data tidak sesuai aturan. Periksa link (harus diawali http:// atau https://) dan panjang nama.';
  if (code === '42501' || /row-level security/i.test(m)) return 'Tidak punya izin untuk perubahan ini. Coba keluar lalu masuk lagi.';
  if (/jwt expired|invalid jwt/i.test(m)) return 'Sesi sudah berakhir. Silakan masuk lagi.';
  return m || 'Terjadi kesalahan yang tidak dikenal.';
}
function check({ data, error }) { if (error) throw error; return data; }

/** Galat karena migration-002-tab.sql belum dijalankan (kolom tab / tabel settings belum ada). */
export function isMigrationError(err) {
  const m = (err && err.message) || '';
  return ['42703', '42P01', 'PGRST204', 'PGRST205'].includes(err && err.code)
    || /column .*tab.* does not exist|relation .*settings.* does not exist|could not find the table .*settings/i.test(m);
}

// ----- Login -----
export async function getSession() {
  const sb = await getClient();
  const { data } = await sb.auth.getSession();
  return data.session;
}
export async function onAuthChange(cb) {
  const sb = await getClient();
  sb.auth.onAuthStateChange((event, session) => cb(event, session));
}
export async function signIn(email, password) {
  const sb = await getClient();
  return check(await sb.auth.signInWithPassword({ email, password }));
}
export async function signOut() {
  const sb = await getClient();
  check(await sb.auth.signOut());
}
export async function sendReset(email) {
  const sb = await getClient();
  const redirectTo = location.origin + location.pathname;
  check(await sb.auth.resetPasswordForEmail(email, { redirectTo }));
}
export async function updatePassword(password) {
  const sb = await getClient();
  check(await sb.auth.updateUser({ password }));
}

// ----- Membaca data -----
export async function fetchAll() {
  const sb = await getClient();
  const [cats, links, settings] = await Promise.all([
    sb.from('categories').select(CAT_COLS).order('sort_order').order('name'),
    sb.from('links').select(LINK_COLS).order('sort_order').order('name'),
    sb.from('settings').select('links_tab_private').limit(1).maybeSingle()
  ]);
  return {
    categories: check(cats),
    links: check(links),
    settings: { links_tab_private: !!(check(settings) || {}).links_tab_private }
  };
}

// ----- Pengaturan -----
export async function saveSettings(patch) {
  const sb = await getClient();
  check(await sb.from('settings').upsert({ ...patch, updated_at: new Date().toISOString() }, { onConflict: 'user_id' }));
}

// ----- Link -----
export async function insertLink(row) {
  const sb = await getClient();
  return check(await sb.from('links').insert(row).select(LINK_COLS).single());
}
export async function updateLink(id, patch) {
  const sb = await getClient();
  return check(await sb.from('links').update(patch).eq('id', id).select(LINK_COLS).single());
}
export async function deleteLink(id) {
  const sb = await getClient();
  check(await sb.from('links').delete().eq('id', id));
}
export async function reorderLinks(ids) {
  const sb = await getClient();
  check(await sb.rpc('reorder_links', { p_ids: ids }));
}

// ----- Kategori -----
export async function insertCategory(row) {
  const sb = await getClient();
  return check(await sb.from('categories').insert(row).select(CAT_COLS).single());
}
export async function updateCategory(id, patch) {
  const sb = await getClient();
  return check(await sb.from('categories').update(patch).eq('id', id).select(CAT_COLS).single());
}
export async function deleteCategory(id) {
  const sb = await getClient();
  check(await sb.from('categories').delete().eq('id', id));   // link di dalamnya otomatis jadi tanpa kategori (on delete set null)
}
export async function reorderCategories(ids) {
  const sb = await getClient();
  check(await sb.rpc('reorder_categories', { p_ids: ids }));
}

// ----- Impor -----
/**
 * @param data   hasil sanitizeImport()
 * @param mode   'merge' (gabungkan) atau 'replace' (ganti semua)
 * @param current data saat ini { categories, links }
 */
export async function importData(data, mode, current) {
  const sb = await getClient();
  let existingCats = current.categories, existingLinks = current.links;

  if (mode === 'replace') {
    check(await sb.from('links').delete().not('id', 'is', null));
    check(await sb.from('categories').delete().not('id', 'is', null));
    existingCats = []; existingLinks = [];
  }

  // Kategori: dicocokkan berdasarkan nama, yang belum ada dibuat
  const refToId = {};
  const byName = new Map(existingCats.map(c => [c.name.toLowerCase(), c.id]));
  const baseOrder = existingCats.length;
  const newCats = data.categories.filter(c => !byName.has(c.name.toLowerCase()))
    .filter((c, i, arr) => arr.findIndex(x => x.name.toLowerCase() === c.name.toLowerCase()) === i)
    .map((c, i) => ({ name: c.name, color: c.color, icon: c.icon, tab: c.tab, sort_order: baseOrder + i }));
  if (newCats.length) {
    const rows = check(await sb.from('categories').insert(newCats).select(CAT_COLS));
    rows.forEach(r => byName.set(r.name.toLowerCase(), r.id));
  }
  data.categories.forEach(c => { refToId[c.ref] = byName.get(c.name.toLowerCase()) || null; });

  // Link: alamat yang sudah ada dilewati
  const seen = new Set(existingLinks.map(l => normUrl(l.url)));
  let skipped = 0;
  const newLinks = [];
  for (const l of data.links) {
    const n = normUrl(l.url);
    if (seen.has(n)) { skipped++; continue; }
    seen.add(n);
    newLinks.push({ name: l.name, url: l.url, icon: l.icon, note: l.note, is_favorite: l.is_favorite, is_private: l.is_private,
      sort_order: l.sort_order, category_id: l.category_ref ? (refToId[l.category_ref] || null) : null });
  }
  if (newLinks.length) check(await sb.from('links').insert(newLinks));
  if (mode === 'replace' && data.settings) await saveSettings({ links_tab_private: !!data.settings.links_tab_private });
  return { addedCategories: newCats.length, addedLinks: newLinks.length, skipped };
}

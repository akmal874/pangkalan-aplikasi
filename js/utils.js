// =====================================================================
// Fungsi bantu: teks, URL, ikon, warna, impor
// =====================================================================

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const host = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

/** Lengkapi https:// bila belum ada; hanya http/https yang diterima. */
export function safeUrl(u) {
  let v = (u || '').trim();
  if (/^(javascript|data|vbscript|file|blob|about|mailto|tel|sms|ftp):/i.test(v)) return null;
  if (v && !/^[a-z]+:\/\//i.test(v)) v = 'https://' + v;
  try { const p = new URL(v); return /^https?:$/.test(p.protocol) ? p.href : null; } catch (e) { return null; }
}

/** URL dinormalkan untuk cek link ganda: tanpa www, tanpa / di akhir, tanpa #…, huruf kecil. */
export function normUrl(u) {
  try { const p = new URL(u); return (p.hostname.replace(/^www\./, '') + p.pathname.replace(/\/+$/, '') + p.search).toLowerCase(); }
  catch (e) { return (u || '').toLowerCase(); }
}

export function fmtTime(iso) {
  try { return new Date(iso).toLocaleString('id-ID', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); }
  catch (e) { return iso || '-'; }
}

export async function copyText(t) {
  try { await navigator.clipboard.writeText(t); return true; }
  catch (e) {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    let ok = false; try { ok = document.execCommand('copy'); } catch (_) {}
    ta.remove(); return ok;
  }
}

// ----- Warna kategori (harus sama dengan check constraint di schema.sql) -----
export const COLORS = [
  { key: 'biru', name: 'Biru' }, { key: 'teal', name: 'Hijau laut' }, { key: 'oranye', name: 'Oranye' }, { key: 'ungu', name: 'Ungu' },
  { key: 'merah', name: 'Merah' }, { key: 'hijau', name: 'Hijau' }, { key: 'langit', name: 'Biru langit' }, { key: 'abu', name: 'Abu-abu' }
];
export const validColor = c => (COLORS.some(x => x.key === c) ? c : 'abu');

// ----- Ikon Bootstrap -----
export const validIcon = n => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(n || '');
export const iconClass = n => 'bi bi-' + (validIcon(n) ? n : 'app');

/** Pilihan cepat di form. */
export const ICONS = ['app', 'journal-text', 'journal-bookmark', 'book', 'mortarboard', 'building', 'people', 'person-badge',
  'calendar-check', 'clipboard-check', 'clipboard-data', 'ui-checks', 'pencil-square', 'pen', 'file-earmark-text', 'table',
  'box-arrow-in-right', 'signpost-split', 'cash-coin', 'cash-stack', 'wallet2', 'receipt', 'bar-chart', 'graph-up',
  'compass', 'compass-fill', 'map', 'broadcast', 'broadcast-pin', 'water', 'life-preserver', 'joystick',
  'globe', 'database', 'laptop', 'phone', 'magic', 'images', 'camera-video', 'chat-dots', 'bullseye', 'award',
  'shield-check', 'qr-code', 'gear', 'folder2', 'tags', 'star'];

/**
 * Kata kunci di nama aplikasi → ikon. Urutan penting: yang lebih spesifik di atas.
 * \b di depan: kata harus DIAWALI kata kunci (absen → "absensi" cocok, "kas" tidak cocok di "aplikasi").
 * Tambahkan aturan sendiri di sini bila perlu.
 */
export const ICON_RULES = [
  [/\b(radar|arpa)/, 'broadcast'],
  [/\bkompas/, 'compass'],
  [/\b(navigasi|pelayaran|peta|rute)/, 'map'],
  [/\b(kapal|bahari|laut|nautika|pelaut)/, 'water'],
  [/\b(login|masuk)\b/, 'box-arrow-in-right'],
  [/\b(panduan|tutorial|petunjuk)/, 'signpost-split'],
  [/\b(cbt|ujian|ulangan|kuis|quiz|asesmen)/, 'ui-checks'],
  [/\b(absen|hadir|kehadiran|presensi)/, 'calendar-check'],
  [/\bjurnal/, 'journal-text'],
  [/\b(modul|rpp|ajar|materi)/, 'book'],
  [/\b(ai|generator)\b/, 'magic'],
  [/\b(nilai|rapor|raport)/, 'clipboard-data'],
  [/\b(tte|tanda tangan|e-?sign)/, 'pen'],
  [/\b(bku|dana|keuangan|bos|bosp|lpj|kas|anggaran|revit)\b/, 'cash-coin'],
  [/\b(arkas|excel|tabel)/, 'table'],
  [/\b(laporan|dokumen|surat)/, 'file-earmark-text'],
  [/\b(supabase|database|basis data)/, 'database'],
  [/\b(web|website|situs|blog)/, 'globe'],
  [/\b(sekolah|kampus)/, 'building'],
  [/\b(siswa|murid|kelas)/, 'people'],
  [/\b(guru|pegawai|kepegawaian)/, 'person-badge'],
  [/\b(menembak|tembak|club|klub|ekskul)/, 'bullseye'],
  [/\b(simulasi|simulator|game|permainan)/, 'joystick'],
  [/\b(grafik|statistik|dashboard)/, 'bar-chart'],
  [/\b(galeri|foto|gambar)/, 'images'],
  [/\bvideo/, 'camera-video'],
  [/\b(chat|pesan)/, 'chat-dots']
];

/** Ikon dari nama aplikasi → ikon bawaan kategori → ikon umum. */
export function suggestIcon(name, categoryIcon) {
  const n = (name || '').toLowerCase();
  for (const [re, icon] of ICON_RULES) if (re.test(n)) return icon;
  return validIcon(categoryIcon) ? categoryIcon : 'app';
}

/** Bersihkan isi file impor. Link tak sah (mis. javascript:) dibuang. */
export function sanitizeImport(d) {
  const cats = (Array.isArray(d && d.categories) ? d.categories : [])
    .filter(c => c && c.id && typeof c.name === 'string' && c.name.trim())
    .map((c, i) => ({
      ref: String(c.id), name: c.name.trim().slice(0, 40), color: validColor(c.color),
      icon: validIcon(c.icon) ? c.icon : 'folder2', sort_order: Number.isFinite(c.sort_order) ? c.sort_order : i
    }));
  const refs = new Set(cats.map(c => c.ref));
  const links = (Array.isArray(d && d.links) ? d.links : [])
    .filter(l => l && typeof l.name === 'string' && l.name.trim() && safeUrl(l.url))
    .map((l, i) => ({
      name: l.name.trim().slice(0, 80), url: safeUrl(l.url),
      category_ref: refs.has(String(l.category_id)) ? String(l.category_id) : null,
      icon: validIcon(l.icon) ? l.icon : 'app', note: String(l.note || '').slice(0, 120),
      is_favorite: !!l.is_favorite, is_private: !!l.is_private, sort_order: Number.isFinite(l.sort_order) ? l.sort_order : i
    }));
  return { categories: cats, links };
}

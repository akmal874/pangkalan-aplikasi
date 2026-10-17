// =====================================================================
// Pangkalan Aplikasi: logika halaman
// =====================================================================
import {
  esc, host, safeUrl, normUrl, fmtTime, copyText, COLORS, validIcon, iconClass, ICONS, suggestIcon, sanitizeImport, TABS, validTab
} from './utils.js';
import {
  lsGet, lsSet, loadCache, saveCache, stripPrivateFromCache, loadRecent, pushRecent, saveRecent, loadCollapsed, saveCollapsed, loadTab, saveTab
} from './store.js';
import * as api from './api.js';

const $ = id => document.getElementById(id);
const bs = window.bootstrap;

/* ===================== STATE ===================== */
let db = { categories: [], links: [], settings: { links_tab_private: false }, savedAt: null };
let loaded = false;           // sudah pernah ada data (dari salinan atau server)
let loggedIn = false;
let ownerEmail = '';
let serverDown = false;
let needsMigration = false;
let editMode = false;
let activeTab = validTab(loadTab());
let activeCat = 'all';
let recent = loadRecent();
let collapsed = loadCollapsed();
let expanded = new Set();     // kategori yang sedang dibuka penuh di HP (tidak diingat setelah muat ulang)
let sortables = [];
const PHONE_MAX = 8;          // di HP: maksimal 2 baris (4 × 2). Lebih dari itu → 7 link + kotak "+N lainnya"
const phoneMq = matchMedia('(max-width: 575.98px)');
const isPhone = () => phoneMq.matches;
const canEdit = () => loggedIn && !serverDown && !needsMigration && api.isConfigured;

/* ===================== AKSES DATA ===================== */
const tabById = id => TABS.find(t => t.id === id) || TABS[0];
const byOrder = (a, b) => (a.sort_order - b.sort_order) || a.name.localeCompare(b.name, 'id');
const catById = id => db.categories.find(c => c.id === id);
const catOf = l => catById(l.category_id);
const catKey = l => (catOf(l) ? l.category_id : 'none');
const colorOf = l => (catOf(l) || {}).color || 'abu';
const tabOfCat = c => validTab(c && c.tab);
const tabOfLink = l => (catOf(l) ? tabOfCat(catOf(l)) : 'apps');   // link tanpa kategori masuk Aplikasi Saya
const tabAllowed = t => t === 'apps' || loggedIn || !db.settings.links_tab_private;
const visible = () => db.links.filter(l => (loggedIn || !l.is_private) && tabAllowed(tabOfLink(l)));
const inTab = (t = activeTab) => visible().filter(l => tabOfLink(l) === t);
const catsIn = t => db.categories.filter(c => tabOfCat(c) === t).sort(byOrder);
const countIn = id => visible().filter(l => catKey(l) === id).length;
function groupList(t = activeTab) {
  const g = catsIn(t).map(c => ({ id: c.id, name: c.name, color: c.color, icon: c.icon, tab: t }));
  if (t === 'apps' && visible().some(l => !catOf(l))) g.push({ id: 'none', name: 'Tanpa kategori', color: 'abu', icon: 'three-dots', tab: 'apps' });
  return g.filter(x => loggedIn || countIn(x.id) > 0);
}
const findDuplicate = (url, exceptId) => { const n = normUrl(url); return db.links.find(l => l.id !== exceptId && normUrl(l.url) === n) || null; };
function setData(data) {
  db = {
    categories: data.categories || [], links: data.links || [],
    settings: { links_tab_private: !!(data.settings && data.settings.links_tab_private) },
    savedAt: data.savedAt || new Date().toISOString()
  };
  loaded = true;
}
function persist() { saveCache(db); }

/* ===================== NOTIFIKASI ===================== */
const toast = new bs.Toast($('toast'), { delay: 2600 });
function notify(t) { $('toastText').textContent = t; toast.show(); }

/* ===================== TEMA ===================== */
function applyThemeIcon() {
  const dark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
  document.querySelectorAll('.theme-icon').forEach(i => { i.className = 'bi theme-icon ' + (dark ? 'bi-sun' : 'bi-moon-stars'); });
  document.querySelector('meta[name="theme-color"]').content = dark ? '#172229' : '#0f6e7a';
}
function toggleTheme() {
  const next = document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-bs-theme', next); lsSet('pa-theme', next); applyThemeIcon();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', ev => {
  if (!lsGet('pa-theme', '')) { document.documentElement.setAttribute('data-bs-theme', ev.matches ? 'dark' : 'light'); applyThemeIcon(); }
});

/* ===================== STATUS ===================== */
function updateStatus() {
  $('setupBanner').hidden = api.isConfigured;
  $('migrateBanner').hidden = !needsMigration;
  $('offlineBanner').hidden = !(serverDown && api.isConfigured && !needsMigration);
  $('savedAt').textContent = db.savedAt ? fmtTime(db.savedAt) : 'belum pernah';
  document.querySelectorAll('.needs-online').forEach(b => { b.disabled = serverDown || needsMigration || !api.isConfigured; });
  if (!canEdit() && editMode) setEditMode(false, true);
}
function setOwner(session) {
  loggedIn = !!session;
  ownerEmail = session?.user?.email || '';
  $('ownerEmail').textContent = ownerEmail || '-';
  document.body.classList.toggle('is-owner', loggedIn);
  if (!loggedIn) setEditMode(false, true);
}
function setEditMode(on, silent) {
  editMode = on && canEdit();
  $('editHint').hidden = !editMode;
  $('editModeBtn').innerHTML = editMode ? '<i class="bi bi-check2 me-1"></i>Selesai' : '<i class="bi bi-arrows-move me-1"></i>Atur';
  $('editModeBtn').classList.toggle('btn-accent', editMode);
  $('editModeBtn').classList.toggle('btn-outline-secondary', !editMode);
  if (!silent) render();
}
function setTab(t) { activeTab = validTab(t); saveTab(activeTab); activeCat = 'all'; expanded.clear(); render(); }

/* ===================== POTONGAN TAMPILAN ===================== */
function cardHtml(l) {
  const meta = [l.is_favorite ? '<i class="bi bi-star-fill text-star"></i>' : '', l.is_private && loggedIn ? '<i class="bi bi-lock-fill"></i>' : '', esc(l.note || host(l.url))].filter(Boolean).join(' ');
  const body = `<span class="app-icon"><i class="${iconClass(l.icon)}"></i></span>
    <span class="d-flex flex-column" style="min-width:0"><span class="app-name">${esc(l.name)}</span><span class="app-meta text-body-secondary">${meta}</span></span>`;
  const main = editMode
    ? `<button type="button" class="app-link d-flex align-items-center gap-3 flex-grow-1 py-1" data-edit="${esc(l.id)}">${body}</button>`
    : `<a class="app-link d-flex align-items-center gap-3 flex-grow-1 py-1" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" data-open="${esc(l.id)}" data-press="${esc(l.id)}">${body}</a>`;
  return `<div class="app-card d-flex align-items-center gap-1 p-2 ${editMode ? '' : 'ps-3'} h-100" data-id="${esc(l.id)}" style="--cat: var(--cat-${colorOf(l)})">
    ${editMode ? '<span class="drag-handle" title="Seret untuk mengatur urutan"><i class="bi bi-grip-vertical"></i></span>' : ''}
    ${main}
    ${editMode ? '' : `<button class="btn btn-sm btn-link text-body-secondary" type="button" data-sheet="${esc(l.id)}" aria-label="Menu ${esc(l.name)}"><i class="bi bi-three-dots-vertical"></i></button>`}
  </div>`;
}
function tileHtml(l) {
  const flag = l.is_private && loggedIn ? '<span class="flag" title="Privat"><i class="bi bi-lock-fill"></i></span>' : '';
  const inner = `<span class="tile-icon"><i class="${iconClass(l.icon)}"></i>${flag}</span><span class="tile-name">${esc(l.name)}</span>`;
  const st = `style="--cat: var(--cat-${colorOf(l)})"`;
  if (editMode) return `<button class="tile" ${st} type="button" data-edit="${esc(l.id)}" data-id="${esc(l.id)}" aria-label="Ubah ${esc(l.name)}">${inner}<span class="tile-badge"><i class="bi bi-pencil-fill"></i></span></button>`;
  return `<a class="tile" ${st} href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" data-open="${esc(l.id)}" data-press="${esc(l.id)}" data-id="${esc(l.id)}">${inner}</a>`;
}
const itemsHtml = (items, groupId, extra = '') =>
  `<div class="app-grid" ${groupId ? `data-group="${esc(groupId)}"` : ''}>${items.map(isPhone() ? tileHtml : cardHtml).join('')}${extra}</div>`;

/* HP saja: maksimal 2 baris. Laptop dan mode Atur selalu menampilkan semua. */
function limitedHtml(items, key, groupId) {
  if (!isPhone() || editMode || items.length <= PHONE_MAX) return itemsHtml(items, groupId);
  if (!expanded.has(key)) {
    const rest = items.length - (PHONE_MAX - 1);
    const more = `<button type="button" class="tile more-tile" data-expand="${esc(key)}" aria-label="Tampilkan ${rest} link lainnya">
      <span class="tile-icon">+${rest}</span><span class="tile-name">lainnya</span></button>`;
    return itemsHtml(items.slice(0, PHONE_MAX - 1), groupId, more);
  }
  return itemsHtml(items, groupId) + `<button type="button" class="less-btn" data-expand="${esc(key)}">Ringkas <i class="bi bi-chevron-up"></i></button>`;
}

function tabsHtml() {
  const tabs = TABS.filter(t => tabAllowed(t.id));
  $('tabWrap').hidden = tabs.length < 2;
  return tabs.map(t => {
    const lock = t.id === 'links' && db.settings.links_tab_private && loggedIn ? '<i class="bi bi-lock-fill small" title="Tab privat"></i>' : '';
    return `<button type="button" role="tab" class="tab-btn ${t.id === activeTab ? 'active' : ''}" aria-selected="${t.id === activeTab}" data-tab="${t.id}">
      <i class="bi bi-${t.icon}"></i><span>${t.name}</span>${lock}<span class="count">${inTab(t.id).length}</span></button>`;
  }).join('');
}
function controlsHtml() {
  const chips = [{ id: 'all', name: 'Semua', n: inTab().length }].concat(groupList().map(g => ({ id: g.id, name: g.name, n: countIn(g.id) })));
  return `<div class="chip-row">
    <button class="btn btn-sm btn-outline-secondary cat-btn ${activeCat !== 'all' ? 'active' : ''}" type="button" data-action="catsheet" aria-label="Semua kategori" title="Semua kategori"><i class="bi bi-list-ul"></i></button>
    <div class="chip-scroll" id="chipScroll" role="toolbar" aria-label="Filter kategori">
      ${chips.map(c => `<button type="button" class="btn btn-sm btn-outline-secondary chip ${c.id === activeCat ? 'active' : ''}" data-cat="${esc(c.id)}" aria-pressed="${c.id === activeCat}">${esc(c.name)} <span class="opacity-75 ms-1">${c.n}</span></button>`).join('')}
    </div>
  </div>`;
}
function renderCatSheet() {
  const rows = [{ id: 'all', name: 'Semua kategori', n: inTab().length, color: 'abu', icon: 'grid' }].concat(groupList().map(g => ({ ...g, n: countIn(g.id) })));
  $('catSheetTitle').textContent = 'Kategori di ' + tabById(activeTab).name;
  $('catSheetBody').innerHTML = rows.map(r => `
    <button type="button" class="sheet-item ${r.id === activeCat ? 'active' : ''}" data-cat-sheet="${esc(r.id)}" style="--cat: var(--cat-${r.color})">
      <span class="sq-icon"><i class="${iconClass(r.icon)}"></i></span><span class="flex-grow-1 fw-semibold">${esc(r.name)}</span>
      <span class="text-body-secondary small">${r.n}</span>${r.id === activeCat ? '<i class="bi bi-check-lg text-accent ms-1"></i>' : '<span style="width:20px"></span>'}
    </button>`).join('')
    + (loggedIn ? `<hr class="my-2"><button type="button" class="sheet-item" data-action="cats" ${canEdit() ? '' : 'disabled'}><span class="sq-icon"><i class="bi bi-tags"></i></span><span class="fw-semibold">Kelola kategori &amp; tab</span></button>` : '');
}
function recentHtml() {
  const items = recent.map(id => inTab().find(l => l.id === id)).filter(Boolean).slice(0, 8);
  if (!items.length) return '';
  return `<section>
    <div class="d-flex align-items-center mb-2">
      <h2 class="h6 fw-bold mb-0"><i class="bi bi-clock-history me-2 text-body-secondary"></i>Terakhir dibuka</h2>
      <button type="button" class="btn btn-link btn-sm text-body-secondary ms-auto p-0" data-action="clearrecent">Hapus riwayat</button>
    </div>
    <div class="recent-row">${items.map(l => `<a class="tile" style="--cat: var(--cat-${colorOf(l)})" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" data-open="${esc(l.id)}" data-press="${esc(l.id)}">
      <span class="tile-icon"><i class="${iconClass(l.icon)}"></i></span><span class="tile-name">${esc(l.name)}</span></a>`).join('')}</div>
  </section>`;
}
function favHtml() {
  const items = inTab().filter(l => l.is_favorite).sort((a, b) => a.name.localeCompare(b.name, 'id'));
  if (!items.length) return '';
  return `<section class="group-panel" style="--cat: var(--pa-star)">
    <h2 class="h6 fw-bold d-flex align-items-center gap-2 mb-3"><i class="bi bi-star-fill text-star"></i>Favorit <span class="text-body-secondary fw-normal small">${items.length}</span></h2>
    ${limitedHtml(items, 'fav:' + activeTab, null)}
  </section>`;
}
function groupSection(g, items, opts) {
  const open = !opts.foldable || !collapsed.has(g.id);
  const badge = opts.showTab ? `<span class="tab-badge ms-1"><i class="bi bi-${tabById(g.tab).icon} me-1"></i>${tabById(g.tab).name}</span>` : '';
  const head = opts.foldable
    ? `<button type="button" class="group-toggle h6 fw-bold ${open ? 'mb-3' : 'mb-0'}" data-collapse="${esc(g.id)}" aria-expanded="${open}"><span class="group-dot"></span>${esc(g.name)} <span class="text-body-secondary fw-normal small">${items.length}</span><i class="bi bi-chevron-down chev"></i></button>`
    : `<h2 class="h6 fw-bold d-flex align-items-center flex-wrap gap-2 mb-3"><span class="group-dot"></span>${esc(g.name)} <span class="text-body-secondary fw-normal small">${items.length}</span>${badge}</h2>`;
  const groupId = opts.sortable ? g.id : null;
  const body = opts.limit ? limitedHtml(items, g.id, groupId) : itemsHtml(items, groupId);
  return `<section class="group-panel" style="--cat: var(--cat-${g.color})">${head}${open ? body : ''}</section>`;
}
function groupsHtml() {
  return groupList().filter(g => activeCat === 'all' || activeCat === g.id).map(g => {
    const items = inTab().filter(l => catKey(l) === g.id).sort(byOrder);
    if (!items.length) {
      if (!loggedIn || activeCat !== g.id) return '';
      return `<section class="group-panel" style="--cat: var(--cat-${g.color})"><h2 class="h6 fw-bold d-flex align-items-center gap-2 mb-2"><span class="group-dot"></span>${esc(g.name)}</h2><p class="text-body-secondary small mb-0">Belum ada link di kategori ini.</p></section>`;
    }
    const all = activeCat === 'all';
    return groupSection(g, items, { foldable: all && !editMode, sortable: true, limit: all });
  }).join('');
}
/* Pencarian: di semua tab yang boleh dilihat, tab aktif lebih dulu, dengan label tab */
function searchHtml(q) {
  const order = TABS.map(t => t.id).sort((a, b) => (a === activeTab ? -1 : b === activeTab ? 1 : 0));
  return order.filter(tabAllowed).flatMap(t => groupList(t).map(g => {
    const items = visible().filter(l => catKey(l) === g.id && `${l.name} ${l.note} ${l.url}`.toLowerCase().includes(q)).sort(byOrder);
    return items.length ? groupSection(g, items, { foldable: false, sortable: false, limit: false, showTab: true }) : '';
  })).join('');
}

/* ===================== RENDER ===================== */
function render() {
  updateStatus();
  if (!loaded) return;
  if (!tabAllowed(activeTab)) activeTab = 'apps';
  const q = $('search').value.trim().toLowerCase();
  const tab = tabById(activeTab);
  $('tabBar').innerHTML = tabsHtml();
  $('pageTitle').textContent = q ? 'Hasil pencarian' : tab.title;
  const nCats = groupList().filter(g => g.id !== 'none').length;
  $('summary').textContent = q ? 'Semua tab' : `${inTab().length} link · ${nCats} kategori`;
  if (activeCat !== 'all' && !groupList().some(g => g.id === activeCat)) activeCat = 'all';
  $('catControls').innerHTML = q ? '' : controlsHtml();
  renderCatSheet();

  let html;
  if (q) {
    html = searchHtml(q) || `<div class="text-center text-body-secondary border rounded-4 p-5" style="border-style:dashed!important">Tidak ada yang cocok dengan pencarian Anda di semua tab.</div>`;
  } else {
    html = (activeCat === 'all' && !editMode ? recentHtml() + favHtml() : '') + groupsHtml();
    if (!html) {
      html = `<div class="text-center border rounded-4 p-5" style="border-style:dashed!important"><i class="bi bi-${tab.icon} fs-1 text-accent"></i>
        <h3 class="h5 fw-bold mt-2">Belum ada link di ${tab.name}</h3>
        <p class="text-body-secondary mb-0">${loggedIn
          ? (activeTab === 'links' ? 'Tambahkan link Google, YouTube, game, atau situs lain lewat Tambah link.' : 'Tekan Tambah link untuk mulai.')
          : 'Tekan Kelola lalu masuk untuk menambahkan link.'}</p></div>`;
    }
  }
  $('list').innerHTML = html;
  setupChipScroll();
  setupSortables();
}
function setupChipScroll() {
  const el = $('chipScroll'); if (!el) return;
  const update = () => { el.classList.toggle('fade-end', el.scrollLeft + el.clientWidth < el.scrollWidth - 4); el.classList.toggle('fade-start', el.scrollLeft > 4); };
  el.addEventListener('scroll', update, { passive: true });
  const act = el.querySelector('.chip.active');
  if (act && (act.offsetLeft < el.scrollLeft || act.offsetLeft + act.offsetWidth > el.scrollLeft + el.clientWidth)) el.scrollLeft = act.offsetLeft - 40;
  update();
}
window.addEventListener('resize', setupChipScroll);
phoneMq.addEventListener('change', render);

/* Seret untuk mengatur urutan link (mode Atur) */
function setupSortables() {
  sortables.forEach(s => s.destroy()); sortables = [];
  if (!editMode || !window.Sortable) return;
  document.querySelectorAll('.app-grid[data-group]').forEach(el => {
    const opts = {
      animation: 150, ghostClass: 'drag-ghost', delay: 200, delayOnTouchOnly: true,
      onEnd: async () => {
        const ids = [...el.children].map(c => c.dataset.id).filter(Boolean);
        ids.forEach((id, i) => { const l = db.links.find(x => x.id === id); if (l) l.sort_order = i; });
        persist();
        try { await api.reorderLinks(ids); notify('Urutan disimpan'); }
        catch (err) { notify('Urutan gagal disimpan. ' + api.friendly(err)); refresh(); }
      }
    };
    if (!isPhone()) opts.handle = '.drag-handle';
    sortables.push(new window.Sortable(el, opts));
  });
}

/* ===================== MEMUAT DATA ===================== */
async function refresh() {
  if (!api.isConfigured) { render(); return; }
  try {
    const data = await api.fetchAll();
    setData({ ...data, savedAt: new Date().toISOString() });
    persist();
    serverDown = false; needsMigration = false;
  } catch (err) {
    console.error('Gagal memuat data:', err);
    if (api.isMigrationError(err)) { needsMigration = true; serverDown = false; }
    else serverDown = true;
    if (!loaded) setData({ categories: [], links: [], savedAt: null });
  }
  render();
}

/* ===================== LEMBAR AKSI LINK ===================== */
const linkSheet = new bs.Offcanvas($('linkSheet'));
const catSheet = new bs.Offcanvas($('catSheet'));
function openLinkSheet(id) {
  const l = db.links.find(x => x.id === id); if (!l) return;
  $('linkSheetHead').innerHTML = `<span class="app-icon" style="--cat: var(--cat-${colorOf(l)})"><i class="${iconClass(l.icon)}"></i></span>
    <div style="min-width:0"><div class="fw-bold text-truncate" id="linkSheetTitle">${esc(l.name)}</div><div class="small text-body-secondary text-truncate">${esc(host(l.url))} · ${tabById(tabOfLink(l)).name}</div></div>`;
  const off = canEdit() ? '' : 'disabled';
  $('linkSheetBody').innerHTML = `
    <a class="sheet-item" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" data-open="${esc(l.id)}"><span class="sq-icon"><i class="bi bi-box-arrow-up-right"></i></span><span class="fw-semibold">Buka</span></a>
    <button type="button" class="sheet-item" data-copy="${esc(l.id)}"><span class="sq-icon"><i class="bi bi-copy"></i></span><span class="fw-semibold">Salin link</span></button>
    ${loggedIn ? `<hr class="my-2">
    <button type="button" class="sheet-item" data-fav="${esc(l.id)}" ${off}><span class="sq-icon"><i class="bi ${l.is_favorite ? 'bi-star' : 'bi-star-fill'} text-star"></i></span><span class="fw-semibold">${l.is_favorite ? 'Hapus dari favorit' : 'Jadikan favorit'}</span></button>
    <button type="button" class="sheet-item" data-edit="${esc(l.id)}" ${off}><span class="sq-icon"><i class="bi bi-pencil"></i></span><span class="fw-semibold">Ubah</span></button>
    <button type="button" class="sheet-item danger" data-del="${esc(l.id)}" ${off}><span class="sq-icon"><i class="bi bi-trash"></i></span><span class="fw-semibold">Hapus</span></button>` : ''}`;
  linkSheet.show();
}

/* Tekan lama (HP) atau klik kanan (laptop) membuka lembar aksi */
let pressTimer = null, pressFired = false, pressXY = null;
document.addEventListener('pointerdown', e => {
  const t = e.target.closest('[data-press]'); if (!t || editMode) return;
  pressFired = false; pressXY = [e.clientX, e.clientY];
  pressTimer = setTimeout(() => { pressFired = true; if (navigator.vibrate) navigator.vibrate(12); openLinkSheet(t.dataset.press); }, 480);
});
document.addEventListener('pointermove', e => {
  if (pressTimer && pressXY && Math.hypot(e.clientX - pressXY[0], e.clientY - pressXY[1]) > 10) { clearTimeout(pressTimer); pressTimer = null; }
});
['pointerup', 'pointercancel'].forEach(ev => document.addEventListener(ev, () => { clearTimeout(pressTimer); pressTimer = null; }));
document.addEventListener('click', e => {
  if (pressFired && e.target.closest('[data-press]')) { e.preventDefault(); e.stopPropagation(); pressFired = false; }
}, true);
document.addEventListener('contextmenu', e => {
  const t = e.target.closest('[data-press]');
  if (t && !editMode) { e.preventDefault(); clearTimeout(pressTimer); openLinkSheet(t.dataset.press); }
});

/* ===================== FORM LINK ===================== */
const linkModal = new bs.Modal($('linkModal'));
let editingId = null, chosenIcon = 'app', iconTouched = false, dupConfirmed = false, newCatTab = 'apps';

const iconGridHtml = sel => ICONS.map(n => `<button type="button" class="icon-opt ${n === sel ? 'active' : ''}" data-icon="${n}" role="radio" aria-checked="${n === sel}" aria-label="${n}" title="${n}"><i class="bi bi-${n}"></i></button>`).join('');
const segHtml = (name, sel) => TABS.map(t => `<input type="radio" name="${name}" id="${name}-${t.id}" value="${t.id}" ${t.id === sel ? 'checked' : ''}><label for="${name}-${t.id}"><i class="bi bi-${t.icon} me-1"></i>${t.name}</label>`).join('');
const currentCatColor = () => (catById($('fCat').value) || {}).color || 'abu';
function updateIconPreview() {
  $('iconPreview').style.setProperty('--cat', `var(--cat-${currentCatColor()})`);
  $('iconPreview').innerHTML = `<i class="${iconClass(chosenIcon)}"></i>`;
  $('autoBadge').hidden = iconTouched; $('autoIconBtn').hidden = !iconTouched;
}
function setIcon(n, touched, fromInput) {
  chosenIcon = n; iconTouched = touched;
  if (!fromInput) $('fIcon').value = (touched && !ICONS.includes(n)) ? n : '';
  $('iconGrid').innerHTML = iconGridHtml(chosenIcon); updateIconPreview();
}
function autoIcon() {
  if (!iconTouched) setIcon(suggestIcon($('fName').value, safeUrl($('fUrl').value) || '', (catById($('fCat').value) || {}).icon), false);
}
function updateCatTabNote() {
  const v = $('fCat').value, c = catById(v);
  $('fCatTab').innerHTML = c ? `Tampil di tab <b>${tabById(tabOfCat(c)).name}</b>.` : v === '' ? 'Tanpa kategori tampil di tab <b>Aplikasi Saya</b>.' : '';
}
function fillCategorySelect(selected) {
  $('fCat').innerHTML = TABS.map(t => `<optgroup label="${t.name}">${catsIn(t.id).map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</optgroup>`).join('')
    + `<optgroup label="Lainnya"><option value="">Tanpa kategori</option><option value="__new">+ Kategori baru…</option></optgroup>`;
  const fallback = activeCat !== 'all' && activeCat !== 'none' ? activeCat : (catsIn(activeTab)[0]?.id || '');
  $('fCat').value = selected ?? fallback;
  $('newCatWrap').hidden = $('fCat').value !== '__new';
  updateCatTabNote();
}
function openForm(id) {
  if (!canEdit()) return;
  linkSheet.hide();
  editingId = id || null; dupConfirmed = false;
  const l = id ? db.links.find(x => x.id === id) : null;
  $('modalTitle').textContent = l ? 'Ubah link' : 'Tambah link';
  $('fName').value = l?.name || ''; $('fUrl').value = l?.url || ''; $('fNote').value = l?.note || ''; $('fNewCat').value = '';
  $('fFav').checked = !!l?.is_favorite; $('fPrivate').checked = !!l?.is_private;
  newCatTab = activeTab; $('newCatTab').innerHTML = segHtml('newCatTabSel', newCatTab);
  fillCategorySelect(l ? (l.category_id || '') : undefined);
  ['fName', 'fUrl', 'fNewCat', 'fIcon'].forEach(i => $(i).classList.remove('is-invalid'));
  $('dupWarn').hidden = true; $('formErr').hidden = true; $('saveBtn').textContent = 'Simpan'; $('saveBtn').disabled = false;
  if (l) setIcon(l.icon || 'app', true); else { iconTouched = false; autoIcon(); }
  $('delBtn').hidden = !l; resetDel();
  linkModal.show();
}
function resetDel() { const b = $('delBtn'); b.textContent = 'Hapus'; b.className = 'btn btn-outline-danger me-auto'; b.dataset.armed = ''; b.disabled = false; }
function showDup() {
  const url = safeUrl($('fUrl').value);
  const d = url ? findDuplicate(url, editingId) : null;
  dupConfirmed = false; $('saveBtn').textContent = 'Simpan';
  if (!d) { $('dupWarn').hidden = true; return; }
  const cn = (catOf(d) || {}).name || 'Tanpa kategori';
  $('dupWarn').innerHTML = `<i class="bi bi-exclamation-triangle me-1"></i>Link ini sudah tersimpan sebagai <b>${esc(d.name)}</b> (${esc(cn)}, tab ${tabById(tabOfLink(d)).name}).`;
  $('dupWarn').hidden = false;
}
$('fName').addEventListener('input', autoIcon);
// Peringatan link ganda muncul saat mengetik/menempel (bukan saat kolom ditinggalkan),
// supaya tombol Simpan tidak bergeser tepat ketika diklik.
let dupTimer = null;
$('fUrl').addEventListener('input', () => { autoIcon(); clearTimeout(dupTimer); dupTimer = setTimeout(showDup, 350); });
$('fCat').addEventListener('change', () => {
  $('newCatWrap').hidden = $('fCat').value !== '__new';
  if (!$('newCatWrap').hidden) $('fNewCat').focus();
  updateCatTabNote(); autoIcon(); updateIconPreview();
});
$('newCatTab').addEventListener('change', e => { if (e.target.name === 'newCatTabSel') newCatTab = e.target.value; });
$('iconGrid').addEventListener('click', e => { const b = e.target.closest('[data-icon]'); if (b) setIcon(b.dataset.icon, true); });
$('fIcon').addEventListener('input', () => {
  const v = $('fIcon').value.trim().toLowerCase().replace(/^bi-/, '');
  $('fIcon').classList.toggle('is-invalid', !!v && !validIcon(v));
  if (!v) { iconTouched = false; autoIcon(); } else if (validIcon(v)) setIcon(v, true, true);
});
$('linkModal').addEventListener('shown.bs.modal', () => { if (!isPhone()) $('fName').focus(); });

$('linkForm').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('fName').value.trim(), url = safeUrl($('fUrl').value);
  let catId = $('fCat').value; const newCat = $('fNewCat').value.trim();
  const catExists = newCat && db.categories.some(c => c.name.toLowerCase() === newCat.toLowerCase());
  $('fName').classList.toggle('is-invalid', !name);
  $('fUrl').classList.toggle('is-invalid', !url);
  $('newCatErr').textContent = catExists ? 'Kategori dengan nama ini sudah ada. Pilih dari daftar.' : 'Nama kategori wajib diisi.';
  $('fNewCat').classList.toggle('is-invalid', catId === '__new' && (!newCat || catExists));
  if (!name || !url || (catId === '__new' && (!newCat || catExists)) || $('fIcon').classList.contains('is-invalid')) return;

  if (!dupConfirmed && findDuplicate(url, editingId)) { showDup(); dupConfirmed = true; $('saveBtn').textContent = 'Tetap simpan'; return; }

  const btn = $('saveBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Menyimpan…';
  $('formErr').hidden = true;
  const wasEdit = !!editingId;
  try {
    if (catId === '__new') {
      const c = await api.insertCategory({ name: newCat, color: 'abu', icon: 'folder2', tab: newCatTab, sort_order: catsIn(newCatTab).length });
      db.categories.push(c); catId = c.id; fillCategorySelect(c.id);
    }
    const data = { name, url, icon: chosenIcon, category_id: catId || null, note: $('fNote').value.trim(),
      is_favorite: $('fFav').checked, is_private: $('fPrivate').checked };
    const endOrder = db.links.filter(x => x.category_id === data.category_id && x.id !== editingId).length;
    if (wasEdit) {
      const old = db.links.find(x => x.id === editingId);
      if (old && old.category_id !== data.category_id) data.sort_order = endOrder;
      Object.assign(old, await api.updateLink(editingId, data));
    } else {
      db.links.push(await api.insertLink({ ...data, sort_order: endOrder }));
    }
    persist(); linkModal.hide();
    const t = tabOfLink(data);
    if (t !== activeTab) { setTab(t); notify(`${wasEdit ? 'Disimpan' : 'Ditambahkan'} di tab ${tabById(t).name}`); }
    else { render(); notify(wasEdit ? 'Perubahan disimpan' : 'Link ditambahkan'); }
  } catch (err) {
    $('formErr').textContent = api.friendly(err); $('formErr').hidden = false;
  } finally {
    btn.disabled = false; btn.textContent = dupConfirmed ? 'Tetap simpan' : 'Simpan';
  }
});
$('delBtn').addEventListener('click', async () => {
  const b = $('delBtn');
  if (!b.dataset.armed) { b.dataset.armed = '1'; b.textContent = 'Ketuk lagi untuk hapus'; b.className = 'btn btn-danger me-auto'; return; }
  b.disabled = true;
  try {
    await api.deleteLink(editingId);
    db.links = db.links.filter(x => x.id !== editingId);
    recent = recent.filter(x => x !== editingId); saveRecent(recent);
    persist(); linkModal.hide(); render(); notify('Link dihapus');
  } catch (err) {
    $('formErr').textContent = api.friendly(err); $('formErr').hidden = false; resetDel();
  }
});

/* ===================== KELOLA KATEGORI & TAB ===================== */
const catModal = new bs.Modal($('catModal'));
let catEditing = null, catColor = 'biru', catIcon = 'folder2', catTab = 'apps', catSortables = [];

function showCatView(view) {
  $('catListView').hidden = view !== 'list';
  $('catEditView').hidden = view !== 'edit';
  $('catBackBtn').hidden = view !== 'edit';
  $('catModalTitle').textContent = view === 'list' ? 'Kelola kategori & tab' : (catEditing ? 'Ubah kategori' : 'Kategori baru');
}
function catRowsHtml(t) {
  const cats = catsIn(t);
  if (!cats.length) return '<p class="text-body-secondary small p-3 mb-0">Belum ada kategori di tab ini.</p>';
  return cats.map((c, i) => {
    const n = db.links.filter(l => l.category_id === c.id).length;
    return `<div class="cat-row" data-id="${esc(c.id)}" style="--cat: var(--cat-${c.color})">
      <span class="drag-handle" title="Seret"><i class="bi bi-grip-vertical"></i></span>
      <span class="sq-icon"><i class="${iconClass(c.icon)}"></i></span>
      <span class="flex-grow-1" style="min-width:0"><span class="fw-semibold d-block text-truncate">${esc(c.name)}</span><span class="small text-body-secondary">${n} link</span></span>
      <button type="button" class="btn btn-sm btn-outline-secondary border-0" data-catmove="${esc(c.id)}:-1" ${i === 0 ? 'disabled' : ''} aria-label="Naikkan ${esc(c.name)}"><i class="bi bi-chevron-up"></i></button>
      <button type="button" class="btn btn-sm btn-outline-secondary border-0" data-catmove="${esc(c.id)}:1" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Turunkan ${esc(c.name)}"><i class="bi bi-chevron-down"></i></button>
      <button type="button" class="btn btn-sm btn-outline-secondary" data-catedit="${esc(c.id)}" aria-label="Ubah ${esc(c.name)}"><i class="bi bi-pencil"></i></button>
    </div>`;
  }).join('');
}
function renderCatList() {
  $('catListView').innerHTML = `<p class="small text-body-secondary mb-0">Urutan di sini menjadi urutan kategori di halaman utama. Seret pegangan atau pakai tombol panah.</p>`
    + TABS.map(t => `
    <div class="cat-section-head"><i class="bi bi-${t.icon} text-accent"></i>${t.name}</div>
    ${t.id === 'links' ? `<div class="form-check form-switch small mb-2"><input class="form-check-input" type="checkbox" role="switch" id="linksPrivate" ${db.settings.links_tab_private ? 'checked' : ''}>
      <label class="form-check-label" for="linksPrivate"><i class="bi bi-lock-fill me-1"></i>Tab ini privat, hanya terlihat setelah masuk</label></div>` : ''}
    <div class="cat-list" data-tablist="${t.id}">${catRowsHtml(t.id)}</div>
    <button class="btn btn-sm btn-outline-secondary w-100 mt-2" type="button" data-newcat="${t.id}"><i class="bi bi-plus-lg me-1"></i>Tambah kategori di ${t.name}</button>`).join('');
  catSortables.forEach(s => s.destroy()); catSortables = [];
  if (window.Sortable) document.querySelectorAll('[data-tablist]').forEach(el => catSortables.push(new window.Sortable(el, {
    handle: '.drag-handle', animation: 150, ghostClass: 'drag-ghost',
    onEnd: () => saveCatOrder([...el.children].map(r => r.dataset.id).filter(Boolean))
  })));
}
async function saveCatOrder(ids) {
  ids.forEach((id, i) => { const c = catById(id); if (c) c.sort_order = i; });
  persist(); renderCatList(); render();
  try { await api.reorderCategories(ids); }
  catch (err) { notify('Urutan kategori gagal disimpan. ' + api.friendly(err)); refresh().then(renderCatList); }
}
function moveCat(id, dir) {
  const c = catById(id); if (!c) return;
  const ids = catsIn(tabOfCat(c)).map(x => x.id); const i = ids.indexOf(id); const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  saveCatOrder(ids);
}
function openCatManager() {
  if (!canEdit()) return;
  linkSheet.hide(); catSheet.hide(); renderCatList(); showCatView('list'); catModal.show();
}
function renderCatColors() {
  $('cColors').innerHTML = COLORS.map(c => `<label class="swatch" title="${c.name}">
    <input type="radio" name="catColor" value="${c.key}" ${c.key === catColor ? 'checked' : ''} aria-label="${c.name}"><span style="--sw: var(--cat-${c.key})"><i class="bi bi-check-lg"></i></span></label>`).join('');
}
function updateCatPreview() { $('catPreview').style.setProperty('--cat', `var(--cat-${catColor})`); $('catPreview').innerHTML = `<i class="${iconClass(catIcon)}"></i>`; }
function openCatEdit(id, tabForNew) {
  catEditing = id || null;
  const c = id ? catById(id) : null;
  $('cName').value = c?.name || ''; $('cName').classList.remove('is-invalid');
  catColor = c?.color || COLORS[db.categories.length % 7].key; catIcon = c?.icon || 'folder2';
  catTab = c ? tabOfCat(c) : validTab(tabForNew || activeTab);
  $('cTab').innerHTML = segHtml('catTabSel', catTab);
  renderCatColors(); $('catIconGrid').innerHTML = iconGridHtml(catIcon); updateCatPreview();
  const del = $('catDelBtn'); del.hidden = !c; del.dataset.armed = ''; del.textContent = 'Hapus'; del.className = 'btn btn-outline-danger me-auto'; del.disabled = false;
  $('catDelWarn').hidden = true; $('catErr').hidden = true;
  showCatView('edit'); if (!isPhone()) setTimeout(() => $('cName').focus(), 50);
}
$('cTab').addEventListener('change', e => { if (e.target.name === 'catTabSel') catTab = e.target.value; });
$('cColors').addEventListener('change', e => { if (e.target.name === 'catColor') { catColor = e.target.value; updateCatPreview(); } });
$('catIconGrid').addEventListener('click', e => {
  const b = e.target.closest('[data-icon]'); if (!b) return;
  catIcon = b.dataset.icon; $('catIconGrid').innerHTML = iconGridHtml(catIcon); updateCatPreview();
});
$('catListView').addEventListener('change', async e => {
  if (e.target.id !== 'linksPrivate') return;
  const on = e.target.checked; e.target.disabled = true;
  try {
    await api.saveSettings({ links_tab_private: on });
    db.settings.links_tab_private = on; persist(); render();
    notify(on ? 'Tab Link Lain sekarang hanya terlihat oleh Anda' : 'Tab Link Lain terlihat oleh semua pengunjung');
  } catch (err) {
    e.target.checked = !on; notify('Pengaturan gagal disimpan. ' + api.friendly(err));
  } finally { e.target.disabled = false; }
});
$('catEditView').addEventListener('submit', async e => {
  e.preventDefault();
  const name = $('cName').value.trim();
  const dup = db.categories.some(c => c.id !== catEditing && c.name.toLowerCase() === name.toLowerCase());
  $('cNameErr').textContent = dup ? 'Kategori dengan nama ini sudah ada.' : 'Nama kategori wajib diisi.';
  $('cName').classList.toggle('is-invalid', !name || dup);
  if (!name || dup) return;
  const btn = $('catSaveBtn'); btn.disabled = true; $('catErr').hidden = true;
  try {
    if (catEditing) {
      const c = catById(catEditing);
      const patch = { name, color: catColor, icon: catIcon, tab: catTab };
      if (tabOfCat(c) !== catTab) patch.sort_order = catsIn(catTab).length;   // pindah tab → taruh di urutan terakhir
      Object.assign(c, await api.updateCategory(catEditing, patch));
    } else {
      db.categories.push(await api.insertCategory({ name, color: catColor, icon: catIcon, tab: catTab, sort_order: catsIn(catTab).length }));
    }
    persist(); renderCatList(); showCatView('list'); render();
    notify(catEditing ? 'Kategori diperbarui' : 'Kategori ditambahkan');
  } catch (err) {
    $('catErr').textContent = api.friendly(err); $('catErr').hidden = false;
  } finally { btn.disabled = false; }
});
$('catDelBtn').addEventListener('click', async () => {
  const b = $('catDelBtn'); const n = db.links.filter(l => l.category_id === catEditing).length;
  if (!b.dataset.armed) {
    b.dataset.armed = '1'; b.textContent = 'Ya, hapus'; b.className = 'btn btn-danger me-auto';
    $('catDelWarn').innerHTML = n ? `<i class="bi bi-exclamation-triangle me-1"></i>${n} link di kategori ini tidak ikut terhapus. Link tersebut akan dipindah ke <b>Tanpa kategori</b> di tab Aplikasi Saya.` : 'Kategori ini kosong dan akan dihapus.';
    $('catDelWarn').hidden = false; return;
  }
  b.disabled = true;
  try {
    await api.deleteCategory(catEditing);
    db.links.forEach(l => { if (l.category_id === catEditing) l.category_id = null; });
    db.categories = db.categories.filter(c => c.id !== catEditing);
    if (activeCat === catEditing) activeCat = 'all';
    persist(); renderCatList(); showCatView('list'); render(); notify('Kategori dihapus');
  } catch (err) {
    $('catErr').textContent = api.friendly(err); $('catErr').hidden = false; b.disabled = false;
  }
});

/* ===================== EKSPOR / IMPOR ===================== */
function exportData() {
  const payload = { app: 'pangkalan-aplikasi', version: 2, exported_at: new Date().toISOString(),
    settings: db.settings, categories: db.categories, links: db.links };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `pangkalan-aplikasi-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  notify('File cadangan diunduh');
}
const importModal = new bs.Modal($('importModal'));
let pendingImport = null;
$('importFile').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const d = sanitizeImport(JSON.parse(await f.text()));
    if (!d.links.length && !d.categories.length) throw new Error('kosong');
    pendingImport = d;
    $('importSummary').innerHTML = `File <b>${esc(f.name)}</b> berisi <b>${d.categories.length}</b> kategori dan <b>${d.links.length}</b> link. Pilih cara memasukkannya:`;
    const rb = $('replaceBtn'); rb.dataset.armed = ''; rb.querySelector('b').textContent = 'Ganti semua';
    $('importErr').hidden = true;
    importModal.show();
  } catch (err) { notify('File tidak bisa dibaca. Pastikan file hasil ekspor Pangkalan Aplikasi.'); }
});
async function runImport(mode) {
  const btns = document.querySelectorAll('#importModal [data-action^="import"]');
  btns.forEach(b => { b.disabled = true; });
  try {
    const r = await api.importData(pendingImport, mode, db);
    pendingImport = null; importModal.hide(); await refresh();
    notify(`Ditambahkan ${r.addedLinks} link dan ${r.addedCategories} kategori${r.skipped ? `, ${r.skipped} link ganda dilewati` : ''}`);
  } catch (err) {
    $('importErr').textContent = api.friendly(err); $('importErr').hidden = false;
    if (mode === 'replace') refresh();
  } finally { btns.forEach(b => { b.disabled = false; }); }
}

/* ===================== MASUK / LUPA PASSWORD ===================== */
const loginModal = new bs.Modal($('loginModal'));
function showLoginView(v) {
  $('loginForm').hidden = v !== 'login'; $('resetForm').hidden = v !== 'reset'; $('newPassForm').hidden = v !== 'newpass';
  $('loginTitle').textContent = v === 'login' ? 'Masuk untuk mengelola' : v === 'reset' ? 'Lupa password' : 'Buat password baru';
}
function openLogin(view = 'login') {
  ['loginForm', 'resetForm', 'newPassForm'].forEach(f => $(f).reset());
  ['loginEmail', 'loginPass', 'resetEmail', 'newPass', 'newPass2'].forEach(i => { $(i).classList.remove('is-invalid'); });
  ['loginPass', 'newPass'].forEach(i => { $(i).type = 'password'; });
  ['loginError', 'resetMsg', 'newPassMsg'].forEach(i => { $(i).hidden = true; });
  showLoginView(view);
  loginModal.show();
}
$('loginModal').addEventListener('shown.bs.modal', () => { if (!isPhone() && !$('loginForm').hidden) $('loginEmail').focus(); });
$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  const email = $('loginEmail').value.trim(), pass = $('loginPass').value;
  const emailOk = $('loginEmail').checkValidity(), passOk = pass.length > 0;
  $('loginEmail').classList.toggle('is-invalid', !emailOk); $('loginPass').classList.toggle('is-invalid', !passOk);
  $('loginError').hidden = true;
  if (!emailOk || !passOk) return;
  const btn = $('loginBtn'); btn.disabled = true; btn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Memeriksa…';
  try {
    const { session } = await api.signIn(email, pass);
    setOwner(session); loginModal.hide(); notify('Berhasil masuk'); await refresh();
  } catch (err) {
    $('loginError').textContent = api.friendly(err); $('loginError').hidden = false;
  } finally { btn.disabled = false; btn.textContent = 'Masuk'; }
});
$('resetForm').addEventListener('submit', async e => {
  e.preventDefault();
  const ok = $('resetEmail').checkValidity(); $('resetEmail').classList.toggle('is-invalid', !ok);
  if (!ok) return;
  const btn = $('resetBtn'), msg = $('resetMsg'); btn.disabled = true;
  try {
    await api.sendReset($('resetEmail').value.trim());
    msg.className = 'alert alert-success small py-2'; msg.textContent = 'Jika email terdaftar, link reset sudah dikirim. Buka email lalu ketuk link tersebut di perangkat ini.';
  } catch (err) {
    msg.className = 'alert alert-danger small py-2'; msg.textContent = api.friendly(err);
  } finally { msg.hidden = false; btn.disabled = false; }
});
$('newPassForm').addEventListener('submit', async e => {
  e.preventDefault();
  const p1 = $('newPass').value, p2 = $('newPass2').value;
  $('newPass').classList.toggle('is-invalid', p1.length < 8); $('newPass2').classList.toggle('is-invalid', p1 !== p2);
  if (p1.length < 8 || p1 !== p2) return;
  const btn = $('newPassBtn'); btn.disabled = true; $('newPassMsg').hidden = true;
  try { await api.updatePassword(p1); loginModal.hide(); notify('Password baru disimpan'); }
  catch (err) { $('newPassMsg').textContent = api.friendly(err); $('newPassMsg').hidden = false; }
  finally { btn.disabled = false; }
});
function hidePrivateLocally() {
  db.links = db.links.filter(l => !l.is_private);
  if (db.settings.links_tab_private) {
    const hidden = new Set(db.categories.filter(c => c.tab === 'links').map(c => c.id));
    db.categories = db.categories.filter(c => !hidden.has(c.id));
    db.links = db.links.filter(l => !hidden.has(l.category_id));
  }
}
async function logout() {
  try { await api.signOut(); } catch (err) { console.warn(err); }
  setOwner(null); stripPrivateFromCache(); hidePrivateLocally();
  render(); notify('Anda sudah keluar'); refresh();
}

/* ===================== EVENT ===================== */
document.addEventListener('click', async e => {
  const a = e.target.closest('[data-action]');
  if (a) {
    const act = a.dataset.action;
    if (act === 'theme') toggleTheme();
    else if (act === 'manage') openLogin('login');
    else if (act === 'logout') logout();
    else if (act === 'add') openForm();
    else if (act === 'editmode') setEditMode(!editMode);
    else if (act === 'retry') { a.disabled = true; await refresh(); a.disabled = false; if (serverDown) notify('Server masih belum bisa dihubungi'); }
    else if (act === 'catsheet') { renderCatSheet(); catSheet.show(); }
    else if (act === 'cats') openCatManager();
    else if (act === 'catback') showCatView('list');
    else if (act === 'autoicon') { iconTouched = false; $('fIcon').value = ''; $('fIcon').classList.remove('is-invalid'); autoIcon(); }
    else if (act === 'clearrecent') {
      const ids = new Set(inTab().map(l => l.id));
      recent = recent.filter(x => !ids.has(x)); saveRecent(recent); render(); notify('Riwayat tab ini dihapus dari perangkat ini');
    }
    else if (act === 'export') exportData();
    else if (act === 'import') { if (canEdit()) $('importFile').click(); }
    else if (act === 'importmerge' && pendingImport) runImport('merge');
    else if (act === 'importreplace' && pendingImport) {
      if (!a.dataset.armed) { a.dataset.armed = '1'; a.querySelector('b').textContent = 'Ketuk lagi untuk mengganti semua data'; return; }
      runImport('replace');
    }
    else if (act === 'togglepass') {
      const input = $(a.dataset.target); const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      a.querySelector('i').className = show ? 'bi bi-eye-slash' : 'bi bi-eye';
      a.setAttribute('aria-label', show ? 'Sembunyikan password' : 'Tampilkan password');
    }
    else if (act === 'showreset') { const em = $('loginEmail').value; showLoginView('reset'); $('resetEmail').value = em; }
    else if (act === 'showlogin') showLoginView('login');
    return;
  }
  const tb = e.target.closest('[data-tab]'); if (tb) { setTab(tb.dataset.tab); return; }
  const ex = e.target.closest('[data-expand]');
  if (ex) {
    const id = ex.dataset.expand, closing = expanded.has(id);
    closing ? expanded.delete(id) : expanded.add(id);
    render();
    if (closing) { const head = document.querySelector(`[data-collapse="${CSS.escape(id)}"]`); if (head) head.closest('section').scrollIntoView({ block: 'nearest' }); }
    return;
  }
  const op = e.target.closest('[data-open]');
  if (op) { recent = pushRecent(recent, op.dataset.open); linkSheet.hide(); setTimeout(render, 300); return; }
  const sh = e.target.closest('[data-sheet]'); if (sh) { openLinkSheet(sh.dataset.sheet); return; }
  const cp = e.target.closest('[data-copy]');
  if (cp) {
    const l = db.links.find(x => x.id === cp.dataset.copy); if (!l) return;
    const ok = await copyText(l.url); linkSheet.hide();
    notify(ok ? 'Link disalin' : 'Gagal menyalin. Salin manual: ' + l.url); return;
  }
  const fv = e.target.closest('[data-fav]');
  if (fv) {
    const l = db.links.find(x => x.id === fv.dataset.fav); if (!l) return;
    linkSheet.hide();
    try { Object.assign(l, await api.updateLink(l.id, { is_favorite: !l.is_favorite })); persist(); render(); notify(l.is_favorite ? 'Ditambahkan ke favorit' : 'Dihapus dari favorit'); }
    catch (err) { notify(api.friendly(err)); }
    return;
  }
  const ed = e.target.closest('[data-edit]'); if (ed) { openForm(ed.dataset.edit); return; }
  const dl = e.target.closest('[data-del]'); if (dl) { openForm(dl.dataset.del); $('delBtn').click(); return; }
  const cs = e.target.closest('[data-cat-sheet]'); if (cs) { activeCat = cs.dataset.catSheet; catSheet.hide(); render(); return; }
  const ch = e.target.closest('[data-cat]'); if (ch) { activeCat = ch.dataset.cat; render(); return; }
  const cm = e.target.closest('[data-catmove]'); if (cm) { const [id, d] = cm.dataset.catmove.split(':'); moveCat(id, Number(d)); return; }
  const ce = e.target.closest('[data-catedit]'); if (ce) { openCatEdit(ce.dataset.catedit); return; }
  const nc = e.target.closest('[data-newcat]'); if (nc) { openCatEdit(null, nc.dataset.newcat); return; }
  const co = e.target.closest('[data-collapse]');
  if (co) { const id = co.dataset.collapse; collapsed.has(id) ? collapsed.delete(id) : collapsed.add(id); saveCollapsed(collapsed); render(); }
});
$('search').addEventListener('input', render);
window.addEventListener('online', () => { if (serverDown) refresh(); });

/* ===================== MULAI ===================== */
async function start() {
  applyThemeIcon();
  const cached = loadCache();
  if (cached) setData(cached);
  render();                                         // langsung tampil dari salinan, sebelum server menjawab

  if (!api.isConfigured) { if (!loaded) setData({ categories: [], links: [] }); render(); return; }

  try {
    setOwner(await api.getSession());
    if (!loggedIn) hidePrivateLocally();
    await api.onAuthChange((event, session) => {
      // Jangan memanggil Supabase langsung di dalam callback ini; tunda dengan setTimeout.
      setTimeout(() => {
        const was = loggedIn;
        if (event === 'SIGNED_OUT' || session) setOwner(session);
        if (event === 'PASSWORD_RECOVERY') openLogin('newpass');
        if (was !== loggedIn) { if (!loggedIn) stripPrivateFromCache(); refresh(); }
      }, 0);
    });
  } catch (err) {
    console.error('Gagal memuat Supabase:', err);
  }
  await refresh();
}
start();

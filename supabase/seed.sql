-- =====================================================================
-- Pangkalan Aplikasi: data awal (4 kategori, 11 link)
-- 1. Buat dulu akun pemilik di Authentication → Users → Add user.
-- 2. Ganti email di baris "owner_email" di bawah dengan email akun tersebut.
-- 3. Jalankan di SQL Editor. Jalankan sekali saja.
-- =====================================================================

with owner as (
  select id from auth.users where email = 'GANTI-DENGAN-EMAIL-ANDA@contoh.com'  -- owner_email
),
cats as (
  insert into public.categories (user_id, name, color, icon, sort_order)
  select owner.id, v.name, v.color, v.icon, v.ord
    from owner
   cross join (values
     ('Jurnal PBM', 'biru',   'journal-bookmark', 0),
     ('Nautika',    'teal',   'compass',          1),
     ('Sekolah',    'oranye', 'building',         2),
     ('Keuangan',   'ungu',   'cash-stack',       3)
   ) as v(name, color, icon, ord)
  returning id, name, user_id
)
insert into public.links (user_id, category_id, name, url, icon, note, is_favorite, sort_order)
select cats.user_id, cats.id, v.name, v.url, v.icon, v.note, v.fav, v.ord
  from (values
    ('Jurnal PBM', 'Desain Aplikasi Jurnal PBM',   'https://claude.ai/code/artifact/c0380bff-1976-4906-b83f-a7fee30c140b', 'journal-text',       'Tampilan utama',        true,  0),
    ('Jurnal PBM', 'Desain Login Jurnal PBM',      'https://claude.ai/code/artifact/a62f0fb9-03a2-4d46-ac5a-c47ddfc3ca7e', 'box-arrow-in-right', '',                      false, 1),
    ('Jurnal PBM', 'Panduan Peralihan Jurnal PBM', 'https://claude.ai/code/artifact/b83893c2-442d-41f4-a671-8a46d3e08ed9', 'signpost-split',     '',                      false, 2),
    ('Nautika',    'Bahari: Navigasi, Olah Gerak & Kepelautan', 'https://claude.ai/code/artifact/edf9bbc2-324b-47f4-898f-4ce833157187', 'compass',  '',                      false, 0),
    ('Nautika',    'Bahari: Navigasi & Perencanaan Pelayaran',  'https://claude.ai/code/artifact/1a018397-8267-435d-b7a4-d02a2c0f1794', 'map',      '',                      false, 1),
    ('Nautika',    'Simulator Radar ARPA',         'https://claude.ai/code/artifact/eab92d47-ac81-4ceb-9171-4cec2d2120df', 'broadcast',          'Latihan dan penilaian', true,  2),
    ('Nautika',    'Simulator Radar Kapal',        'https://claude.ai/code/artifact/aff648d7-a285-483c-85d4-7e8853291e38', 'broadcast-pin',      '',                      false, 3),
    ('Nautika',    'Simulasi Kompas Kapal',        'https://claude.ai/code/artifact/d93b1e32-52f0-46c4-972f-fd67471b4067', 'compass-fill',       '',                      false, 4),
    ('Sekolah',    'Mockup Web Sekolah',           'https://claude.ai/code/artifact/49bf009e-ecc0-4f1f-8a17-1d938076d40b', 'building',           '',                      false, 0),
    ('Sekolah',    'Mock Tanda Seri Kehadiran Harian', 'https://claude.ai/code/artifact/06cfbf12-0be6-4713-a24f-7cdf3348179e', 'calendar-check', '',                      false, 1),
    ('Keuangan',   'Mockup Aplikasi BKU Dana Revitalisasi', 'https://claude.ai/code/artifact/e29f0dbb-e5ce-4ed0-be14-4436a0e5cd72', 'cash-coin', '',                     true,  0)
  ) as v(cat, name, url, icon, note, fav, ord)
  join cats on cats.name = v.cat;

-- Periksa hasil: harus 4 kategori dan 11 link
select (select count(*) from public.categories) as kategori,
       (select count(*) from public.links)      as link;

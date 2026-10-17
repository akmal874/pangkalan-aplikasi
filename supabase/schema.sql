-- =====================================================================
-- Pangkalan Aplikasi: skema database Supabase
-- Jalankan sekali di Supabase → SQL Editor → New query → Run.
-- Aman dijalankan ulang (memakai "if not exists" / "or replace").
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Tabel kategori
-- ---------------------------------------------------------------------
create table if not exists public.categories (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (char_length(name) between 1 and 40),
  color       text not null default 'abu'
              check (color in ('biru', 'teal', 'oranye', 'ungu', 'merah', 'hijau', 'langit', 'abu')),
  icon        text not null default 'folder2' check (icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- Nama kategori tidak boleh kembar (huruf besar/kecil dianggap sama)
create unique index if not exists categories_user_name_key
  on public.categories (user_id, lower(name));

-- ---------------------------------------------------------------------
-- 2. Tabel link
-- ---------------------------------------------------------------------
create table if not exists public.links (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,
  category_id  uuid references public.categories (id) on delete set null,  -- kategori dihapus → link jadi "Tanpa kategori"
  name         text not null check (char_length(name) between 1 and 80),
  url          text not null check (url ~* '^https?://'),                  -- menolak javascript:, data:, dll.
  icon         text not null default 'app' check (icon ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  note         text not null default '' check (char_length(note) <= 120),
  is_favorite  boolean not null default false,
  is_private   boolean not null default false,                            -- true = hanya tampil setelah masuk
  sort_order   integer not null default 0,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists links_user_category_order_idx
  on public.links (user_id, category_id, sort_order);

-- updated_at diperbarui otomatis setiap kali baris diubah
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists links_set_updated_at on public.links;
create trigger links_set_updated_at
  before update on public.links
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------
-- 3. Row Level Security
--    - Siapa saja (termasuk tamu tanpa login) boleh MEMBACA kategori dan link publik.
--    - Link privat hanya terbaca oleh pemiliknya.
--    - Menambah, mengubah, menghapus hanya untuk pemilik baris.
--    PENTING: matikan pendaftaran akun baru di Authentication agar hanya Anda yang punya akun.
-- ---------------------------------------------------------------------
alter table public.categories enable row level security;
alter table public.links      enable row level security;

grant select on public.categories, public.links to anon;
grant select, insert, update, delete on public.categories, public.links to authenticated;

-- Kategori
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to anon, authenticated
  using (true);

drop policy if exists categories_insert on public.categories;
create policy categories_insert on public.categories
  for insert to authenticated
  with check (user_id = (select auth.uid()));

drop policy if exists categories_update on public.categories;
create policy categories_update on public.categories
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

drop policy if exists categories_delete on public.categories;
create policy categories_delete on public.categories
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Link
drop policy if exists links_select on public.links;
create policy links_select on public.links
  for select to anon, authenticated
  using (is_private = false or user_id = (select auth.uid()));

-- Link hanya boleh masuk ke kategori milik sendiri (atau tanpa kategori)
drop policy if exists links_insert on public.links;
create policy links_insert on public.links
  for insert to authenticated
  with check (
    user_id = (select auth.uid())
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid())))
  );

drop policy if exists links_update on public.links;
create policy links_update on public.links
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (
    user_id = (select auth.uid())
    and (category_id is null or exists (
      select 1 from public.categories c where c.id = category_id and c.user_id = (select auth.uid())))
  );

drop policy if exists links_delete on public.links;
create policy links_delete on public.links
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------
-- 4. Fungsi untuk menyimpan urutan hasil seret dalam satu panggilan
--    security invoker = tetap tunduk pada RLS (hanya baris milik sendiri yang berubah)
-- ---------------------------------------------------------------------
create or replace function public.reorder_links(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.links l
     set sort_order = x.ord - 1
    from unnest(p_ids) with ordinality as x(id, ord)
   where l.id = x.id
     and l.user_id = (select auth.uid());
$$;

create or replace function public.reorder_categories(p_ids uuid[])
returns void
language sql
security invoker
set search_path = ''
as $$
  update public.categories c
     set sort_order = x.ord - 1
    from unnest(p_ids) with ordinality as x(id, ord)
   where c.id = x.id
     and c.user_id = (select auth.uid());
$$;

revoke execute on function public.reorder_links(uuid[])      from public, anon;
revoke execute on function public.reorder_categories(uuid[]) from public, anon;
grant  execute on function public.reorder_links(uuid[])      to authenticated;
grant  execute on function public.reorder_categories(uuid[]) to authenticated;

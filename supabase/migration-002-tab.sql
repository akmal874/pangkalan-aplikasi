-- =====================================================================
-- Pangkalan Aplikasi: perubahan 002 (dua tab: Aplikasi Saya & Link Lain)
-- Untuk database yang SUDAH berjalan. Jalankan sekali di SQL Editor.
-- Data yang ada tidak hilang: semua kategori lama otomatis masuk tab "Aplikasi Saya".
-- Aman dijalankan ulang.
-- =====================================================================

-- 1. Kolom tab di kategori ('apps' = Aplikasi Saya, 'links' = Link Lain)
alter table public.categories
  add column if not exists tab text not null default 'apps';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'categories_tab_check') then
    alter table public.categories add constraint categories_tab_check check (tab in ('apps', 'links'));
  end if;
end $$;

-- 2. Pengaturan pemilik (satu baris per akun)
create table if not exists public.settings (
  user_id            uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  links_tab_private  boolean not null default false,     -- true = tab Link Lain hanya terlihat oleh pemilik
  updated_at         timestamptz not null default now()
);

alter table public.settings enable row level security;
grant select on public.settings to anon;
grant select, insert, update on public.settings to authenticated;

drop policy if exists settings_select on public.settings;
create policy settings_select on public.settings
  for select to anon, authenticated using (true);

drop policy if exists settings_insert on public.settings;
create policy settings_insert on public.settings
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists settings_update on public.settings;
create policy settings_update on public.settings
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- 3. Fungsi bantu untuk aturan RLS.
--    security definer: membaca kategori & pengaturan tanpa terhalang RLS,
--    sehingga keputusan "sembunyikan atau tidak" selalu tepat untuk tamu.
create or replace function public.links_tab_private_for(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((select s.links_tab_private from public.settings s where s.user_id = p_user), false);
$$;

create or replace function public.link_in_private_tab(p_category uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.categories c
      join public.settings s on s.user_id = c.user_id
     where c.id = p_category
       and c.tab = 'links'
       and s.links_tab_private
  );
$$;

revoke execute on function public.links_tab_private_for(uuid) from public;
revoke execute on function public.link_in_private_tab(uuid)    from public;
grant  execute on function public.links_tab_private_for(uuid) to anon, authenticated;
grant  execute on function public.link_in_private_tab(uuid)    to anon, authenticated;

-- 4. Aturan baca baru
--    Kategori: tamu tidak melihat kategori tab Link Lain jika tab itu privat.
drop policy if exists categories_select on public.categories;
create policy categories_select on public.categories
  for select to anon, authenticated
  using (
    user_id = (select auth.uid())
    or tab = 'apps'
    or not public.links_tab_private_for(user_id)
  );

--    Link: tamu tidak melihat link privat, maupun link di tab Link Lain yang diprivatkan.
drop policy if exists links_select on public.links;
create policy links_select on public.links
  for select to anon, authenticated
  using (
    user_id = (select auth.uid())
    or (is_private = false and (category_id is null or not public.link_in_private_tab(category_id)))
  );

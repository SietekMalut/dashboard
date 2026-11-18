-- Media Monitoring Dashboard — Supabase schema
-- Jalankan sekali di Supabase → SQL Editor → New query → Run.
-- Aman dijalankan ulang (idempotent).

-- 1. Satu profil per akun. Menyimpan status persetujuan dan peran.
create table if not exists public.profiles (
    id uuid primary key references auth.users(id) on delete cascade,
    username text not null unique,
    role text not null default 'user' check (role in ('user', 'super_admin')),
    approved boolean not null default false,
    created_at timestamptz not null default now()
);

-- 2. Satu dokumen state dashboard per akun (seluruh dashboard + widget + layout).
create table if not exists public.user_dashboards (
    user_id uuid primary key references auth.users(id) on delete cascade,
    state jsonb not null default '{}'::jsonb,
    updated_at timestamptz not null default now()
);

-- 3. Buat profil otomatis saat akun didaftarkan. username diambil dari metadata
--    yang dikirim aplikasi (pengguna tidak pernah memasukkan email).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
    insert into public.profiles (id, username)
    values (
        new.id,
        coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1))
    );
    return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
    after insert on auth.users
    for each row execute function public.handle_new_user();

-- 4. Cek super admin. SECURITY DEFINER mencegah RLS profiles menjadi rekursif.
create or replace function public.is_super_admin()
returns boolean
language sql
security definer set search_path = public
stable
as $$
    select exists (
        select 1 from public.profiles
        where id = auth.uid() and role = 'super_admin'
    );
$$;

-- 5. Menjaga updated_at.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists user_dashboards_touch on public.user_dashboards;
create trigger user_dashboards_touch
    before update on public.user_dashboards
    for each row execute function public.touch_updated_at();

-- 6. Row Level Security.
alter table public.profiles enable row level security;
alter table public.user_dashboards enable row level security;

-- Profil: akun hanya melihat dirinya sendiri; super admin melihat semua.
drop policy if exists "profiles read" on public.profiles;
create policy "profiles read" on public.profiles
    for select using (id = auth.uid() or public.is_super_admin());

-- Hanya super admin yang boleh menyetujui/menolak dan mengubah peran.
drop policy if exists "profiles admin update" on public.profiles;
create policy "profiles admin update" on public.profiles
    for update
    using (public.is_super_admin())
    with check (public.is_super_admin());

-- Tidak ada policy insert/delete untuk profiles: dibuat trigger, tidak oleh klien.

-- Dashboard state: hanya pemiliknya.
drop policy if exists "dashboards own select" on public.user_dashboards;
create policy "dashboards own select" on public.user_dashboards
    for select using (user_id = auth.uid());

drop policy if exists "dashboards own insert" on public.user_dashboards;
create policy "dashboards own insert" on public.user_dashboards
    for insert with check (user_id = auth.uid());

drop policy if exists "dashboards own update" on public.user_dashboards;
create policy "dashboards own update" on public.user_dashboards
    for update
    using (user_id = auth.uid())
    with check (user_id = auth.uid());

-- 7. Hak akses untuk peran `authenticated` (akun yang sudah login).
grant usage on schema public to authenticated;
grant select, update on public.profiles to authenticated;
grant select, insert, update on public.user_dashboards to authenticated;
grant execute on function public.is_super_admin() to authenticated;

-- Selesai. Lanjutkan panduan di supabase/SETUP.md untuk mengaktifkan login
-- dan menunjuk super admin pertama.

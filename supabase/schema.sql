-- flipmuch — Supabase schema
-- Run this once in the Supabase SQL editor (Project > SQL Editor > New query).

-- ============ profiles ============
-- One row per auth user. Created automatically by the trigger below.
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  role text not null default 'subscriber' check (role in ('subscriber', 'admin')),
  stripe_customer_id text,
  subscription_status text not null default 'inactive' check (subscription_status in ('inactive', 'active', 'trialing', 'past_due')),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();


-- ============ deals ============
-- One row per saved deal analysis. data is the same JSON shape the
-- calculator already exports/imports (collectIds() + rule + comps).
create table if not exists public.deals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Untitled deal',
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.deals enable row level security;

create policy "deals_select_own" on public.deals
  for select using (auth.uid() = user_id);

create policy "deals_insert_own" on public.deals
  for insert with check (auth.uid() = user_id);

create policy "deals_update_own" on public.deals
  for update using (auth.uid() = user_id);

create policy "deals_delete_own" on public.deals
  for delete using (auth.uid() = user_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists deals_set_updated_at on public.deals;
create trigger deals_set_updated_at
  before update on public.deals
  for each row execute procedure public.set_updated_at();


-- ============ program_params ============
-- Single global row holding the Fix & Flip underwriting matrix (rates,
-- points, leverage caps, overlays, fee schedule, etc). Every signed-in
-- subscriber can read it; only an admin-role profile can write it.
create table if not exists public.program_params (
  id int primary key default 1,
  data jsonb not null default '{}'::jsonb,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now(),
  constraint program_params_singleton check (id = 1)
);

alter table public.program_params enable row level security;

create policy "program_params_select_authenticated" on public.program_params
  for select using (auth.role() = 'authenticated');

create policy "program_params_upsert_admin" on public.program_params
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "program_params_update_admin" on public.program_params
  for update using (
    exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- Seed the single row so the app always has something to read.
insert into public.program_params (id, data)
values (1, '{}'::jsonb)
on conflict (id) do nothing;

-- To promote a user to admin after they sign up, run:
--   update public.profiles set role = 'admin' where email = 'you@example.com';

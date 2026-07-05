-- Run this in Supabase SQL Editor to enable pre-release household sharing.
-- TODO before release: use authenticated, member-scoped policies instead of anon write access.

create table if not exists public.household_snapshots (
  household_id text primary key,
  snapshot jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by text,
  created_at timestamptz not null default now(),
  constraint household_snapshots_household_id_check check (
    household_id ~ '^NYAN-[A-Z2-9]{4}-[A-Z2-9]{4}$'
  ),
  constraint household_snapshots_snapshot_check check (
    jsonb_typeof(snapshot) = 'object'
  )
);

alter table public.household_snapshots enable row level security;

drop policy if exists "Anon household snapshot read" on public.household_snapshots;
create policy "Anon household snapshot read"
on public.household_snapshots for select
using (true);

drop policy if exists "Anon household snapshot create" on public.household_snapshots;
create policy "Anon household snapshot create"
on public.household_snapshots for insert
with check (true);

drop policy if exists "Anon household snapshot update" on public.household_snapshots;
create policy "Anon household snapshot update"
on public.household_snapshots for update
using (true)
with check (true);

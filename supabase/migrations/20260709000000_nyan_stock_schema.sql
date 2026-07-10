-- Consolidated SQL for manual Supabase SQL Editor setup.
-- Generated from the previously split migration files in timestamp order.
-- Keep this file as the single source for database schema changes while using SQL Editor manually.

-- ============================================================================
-- Source: 20260705000000_icon_storage.sql
-- ============================================================================

-- Icon storage for cat and product icons.
-- The mobile app uploads compressed 160px JPEG icons to the public `icons` bucket.
--
-- For the current local-first app without account login, anon uploads are enabled.
-- When family sharing/account auth is introduced, replace the anon write policy with
-- owner-scoped authenticated policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('icons', 'icons', true, 102400, array['image/jpeg'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public icon read" on storage.objects;
create policy "Public icon read"
on storage.objects for select
using (bucket_id = 'icons');

drop policy if exists "Anon icon upload" on storage.objects;
create policy "Anon icon upload"
on storage.objects for insert
with check (
  bucket_id = 'icons'
  and lower((storage.foldername(name))[1]) in ('cats', 'products')
);

create table if not exists public.icon_references (
  owner_kind text not null,
  owner_id text not null,
  bucket_id text not null default 'icons',
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_kind, owner_id),
  constraint icon_references_owner_kind_check check (owner_kind in ('cat', 'inventory_item')),
  constraint icon_references_bucket_check check (bucket_id = 'icons'),
  constraint icon_references_storage_path_check check (
    lower((storage.foldername(storage_path))[1]) in ('cats', 'products')
  )
);

alter table public.icon_references enable row level security;

drop policy if exists "Anon icon reference upsert" on public.icon_references;
create policy "Anon icon reference upsert"
on public.icon_references for insert
with check (bucket_id = 'icons');

drop policy if exists "Anon icon reference update" on public.icon_references;
create policy "Anon icon reference update"
on public.icon_references for update
using (bucket_id = 'icons')
with check (bucket_id = 'icons');

drop policy if exists "Anon icon reference delete" on public.icon_references;
create policy "Anon icon reference delete"
on public.icon_references for delete
using (bucket_id = 'icons');

drop policy if exists "Anon icon reference read" on public.icon_references;
create policy "Anon icon reference read"
on public.icon_references for select
using (bucket_id = 'icons');

drop policy if exists "Anon icon update" on storage.objects;
create policy "Anon icon update"
on storage.objects for update
using (
  bucket_id = 'icons'
  and lower((storage.foldername(name))[1]) in ('cats', 'products')
)
with check (
  bucket_id = 'icons'
  and lower((storage.foldername(name))[1]) in ('cats', 'products')
);

-- ============================================================================
-- Source: 20260705001000_household_snapshots.sql
-- ============================================================================

-- Shared household inventory snapshots.
-- This enables pre-release sharing by code between accounts/devices.
--
-- TODO before release: replace anon read/write policies with authenticated,
-- member-scoped RLS. Shared codes should become invitations, not long-lived
-- write credentials.

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

-- ============================================================================
-- Source: 20260705002000_household_normalized_sync.sql
-- ============================================================================

-- Normalized household sync tables.
-- These tables allow row-level updates and Supabase Realtime subscriptions for
-- cats, inventory items, and purchase history.
--
-- The payload columns intentionally keep the mobile app's current TypeScript
-- shape stable while moving storage from one large snapshot into per-record
-- rows.
--
-- TODO before release: replace anon policies with authenticated household
-- membership policies. Shared codes should become invitations.

create table if not exists public.households (
  household_id text primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint households_household_id_check check (
    household_id ~ '^NYAN-[A-Z2-9]{4}-[A-Z2-9]{4}$'
  )
);

create table if not exists public.household_cats (
  id text not null,
  household_id text not null references public.households(household_id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (household_id, id),
  constraint household_cats_payload_check check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.household_inventory_items (
  id text not null,
  household_id text not null references public.households(household_id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (household_id, id),
  constraint household_inventory_items_payload_check check (jsonb_typeof(payload) = 'object')
);

create table if not exists public.household_purchase_history (
  id text not null,
  household_id text not null references public.households(household_id) on delete cascade,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text,
  primary key (household_id, id),
  constraint household_purchase_history_payload_check check (jsonb_typeof(payload) = 'object')
);

alter table public.household_cats
drop constraint if exists household_cats_pkey;

alter table public.household_cats
add constraint household_cats_pkey primary key (household_id, id);

alter table public.household_inventory_items
drop constraint if exists household_inventory_items_pkey;

alter table public.household_inventory_items
add constraint household_inventory_items_pkey primary key (household_id, id);

alter table public.household_purchase_history
drop constraint if exists household_purchase_history_pkey;

alter table public.household_purchase_history
add constraint household_purchase_history_pkey primary key (household_id, id);

create index if not exists household_cats_household_id_updated_at_idx
on public.household_cats (household_id, updated_at desc);

create index if not exists household_inventory_items_household_id_updated_at_idx
on public.household_inventory_items (household_id, updated_at desc);

create index if not exists household_purchase_history_household_id_updated_at_idx
on public.household_purchase_history (household_id, updated_at desc);

alter table public.households enable row level security;
alter table public.household_cats enable row level security;
alter table public.household_inventory_items enable row level security;
alter table public.household_purchase_history enable row level security;

drop policy if exists "Anon households read" on public.households;
create policy "Anon households read"
on public.households for select
using (true);

drop policy if exists "Anon households create" on public.households;
create policy "Anon households create"
on public.households for insert
with check (true);

drop policy if exists "Anon households update" on public.households;
create policy "Anon households update"
on public.households for update
using (true)
with check (true);

drop policy if exists "Anon household cats read" on public.household_cats;
create policy "Anon household cats read"
on public.household_cats for select
using (true);

drop policy if exists "Anon household cats create" on public.household_cats;
create policy "Anon household cats create"
on public.household_cats for insert
with check (true);

drop policy if exists "Anon household cats update" on public.household_cats;
create policy "Anon household cats update"
on public.household_cats for update
using (true)
with check (true);

drop policy if exists "Anon household cats delete" on public.household_cats;
create policy "Anon household cats delete"
on public.household_cats for delete
using (true);

drop policy if exists "Anon household inventory read" on public.household_inventory_items;
create policy "Anon household inventory read"
on public.household_inventory_items for select
using (true);

drop policy if exists "Anon household inventory create" on public.household_inventory_items;
create policy "Anon household inventory create"
on public.household_inventory_items for insert
with check (true);

drop policy if exists "Anon household inventory update" on public.household_inventory_items;
create policy "Anon household inventory update"
on public.household_inventory_items for update
using (true)
with check (true);

drop policy if exists "Anon household inventory delete" on public.household_inventory_items;
create policy "Anon household inventory delete"
on public.household_inventory_items for delete
using (true);

drop policy if exists "Anon household purchase history read" on public.household_purchase_history;
create policy "Anon household purchase history read"
on public.household_purchase_history for select
using (true);

drop policy if exists "Anon household purchase history create" on public.household_purchase_history;
create policy "Anon household purchase history create"
on public.household_purchase_history for insert
with check (true);

drop policy if exists "Anon household purchase history update" on public.household_purchase_history;
create policy "Anon household purchase history update"
on public.household_purchase_history for update
using (true)
with check (true);

drop policy if exists "Anon household purchase history delete" on public.household_purchase_history;
create policy "Anon household purchase history delete"
on public.household_purchase_history for delete
using (true);

alter table public.households replica identity full;
alter table public.household_cats replica identity full;
alter table public.household_inventory_items replica identity full;
alter table public.household_purchase_history replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.households;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.household_cats;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.household_inventory_items;
exception
  when duplicate_object then null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.household_purchase_history;
exception
  when duplicate_object then null;
end $$;

-- ============================================================================
-- Source: 20260705003000_household_auth_members.sql
-- ============================================================================

alter table public.households
  add column if not exists invite_code text,
  add column if not exists created_by uuid references auth.users(id) on delete set null;

update public.households
set invite_code = household_id
where invite_code is null;

alter table public.households
  alter column invite_code set not null;

create unique index if not exists households_invite_code_key
  on public.households (invite_code);

create table if not exists public.household_members (
  household_id text not null references public.households(household_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'member')),
  joined_at timestamptz not null default now(),
  primary key (household_id, user_id)
);

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_cats enable row level security;
alter table public.household_inventory_items enable row level security;
alter table public.household_purchase_history enable row level security;

create or replace function public.is_household_member(p_household_id text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members members
    where members.household_id = p_household_id
      and members.user_id = auth.uid()
  );
$$;

drop policy if exists "households are readable by anon" on public.households;
drop policy if exists "households are insertable by anon" on public.households;
drop policy if exists "households are updatable by anon" on public.households;
drop policy if exists "household cats are readable by anon" on public.household_cats;
drop policy if exists "household cats are writable by anon" on public.household_cats;
drop policy if exists "household cats are deletable by anon" on public.household_cats;
drop policy if exists "household inventory is readable by anon" on public.household_inventory_items;
drop policy if exists "household inventory is writable by anon" on public.household_inventory_items;
drop policy if exists "household inventory is deletable by anon" on public.household_inventory_items;
drop policy if exists "household purchase history is readable by anon" on public.household_purchase_history;
drop policy if exists "household purchase history is writable by anon" on public.household_purchase_history;
drop policy if exists "household purchase history is deletable by anon" on public.household_purchase_history;

drop policy if exists "household members can read households" on public.households;
drop policy if exists "household members can update households" on public.households;
drop policy if exists "household members can read memberships" on public.household_members;
drop policy if exists "household members can read cats" on public.household_cats;
drop policy if exists "household members can write cats" on public.household_cats;
drop policy if exists "household members can update cats" on public.household_cats;
drop policy if exists "household members can delete cats" on public.household_cats;
drop policy if exists "household members can read inventory" on public.household_inventory_items;
drop policy if exists "household members can write inventory" on public.household_inventory_items;
drop policy if exists "household members can update inventory" on public.household_inventory_items;
drop policy if exists "household members can delete inventory" on public.household_inventory_items;
drop policy if exists "household members can read purchase history" on public.household_purchase_history;
drop policy if exists "household members can write purchase history" on public.household_purchase_history;
drop policy if exists "household members can update purchase history" on public.household_purchase_history;
drop policy if exists "household members can delete purchase history" on public.household_purchase_history;

create policy "household members can read households"
  on public.households for select
  using (public.is_household_member(household_id));

create policy "household members can update households"
  on public.households for update
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "household members can read memberships"
  on public.household_members for select
  using (public.is_household_member(household_id));

create policy "household members can read cats"
  on public.household_cats for select
  using (public.is_household_member(household_id));

create policy "household members can write cats"
  on public.household_cats for insert
  with check (public.is_household_member(household_id));

create policy "household members can update cats"
  on public.household_cats for update
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "household members can delete cats"
  on public.household_cats for delete
  using (public.is_household_member(household_id));

create policy "household members can read inventory"
  on public.household_inventory_items for select
  using (public.is_household_member(household_id));

create policy "household members can write inventory"
  on public.household_inventory_items for insert
  with check (public.is_household_member(household_id));

create policy "household members can update inventory"
  on public.household_inventory_items for update
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "household members can delete inventory"
  on public.household_inventory_items for delete
  using (public.is_household_member(household_id));

create policy "household members can read purchase history"
  on public.household_purchase_history for select
  using (public.is_household_member(household_id));

create policy "household members can write purchase history"
  on public.household_purchase_history for insert
  with check (public.is_household_member(household_id));

create policy "household members can update purchase history"
  on public.household_purchase_history for update
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

create policy "household members can delete purchase history"
  on public.household_purchase_history for delete
  using (public.is_household_member(household_id));

create or replace function public.create_household_code()
returns text
language plpgsql
volatile
set search_path = public
as $$
declare
  chars constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  code text;
  char_index int;
begin
  loop
    code := '';
    for char_index in 1..8 loop
      code := code || substr(chars, 1 + floor(random() * length(chars))::int, 1);
    end loop;
    code := 'NYAN-' || substr(code, 1, 4) || '-' || substr(code, 5, 4);
    exit when not exists (select 1 from public.households where invite_code = code);
  end loop;
  return code;
end;
$$;

create or replace function public.create_household_with_owner()
returns table (household_id text, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  next_household_id text := gen_random_uuid()::text;
  next_invite_code text := public.create_household_code();
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  insert into public.households (household_id, invite_code, created_by, updated_by)
  values (next_household_id, next_invite_code, current_user_id, current_user_id::text);

  insert into public.household_members (household_id, user_id, role)
  values (next_household_id, current_user_id, 'owner');

  return query select next_household_id, next_invite_code;
end;
$$;

create or replace function public.join_household_by_invite_code(p_invite_code text)
returns table (household_id text, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_code text := upper(regexp_replace(coalesce(p_invite_code, ''), '\s+', '', 'g'));
  target_household_id text;
  target_invite_code text;
  next_role text;
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select households.household_id, households.invite_code
    into target_household_id, target_invite_code
  from public.households households
  where households.invite_code = normalized_code
     or households.household_id = normalized_code
  limit 1;

  if target_household_id is null then
    raise exception 'Household invite code was not found';
  end if;

  select case
    when exists (
      select 1 from public.household_members members
      where members.household_id = target_household_id
    )
    then 'member'
    else 'owner'
  end into next_role;

  insert into public.household_members (household_id, user_id, role)
  values (target_household_id, current_user_id, next_role)
  on conflict (household_id, user_id) do nothing;

  return query select target_household_id, target_invite_code;
end;
$$;

grant execute on function public.create_household_with_owner() to authenticated;
grant execute on function public.join_household_by_invite_code(text) to authenticated;

-- ============================================================================
-- Source: 20260705004000_account_household_auto_sync.sql
-- ============================================================================

create table if not exists public.account_households (
  user_id uuid primary key references auth.users(id) on delete cascade,
  household_id text not null unique references public.households(household_id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.account_households enable row level security;

drop policy if exists "users can read own account household" on public.account_households;

create policy "users can read own account household"
  on public.account_households for select
  using (user_id = auth.uid());

create or replace function public.get_or_create_account_household()
returns table (household_id text, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  existing_household_id text;
  existing_invite_code text;
  next_household_id text := gen_random_uuid()::text;
  next_invite_code text := public.create_household_code();
begin
  if current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select account_households.household_id, households.invite_code
    into existing_household_id, existing_invite_code
  from public.account_households account_households
  join public.households households
    on households.household_id = account_households.household_id
  where account_households.user_id = current_user_id
  limit 1;

  if existing_household_id is not null then
    insert into public.household_members (household_id, user_id, role)
    values (existing_household_id, current_user_id, 'owner')
    on conflict (household_id, user_id) do nothing;

    return query select existing_household_id, existing_invite_code;
    return;
  end if;

  insert into public.households (household_id, invite_code, created_by, updated_by)
  values (next_household_id, next_invite_code, current_user_id, current_user_id::text);

  insert into public.household_members (household_id, user_id, role)
  values (next_household_id, current_user_id, 'owner')
  on conflict (household_id, user_id) do nothing;

  insert into public.account_households (user_id, household_id)
  values (current_user_id, next_household_id)
  on conflict (user_id) do nothing;

  return query select next_household_id, next_invite_code;
end;
$$;

grant execute on function public.get_or_create_account_household() to authenticated;

-- ============================================================================
-- Source: 202607050050_relax_household_id_for_auth_sync.sql
-- ============================================================================

-- Auth-based sync uses an opaque household_id and a separate human-facing invite_code.
-- The original normalized sync migration constrained household_id to the invite-code
-- format, which blocks account households created with gen_random_uuid()::text.

alter table public.households
  drop constraint if exists households_household_id_check;

alter table public.households
  drop constraint if exists households_invite_code_format_check;

alter table public.households
  add constraint households_invite_code_format_check
  check (invite_code ~ '^NYAN-[A-Z2-9]{4}-[A-Z2-9]{4}$')
  not valid;

-- ============================================================================
-- Source: 202607050060_fix_account_household_rpc_ambiguity.sql
-- ============================================================================

-- Avoid PL/pgSQL ambiguity between RETURNS TABLE output columns and table columns.

drop function if exists public.get_or_create_account_household();

create or replace function public.get_or_create_account_household()
returns table (household_id text, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid := auth.uid();
  v_existing_household_id text;
  v_existing_invite_code text;
  v_next_household_id text := gen_random_uuid()::text;
  v_next_invite_code text := public.create_household_code();
begin
  if v_current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select ah.household_id, h.invite_code
    into v_existing_household_id, v_existing_invite_code
  from public.account_households as ah
  join public.households as h
    on h.household_id = ah.household_id
  where ah.user_id = v_current_user_id
  limit 1;

  if v_existing_household_id is not null then
    insert into public.household_members (household_id, user_id, role)
    values (v_existing_household_id, v_current_user_id, 'owner')
    on conflict on constraint household_members_pkey do nothing;

    return query select v_existing_household_id, v_existing_invite_code;
    return;
  end if;

  insert into public.households (household_id, invite_code, created_by, updated_by)
  values (v_next_household_id, v_next_invite_code, v_current_user_id, v_current_user_id::text);

  insert into public.household_members (household_id, user_id, role)
  values (v_next_household_id, v_current_user_id, 'owner')
  on conflict on constraint household_members_pkey do nothing;

  insert into public.account_households (user_id, household_id)
  values (v_current_user_id, v_next_household_id)
  on conflict on constraint account_households_pkey do nothing;

  return query select v_next_household_id, v_next_invite_code;
end;
$$;

grant execute on function public.get_or_create_account_household() to authenticated;

-- ============================================================================
-- Source: 20260706000000_security_hardening_after_initial_sync.sql
-- ============================================================================

-- Security hardening for databases that already applied the initial pre-release
-- sharing/icon migrations.
--
-- This intentionally leaves the historical setup migrations untouched and closes
-- the unsafe policies in-place on an already-provisioned database.

alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.household_snapshots enable row level security;
alter table public.household_cats enable row level security;
alter table public.household_inventory_items enable row level security;
alter table public.household_purchase_history enable row level security;

drop policy if exists "Anon households read" on public.households;
drop policy if exists "Anon households create" on public.households;
drop policy if exists "Anon households update" on public.households;

drop policy if exists "Anon household snapshot read" on public.household_snapshots;
drop policy if exists "Anon household snapshot create" on public.household_snapshots;
drop policy if exists "Anon household snapshot update" on public.household_snapshots;

drop policy if exists "Anon household cats read" on public.household_cats;
drop policy if exists "Anon household cats create" on public.household_cats;
drop policy if exists "Anon household cats update" on public.household_cats;
drop policy if exists "Anon household cats delete" on public.household_cats;

drop policy if exists "Anon household inventory read" on public.household_inventory_items;
drop policy if exists "Anon household inventory create" on public.household_inventory_items;
drop policy if exists "Anon household inventory update" on public.household_inventory_items;
drop policy if exists "Anon household inventory delete" on public.household_inventory_items;

drop policy if exists "Anon household purchase history read" on public.household_purchase_history;
drop policy if exists "Anon household purchase history create" on public.household_purchase_history;
drop policy if exists "Anon household purchase history update" on public.household_purchase_history;
drop policy if exists "Anon household purchase history delete" on public.household_purchase_history;

drop policy if exists "household members can read snapshots" on public.household_snapshots;
drop policy if exists "household members can write snapshots" on public.household_snapshots;
drop policy if exists "household members can update snapshots" on public.household_snapshots;

create policy "household members can read snapshots"
  on public.household_snapshots for select
  using (public.is_household_member(household_id));

create policy "household members can write snapshots"
  on public.household_snapshots for insert
  with check (public.is_household_member(household_id));

create policy "household members can update snapshots"
  on public.household_snapshots for update
  using (public.is_household_member(household_id))
  with check (public.is_household_member(household_id));

drop policy if exists "Anon icon upload" on storage.objects;
drop policy if exists "Anon icon update" on storage.objects;
drop policy if exists "Authenticated icon upload" on storage.objects;
drop policy if exists "Authenticated icon update" on storage.objects;
drop policy if exists "Authenticated icon delete" on storage.objects;

create policy "Authenticated icon upload"
  on storage.objects for insert
  with check (
    bucket_id = 'icons'
    and lower((storage.foldername(name))[1]) in ('cats', 'products')
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "Authenticated icon update"
  on storage.objects for update
  using (
    bucket_id = 'icons'
    and lower((storage.foldername(name))[1]) in ('cats', 'products')
    and (storage.foldername(name))[2] = auth.uid()::text
  )
  with check (
    bucket_id = 'icons'
    and lower((storage.foldername(name))[1]) in ('cats', 'products')
    and (storage.foldername(name))[2] = auth.uid()::text
  );

create policy "Authenticated icon delete"
  on storage.objects for delete
  using (
    bucket_id = 'icons'
    and lower((storage.foldername(name))[1]) in ('cats', 'products')
    and (storage.foldername(name))[2] = auth.uid()::text
  );

alter table public.icon_references
  add column if not exists owner_user_id uuid;

delete from public.icon_references
where owner_user_id is null;

alter table public.icon_references
  alter column owner_user_id set not null;

alter table public.icon_references
  drop constraint if exists icon_references_pkey;

alter table public.icon_references
  add constraint icon_references_pkey primary key (owner_user_id, owner_kind, owner_id);

alter table public.icon_references enable row level security;

drop policy if exists "Anon icon reference upsert" on public.icon_references;
drop policy if exists "Anon icon reference update" on public.icon_references;
drop policy if exists "Anon icon reference delete" on public.icon_references;
drop policy if exists "Anon icon reference read" on public.icon_references;
drop policy if exists "Authenticated icon reference upsert" on public.icon_references;
drop policy if exists "Authenticated icon reference update" on public.icon_references;
drop policy if exists "Authenticated icon reference delete" on public.icon_references;
drop policy if exists "Authenticated icon reference read" on public.icon_references;

create policy "Authenticated icon reference upsert"
  on public.icon_references for insert
  with check (
    owner_user_id = auth.uid()
    and bucket_id = 'icons'
    and (storage.foldername(storage_path))[2] = auth.uid()::text
  );

create policy "Authenticated icon reference update"
  on public.icon_references for update
  using (owner_user_id = auth.uid() and bucket_id = 'icons')
  with check (
    owner_user_id = auth.uid()
    and bucket_id = 'icons'
    and (storage.foldername(storage_path))[2] = auth.uid()::text
  );

create policy "Authenticated icon reference delete"
  on public.icon_references for delete
  using (owner_user_id = auth.uid() and bucket_id = 'icons');

create policy "Authenticated icon reference read"
  on public.icon_references for select
  using (owner_user_id = auth.uid() and bucket_id = 'icons');

-- ============================================================================
-- Source: 20260708000000_product_link_reports.sql
-- ============================================================================

create table if not exists product_link_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  provider text,
  provider_user_id text,
  user_email text,
  household_id text,
  inventory_item_id text not null,
  product_master_id text,
  product_name text not null,
  issue_type text not null check (issue_type in ('purchase_link', 'image', 'variant', 'other')),
  message text,
  image_url text,
  purchase_links jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'closed')),
  created_at timestamptz not null default now()
);

alter table product_link_reports enable row level security;

drop policy if exists "Users can create product link reports" on product_link_reports;
create policy "Users can create product link reports"
  on product_link_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own product link reports" on product_link_reports;
create policy "Users can read own product link reports"
  on product_link_reports
  for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists product_link_reports_user_id_created_at_idx
  on product_link_reports (user_id, created_at desc);

create index if not exists product_link_reports_status_created_at_idx
  on product_link_reports (status, created_at desc);

grant insert, select on public.product_link_reports to authenticated;

-- ============================================================================
-- Source: 20260708000500_support_inquiries.sql
-- ============================================================================

create table if not exists support_inquiries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  provider text,
  provider_user_id text,
  user_email text,
  household_id text,
  message text not null,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'closed')),
  created_at timestamptz not null default now()
);

alter table support_inquiries enable row level security;

drop policy if exists "Users can create support inquiries" on support_inquiries;
create policy "Users can create support inquiries"
  on support_inquiries
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own support inquiries" on support_inquiries;
create policy "Users can read own support inquiries"
  on support_inquiries
  for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists support_inquiries_user_id_created_at_idx
  on support_inquiries (user_id, created_at desc);

create index if not exists support_inquiries_status_created_at_idx
  on support_inquiries (status, created_at desc);

grant insert, select on public.support_inquiries to authenticated;

-- ============================================================================
-- Source: 20260708001000_product_master_suggestions.sql
-- ============================================================================

create table if not exists product_master_suggestions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  provider text,
  provider_user_id text,
  user_email text,
  household_id text,
  inventory_item_id text,
  product_name text not null,
  normalized_product_name text not null,
  category text,
  jan_code text,
  purchase_url text,
  image_url text,
  purchase_links jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

alter table product_master_suggestions enable row level security;

drop policy if exists "Users can create product master suggestions" on product_master_suggestions;
create policy "Users can create product master suggestions"
  on product_master_suggestions
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own product master suggestions" on product_master_suggestions;
create policy "Users can read own product master suggestions"
  on product_master_suggestions
  for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists product_master_suggestions_user_id_created_at_idx
  on product_master_suggestions (user_id, created_at desc);

create index if not exists product_master_suggestions_status_created_at_idx
  on product_master_suggestions (status, created_at desc);

create index if not exists product_master_suggestions_normalized_category_idx
  on product_master_suggestions (normalized_product_name, category);

create or replace view product_master_suggestion_counts as
select
  normalized_product_name,
  category,
  min(product_name) as sample_product_name,
  count(*) as suggestion_count,
  max(created_at) as last_suggested_at,
  array_remove(array_agg(distinct jan_code), null) as jan_codes,
  array_remove(array_agg(distinct purchase_url), null) as purchase_urls
from product_master_suggestions
where status = 'pending'
group by normalized_product_name, category
order by suggestion_count desc, last_suggested_at desc;

grant insert, select on public.product_master_suggestions to authenticated;

-- ============================================================================
-- Source: 20260709000000_fix_join_household_rpc_ambiguity.sql
-- ============================================================================

-- Avoid PL/pgSQL ambiguity between RETURNS TABLE output columns and table columns.

drop function if exists public.join_household_by_invite_code(text);

create or replace function public.join_household_by_invite_code(p_invite_code text)
returns table (household_id text, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid := auth.uid();
  v_normalized_code text := upper(regexp_replace(coalesce(p_invite_code, ''), '\s+', '', 'g'));
  v_target_household_id text;
  v_target_invite_code text;
  v_next_role text;
begin
  if v_current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  select h.household_id, h.invite_code
    into v_target_household_id, v_target_invite_code
  from public.households as h
  where h.invite_code = v_normalized_code
     or h.household_id = v_normalized_code
  limit 1;

  if v_target_household_id is null then
    raise exception 'Household invite code was not found';
  end if;

  select case
    when exists (
      select 1
      from public.household_members as hm
      where hm.household_id = v_target_household_id
    )
    then 'member'
    else 'owner'
  end into v_next_role;

  insert into public.household_members (household_id, user_id, role)
  values (v_target_household_id, v_current_user_id, v_next_role)
  on conflict on constraint household_members_pkey do nothing;

  return query select v_target_household_id, v_target_invite_code;
end;
$$;

grant execute on function public.join_household_by_invite_code(text) to authenticated;

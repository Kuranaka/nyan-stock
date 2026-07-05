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

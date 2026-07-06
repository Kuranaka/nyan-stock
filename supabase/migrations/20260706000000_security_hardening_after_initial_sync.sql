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

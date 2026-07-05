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

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

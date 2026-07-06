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

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

-- Store an optional participant name so household owners can identify members.
alter table public.household_members
  add column if not exists display_name text;

-- Keep the one-argument RPC available to older app versions and add an
-- optional participant name for newer versions.
drop function if exists public.join_household_by_invite_code(text);

create function public.join_household_by_invite_code(
  p_invite_code text,
  p_display_name text default null
)
returns table (household_id text, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid := auth.uid();
  v_normalized_code text := upper(regexp_replace(coalesce(p_invite_code, ''), '\s+', '', 'g'));
  v_display_name text := nullif(trim(coalesce(p_display_name, '')), '');
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
      select 1 from public.household_members as hm where hm.household_id = v_target_household_id
    ) then 'member'
    else 'owner'
  end into v_next_role;

  insert into public.household_members (household_id, user_id, role, display_name)
  values (v_target_household_id, v_current_user_id, v_next_role, v_display_name)
  on conflict on constraint household_members_pkey do update
    set display_name = coalesce(excluded.display_name, public.household_members.display_name);

  return query select v_target_household_id, v_target_invite_code;
end;
$$;

create or replace function public.list_household_members(p_household_id text)
returns table (member_user_id uuid, role text, display_name text, joined_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.household_members as hm
    where hm.household_id = p_household_id and hm.user_id = auth.uid()
  ) then
    raise exception 'Household membership is required';
  end if;

  return query
  select hm.user_id, hm.role, hm.display_name, hm.joined_at
  from public.household_members as hm
  where hm.household_id = p_household_id
  order by case hm.role when 'owner' then 0 else 1 end, hm.joined_at;
end;
$$;

create or replace function public.remove_household_member(
  p_household_id text,
  p_member_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not exists (
    select 1 from public.household_members as hm
    where hm.household_id = p_household_id
      and hm.user_id = auth.uid()
      and hm.role = 'owner'
  ) then
    raise exception 'Only the household owner can remove members';
  end if;

  if p_member_user_id = auth.uid() then
    raise exception 'The household owner cannot remove themselves';
  end if;

  delete from public.household_members
  where household_id = p_household_id
    and user_id = p_member_user_id
    and role <> 'owner';
end;
$$;

grant execute on function public.join_household_by_invite_code(text, text) to authenticated;
grant execute on function public.list_household_members(text) to authenticated;
grant execute on function public.remove_household_member(text, uuid) to authenticated;

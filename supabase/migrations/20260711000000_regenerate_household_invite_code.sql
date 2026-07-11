-- Lets only the owner of a shared space invalidate a leaked invite code and
-- issue a replacement. Existing household members keep their membership.
create or replace function public.regenerate_household_invite_code(p_household_id text)
returns table (household_id text, invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_user_id uuid := auth.uid();
  v_next_invite_code text;
begin
  if v_current_user_id is null then
    raise exception 'Authentication is required';
  end if;

  if not exists (
    select 1
    from public.household_members as hm
    where hm.household_id = p_household_id
      and hm.user_id = v_current_user_id
      and hm.role = 'owner'
  ) then
    raise exception 'Only the household owner can regenerate an invite code';
  end if;

  v_next_invite_code := public.create_household_code();

  update public.households
  set invite_code = v_next_invite_code,
      updated_at = now(),
      updated_by = v_current_user_id::text
  where households.household_id = p_household_id;

  return query select p_household_id, v_next_invite_code;
end;
$$;

grant execute on function public.regenerate_household_invite_code(text) to authenticated;

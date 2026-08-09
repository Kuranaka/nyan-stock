-- Apply related inventory and purchase-history changes in one transaction.
-- The function only mutates explicitly supplied entity IDs, so a stale client
-- cannot remove unrelated rows that another household member added meanwhile.

create or replace function public.apply_household_inventory_mutation(
  p_household_id text,
  p_upsert_inventory_items jsonb default '[]'::jsonb,
  p_delete_inventory_item_ids text[] default '{}'::text[],
  p_upsert_purchase_history jsonb default '[]'::jsonb,
  p_delete_purchase_history_ids text[] default '{}'::text[]
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_user_id uuid := auth.uid();
  mutation_time timestamptz := now();
  entity jsonb;
  entity_id text;
begin
  if current_user_id is null or not public.is_household_member(p_household_id) then
    raise exception 'household membership is required' using errcode = '42501';
  end if;

  if jsonb_typeof(coalesce(p_upsert_inventory_items, '[]'::jsonb)) <> 'array'
    or jsonb_typeof(coalesce(p_upsert_purchase_history, '[]'::jsonb)) <> 'array'
  then
    raise exception 'upsert payloads must be JSON arrays' using errcode = '22023';
  end if;

  delete from public.household_purchase_history
  where household_id = p_household_id
    and id = any(coalesce(p_delete_purchase_history_ids, '{}'::text[]));

  delete from public.household_inventory_items
  where household_id = p_household_id
    and id = any(coalesce(p_delete_inventory_item_ids, '{}'::text[]));

  for entity in
    select value from jsonb_array_elements(coalesce(p_upsert_inventory_items, '[]'::jsonb))
  loop
    entity_id := btrim(coalesce(entity ->> 'id', ''));
    if entity_id = '' then
      raise exception 'inventory item id is required' using errcode = '22023';
    end if;

    insert into public.household_inventory_items (
      id,
      household_id,
      payload,
      updated_at,
      updated_by
    )
    values (
      entity_id,
      p_household_id,
      entity,
      mutation_time,
      current_user_id::text
    )
    on conflict (household_id, id) do update
    set payload = excluded.payload,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
  end loop;

  for entity in
    select value from jsonb_array_elements(coalesce(p_upsert_purchase_history, '[]'::jsonb))
  loop
    entity_id := btrim(coalesce(entity ->> 'id', ''));
    if entity_id = '' then
      raise exception 'purchase history id is required' using errcode = '22023';
    end if;

    insert into public.household_purchase_history (
      id,
      household_id,
      payload,
      updated_at,
      updated_by
    )
    values (
      entity_id,
      p_household_id,
      entity,
      mutation_time,
      current_user_id::text
    )
    on conflict (household_id, id) do update
    set payload = excluded.payload,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by;
  end loop;

  update public.households
  set updated_at = mutation_time,
      updated_by = current_user_id::text
  where household_id = p_household_id;

  if not found then
    raise exception 'household does not exist' using errcode = 'P0002';
  end if;
end;
$$;

revoke all on function public.apply_household_inventory_mutation(
  text,
  jsonb,
  text[],
  jsonb,
  text[]
) from public, anon;

grant execute on function public.apply_household_inventory_mutation(
  text,
  jsonb,
  text[],
  jsonb,
  text[]
) to authenticated;

comment on function public.apply_household_inventory_mutation(
  text,
  jsonb,
  text[],
  jsonb,
  text[]
) is 'Atomically applies explicit household inventory and purchase-history entity mutations.';

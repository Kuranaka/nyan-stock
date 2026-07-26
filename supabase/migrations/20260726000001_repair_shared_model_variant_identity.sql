-- Retailer feeds sometimes expose one series-level model number for multiple
-- JAN-specific SKUs. Older merge code registered both values as strong
-- identities, so a later SKU could attach another JAN to the same variant.
-- Split every affected variant by JAN and retire the ambiguous model identity.

create extension if not exists pgcrypto with schema extensions;

do $$
declare
  conflicted_variant record;
  jan_identity record;
  target_variant_key text;
  proposed_target_variant_id text;
  actual_target_variant_id text;
  actual_target_product_id text;
  representative_capacity_value numeric(14, 4);
  representative_capacity_unit text;
  representative_quantity integer;
  representative_model_number text;
  representative_package_type text;
begin
  for conflicted_variant in
    select
      variant.id,
      variant.product_id,
      variant.status
    from public.product_variants variant
    join public.product_identity_keys identity_key
      on identity_key.variant_id = variant.id
     and identity_key.key_type = 'jan'
    group by variant.id, variant.product_id, variant.status
    having count(distinct identity_key.normalized_value) > 1
    order by variant.id
  loop
    -- A model identity attached to more than one JAN has been proven to be
    -- series-level rather than SKU-level. The value remains on the variant as
    -- metadata, but must no longer participate in identity resolution.
    delete from public.product_identity_keys
    where variant_id = conflicted_variant.id
      and key_type = 'model_number';

    for jan_identity in
      select id, normalized_value
      from public.product_identity_keys
      where variant_id = conflicted_variant.id
        and key_type = 'jan'
      order by normalized_value
    loop
      representative_capacity_value := null;
      representative_capacity_unit := null;
      representative_quantity := null;
      representative_model_number := null;
      representative_package_type := null;

      select
        coalesce(candidate.capacity_value, retailer_link.capacity_value),
        coalesce(candidate.capacity_unit, retailer_link.capacity_unit),
        coalesce(candidate.quantity, retailer_link.quantity),
        coalesce(candidate.model_number, retailer_link.model_number, raw_listing.model_number),
        candidate.package_type
      into
        representative_capacity_value,
        representative_capacity_unit,
        representative_quantity,
        representative_model_number,
        representative_package_type
      from public.product_retailer_listings retailer_link
      join public.product_candidates candidate on candidate.id = retailer_link.candidate_id
      join public.retailer_listings_raw raw_listing on raw_listing.id = candidate.raw_listing_id
      where retailer_link.variant_id = conflicted_variant.id
        and regexp_replace(
          coalesce(
            nullif(candidate.jan_code, ''),
            nullif(retailer_link.jan_code, ''),
            nullif(raw_listing.jan_code, ''),
            ''
          ),
          '\D',
          '',
          'g'
        ) = jan_identity.normalized_value
      order by candidate.confidence desc, candidate.id
      limit 1;

      if not found then
        raise exception 'Cannot split variant %: no retailer listing found for JAN %',
          conflicted_variant.id,
          jan_identity.normalized_value;
      end if;

      target_variant_key := 'identity:jan::' || jan_identity.normalized_value;
      proposed_target_variant_id := 'variant-' || substr(
        encode(extensions.digest(target_variant_key, 'sha256'), 'hex'),
        1,
        24
      );

      insert into public.product_variants (
        id,
        product_id,
        variant_key,
        capacity_value,
        capacity_unit,
        quantity,
        jan_code,
        model_number,
        package_type,
        status,
        updated_at
      ) values (
        proposed_target_variant_id,
        conflicted_variant.product_id,
        target_variant_key,
        representative_capacity_value,
        representative_capacity_unit,
        representative_quantity,
        jan_identity.normalized_value,
        representative_model_number,
        representative_package_type,
        conflicted_variant.status,
        now()
      )
      on conflict (variant_key) do update set
        capacity_value = coalesce(excluded.capacity_value, product_variants.capacity_value),
        capacity_unit = coalesce(excluded.capacity_unit, product_variants.capacity_unit),
        quantity = coalesce(excluded.quantity, product_variants.quantity),
        jan_code = excluded.jan_code,
        model_number = coalesce(excluded.model_number, product_variants.model_number),
        package_type = coalesce(excluded.package_type, product_variants.package_type),
        updated_at = now()
      returning id, product_id into actual_target_variant_id, actual_target_product_id;

      if actual_target_product_id <> conflicted_variant.product_id then
        raise exception 'Cannot split variant %: JAN % already belongs to product %',
          conflicted_variant.id,
          jan_identity.normalized_value,
          actual_target_product_id;
      end if;

      update public.product_identity_keys
      set variant_id = actual_target_variant_id, updated_at = now()
      where id = jan_identity.id;

      update public.product_retailer_listings retailer_link
      set
        variant_id = actual_target_variant_id,
        capacity_value = coalesce(candidate.capacity_value, retailer_link.capacity_value),
        capacity_unit = coalesce(candidate.capacity_unit, retailer_link.capacity_unit),
        quantity = coalesce(candidate.quantity, retailer_link.quantity),
        jan_code = jan_identity.normalized_value,
        model_number = coalesce(candidate.model_number, retailer_link.model_number)
      from public.product_candidates candidate
      join public.retailer_listings_raw raw_listing on raw_listing.id = candidate.raw_listing_id
      where retailer_link.candidate_id = candidate.id
        and retailer_link.variant_id = conflicted_variant.id
        and regexp_replace(
          coalesce(
            nullif(candidate.jan_code, ''),
            nullif(retailer_link.jan_code, ''),
            nullif(raw_listing.jan_code, ''),
            ''
          ),
          '\D',
          '',
          'g'
        ) = jan_identity.normalized_value;
    end loop;
  end loop;

  if exists (
    select 1
    from public.product_identity_keys identity_key
    where identity_key.key_type = 'jan'
    group by identity_key.variant_id
    having count(distinct identity_key.normalized_value) > 1
  ) then
    raise exception 'JAN variant repair left at least one variant with multiple JAN identities';
  end if;
end
$$;

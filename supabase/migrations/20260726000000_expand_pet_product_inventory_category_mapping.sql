-- Keep product-master category filtering aligned with the app's common inventory categories.
-- Rebuild the expression index because it depends on this immutable function.

drop index if exists public.pet_product_masters_published_inventory_category_group_id_idx;

create or replace function public.pet_product_master_inventory_category(
  category_id text,
  subcategory_id text
)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select case
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(therapeutic|medicine)' then 'medicine'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(supplementary_food|milk)' then 'wet_food'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(water_conditioner|dechlorinator|bacteria|algae_control|plant_fertilizer|co2_consumable|aquarium_salt)'
      then 'supplement'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(supplement|vitamin|calcium|mineral|cuttlebone|grit)' then 'supplement'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(treat|jelly|honey)' then 'treat'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(wet_food|semi_moist)' then 'wet_food'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(litter|sheet|sand|bedding|substrate|mat|gravel|soil|leaf_mold)'
      then 'cat_litter'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(food|feed|pellet|timothy|alfalfa|seed|formula|flake|granule|tablet)'
      then 'dry_food'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(care|shampoo|conditioner|deodorizer|grooming|bath|toilet|waste|diaper|wet_tissue|chew_toy|activated_carbon|filter_media|water_test|hydration|humidity|water_replacement|lighting|heat_lamp|kinshi_bottle|spawning_wood)'
      then 'care'
    else 'other'
  end
$$;

create index if not exists pet_product_masters_published_inventory_category_group_id_idx
  on public.pet_product_masters (
    public.pet_product_master_inventory_category(category_id, subcategory_id),
    pet_group,
    id
  )
  where status = 'published';


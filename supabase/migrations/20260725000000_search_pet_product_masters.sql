-- Server-side product-master search with stable keyset pagination.

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
      ~ '(supplement|vitamin|calcium|mineral|cuttlebone|grit)' then 'supplement'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(treat|jelly|honey)' then 'treat'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(wet_food|semi_moist)' then 'wet_food'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(litter|sheet|sand|bedding|substrate|mat|gravel|soil)' then 'cat_litter'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(food|feed|pellet|timothy|alfalfa|seed|formula|flake|granule|tablet)' then 'dry_food'
    when lower(coalesce(category_id, '') || ' ' || coalesce(subcategory_id, ''))
      ~ '(care|shampoo|conditioner|deodorizer|grooming|bath|toilet|waste|diaper)' then 'care'
    else 'other'
  end
$$;

create or replace function public.normalize_pet_product_master_search_text(value text)
returns text
language sql
immutable
parallel safe
set search_path = public
as $$
  select regexp_replace(
    lower(normalize(coalesce(value, ''), NFKC)),
    '[[:space:]\-_/・,，.。()（）\[\]【】]',
    '',
    'g'
  )
$$;

create or replace function public.search_pet_product_masters(
  p_pet_group text default null,
  p_inventory_category text default null,
  p_brand text default null,
  p_keyword_terms text[] default null,
  p_jan_code text default null,
  p_after_id text default null,
  p_limit integer default 11
)
returns table (
  id text,
  data jsonb
)
language sql
stable
security invoker
set search_path = public
as $$
  select master.id, master.data
  from public.pet_product_masters as master
  where master.status = 'published'
    and (p_pet_group is null or master.pet_group = p_pet_group)
    and (
      p_inventory_category is null
      or public.pet_product_master_inventory_category(
        master.category_id,
        master.subcategory_id
      ) = p_inventory_category
    )
    and (p_brand is null or master.brand = p_brand)
    and (p_after_id is null or master.id > p_after_id)
    and (p_jan_code is null or master.jan_code = p_jan_code)
    and (
      coalesce(cardinality(p_keyword_terms), 0) = 0
      or not exists (
        select 1
        from unnest(p_keyword_terms) as term(value)
        where strpos(
          public.normalize_pet_product_master_search_text(
            concat(
              master.normalized_name,
              coalesce(master.brand, ''),
              coalesce(master.jan_code, ''),
              coalesce(master.data ->> 'name', ''),
              coalesce(master.data ->> 'baseProductName', ''),
              coalesce(master.data ->> 'series', '')
            )
          ),
          term.value
        ) = 0
      )
    )
  order by master.id asc
  limit least(greatest(coalesce(p_limit, 11), 1), 101)
$$;

create or replace function public.list_pet_product_master_brands(
  p_pet_group text default null,
  p_inventory_category text default null
)
returns table (
  brand text
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct master.brand
  from public.pet_product_masters as master
  where master.status = 'published'
    and master.brand is not null
    and btrim(master.brand) <> ''
    and (p_pet_group is null or master.pet_group = p_pet_group)
    and (
      p_inventory_category is null
      or public.pet_product_master_inventory_category(
        master.category_id,
        master.subcategory_id
      ) = p_inventory_category
    )
  order by master.brand
$$;

create index if not exists pet_product_masters_published_group_id_idx
  on public.pet_product_masters (pet_group, id)
  where status = 'published';

create index if not exists pet_product_masters_published_group_brand_id_idx
  on public.pet_product_masters (pet_group, brand, id)
  where status = 'published' and brand is not null;

create index if not exists pet_product_masters_published_inventory_category_group_id_idx
  on public.pet_product_masters (
    public.pet_product_master_inventory_category(category_id, subcategory_id),
    pet_group,
    id
  )
  where status = 'published';

grant execute on function public.search_pet_product_masters(
  text,
  text,
  text,
  text[],
  text,
  text,
  integer
) to anon, authenticated;
grant execute on function public.list_pet_product_master_brands(text, text)
  to anon, authenticated;

comment on function public.search_pet_product_masters(
  text,
  text,
  text,
  text[],
  text,
  text,
  integer
) is 'Filters published pet product masters server-side and returns rows after the id cursor.';

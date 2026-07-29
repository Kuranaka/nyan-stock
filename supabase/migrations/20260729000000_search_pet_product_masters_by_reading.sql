-- Include importer-generated Japanese readings in product-master keyword search.

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
              coalesce(master.data ->> 'series', ''),
              coalesce(master.data ->> 'searchReadings', '')
            )
          ),
          term.value
        ) = 0
      )
    )
  order by master.id asc
  limit least(greatest(coalesce(p_limit, 11), 1), 101)
$$;

grant execute on function public.search_pet_product_masters(
  text,
  text,
  text,
  text[],
  text,
  text,
  integer
) to anon, authenticated;

comment on function public.search_pet_product_masters(
  text,
  text,
  text,
  text[],
  text,
  text,
  integer
) is 'Filters published pet product masters by names, Japanese readings, and other server-side criteria.';

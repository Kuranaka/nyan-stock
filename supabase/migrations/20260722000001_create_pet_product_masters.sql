-- Release-oriented, variant-level product master built from the pet catalog.
-- The legacy public.product_masters table remains unchanged.

create table if not exists public.pet_product_masters (
  id text primary key,
  product_id text not null references public.products(id) on delete restrict,
  variant_id text not null unique references public.product_variants(id) on delete restrict,
  pet_group text not null references public.pet_groups(code),
  target_species text[] not null default '{}',
  target_scope text not null,
  category_id text not null,
  subcategory_id text not null,
  normalized_name text not null,
  brand text,
  jan_code text,
  status text not null default 'draft',
  source_locale text not null default 'ja-JP',
  data jsonb not null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint pet_product_masters_target_scope_check
    check (target_scope in ('species_specific', 'multi_species', 'group_wide')),
  constraint pet_product_masters_status_check
    check (status in ('draft', 'published', 'retired')),
  constraint pet_product_masters_locale_check
    check (source_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  constraint pet_product_masters_data_check
    check (jsonb_typeof(data) = 'object'),
  constraint pet_product_masters_category_fk
    foreign key (category_id, subcategory_id)
      references public.pet_subcategories(category_id, id) on delete restrict
);

create index if not exists pet_product_masters_group_category_idx
  on public.pet_product_masters (pet_group, category_id, subcategory_id, status);
create index if not exists pet_product_masters_jan_idx
  on public.pet_product_masters (jan_code) where jan_code is not null;
create index if not exists pet_product_masters_target_species_gin_idx
  on public.pet_product_masters using gin (target_species);
create index if not exists pet_product_masters_name_idx
  on public.pet_product_masters (normalized_name);

alter table public.pet_product_masters enable row level security;

drop policy if exists "published pet product masters are readable" on public.pet_product_masters;
create policy "published pet product masters are readable"
  on public.pet_product_masters
  for select
  to anon, authenticated
  using (status = 'published');

grant select on public.pet_product_masters to anon, authenticated;
grant all on public.pet_product_masters to service_role;

comment on table public.pet_product_masters is
  'Release-facing variant-level pet product master. Separate from the legacy product_masters JSON store.';

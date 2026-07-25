-- Prepare the pet catalog for future localization without changing the
-- current Japanese product-discovery behavior.

alter table public.product_search_queries
  add column if not exists locale text not null default 'ja-JP',
  add column if not exists market_code text not null default 'JP',
  add column if not exists currency_code text not null default 'JPY';

alter table public.retailer_listings_raw
  add column if not exists content_locale text not null default 'ja-JP',
  add column if not exists market_code text not null default 'JP';

alter table public.product_candidates
  add column if not exists source_locale text not null default 'ja-JP';

alter table public.products
  add column if not exists source_locale text not null default 'ja-JP';

alter table public.product_search_queries
  add constraint product_search_queries_locale_check
    check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  add constraint product_search_queries_market_code_check
    check (market_code ~ '^[A-Z]{2}$'),
  add constraint product_search_queries_currency_code_check
    check (currency_code ~ '^[A-Z]{3}$');

alter table public.retailer_listings_raw
  add constraint retailer_listings_raw_content_locale_check
    check (content_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  add constraint retailer_listings_raw_market_code_check
    check (market_code ~ '^[A-Z]{2}$');

alter table public.product_candidates
  add constraint product_candidates_source_locale_check
    check (source_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$');

alter table public.products
  add constraint products_source_locale_check
    check (source_locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$');

create table if not exists public.pet_group_translations (
  pet_group text not null references public.pet_groups(code) on delete cascade,
  locale text not null,
  name text not null,
  source text not null default 'seed',
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pet_group, locale),
  constraint pet_group_translations_locale_check check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  constraint pet_group_translations_name_check check (length(btrim(name)) > 0),
  constraint pet_group_translations_status_check check (status in ('draft', 'reviewed', 'approved'))
);

create table if not exists public.pet_species_translations (
  pet_group text not null,
  species_code text not null,
  locale text not null,
  name text not null,
  source text not null default 'seed',
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pet_group, species_code, locale),
  foreign key (pet_group, species_code) references public.pet_species(pet_group, code) on delete cascade,
  constraint pet_species_translations_locale_check check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  constraint pet_species_translations_name_check check (length(btrim(name)) > 0),
  constraint pet_species_translations_status_check check (status in ('draft', 'reviewed', 'approved'))
);

create table if not exists public.pet_species_group_translations (
  pet_group text not null,
  species_group_code text not null,
  locale text not null,
  name text not null,
  source text not null default 'seed',
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (pet_group, species_group_code, locale),
  foreign key (pet_group, species_group_code)
    references public.pet_species_groups(pet_group, code) on delete cascade,
  constraint pet_species_group_translations_locale_check check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  constraint pet_species_group_translations_name_check check (length(btrim(name)) > 0),
  constraint pet_species_group_translations_status_check check (status in ('draft', 'reviewed', 'approved'))
);

create table if not exists public.pet_brand_translations (
  brand_id text not null references public.pet_brands(id) on delete cascade,
  locale text not null,
  name text not null,
  source text not null default 'seed',
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (brand_id, locale),
  constraint pet_brand_translations_locale_check check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  constraint pet_brand_translations_name_check check (length(btrim(name)) > 0),
  constraint pet_brand_translations_status_check check (status in ('draft', 'reviewed', 'approved'))
);

create table if not exists public.pet_category_translations (
  category_id text not null references public.pet_categories(id) on delete cascade,
  locale text not null,
  name text not null,
  source text not null default 'seed',
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (category_id, locale),
  constraint pet_category_translations_locale_check check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  constraint pet_category_translations_name_check check (length(btrim(name)) > 0),
  constraint pet_category_translations_status_check check (status in ('draft', 'reviewed', 'approved'))
);

create table if not exists public.pet_subcategory_translations (
  category_id text not null,
  subcategory_id text not null,
  locale text not null,
  name text not null,
  source text not null default 'seed',
  status text not null default 'approved',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (category_id, subcategory_id, locale),
  foreign key (category_id, subcategory_id)
    references public.pet_subcategories(category_id, id) on delete cascade,
  constraint pet_subcategory_translations_locale_check check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  constraint pet_subcategory_translations_name_check check (length(btrim(name)) > 0),
  constraint pet_subcategory_translations_status_check check (status in ('draft', 'reviewed', 'approved'))
);

create table if not exists public.product_translations (
  product_id text not null references public.products(id) on delete cascade,
  locale text not null,
  display_name text not null,
  normalized_name text not null,
  base_product_name text not null,
  description text,
  source text not null default 'pipeline',
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (product_id, locale),
  constraint product_translations_locale_check check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  constraint product_translations_display_name_check check (length(btrim(display_name)) > 0),
  constraint product_translations_normalized_name_check check (length(btrim(normalized_name)) > 0),
  constraint product_translations_base_product_name_check check (length(btrim(base_product_name)) > 0),
  constraint product_translations_status_check check (status in ('draft', 'reviewed', 'approved'))
);

insert into public.pet_group_translations (pet_group, locale, name)
select code, 'ja-JP', name_ja from public.pet_groups
on conflict (pet_group, locale) do nothing;
insert into public.pet_group_translations (pet_group, locale, name)
select code, 'en', name_en from public.pet_groups where nullif(btrim(name_en), '') is not null
on conflict (pet_group, locale) do nothing;

insert into public.pet_species_translations (pet_group, species_code, locale, name)
select pet_group, code, 'ja-JP', name_ja from public.pet_species
on conflict (pet_group, species_code, locale) do nothing;
insert into public.pet_species_translations (pet_group, species_code, locale, name)
select pet_group, code, 'en', name_en from public.pet_species where nullif(btrim(name_en), '') is not null
on conflict (pet_group, species_code, locale) do nothing;

insert into public.pet_species_group_translations (pet_group, species_group_code, locale, name)
select pet_group, code, 'ja-JP', name_ja from public.pet_species_groups
on conflict (pet_group, species_group_code, locale) do nothing;
insert into public.pet_species_group_translations (pet_group, species_group_code, locale, name)
select pet_group, code, 'en', name_en from public.pet_species_groups where nullif(btrim(name_en), '') is not null
on conflict (pet_group, species_group_code, locale) do nothing;

insert into public.pet_brand_translations (brand_id, locale, name)
select id, 'ja-JP', name_ja from public.pet_brands
on conflict (brand_id, locale) do nothing;
insert into public.pet_brand_translations (brand_id, locale, name)
select id, 'en', name_en from public.pet_brands where nullif(btrim(name_en), '') is not null
on conflict (brand_id, locale) do nothing;

insert into public.pet_category_translations (category_id, locale, name)
select id, 'ja-JP', name_ja from public.pet_categories
on conflict (category_id, locale) do nothing;
insert into public.pet_category_translations (category_id, locale, name)
select id, 'en', name_en from public.pet_categories where nullif(btrim(name_en), '') is not null
on conflict (category_id, locale) do nothing;

insert into public.pet_subcategory_translations (category_id, subcategory_id, locale, name)
select category_id, id, 'ja-JP', name_ja from public.pet_subcategories
on conflict (category_id, subcategory_id, locale) do nothing;
insert into public.pet_subcategory_translations (category_id, subcategory_id, locale, name)
select category_id, id, 'en', name_en from public.pet_subcategories where nullif(btrim(name_en), '') is not null
on conflict (category_id, subcategory_id, locale) do nothing;

insert into public.product_translations (
  product_id, locale, display_name, normalized_name, base_product_name, source, status
)
select id, source_locale, base_product_name, normalized_name, base_product_name, 'migration', 'draft'
from public.products
on conflict (product_id, locale) do nothing;

create index if not exists product_search_queries_market_locale_idx
  on public.product_search_queries (market_code, locale, enabled, priority desc);
create index if not exists retailer_listings_raw_market_locale_idx
  on public.retailer_listings_raw (market_code, content_locale, fetched_at desc);
create index if not exists product_translations_locale_name_idx
  on public.product_translations (locale, normalized_name);

alter table public.pet_group_translations enable row level security;
alter table public.pet_species_translations enable row level security;
alter table public.pet_species_group_translations enable row level security;
alter table public.pet_brand_translations enable row level security;
alter table public.pet_category_translations enable row level security;
alter table public.pet_subcategory_translations enable row level security;
alter table public.product_translations enable row level security;

grant all on public.pet_group_translations to service_role;
grant all on public.pet_species_translations to service_role;
grant all on public.pet_species_group_translations to service_role;
grant all on public.pet_brand_translations to service_role;
grant all on public.pet_category_translations to service_role;
grant all on public.pet_subcategory_translations to service_role;
grant all on public.product_translations to service_role;

comment on column public.products.source_locale is
  'Locale of the compatibility name columns. Product identity and canonical_key remain language-independent.';
comment on table public.product_translations is
  'Localized product display text. Not used by the current Japanese-only application yet.';

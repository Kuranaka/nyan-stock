-- Multi-pet product discovery pipeline.
--
-- This is intentionally separate from the legacy JSONB `product_masters`
-- table. Retailer results must pass through raw storage, normalization and
-- review before an adapter may publish them to the mobile product master.

create table if not exists public.pet_groups (
  code text primary key,
  name_ja text not null,
  name_en text not null,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  constraint pet_groups_code_check check (
    code in ('cat', 'dog', 'rabbit', 'small_animal', 'bird', 'aquarium', 'reptile_amphibian', 'insect')
  )
);

create table if not exists public.pet_species (
  pet_group text not null references public.pet_groups(code),
  code text not null,
  parent_species_code text,
  name_ja text not null,
  name_en text not null,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  primary key (pet_group, code),
  foreign key (pet_group, parent_species_code)
    references public.pet_species(pet_group, code)
    deferrable initially deferred
);

create table if not exists public.pet_species_groups (
  pet_group text not null references public.pet_groups(code),
  code text not null,
  name_ja text not null,
  name_en text not null,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  primary key (pet_group, code)
);

create table if not exists public.pet_brands (
  id text primary key,
  name_ja text not null,
  name_en text,
  manufacturer text,
  normalized_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (normalized_name)
);

create table if not exists public.pet_categories (
  id text primary key,
  name_ja text not null,
  name_en text not null,
  sort_order integer not null default 0,
  enabled boolean not null default true
);

create table if not exists public.pet_subcategories (
  id text not null,
  category_id text not null references public.pet_categories(id),
  name_ja text not null,
  name_en text not null,
  sort_order integer not null default 0,
  enabled boolean not null default true,
  primary key (category_id, id)
);

create table if not exists public.product_search_queries (
  id text primary key,
  pet_group text not null references public.pet_groups(code),
  target_species text,
  target_species_group text,
  category_id text not null,
  subcategory_id text not null,
  keyword text not null,
  negative_keywords text[] not null default '{}',
  rakuten_genre_id text,
  yahoo_genre_category_id text,
  yahoo_brand_id text,
  priority integer not null default 100,
  enabled boolean not null default true,
  max_pages integer not null default 1,
  last_searched_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (pet_group, target_species)
    references public.pet_species(pet_group, code),
  foreign key (pet_group, target_species_group)
    references public.pet_species_groups(pet_group, code),
  constraint product_search_queries_max_pages_check check (max_pages between 1 and 100),
  constraint product_search_queries_keyword_check check (length(btrim(keyword)) > 0)
);

create table if not exists public.retailer_listings_raw (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_item_id text not null,
  search_query_id text not null references public.product_search_queries(id),
  search_pet_group text not null references public.pet_groups(code),
  search_target_species text,
  raw_title text not null,
  raw_description text,
  shop_name text,
  brand_name text,
  maker_name text,
  price numeric(14, 2),
  currency text not null default 'JPY',
  item_url text,
  affiliate_url text,
  image_url text,
  jan_code text,
  model_number text,
  genre_id text,
  genre_name text,
  availability boolean,
  fetched_at timestamptz not null,
  raw_json jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source, source_item_id, search_query_id),
  foreign key (search_pet_group, search_target_species)
    references public.pet_species(pet_group, code),
  constraint retailer_listings_raw_source_check check (
    source in ('rakuten_ichiba', 'rakuten_product_navi', 'yahoo_shopping')
  ),
  constraint retailer_listings_raw_title_check check (length(btrim(raw_title)) > 0),
  constraint retailer_listings_raw_json_check check (jsonb_typeof(raw_json) = 'object')
);

create table if not exists public.product_candidates (
  id text primary key,
  raw_listing_id uuid not null unique references public.retailer_listings_raw(id) on delete cascade,
  normalized_name text not null,
  brand text,
  series text,
  base_product_name text not null,
  pet_group text references public.pet_groups(code),
  target_species text[] not null default '{}',
  target_species_group text,
  target_scope text not null,
  target_size text,
  target_age text,
  life_stage text,
  habitat_type text,
  feeding_type text,
  flavor text,
  primary_ingredient text,
  purpose text,
  product_function text,
  package_type text,
  category_id text,
  subcategory_id text,
  capacity_value numeric(14, 4),
  capacity_unit text,
  quantity integer,
  jan_code text,
  model_number text,
  canonical_key text not null,
  classification_evidence jsonb not null,
  classification_confidence numeric(4, 3) not null,
  merge_confidence numeric(4, 3) not null,
  confidence numeric(4, 3) not null,
  status text not null default 'normalized',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_candidates_target_scope_check check (
    target_scope in ('species_specific', 'multi_species', 'group_wide', 'unconfirmed')
  ),
  constraint product_candidates_life_stage_check check (
    life_stage is null or life_stage in ('egg', 'larva', 'pupa', 'juvenile', 'adult', 'all_stages', 'not_applicable')
  ),
  constraint product_candidates_habitat_type_check check (
    habitat_type is null or habitat_type in ('freshwater', 'marine', 'brackish', 'both', 'not_applicable')
  ),
  constraint product_candidates_feeding_type_check check (
    feeding_type is null or feeding_type in ('herbivore', 'carnivore', 'omnivore', 'insectivore', 'species_specific', 'not_applicable')
  ),
  constraint product_candidates_package_type_check check (package_type is null or package_type in ('main', 'refill')),
  constraint product_candidates_confidence_check check (
    classification_confidence between 0 and 1
    and merge_confidence between 0 and 1
    and confidence between 0 and 1
  ),
  constraint product_candidates_status_check check (
    status in ('normalized', 'review_required', 'merge_ready', 'merged', 'rejected')
  ),
  constraint product_candidates_classification_evidence_check check (
    jsonb_typeof(classification_evidence) = 'object'
  )
);

create table if not exists public.products (
  id text primary key,
  canonical_key text not null unique,
  normalized_name text not null,
  brand text,
  series text,
  base_product_name text not null,
  pet_group text not null references public.pet_groups(code),
  target_species text[] not null default '{}',
  target_species_group text,
  target_scope text not null,
  target_size text,
  target_age text,
  life_stage text,
  habitat_type text,
  feeding_type text,
  flavor text,
  primary_ingredient text,
  purpose text,
  product_function text,
  package_type text,
  category_id text,
  subcategory_id text,
  confidence numeric(4, 3) not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint products_target_scope_check check (
    target_scope in ('species_specific', 'multi_species', 'group_wide')
  ),
  constraint products_life_stage_check check (
    life_stage is null or life_stage in ('egg', 'larva', 'pupa', 'juvenile', 'adult', 'all_stages', 'not_applicable')
  ),
  constraint products_habitat_type_check check (
    habitat_type is null or habitat_type in ('freshwater', 'marine', 'brackish', 'both', 'not_applicable')
  ),
  constraint products_feeding_type_check check (
    feeding_type is null or feeding_type in ('herbivore', 'carnivore', 'omnivore', 'insectivore', 'species_specific', 'not_applicable')
  ),
  constraint products_package_type_check check (package_type is null or package_type in ('main', 'refill')),
  constraint products_confidence_check check (confidence between 0 and 1),
  constraint products_status_check check (status in ('draft', 'approved', 'active', 'rejected')),
  constraint products_target_species_check check (
    cardinality(target_species) > 0 or target_scope = 'group_wide'
  ),
  constraint products_target_scope_cardinality_check check (
    (target_scope = 'species_specific' and cardinality(target_species) = 1)
    or (target_scope = 'multi_species' and cardinality(target_species) > 1)
    or target_scope = 'group_wide'
  ),
  constraint products_rabbit_group_check check (
    not ('rabbit' = any(target_species) and pet_group <> 'rabbit')
  ),
  constraint products_small_animal_not_species_check check (
    not ('small_animal' = any(target_species))
  )
);

create table if not exists public.product_retailer_listings (
  product_id text not null references public.products(id) on delete cascade,
  raw_listing_id uuid not null references public.retailer_listings_raw(id) on delete cascade,
  candidate_id text not null references public.product_candidates(id) on delete cascade,
  capacity_value numeric(14, 4),
  capacity_unit text,
  quantity integer,
  jan_code text,
  model_number text,
  price numeric(14, 2),
  item_url text,
  affiliate_url text,
  availability boolean,
  linked_at timestamptz not null default now(),
  primary key (product_id, raw_listing_id),
  unique (candidate_id)
);

create table if not exists public.product_review_queue (
  id uuid primary key default gen_random_uuid(),
  candidate_id text not null references public.product_candidates(id) on delete cascade,
  raw_listing_id uuid not null references public.retailer_listings_raw(id) on delete cascade,
  pet_group text references public.pet_groups(code),
  detected_target_species text[] not null default '{}',
  issue_type text not null,
  issue_detail text not null,
  source_url text,
  suggested_action text not null,
  confidence numeric(4, 3) not null,
  status text not null default 'open',
  checked_at timestamptz,
  checked_by text,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (candidate_id, issue_type),
  constraint product_review_queue_confidence_check check (confidence between 0 and 1),
  constraint product_review_queue_status_check check (status in ('open', 'approved', 'rejected', 'resolved'))
);

create index if not exists product_search_queries_enabled_priority_idx
  on public.product_search_queries (enabled, priority desc, id);
create index if not exists retailer_listings_raw_search_query_fetched_idx
  on public.retailer_listings_raw (search_query_id, fetched_at desc);
create index if not exists retailer_listings_raw_jan_code_idx
  on public.retailer_listings_raw (jan_code) where jan_code is not null;
create index if not exists retailer_listings_raw_raw_json_gin_idx
  on public.retailer_listings_raw using gin (raw_json);
create index if not exists product_candidates_canonical_key_idx
  on public.product_candidates (canonical_key);
create index if not exists product_candidates_status_confidence_idx
  on public.product_candidates (status, confidence desc);
create index if not exists product_candidates_target_species_gin_idx
  on public.product_candidates using gin (target_species);
create index if not exists products_pet_group_status_idx
  on public.products (pet_group, status);
create index if not exists products_target_species_gin_idx
  on public.products using gin (target_species);
create index if not exists product_review_queue_status_confidence_idx
  on public.product_review_queue (status, confidence);

alter table public.pet_groups enable row level security;
alter table public.pet_species enable row level security;
alter table public.pet_species_groups enable row level security;
alter table public.pet_brands enable row level security;
alter table public.pet_categories enable row level security;
alter table public.pet_subcategories enable row level security;
alter table public.product_search_queries enable row level security;
alter table public.retailer_listings_raw enable row level security;
alter table public.product_candidates enable row level security;
alter table public.products enable row level security;
alter table public.product_retailer_listings enable row level security;
alter table public.product_review_queue enable row level security;

-- The pipeline contains raw third-party payloads and review notes. It is an
-- internal batch surface, so no anon/authenticated policies are created.
grant all on public.pet_groups to service_role;
grant all on public.pet_species to service_role;
grant all on public.pet_species_groups to service_role;
grant all on public.pet_brands to service_role;
grant all on public.pet_categories to service_role;
grant all on public.pet_subcategories to service_role;
grant all on public.product_search_queries to service_role;
grant all on public.retailer_listings_raw to service_role;
grant all on public.product_candidates to service_role;
grant all on public.products to service_role;
grant all on public.product_retailer_listings to service_role;
grant all on public.product_review_queue to service_role;

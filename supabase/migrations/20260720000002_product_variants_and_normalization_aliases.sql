-- Add SKU/variant identities and data-driven normalization aliases.

create table if not exists public.normalization_aliases (
  id text primary key,
  alias_type text not null,
  locale text not null default 'ja-JP',
  alias text not null,
  normalized_alias text not null,
  canonical_value text not null,
  context_value text not null default '',
  display_value text,
  priority integer not null default 100,
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (alias_type, locale, normalized_alias, context_value),
  constraint normalization_aliases_type_check check (alias_type in ('species', 'brand', 'series')),
  constraint normalization_aliases_locale_check check (locale ~ '^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$'),
  constraint normalization_aliases_alias_check check (length(btrim(alias)) > 0),
  constraint normalization_aliases_canonical_value_check check (length(btrim(canonical_value)) > 0)
);

create table if not exists public.product_variants (
  id text primary key,
  product_id text not null references public.products(id) on delete cascade,
  variant_key text not null unique,
  capacity_value numeric(14, 4),
  capacity_unit text,
  quantity integer,
  jan_code text,
  model_number text,
  package_type text,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_variants_package_type_check check (package_type is null or package_type in ('main', 'refill')),
  constraint product_variants_status_check check (status in ('active', 'inactive', 'rejected')),
  constraint product_variants_quantity_check check (quantity is null or quantity > 0)
);

create table if not exists public.product_identity_keys (
  id uuid primary key default gen_random_uuid(),
  variant_id text not null references public.product_variants(id) on delete cascade,
  key_type text not null,
  namespace text not null default '',
  normalized_value text not null,
  source text not null default 'pipeline',
  confidence numeric(4, 3) not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key_type, namespace, normalized_value),
  constraint product_identity_keys_type_check check (key_type in ('jan', 'model_number')),
  constraint product_identity_keys_value_check check (length(btrim(normalized_value)) > 0),
  constraint product_identity_keys_confidence_check check (confidence between 0 and 1)
);

alter table public.product_retailer_listings
  add column if not exists variant_id text references public.product_variants(id) on delete restrict;

create index if not exists normalization_aliases_lookup_idx
  on public.normalization_aliases (alias_type, locale, enabled, priority desc);
create index if not exists product_variants_product_idx
  on public.product_variants (product_id, status);
create index if not exists product_variants_jan_idx
  on public.product_variants (jan_code) where jan_code is not null;
create index if not exists product_identity_keys_variant_idx
  on public.product_identity_keys (variant_id);
create index if not exists product_retailer_listings_variant_idx
  on public.product_retailer_listings (variant_id) where variant_id is not null;

alter table public.normalization_aliases enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_identity_keys enable row level security;

grant all on public.normalization_aliases to service_role;
grant all on public.product_variants to service_role;
grant all on public.product_identity_keys to service_role;

comment on table public.product_variants is
  'Capacity/quantity/JAN/model-specific SKU variants belonging to a language-independent product.';
comment on table public.product_identity_keys is
  'Strong variant identity keys. JAN is global; model_number is scoped by normalized brand or maker namespace.';

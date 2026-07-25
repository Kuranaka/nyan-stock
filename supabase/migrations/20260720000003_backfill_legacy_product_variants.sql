-- Give pre-variant retailer links a safe, non-deduplicating placeholder variant.
-- A later merge replaces the link with a JAN/model/attribute-based variant.

insert into public.product_variants (
  id,
  product_id,
  variant_key,
  status,
  created_at,
  updated_at
)
select
  'variant-legacy-' || substr(md5(listing.product_id || ':' || listing.raw_listing_id::text), 1, 24),
  listing.product_id,
  'legacy:' || listing.product_id || ':' || listing.raw_listing_id::text,
  'active',
  coalesce(listing.linked_at, now()),
  now()
from public.product_retailer_listings listing
where listing.variant_id is null
on conflict (variant_key) do nothing;

update public.product_retailer_listings listing
set variant_id = variant.id
from public.product_variants variant
where listing.variant_id is null
  and variant.variant_key = 'legacy:' || listing.product_id || ':' || listing.raw_listing_id::text;

comment on column public.product_retailer_listings.variant_id is
  'Resolved SKU variant. Legacy links receive an isolated placeholder until they are reprocessed and merged.';

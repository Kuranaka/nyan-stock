-- Supabase SQL Editor 用:
-- 正規化した商品名と、取得元の商品名を横並びで確認する。
--
-- 必要に応じて status、pet_group、LIMIT を変更してください。
-- raw_json は取得しないため、比較に不要な大きなデータは読み込みません。

with candidate_sample as materialized (
  select
    id,
    raw_listing_id,
    normalized_name,
    base_product_name,
    brand,
    pet_group,
    category_id,
    subcategory_id,
    status,
    confidence,
    updated_at
  from public.product_candidates
  where status in ('normalized', 'review_required', 'merge_ready')
  -- 猫用品だけを見る場合:
  -- and pet_group = 'cat'
  order by updated_at desc, id
  limit 500
)
select
  candidate.id as candidate_id,
  listing.source,
  listing.source_item_id,
  listing.raw_title as original_product_name,
  candidate.normalized_name,
  candidate.base_product_name,
  candidate.brand,
  candidate.pet_group,
  candidate.category_id,
  candidate.subcategory_id,
  candidate.status,
  candidate.confidence,
  case
    when btrim(listing.raw_title) = btrim(candidate.normalized_name) then '同一'
    else '差分あり'
  end as comparison_result,
  length(listing.raw_title) as original_name_length,
  length(candidate.normalized_name) as normalized_name_length,
  candidate.updated_at
from candidate_sample as candidate
join public.retailer_listings_raw as listing
  on listing.id = candidate.raw_listing_id
order by candidate.updated_at desc, candidate.id;

begin;

create index if not exists product_candidates_exact_name_brand_idx
  on public.product_candidates (normalized_name, brand, pet_group)
  where brand is not null;

create index if not exists products_exact_name_brand_idx
  on public.products (normalized_name, brand, pet_group)
  where brand is not null and status <> 'rejected';

create or replace function public.resolve_pet_catalog_exact_name_brand_matches()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  resolved_count integer := 0;
begin
  create temporary table if not exists exact_name_brand_candidates (
    candidate_id text primary key
  ) on commit drop;
  truncate exact_name_brand_candidates;

  insert into exact_name_brand_candidates (candidate_id)
  select candidate.id
  from public.product_candidates candidate
  where candidate.brand is not null
    and btrim(candidate.brand) <> ''
    and btrim(candidate.normalized_name) <> ''
    and candidate.pet_group is not null
    and candidate.target_scope <> 'unconfirmed'
    and candidate.status <> 'merged'
    and exists (
      select 1
      from public.product_review_queue issue
      where issue.candidate_id = candidate.id
        and issue.issue_type = 'variant_merge_uncertain'
        and issue.disposition in ('blocking', 'reject')
        and (
          issue.status = 'open'
          or (issue.status = 'rejected' and coalesce(issue.checked_by, '') like 'issue-policy-%')
        )
    )
    and (
      exists (
        select 1
        from public.product_candidates matching_candidate
        where matching_candidate.id <> candidate.id
          and matching_candidate.normalized_name = candidate.normalized_name
          and matching_candidate.brand = candidate.brand
          and matching_candidate.pet_group = candidate.pet_group
      )
      or exists (
        select 1
        from public.products matching_product
        where matching_product.normalized_name = candidate.normalized_name
          and matching_product.brand = candidate.brand
          and matching_product.pet_group = candidate.pet_group
          and matching_product.status <> 'rejected'
      )
    );

  update public.product_review_queue issue
  set disposition = 'non_blocking',
      policy_reason = '正規化商品名・ブランド・pet groupが既存候補またはproductと完全一致したため、自動統合可能。',
      status = 'resolved',
      checked_at = now(),
      checked_by = 'exact-name-brand-match-v1',
      resolution_note = '完全一致ルールによるvariant merge issueの自動承認。',
      updated_at = now()
  where issue.candidate_id in (select candidate_id from exact_name_brand_candidates)
    and issue.issue_type = 'variant_merge_uncertain';

  get diagnostics resolved_count = row_count;

  update public.product_review_queue issue
  set status = case when issue.disposition = 'blocking' then 'open' else 'resolved' end,
      checked_at = case when issue.disposition = 'blocking' then null else coalesce(issue.checked_at, now()) end,
      checked_by = case when issue.disposition = 'blocking' then null else coalesce(issue.checked_by, 'issue-policy-v2') end,
      resolution_note = case when issue.disposition = 'blocking' then null else issue.resolution_note end,
      updated_at = now()
  where issue.candidate_id in (select candidate_id from exact_name_brand_candidates)
    and issue.issue_type <> 'variant_merge_uncertain'
    and coalesce(issue.checked_by, '') like 'issue-policy-%'
    and not exists (
      select 1
      from public.product_review_queue reject_issue
      where reject_issue.candidate_id = issue.candidate_id
        and reject_issue.disposition = 'reject'
    );

  update public.product_candidates candidate
  set status = case
        when exists (
          select 1 from public.product_review_queue issue
          where issue.candidate_id = candidate.id and issue.disposition = 'reject'
        ) then 'rejected'
        when exists (
          select 1 from public.product_review_queue issue
          where issue.candidate_id = candidate.id
            and issue.disposition = 'blocking' and issue.status = 'open'
        ) then 'review_required'
        else 'merge_ready'
      end,
      updated_at = now()
  where candidate.id in (select candidate_id from exact_name_brand_candidates)
    and candidate.status <> 'merged';

  return resolved_count;
end;
$$;

revoke all on function public.resolve_pet_catalog_exact_name_brand_matches() from public;
grant execute on function public.resolve_pet_catalog_exact_name_brand_matches() to service_role;

select public.resolve_pet_catalog_exact_name_brand_matches();

commit;

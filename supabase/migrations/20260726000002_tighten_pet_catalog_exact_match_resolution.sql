-- Exact normalized name/brand matches are not sufficient product identity:
-- target species, habitat, life stage and other canonical dimensions can
-- legitimately differ. Keep the existing RPC contract, but only auto-resolve
-- candidates when the full canonical key already exists.

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
    and btrim(candidate.canonical_key) <> ''
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
          and matching_candidate.canonical_key = candidate.canonical_key
      )
      or exists (
        select 1
        from public.products matching_product
        where matching_product.canonical_key = candidate.canonical_key
          and matching_product.status <> 'rejected'
      )
    );

  update public.product_review_queue issue
  set disposition = 'non_blocking',
      policy_reason = '分類次元を含むcanonical keyが既存候補またはproductと一致したため、自動統合可能。',
      status = 'resolved',
      checked_at = now(),
      checked_by = 'canonical-key-match-v2',
      resolution_note = 'canonical key完全一致ルールによるvariant merge issueの自動承認。',
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


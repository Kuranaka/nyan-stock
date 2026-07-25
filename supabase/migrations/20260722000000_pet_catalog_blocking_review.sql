-- Atomically apply a human decision to the currently open blocking issues.

create or replace function public.review_pet_catalog_candidate(
  p_candidate_id text,
  p_decision text,
  p_reviewer text,
  p_resolution_note text default null,
  p_expected_issue_types text[] default null
)
returns table (
  candidate_id text,
  candidate_status text,
  reviewed_issue_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate_row public.product_candidates%rowtype;
  current_issue_types text[];
  next_scope text;
  affected_count integer;
begin
  if p_decision not in ('approve', 'reject') then
    raise exception 'Unsupported review decision: %', p_decision;
  end if;
  if length(btrim(coalesce(p_reviewer, ''))) = 0 then
    raise exception 'Reviewer is required.';
  end if;

  select * into candidate_row
  from public.product_candidates
  where id = p_candidate_id
  for update;
  if not found then
    raise exception 'Candidate not found: %', p_candidate_id;
  end if;
  if candidate_row.status in ('merged', 'rejected') then
    raise exception 'Candidate % cannot be reviewed from status %', p_candidate_id, candidate_row.status;
  end if;

  select coalesce(array_agg(issue_type order by issue_type), '{}'::text[])
  into current_issue_types
  from public.product_review_queue
  where candidate_id = p_candidate_id
    and disposition = 'blocking'
    and status = 'open';

  if cardinality(current_issue_types) = 0 then
    raise exception 'Candidate % has no open blocking issues.', p_candidate_id;
  end if;
  if p_expected_issue_types is not null
     and current_issue_types <> (
       select coalesce(array_agg(value order by value), '{}'::text[])
       from unnest(p_expected_issue_types) value
     ) then
    raise exception 'Review is stale for candidate %. expected=%, current=%',
      p_candidate_id, p_expected_issue_types, current_issue_types;
  end if;

  if p_decision = 'approve' then
    if candidate_row.pet_group is null then
      raise exception 'Candidate % cannot be approved without pet_group.', p_candidate_id;
    end if;
    next_scope := candidate_row.target_scope;
    if next_scope = 'unconfirmed' then
      next_scope := case cardinality(candidate_row.target_species)
        when 0 then 'group_wide'
        when 1 then 'species_specific'
        else 'multi_species'
      end;
    end if;
    update public.product_candidates
    set target_scope = next_scope,
        status = 'merge_ready',
        updated_at = now()
    where id = p_candidate_id;

    update public.product_review_queue
    set status = 'approved',
        checked_at = now(),
        checked_by = btrim(p_reviewer),
        resolution_note = coalesce(nullif(btrim(p_resolution_note), ''), 'blocking issueを人手レビューで承認。'),
        updated_at = now()
    where candidate_id = p_candidate_id
      and disposition = 'blocking'
      and status = 'open';
  else
    update public.product_candidates
    set status = 'rejected', updated_at = now()
    where id = p_candidate_id;

    update public.product_review_queue
    set status = 'rejected',
        checked_at = now(),
        checked_by = btrim(p_reviewer),
        resolution_note = coalesce(nullif(btrim(p_resolution_note), ''), 'blocking issueを人手レビューで却下。'),
        updated_at = now()
    where candidate_id = p_candidate_id
      and disposition = 'blocking'
      and status = 'open';
  end if;

  get diagnostics affected_count = row_count;
  return query select p_candidate_id, case when p_decision = 'approve' then 'merge_ready' else 'rejected' end, affected_count;
end;
$$;

revoke all on function public.review_pet_catalog_candidate(text, text, text, text, text[]) from public;
grant execute on function public.review_pet_catalog_candidate(text, text, text, text, text[]) to service_role;

comment on function public.review_pet_catalog_candidate(text, text, text, text, text[]) is
  'Atomically approves or rejects the current open blocking issues after checking the exported issue fingerprint.';

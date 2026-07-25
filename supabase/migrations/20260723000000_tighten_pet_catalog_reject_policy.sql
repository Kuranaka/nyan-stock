begin;

update public.product_review_queue issue
set disposition = 'reject',
    policy_reason = case
      when issue.issue_type in ('multiple_pet_groups_detected', 'rabbit_or_small_animal_unclear')
        then '現行マスタではpet_groupを一意に確定できない候補を安全に表現できないため、自動除外対象。'
      when candidate.pet_group is null
        then 'pet_groupを確定できず、現行マスタへ安全に分類できないため、自動除外対象。'
      else '統合confidenceが人手レビュー下限0.80未満のため、自動除外対象。'
    end,
    checked_at = now(),
    checked_by = 'issue-policy-v2',
    resolution_note = 'issue-policy-v2による自動reject。',
    updated_at = now()
from public.product_candidates candidate
where candidate.id = issue.candidate_id
  and issue.status = 'open'
  and (
    issue.issue_type in ('multiple_pet_groups_detected', 'rabbit_or_small_animal_unclear')
    or (
      issue.issue_type = 'variant_merge_uncertain'
      and (candidate.pet_group is null or candidate.merge_confidence < 0.80)
    )
    or (issue.issue_type = 'target_species_unknown' and candidate.pet_group is null)
  );

with rejected_candidates as (
  select distinct candidate_id
  from public.product_review_queue
  where disposition = 'reject'
)
update public.product_candidates candidate
set status = 'rejected', updated_at = now()
from rejected_candidates rejected
where candidate.id = rejected.candidate_id;

with rejected_candidates as (
  select distinct candidate_id
  from public.product_review_queue
  where disposition = 'reject'
)
update public.product_review_queue issue
set status = 'rejected',
    checked_at = coalesce(issue.checked_at, now()),
    checked_by = coalesce(issue.checked_by, 'issue-policy-v2'),
    resolution_note = coalesce(
      issue.resolution_note,
      '同一candidateに自動reject issueがあるため、このissueもレビュー対象から除外。'
    ),
    updated_at = now()
from rejected_candidates rejected
where issue.candidate_id = rejected.candidate_id
  and issue.status <> 'rejected';

commit;

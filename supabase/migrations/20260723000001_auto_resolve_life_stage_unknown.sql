begin;

create temporary table affected_life_stage_candidates on commit drop as
select distinct candidate_id
from public.product_review_queue
where issue_type = 'life_stage_unknown'
  and disposition = 'blocking'
  and status = 'open';

update public.product_review_queue
set disposition = 'non_blocking',
    policy_reason = 'life_stageは任意属性として未確定を許容し、商品分類と統合を妨げない。',
    status = 'resolved',
    checked_at = now(),
    checked_by = 'issue-policy-v3',
    resolution_note = 'issue-policy-v3による自動承認。',
    updated_at = now()
where candidate_id in (select candidate_id from affected_life_stage_candidates)
  and issue_type = 'life_stage_unknown'
  and disposition = 'blocking'
  and status = 'open';

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
      when candidate.pet_group is not null
        and candidate.target_scope <> 'unconfirmed'
        and candidate.merge_confidence >= 0.85
      then 'merge_ready'
      else 'review_required'
    end,
    updated_at = now()
where candidate.id in (select candidate_id from affected_life_stage_candidates)
  and candidate.status <> 'merged';

commit;

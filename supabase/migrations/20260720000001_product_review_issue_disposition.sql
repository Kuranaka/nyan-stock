-- Classify review issues so only safety- or identity-critical cases require
-- human review. Non-blocking unknowns remain auditable without filling the
-- active review queue.

alter table public.product_review_queue
  add column if not exists disposition text not null default 'blocking',
  add column if not exists policy_reason text;

alter table public.product_review_queue
  add constraint product_review_queue_disposition_check
    check (disposition in ('blocking', 'non_blocking', 'reject'));

update public.product_review_queue
set disposition = 'reject',
    policy_reason = '除外語または検索対象不一致を検出したため、自動除外対象。',
    status = 'rejected',
    resolution_note = coalesce(resolution_note, 'issue disposition policyによる自動判定。'),
    updated_at = now()
where issue_type = 'possible_wrong_search_result';

update public.product_review_queue
set disposition = 'non_blocking',
    policy_reason = case issue_type
      when 'package_data_suspicious' then '容量・入数は販売listing側で管理するため、商品統合を妨げない。'
      else '工程分離後はmergeコマンド自体が明示的な統合操作になるため自動解消可能。'
    end,
    status = 'resolved',
    resolution_note = coalesce(resolution_note, 'issue disposition policyによる自動判定。'),
    updated_at = now()
where issue_type in ('package_data_suspicious', 'initial_review_required')
  and status = 'open';

create index if not exists product_review_queue_active_disposition_idx
  on public.product_review_queue (disposition, confidence, created_at)
  where status = 'open';

comment on column public.product_review_queue.disposition is
  'blocking requires review, non_blocking permits null/unknown, reject excludes the candidate.';

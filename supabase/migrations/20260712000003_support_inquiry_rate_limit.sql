-- Keep support inquiry submission and its quota check in one transaction.
-- Clients may submit through the RPC only; direct inserts would bypass the quota.

create table if not exists public.support_inquiry_rate_limit_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  window_kind text not null check (window_kind in ('minute', 'day')),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, window_kind, window_started_at)
);

create index if not exists support_inquiry_rate_limit_windows_expiry_idx
  on public.support_inquiry_rate_limit_windows (window_started_at);

alter table public.support_inquiry_rate_limit_windows enable row level security;

create or replace function public.submit_support_inquiry(
  p_message text,
  p_provider text default null,
  p_provider_user_id text default null,
  p_household_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  submitting_user_id uuid := auth.uid();
  trimmed_message text := btrim(p_message);
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  minute_count integer := 0;
  day_count integer := 0;
  inquiry_id uuid;
begin
  if submitting_user_id is null then
    raise exception 'ログイン状態を確認できませんでした。';
  end if;

  if trimmed_message is null or trimmed_message = '' then
    raise exception 'お問い合わせ内容を入力してください。';
  end if;
  if char_length(trimmed_message) > 4000 then
    raise exception 'お問い合わせ内容は4,000文字以内で入力してください。';
  end if;

  -- Serialize both quota windows for this user so concurrent submissions cannot exceed the limit.
  perform pg_advisory_xact_lock(hashtextextended(submitting_user_id::text || ':support-inquiry', 0));

  select request_count into minute_count
    from public.support_inquiry_rate_limit_windows
   where user_id = submitting_user_id
     and window_kind = 'minute'
     and window_started_at = minute_start;
  if coalesce(minute_count, 0) >= 3 then
    raise exception 'お問い合わせは1分に3件まで送信できます。少し時間をおいてお試しください。';
  end if;

  select request_count into day_count
    from public.support_inquiry_rate_limit_windows
   where user_id = submitting_user_id
     and window_kind = 'day'
     and window_started_at = day_start;
  if coalesce(day_count, 0) >= 10 then
    raise exception '本日のお問い合わせ送信上限に達しました。明日以降にお試しください。';
  end if;

  insert into public.support_inquiry_rate_limit_windows (user_id, window_kind, window_started_at, request_count)
  values
    (submitting_user_id, 'minute', minute_start, 1),
    (submitting_user_id, 'day', day_start, 1)
  on conflict (user_id, window_kind, window_started_at)
  do update set
    request_count = public.support_inquiry_rate_limit_windows.request_count + 1,
    updated_at = now();

  insert into public.support_inquiries (
    user_id,
    provider,
    provider_user_id,
    household_id,
    message
  )
  values (
    submitting_user_id,
    nullif(btrim(p_provider), ''),
    nullif(btrim(p_provider_user_id), ''),
    nullif(btrim(p_household_id), ''),
    trimmed_message
  )
  returning id into inquiry_id;

  return inquiry_id;
end;
$$;

drop policy if exists "Users can create support inquiries" on public.support_inquiries;

revoke all on table public.support_inquiry_rate_limit_windows from anon, authenticated;
revoke all on function public.submit_support_inquiry(text, text, text, text) from public, anon;
grant execute on function public.submit_support_inquiry(text, text, text, text) to authenticated;

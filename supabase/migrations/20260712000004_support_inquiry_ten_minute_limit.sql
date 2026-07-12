-- Follow-up to 20260712000003: allow one support inquiry per user every ten minutes.

alter table public.support_inquiry_rate_limit_windows
  drop constraint if exists support_inquiry_rate_limit_windows_window_kind_check;

alter table public.support_inquiry_rate_limit_windows
  add constraint support_inquiry_rate_limit_windows_window_kind_check
  check (window_kind in ('minute', 'day', 'ten_minutes'));

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
  ten_minute_start timestamptz := date_trunc('hour', now())
    + floor(extract(minute from now()) / 10)::integer * interval '10 minutes';
  request_count integer := 0;
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

  perform pg_advisory_xact_lock(hashtextextended(submitting_user_id::text || ':support-inquiry', 0));

  select rate_window.request_count into request_count
    from public.support_inquiry_rate_limit_windows as rate_window
   where rate_window.user_id = submitting_user_id
     and rate_window.window_kind = 'ten_minutes'
     and rate_window.window_started_at = ten_minute_start;
  if coalesce(request_count, 0) >= 1 then
    raise exception 'お問い合わせは10分に1回まで送信できます。時間をおいてからお試しください。';
  end if;

  insert into public.support_inquiry_rate_limit_windows (user_id, window_kind, window_started_at, request_count)
  values (submitting_user_id, 'ten_minutes', ten_minute_start, 1)
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

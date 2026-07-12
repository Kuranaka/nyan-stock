-- Per-user quotas for endpoints that can trigger paid or rate-limited upstream APIs.
-- All writes go through consume_api_rate_limit; clients have no table access.

create table if not exists public.api_rate_limit_windows (
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null,
  window_kind text not null check (window_kind in ('minute', 'day')),
  window_started_at timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, endpoint, window_kind, window_started_at)
);

create index if not exists api_rate_limit_windows_expiry_idx
  on public.api_rate_limit_windows (window_started_at);

alter table public.api_rate_limit_windows enable row level security;

create or replace function public.consume_api_rate_limit(
  target_user_id uuid,
  target_endpoint text,
  minute_limit integer default 20,
  day_limit integer default 500
)
returns table (allowed boolean, retry_after_seconds integer, limit_kind text)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  minute_start timestamptz := date_trunc('minute', now());
  day_start timestamptz := date_trunc('day', now());
  quota_endpoint text := '/external-api';
  minute_count integer := 0;
  day_count integer := 0;
begin
  if target_user_id is null
    or target_endpoint not in ('/affiliate/search', '/products/lookup', '/ai/*', '/notifications/send', '/admin/*')
    or minute_limit < 1
    or day_limit < 1 then
    raise exception 'invalid rate limit arguments';
  end if;

  -- The quota is shared across all protected endpoints for a user. Serialize
  -- one user's shared bucket so both time windows are checked atomically.
  perform pg_advisory_xact_lock(hashtextextended(target_user_id::text || ':' || quota_endpoint, 0));

  select request_count into minute_count from public.api_rate_limit_windows
  where user_id = target_user_id and endpoint = quota_endpoint
    and window_kind = 'minute' and window_started_at = minute_start;
  select request_count into day_count from public.api_rate_limit_windows
  where user_id = target_user_id and endpoint = quota_endpoint
    and window_kind = 'day' and window_started_at = day_start;

  if coalesce(minute_count, 0) >= minute_limit then
    return query select false, greatest(1, ceil(extract(epoch from (minute_start + interval '1 minute' - now())))::integer), 'minute';
    return;
  end if;
  if coalesce(day_count, 0) >= day_limit then
    return query select false, greatest(1, ceil(extract(epoch from (day_start + interval '1 day' - now())))::integer), 'day';
    return;
  end if;

  insert into public.api_rate_limit_windows (user_id, endpoint, window_kind, window_started_at, request_count)
  values
    (target_user_id, quota_endpoint, 'minute', minute_start, 1),
    (target_user_id, quota_endpoint, 'day', day_start, 1)
  on conflict (user_id, endpoint, window_kind, window_started_at)
  do update set request_count = public.api_rate_limit_windows.request_count + 1, updated_at = now();

  return query select true, 0, null::text;
end;
$$;

revoke all on table public.api_rate_limit_windows from anon, authenticated;
revoke all on function public.consume_api_rate_limit(uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.consume_api_rate_limit(uuid, text, integer, integer) to service_role;

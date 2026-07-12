-- Apply one shared quota to support inquiries and product-link reports.

create or replace function public.consume_support_submission_rate_limit(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  ten_minute_start timestamptz := date_trunc('hour', now())
    + floor(extract(minute from now()) / 10)::integer * interval '10 minutes';
  day_start timestamptz := date_trunc('day', now());
  ten_minute_count integer := 0;
  day_count integer := 0;
begin
  if p_user_id is null then
    raise exception 'ログイン状態を確認できませんでした。';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(p_user_id::text || ':support-submission', 0));

  select rate_window.request_count into ten_minute_count
    from public.support_inquiry_rate_limit_windows as rate_window
   where rate_window.user_id = p_user_id
     and rate_window.window_kind = 'ten_minutes'
     and rate_window.window_started_at = ten_minute_start;
  if coalesce(ten_minute_count, 0) >= 1 then
    raise exception 'お問い合わせ・商品情報の報告は10分に1回まで送信できます。時間をおいてからお試しください。';
  end if;

  select rate_window.request_count into day_count
    from public.support_inquiry_rate_limit_windows as rate_window
   where rate_window.user_id = p_user_id
     and rate_window.window_kind = 'day'
     and rate_window.window_started_at = day_start;
  if coalesce(day_count, 0) >= 10 then
    raise exception '本日のお問い合わせ・商品情報の報告の送信上限（10件）に達しました。明日以降にお試しください。';
  end if;

  insert into public.support_inquiry_rate_limit_windows (user_id, window_kind, window_started_at, request_count)
  values
    (p_user_id, 'ten_minutes', ten_minute_start, 1),
    (p_user_id, 'day', day_start, 1)
  on conflict (user_id, window_kind, window_started_at)
  do update set
    request_count = public.support_inquiry_rate_limit_windows.request_count + 1,
    updated_at = now();
end;
$$;

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
  inquiry_id uuid;
begin
  if trimmed_message is null or trimmed_message = '' then
    raise exception 'お問い合わせ内容を入力してください。';
  end if;
  if char_length(trimmed_message) > 4000 then
    raise exception 'お問い合わせ内容は4,000文字以内で入力してください。';
  end if;

  perform public.consume_support_submission_rate_limit(submitting_user_id);

  insert into public.support_inquiries (user_id, provider, provider_user_id, household_id, message)
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

create or replace function public.submit_product_link_report(
  p_inventory_item_id text,
  p_product_master_id text default null,
  p_product_name text default null,
  p_issue_type text default null,
  p_message text default null,
  p_image_url text default null,
  p_purchase_links jsonb default '{}'::jsonb,
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
  report_id uuid;
  normalized_issue_type text := btrim(p_issue_type);
  normalized_product_name text := btrim(p_product_name);
begin
  if btrim(p_inventory_item_id) is null or btrim(p_inventory_item_id) = '' then
    raise exception '対象の商品を確認できませんでした。';
  end if;
  if normalized_product_name is null or normalized_product_name = '' then
    raise exception '商品名を確認できませんでした。';
  end if;
  if normalized_issue_type not in ('purchase_link', 'image', 'variant', 'other') then
    raise exception '報告種別を確認できませんでした。';
  end if;
  if p_purchase_links is null or jsonb_typeof(p_purchase_links) <> 'object' then
    raise exception '購入リンク情報を確認できませんでした。';
  end if;
  if char_length(coalesce(p_message, '')) > 4000 then
    raise exception '報告内容は4,000文字以内で入力してください。';
  end if;

  perform public.consume_support_submission_rate_limit(submitting_user_id);

  insert into public.product_link_reports (
    user_id,
    provider,
    provider_user_id,
    household_id,
    inventory_item_id,
    product_master_id,
    product_name,
    issue_type,
    message,
    image_url,
    purchase_links
  )
  values (
    submitting_user_id,
    nullif(btrim(p_provider), ''),
    nullif(btrim(p_provider_user_id), ''),
    nullif(btrim(p_household_id), ''),
    btrim(p_inventory_item_id),
    nullif(btrim(p_product_master_id), ''),
    normalized_product_name,
    normalized_issue_type,
    nullif(btrim(p_message), ''),
    nullif(btrim(p_image_url), ''),
    p_purchase_links
  )
  returning id into report_id;

  return report_id;
end;
$$;

drop policy if exists "Users can create product link reports" on public.product_link_reports;

revoke all on function public.consume_support_submission_rate_limit(uuid) from public, anon, authenticated;
revoke all on function public.submit_product_link_report(text, text, text, text, text, text, jsonb, text, text, text) from public, anon;
grant execute on function public.submit_product_link_report(text, text, text, text, text, text, jsonb, text, text, text) to authenticated;

-- Notify the support Edge Function after a new inquiry or product report is stored.
-- The Edge Function URL and shared secret must be stored in Supabase Vault with:
--   support_inquiry_notify_url
--   support_inquiry_webhook_secret
-- See supabase/README.md for the one-time setup commands.

create extension if not exists pg_net with schema extensions;

create or replace function public.notify_support_inquiry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  function_url text;
  webhook_secret text;
begin
  select decrypted_secret
    into function_url
    from vault.decrypted_secrets
   where name = 'support_inquiry_notify_url'
   limit 1;

  select decrypted_secret
    into webhook_secret
    from vault.decrypted_secrets
   where name = 'support_inquiry_webhook_secret'
   limit 1;

  -- A missing configuration must never prevent a user from submitting an inquiry.
  if function_url is null or webhook_secret is null then
    raise warning 'Support inquiry notification is not configured in Vault.';
    return new;
  end if;

  perform net.http_post(
    url := function_url,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-support-inquiry-webhook-secret', webhook_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'table', tg_table_name,
      'schema', tg_table_schema,
      'record', to_jsonb(new),
      'old_record', null
    )
  );

  return new;
exception
  when others then
    -- pg_net is asynchronous. Do not reject the underlying inquiry if queuing fails.
    raise warning 'Could not queue support inquiry notification: %', sqlerrm;
    return new;
end;
$$;

revoke all on function public.notify_support_inquiry() from public;

drop trigger if exists support_inquiries_notify_support on public.support_inquiries;
create trigger support_inquiries_notify_support
  after insert on public.support_inquiries
  for each row
  execute function public.notify_support_inquiry();

drop trigger if exists product_link_reports_notify_support on public.product_link_reports;
create trigger product_link_reports_notify_support
  after insert on public.product_link_reports
  for each row
  execute function public.notify_support_inquiry();

-- Schedule cleanup-unused-icons Edge Function.
--
-- Replace the project URL and secret before running this snippet.
-- Recommended schedule: once a day during low-traffic hours.

create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.schedule(
  'cleanup-unused-icons-daily',
  '20 3 * * *',
  $$
  select
    net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/cleanup-unused-icons',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer YOUR_ICON_CLEANUP_SECRET'
      ),
      body := jsonb_build_object(
        'graceDays', 14,
        'dryRun', false
      )
    );
  $$
);

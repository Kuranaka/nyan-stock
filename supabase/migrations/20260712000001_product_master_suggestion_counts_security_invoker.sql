-- Apply the querying user's table permissions and RLS policies to this view.
-- Administrators using a service role or the SQL editor retain their elevated access.
alter view public.product_master_suggestion_counts
  set (security_invoker = true);

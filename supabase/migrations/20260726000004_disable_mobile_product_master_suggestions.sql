-- Version 2.0 no longer collects product-master improvement suggestions from
-- inventory created by app users. Disable the legacy client-facing table
-- permissions as well so older app versions cannot continue submitting them.
--
-- Existing rows are intentionally retained. The delete-account function still
-- removes a user's historical rows, while service-role maintenance remains
-- available if an operator later chooses to purge the table.

drop policy if exists "Users can create product master suggestions"
  on public.product_master_suggestions;

drop policy if exists "Users can read own product master suggestions"
  on public.product_master_suggestions;

revoke all on table public.product_master_suggestions from anon, authenticated;

create table if not exists product_link_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  provider text,
  provider_user_id text,
  user_email text,
  household_id text,
  inventory_item_id text not null,
  product_master_id text,
  product_name text not null,
  issue_type text not null check (issue_type in ('purchase_link', 'image', 'variant', 'other')),
  message text,
  image_url text,
  purchase_links jsonb not null default '{}'::jsonb,
  status text not null default 'open' check (status in ('open', 'reviewing', 'resolved', 'closed')),
  created_at timestamptz not null default now()
);

alter table product_link_reports enable row level security;

drop policy if exists "Users can create product link reports" on product_link_reports;
create policy "Users can create product link reports"
  on product_link_reports
  for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can read own product link reports" on product_link_reports;
create policy "Users can read own product link reports"
  on product_link_reports
  for select
  to authenticated
  using (auth.uid() = user_id);

create index if not exists product_link_reports_user_id_created_at_idx
  on product_link_reports (user_id, created_at desc);

create index if not exists product_link_reports_status_created_at_idx
  on product_link_reports (status, created_at desc);

grant insert, select on public.product_link_reports to authenticated;

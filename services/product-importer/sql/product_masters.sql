create table if not exists product_masters (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null
);

create index if not exists product_masters_data_gin_idx on product_masters using gin (data);
create index if not exists product_masters_updated_at_idx on product_masters (updated_at desc);

alter table product_masters enable row level security;

drop policy if exists "Product masters are publicly readable" on product_masters;
create policy "Product masters are publicly readable"
  on product_masters
  for select
  using (true);

grant select on product_masters to anon;
grant select on product_masters to authenticated;

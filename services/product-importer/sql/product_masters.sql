create table if not exists product_masters (
  id text primary key,
  data jsonb not null,
  updated_at timestamptz not null
);

create index if not exists product_masters_data_gin_idx on product_masters using gin (data);
create index if not exists product_masters_updated_at_idx on product_masters (updated_at desc);

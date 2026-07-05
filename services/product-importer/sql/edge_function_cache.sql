create table if not exists edge_function_cache (
  cache_key text primary key,
  cache_type text not null,
  result jsonb not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists edge_function_cache_type_idx on edge_function_cache (cache_type);
create index if not exists edge_function_cache_expires_at_idx on edge_function_cache (expires_at);

alter table edge_function_cache enable row level security;

-- Edge Functionからservice roleで読み書きするキャッシュ。
-- anon/authenticatedには公開しない。

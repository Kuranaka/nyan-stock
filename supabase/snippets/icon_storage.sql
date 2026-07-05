-- Icon storage for cat and product icons.
-- The mobile app uploads compressed 160px JPEG icons to the public `icons` bucket.
--
-- For the current local-first app without account login, anon uploads are enabled.
-- When family sharing/account auth is introduced, replace the anon write policy with
-- owner-scoped authenticated policies.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('icons', 'icons', true, 102400, array['image/jpeg'])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Public icon read" on storage.objects;
create policy "Public icon read"
on storage.objects for select
using (bucket_id = 'icons');

drop policy if exists "Anon icon upload" on storage.objects;
create policy "Anon icon upload"
on storage.objects for insert
with check (
  bucket_id = 'icons'
  and lower((storage.foldername(name))[1]) in ('cats', 'products')
);

create table if not exists public.icon_references (
  owner_kind text not null,
  owner_id text not null,
  bucket_id text not null default 'icons',
  storage_path text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (owner_kind, owner_id),
  constraint icon_references_owner_kind_check check (owner_kind in ('cat', 'inventory_item')),
  constraint icon_references_bucket_check check (bucket_id = 'icons'),
  constraint icon_references_storage_path_check check (
    lower((storage.foldername(storage_path))[1]) in ('cats', 'products')
  )
);

alter table public.icon_references enable row level security;

drop policy if exists "Anon icon reference upsert" on public.icon_references;
create policy "Anon icon reference upsert"
on public.icon_references for insert
with check (bucket_id = 'icons');

drop policy if exists "Anon icon reference update" on public.icon_references;
create policy "Anon icon reference update"
on public.icon_references for update
using (bucket_id = 'icons')
with check (bucket_id = 'icons');

drop policy if exists "Anon icon reference delete" on public.icon_references;
create policy "Anon icon reference delete"
on public.icon_references for delete
using (bucket_id = 'icons');

drop policy if exists "Anon icon reference read" on public.icon_references;
create policy "Anon icon reference read"
on public.icon_references for select
using (bucket_id = 'icons');

drop policy if exists "Anon icon update" on storage.objects;
create policy "Anon icon update"
on storage.objects for update
using (
  bucket_id = 'icons'
  and lower((storage.foldername(name))[1]) in ('cats', 'products')
)
with check (
  bucket_id = 'icons'
  and lower((storage.foldername(name))[1]) in ('cats', 'products')
);

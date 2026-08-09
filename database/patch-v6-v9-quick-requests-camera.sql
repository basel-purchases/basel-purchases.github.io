-- Basel Purchases V9 database patch
-- Run ONCE after the V8 patch (supabase-patch-v5.sql).
-- V9 adds a separate quick-intake area for new requests that can be saved with
-- any currently available information, then completed later.

begin;

-- =========================================================
-- 1) Quick / incoming requests
-- =========================================================
create table if not exists public.quick_requests (
  id uuid primary key default gen_random_uuid(),
  title text not null default '',
  details text not null default '',
  department_code text references public.requesting_entities(code) on delete set null,
  location text not null default '',
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists quick_requests_created_idx
  on public.quick_requests (created_at desc);
create index if not exists quick_requests_department_idx
  on public.quick_requests (department_code);

alter table public.quick_requests
  alter column location set default '';

alter table public.quick_requests
  drop constraint if exists quick_requests_location_check;

create table if not exists public.quick_request_images (
  id uuid primary key default gen_random_uuid(),
  quick_request_id uuid not null references public.quick_requests(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists quick_request_images_request_idx
  on public.quick_request_images (quick_request_id, created_at);

-- =========================================================
-- 2) Actor / timestamp triggers
-- =========================================================
create or replace function public.assign_quick_request_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.location := btrim(coalesce(new.location, ''));
  new.title := btrim(coalesce(new.title, ''));
  new.details := coalesce(new.details, '');


  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.created_by := auth.uid();
      new.updated_by := auth.uid();
    end if;
  else
    new.updated_at := now();
    new.created_by := old.created_by;
    if auth.uid() is not null then
      new.updated_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.assign_quick_image_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists quick_requests_actor on public.quick_requests;
create trigger quick_requests_actor
before insert or update on public.quick_requests
for each row execute function public.assign_quick_request_actor();

drop trigger if exists quick_request_images_actor on public.quick_request_images;
create trigger quick_request_images_actor
before insert on public.quick_request_images
for each row execute function public.assign_quick_image_actor();

-- =========================================================
-- 3) Access helpers and RLS
-- =========================================================
create or replace function public.can_access_quick_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user()
     and exists (
       select 1
       from public.quick_requests r
       where r.id = p_request_id
     );
$$;

-- The Storage policies already call this function using the first folder name.
-- Extend it so the same private purchase-files bucket can also serve V9 quick requests.
create or replace function public.can_access_request_folder(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user()
     and (
       exists (
         select 1
         from public.requests r
         where r.id::text = p_folder
           and r.deleted_at is null
       )
       or exists (
         select 1
         from public.quick_requests q
         where q.id::text = p_folder
       )
     );
$$;

revoke all on function public.can_access_quick_request(uuid) from public, anon;
grant execute on function public.can_access_quick_request(uuid) to authenticated;
revoke all on function public.can_access_request_folder(text) from public, anon;
grant execute on function public.can_access_request_folder(text) to authenticated;

alter table public.quick_requests enable row level security;
alter table public.quick_request_images enable row level security;

drop policy if exists quick_requests_select on public.quick_requests;
create policy quick_requests_select
on public.quick_requests
for select
to authenticated
using (public.is_active_user());

drop policy if exists quick_requests_insert on public.quick_requests;
create policy quick_requests_insert
on public.quick_requests
for insert
to authenticated
with check (public.is_active_user());

drop policy if exists quick_requests_update on public.quick_requests;
create policy quick_requests_update
on public.quick_requests
for update
to authenticated
using (public.is_active_user())
with check (public.is_active_user());

drop policy if exists quick_requests_delete on public.quick_requests;
create policy quick_requests_delete
on public.quick_requests
for delete
to authenticated
using (public.is_active_user());

drop policy if exists quick_request_images_select on public.quick_request_images;
create policy quick_request_images_select
on public.quick_request_images
for select
to authenticated
using (public.can_access_quick_request(quick_request_id));

drop policy if exists quick_request_images_insert on public.quick_request_images;
create policy quick_request_images_insert
on public.quick_request_images
for insert
to authenticated
with check (public.can_access_quick_request(quick_request_id));

drop policy if exists quick_request_images_delete on public.quick_request_images;
create policy quick_request_images_delete
on public.quick_request_images
for delete
to authenticated
using (public.can_access_quick_request(quick_request_id));

-- =========================================================
-- 4) Data API grants
-- =========================================================
revoke all on table public.quick_requests from anon;
revoke all on table public.quick_request_images from anon;

grant select, insert, update, delete on table public.quick_requests to authenticated;
grant select, insert, delete on table public.quick_request_images to authenticated;

grant select, insert, update, delete on table public.quick_requests to service_role;
grant select, insert, update, delete on table public.quick_request_images to service_role;

commit;

notify pgrst, 'reload schema';

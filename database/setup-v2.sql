-- Basel Purchases - Supabase database setup v2
-- Run once from Supabase Dashboard > SQL Editor.
-- This file intentionally contains NO database password, secret API key, or delete password.

begin;

-- Cryptographic helpers for the delete-password hash.
create extension if not exists pgcrypto with schema extensions;

-- Private schema: not exposed through the Data API.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

-- =========================================================
-- 1) Users / profiles
-- Supabase Auth owns auth.users. This public table stores app data only.
-- =========================================================
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  role text not null default 'user' check (role in ('admin', 'user')),
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =========================================================
-- 2) Requesting entities / departments
-- =========================================================
create table if not exists public.requesting_entities (
  code text primary key,
  name_ar text not null unique,
  active boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.requesting_entities (code, name_ar, active, sort_order)
values
  ('operations',  'العمليات',   true, 10),
  ('engineering', 'الهندسية',   true, 20),
  ('technical',   'الفنية',     true, 30)
on conflict (code) do update
set name_ar = excluded.name_ar,
    active = excluded.active,
    sort_order = excluded.sort_order;

-- =========================================================
-- 3) Purchase requests / work orders
-- =========================================================
create sequence if not exists public.request_number_seq start with 1 increment by 1;

create table if not exists public.requests (
  id uuid primary key default gen_random_uuid(),
  request_number text not null unique,
  title text not null,
  request_type text not null check (request_type in ('materials', 'work-order')),
  department_code text not null references public.requesting_entities(code),

  -- Used only for work orders. Material purchase requests use purchase_items.
  description text not null default '',

  initial_price numeric(18,2),
  final_price numeric(18,2),
  currency text not null default 'SYP' check (currency = 'SYP'),
  request_date date not null default current_date,

  is_uploaded boolean not null default true,
  has_quotes boolean not null default false,
  is_purchased boolean not null default false,
  is_settled boolean not null default false,
  offers_count integer not null default 0 check (offers_count >= 0),
  supplier text not null default '',

  sort_order bigint not null default 0,

  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Safe delete: hidden from the normal app but kept for audit/recovery.
  deleted_at timestamptz,
  deleted_by uuid references auth.users(id) on delete set null,

  constraint work_order_description_check check (
    request_type <> 'work-order' or nullif(btrim(description), '') is not null
  )
);

create index if not exists requests_active_sort_idx
  on public.requests (is_settled, sort_order, request_date desc)
  where deleted_at is null;
create index if not exists requests_department_idx
  on public.requests (department_code)
  where deleted_at is null;
create index if not exists requests_type_idx
  on public.requests (request_type)
  where deleted_at is null;

-- =========================================================
-- 4) Material purchase items
-- =========================================================
create table if not exists public.purchase_items (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  item_name text not null,
  specifications text not null default '',
  origin text not null default '',
  quantity numeric(18,3),
  unit text not null default '',
  price numeric(18,2),
  last_entry_price numeric(18,2),
  unit_price numeric(18,2),
  total_price numeric(18,2),
  available boolean not null default true,
  action_if_unavailable text not null default '',
  signal text not null default 'none' check (signal in ('none', 'green', 'red')),
  sort_order integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint purchase_item_nonnegative_quantity check (quantity is null or quantity >= 0),
  constraint purchase_item_nonnegative_price check (price is null or price >= 0),
  constraint purchase_item_nonnegative_last_entry_price check (last_entry_price is null or last_entry_price >= 0),
  constraint purchase_item_nonnegative_unit_price check (unit_price is null or unit_price >= 0),
  constraint purchase_item_nonnegative_total_price check (total_price is null or total_price >= 0),
  constraint purchase_item_single_source_price check (last_entry_price is null or unit_price is null),
  constraint unavailable_action_required check (
    available = true or nullif(btrim(action_if_unavailable), '') is not null
  )
);

create index if not exists purchase_items_request_idx
  on public.purchase_items (request_id, sort_order);
create index if not exists purchase_items_signal_idx
  on public.purchase_items (signal, available);

-- =========================================================
-- 5) Notes
-- =========================================================
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  body text not null,
  author_id uuid references auth.users(id) on delete set null,
  author_name text not null default 'مستخدم',
  created_at timestamptz not null default now(),
  updated_at timestamptz,
  constraint note_not_empty check (nullif(btrim(body), '') is not null)
);

create index if not exists notes_request_idx
  on public.notes (request_id, created_at desc);

-- =========================================================
-- 6) Attachment metadata
-- Actual files are stored in the private Storage bucket: purchase-files
-- Object path format: <request_uuid>/<unique-file-name.ext>
-- =========================================================
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.requests(id) on delete cascade,
  purchase_item_id uuid references public.purchase_items(id) on delete cascade,
  storage_path text not null unique,
  original_name text not null,
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes >= 0),
  kind text not null default 'image' check (kind in ('image', 'document', 'other')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists attachments_request_idx
  on public.attachments (request_id, created_at);
create index if not exists attachments_purchase_item_idx
  on public.attachments (purchase_item_id, created_at);

-- =========================================================
-- 7) Deletion audit log
-- =========================================================
create table if not exists public.deletion_log (
  id bigint generated always as identity primary key,
  request_id uuid not null,
  request_number text not null,
  title text not null,
  request_type text not null,
  deleted_by uuid,
  deleted_by_name text not null,
  deleted_at timestamptz not null default now(),
  snapshot jsonb not null
);

create index if not exists deletion_log_time_idx
  on public.deletion_log (deleted_at desc);

-- =========================================================
-- 8) Private application secrets
-- Only the hash is stored. The plaintext delete password is never stored here.
-- =========================================================
create table if not exists private.app_secrets (
  secret_name text primary key,
  secret_hash text not null,
  updated_at timestamptz not null default now()
);

revoke all on table private.app_secrets from public, anon, authenticated;

create or replace function private.set_delete_password(p_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_password is null or length(p_password) < 4 then
    raise exception 'Delete password must contain at least 4 characters';
  end if;

  insert into private.app_secrets (secret_name, secret_hash, updated_at)
  values (
    'delete_password',
    extensions.crypt(p_password, extensions.gen_salt('bf', 12)),
    now()
  )
  on conflict (secret_name) do update
    set secret_hash = excluded.secret_hash,
        updated_at = excluded.updated_at;
end;
$$;

revoke all on function private.set_delete_password(text) from public, anon, authenticated;

-- =========================================================
-- 9) Helper functions and triggers
-- =========================================================
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.active = true
  );
$$;

create or replace function public.can_access_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user()
     and exists (
       select 1
       from public.requests r
       where r.id = p_request_id
         and r.deleted_at is null
     );
$$;

create or replace function public.can_access_request_folder(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_active_user()
     and exists (
       select 1
       from public.requests r
       where r.id::text = p_folder
         and r.deleted_at is null
     );
$$;

revoke all on function public.is_active_user() from public, anon;
revoke all on function public.can_access_request(uuid) from public, anon;
revoke all on function public.can_access_request_folder(text) from public, anon;
grant execute on function public.is_active_user() to authenticated;
grant execute on function public.can_access_request(uuid) to authenticated;
grant execute on function public.can_access_request_folder(text) to authenticated;

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(new.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'مستخدم'
  );

  insert into public.profiles (id, display_name, role, active)
  values (new.id, v_name, 'user', false)
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- Backfill profiles if a user was created before this script was run.
insert into public.profiles (id, display_name, role, active)
select
  u.id,
  coalesce(
    nullif(u.raw_user_meta_data ->> 'display_name', ''),
    nullif(split_part(coalesce(u.email, ''), '@', 1), ''),
    'مستخدم'
  ),
  'user',
  false
from auth.users u
on conflict (id) do nothing;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function public.assign_request_number_and_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.request_number is null or btrim(new.request_number) = '' then
    new.request_number := 'REQ-' || lpad(nextval('public.request_number_seq')::text, 6, '0');
  end if;

  if auth.uid() is not null then
    new.created_by := auth.uid();
    new.updated_by := auth.uid();
  end if;

  return new;
end;
$$;

create or replace function public.assign_request_update_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;

  -- Keep immutable audit identity fields. deleted_at/deleted_by are not reset here:
  -- the secure deletion RPC needs to set them. The normal client update policy
  -- rejects rows whose deleted_at becomes non-null, so clients cannot bypass it.
  new.created_by := old.created_by;
  new.request_number := old.request_number;

  return new;
end;
$$;

create or replace function public.assign_item_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.created_by := auth.uid();
  end if;

  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;

  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
  end if;

  return new;
end;
$$;

create or replace function public.assign_note_author()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  if tg_op = 'INSERT' and auth.uid() is not null then
    new.author_id := auth.uid();
    select p.display_name into v_name
    from public.profiles p
    where p.id = auth.uid();
    new.author_name := coalesce(v_name, 'مستخدم');
  elsif tg_op = 'UPDATE' then
    new.author_id := old.author_id;
    new.author_name := old.author_name;
    new.updated_at := now();
  end if;

  return new;
end;
$$;

create or replace function public.assign_attachment_actor()
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

-- Triggers

drop trigger if exists requesting_entities_touch_updated_at on public.requesting_entities;
create trigger requesting_entities_touch_updated_at
before update on public.requesting_entities
for each row execute function public.touch_updated_at();

drop trigger if exists profiles_touch_updated_at on public.profiles;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function public.touch_updated_at();

drop trigger if exists requests_before_insert on public.requests;
create trigger requests_before_insert
before insert on public.requests
for each row execute function public.assign_request_number_and_actor();

drop trigger if exists requests_before_update on public.requests;
create trigger requests_before_update
before update on public.requests
for each row execute function public.assign_request_update_actor();

drop trigger if exists purchase_items_actor on public.purchase_items;
create trigger purchase_items_actor
before insert or update on public.purchase_items
for each row execute function public.assign_item_actor();

drop trigger if exists notes_author on public.notes;
create trigger notes_author
before insert or update on public.notes
for each row execute function public.assign_note_author();

drop trigger if exists attachments_actor on public.attachments;
create trigger attachments_actor
before insert on public.attachments
for each row execute function public.assign_attachment_actor();

-- =========================================================
-- 10) Password-protected safe deletion function
-- =========================================================
create or replace function public.delete_request_secure(
  p_request_id uuid,
  p_password text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_request public.requests%rowtype;
  v_user_name text;
  v_snapshot jsonb;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Not authorized';
  end if;

  select s.secret_hash
    into v_hash
  from private.app_secrets s
  where s.secret_name = 'delete_password';

  if v_hash is null then
    raise exception 'Delete password is not configured';
  end if;

  if extensions.crypt(p_password, v_hash) <> v_hash then
    raise exception 'Invalid delete password';
  end if;

  select *
    into v_request
  from public.requests r
  where r.id = p_request_id
    and r.deleted_at is null
  for update;

  if not found then
    raise exception 'Request not found or already deleted';
  end if;

  select p.display_name
    into v_user_name
  from public.profiles p
  where p.id = auth.uid();

  select jsonb_build_object(
    'request', to_jsonb(v_request),
    'items', coalesce((
      select jsonb_agg(to_jsonb(i) order by i.sort_order, i.created_at)
      from public.purchase_items i
      where i.request_id = p_request_id
    ), '[]'::jsonb),
    'notes', coalesce((
      select jsonb_agg(to_jsonb(n) order by n.created_at)
      from public.notes n
      where n.request_id = p_request_id
    ), '[]'::jsonb),
    'attachments', coalesce((
      select jsonb_agg(to_jsonb(a) order by a.created_at)
      from public.attachments a
      where a.request_id = p_request_id
    ), '[]'::jsonb)
  ) into v_snapshot;

  insert into public.deletion_log (
    request_id,
    request_number,
    title,
    request_type,
    deleted_by,
    deleted_by_name,
    snapshot
  ) values (
    v_request.id,
    v_request.request_number,
    v_request.title,
    v_request.request_type,
    auth.uid(),
    coalesce(v_user_name, 'مستخدم'),
    v_snapshot
  );

  update public.requests
  set deleted_at = now(),
      deleted_by = auth.uid(),
      updated_by = auth.uid(),
      updated_at = now()
  where id = p_request_id;

  return jsonb_build_object(
    'ok', true,
    'request_id', v_request.id,
    'request_number', v_request.request_number
  );
end;
$$;

revoke all on function public.delete_request_secure(uuid, text) from public, anon;
grant execute on function public.delete_request_secure(uuid, text) to authenticated;

-- Atomic request + purchase-items creation, so a network/database error cannot leave
-- a materials request without its items.
create or replace function public.create_request_secure(
  p_title text,
  p_request_type text,
  p_department_code text,
  p_description text,
  p_initial_price numeric,
  p_has_quotes boolean,
  p_is_purchased boolean,
  p_is_settled boolean,
  p_offers_count integer,
  p_sort_order bigint,
  p_items jsonb default '[]'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
  v_item record;
begin
  if auth.uid() is null or not public.is_active_user() then
    raise exception 'Not authorized';
  end if;

  if p_request_type not in ('materials', 'work-order') then
    raise exception 'Invalid request type';
  end if;

  insert into public.requests (
    request_number,
    title,
    request_type,
    department_code,
    description,
    initial_price,
    final_price,
    currency,
    request_date,
    is_uploaded,
    has_quotes,
    is_purchased,
    is_settled,
    offers_count,
    supplier,
    sort_order
  ) values (
    '',
    btrim(p_title),
    p_request_type,
    p_department_code,
    case when p_request_type = 'work-order' then coalesce(p_description, '') else '' end,
    p_initial_price,
    p_initial_price,
    'SYP',
    current_date,
    true,
    coalesce(p_has_quotes, false),
    coalesce(p_is_purchased, false),
    coalesce(p_is_settled, false),
    greatest(coalesce(p_offers_count, 0), 0),
    '',
    coalesce(p_sort_order, 0)
  ) returning id into v_request_id;

  if p_request_type = 'materials' then
    if jsonb_typeof(coalesce(p_items, '[]'::jsonb)) <> 'array'
       or jsonb_array_length(coalesce(p_items, '[]'::jsonb)) = 0 then
      raise exception 'A materials request requires at least one item';
    end if;

    for v_item in
      select *
      from jsonb_to_recordset(p_items) as x(
        item_name text,
        specifications text,
        origin text,
        quantity numeric,
        unit text,
        price numeric,
        last_entry_price numeric,
        unit_price numeric,
        total_price numeric,
        available boolean,
        action_if_unavailable text,
        signal text,
        sort_order integer
      )
    loop
      insert into public.purchase_items (
        request_id,
        item_name,
        specifications,
        origin,
        quantity,
        unit,
        price,
        last_entry_price,
        unit_price,
        total_price,
        available,
        action_if_unavailable,
        signal,
        sort_order
      ) values (
        v_request_id,
        btrim(v_item.item_name),
        coalesce(v_item.specifications, ''),
        coalesce(v_item.origin, ''),
        v_item.quantity,
        coalesce(v_item.unit, ''),
        case when v_item.quantity is not null and coalesce(v_item.unit_price, v_item.last_entry_price) is not null
          then v_item.quantity * coalesce(v_item.unit_price, v_item.last_entry_price)
          else coalesce(v_item.total_price, v_item.price) end,
        v_item.last_entry_price,
        v_item.unit_price,
        case when v_item.quantity is not null and coalesce(v_item.unit_price, v_item.last_entry_price) is not null
          then v_item.quantity * coalesce(v_item.unit_price, v_item.last_entry_price)
          else coalesce(v_item.total_price, v_item.price) end,
        coalesce(v_item.available, true),
        coalesce(v_item.action_if_unavailable, ''),
        coalesce(v_item.signal, 'none'),
        coalesce(v_item.sort_order, 0)
      );
    end loop;
  end if;

  return v_request_id;
end;
$$;

revoke all on function public.create_request_secure(text, text, text, text, numeric, boolean, boolean, boolean, integer, bigint, jsonb) from public, anon;
grant execute on function public.create_request_secure(text, text, text, text, numeric, boolean, boolean, boolean, integer, bigint, jsonb) to authenticated;


-- =========================================================
-- 11) Row Level Security
-- =========================================================
alter table public.profiles enable row level security;
alter table public.requesting_entities enable row level security;
alter table public.requests enable row level security;
alter table public.purchase_items enable row level security;
alter table public.notes enable row level security;
alter table public.attachments enable row level security;
alter table public.deletion_log enable row level security;

-- Profiles: authenticated active users may read names/roles; writes are admin-only via trusted admin tooling.
drop policy if exists profiles_select_active_users on public.profiles;
create policy profiles_select_active_users
on public.profiles
for select
to authenticated
using (public.is_active_user());

-- Requesting entities: app can read them; management changes happen via trusted admin tooling.
drop policy if exists requesting_entities_select on public.requesting_entities;
create policy requesting_entities_select
on public.requesting_entities
for select
to authenticated
using (public.is_active_user());

-- Requests: all active users can read/create/update active documents. Direct DELETE is intentionally denied.
drop policy if exists requests_select on public.requests;
create policy requests_select
on public.requests
for select
to authenticated
using (public.is_active_user() and deleted_at is null);

drop policy if exists requests_insert on public.requests;
create policy requests_insert
on public.requests
for insert
to authenticated
with check (public.is_active_user() and deleted_at is null);

drop policy if exists requests_update on public.requests;
create policy requests_update
on public.requests
for update
to authenticated
using (public.is_active_user() and deleted_at is null)
with check (public.is_active_user() and deleted_at is null);

-- Purchase items
drop policy if exists purchase_items_select on public.purchase_items;
create policy purchase_items_select
on public.purchase_items
for select
to authenticated
using (public.can_access_request(request_id));

drop policy if exists purchase_items_insert on public.purchase_items;
create policy purchase_items_insert
on public.purchase_items
for insert
to authenticated
with check (public.can_access_request(request_id));

drop policy if exists purchase_items_update on public.purchase_items;
create policy purchase_items_update
on public.purchase_items
for update
to authenticated
using (public.can_access_request(request_id))
with check (public.can_access_request(request_id));

drop policy if exists purchase_items_delete on public.purchase_items;
create policy purchase_items_delete
on public.purchase_items
for delete
to authenticated
using (public.can_access_request(request_id));

-- Notes: everybody can read; only the note owner can edit/delete their own note.
drop policy if exists notes_select on public.notes;
create policy notes_select
on public.notes
for select
to authenticated
using (public.can_access_request(request_id));

drop policy if exists notes_insert on public.notes;
create policy notes_insert
on public.notes
for insert
to authenticated
with check (
  public.can_access_request(request_id)
  and author_id = auth.uid()
);

drop policy if exists notes_update_own on public.notes;
create policy notes_update_own
on public.notes
for update
to authenticated
using (
  public.can_access_request(request_id)
  and author_id = auth.uid()
)
with check (
  public.can_access_request(request_id)
  and author_id = auth.uid()
);

drop policy if exists notes_delete_own on public.notes;
create policy notes_delete_own
on public.notes
for delete
to authenticated
using (
  public.can_access_request(request_id)
  and author_id = auth.uid()
);

-- Attachment metadata
drop policy if exists attachments_select on public.attachments;
create policy attachments_select
on public.attachments
for select
to authenticated
using (public.can_access_request(request_id));

drop policy if exists attachments_insert on public.attachments;
create policy attachments_insert
on public.attachments
for insert
to authenticated
with check (public.can_access_request(request_id));

drop policy if exists attachments_update on public.attachments;
create policy attachments_update
on public.attachments
for update
to authenticated
using (public.can_access_request(request_id))
with check (public.can_access_request(request_id));

drop policy if exists attachments_delete on public.attachments;
create policy attachments_delete
on public.attachments
for delete
to authenticated
using (public.can_access_request(request_id));

-- Deletion log: readable to active users; only the secure deletion function can insert it.
drop policy if exists deletion_log_select on public.deletion_log;
create policy deletion_log_select
on public.deletion_log
for select
to authenticated
using (public.is_active_user());

-- =========================================================
-- 12) Explicit Data API grants
-- Needed because new tables were configured NOT to be exposed automatically.
-- No anon access is granted.
-- =========================================================
revoke all on table public.profiles from anon;
revoke all on table public.requesting_entities from anon;
revoke all on table public.requests from anon;
revoke all on table public.purchase_items from anon;
revoke all on table public.notes from anon;
revoke all on table public.attachments from anon;
revoke all on table public.deletion_log from anon;

-- Least-privilege grants for signed-in users.
grant select on table public.profiles to authenticated;
grant select on table public.requesting_entities to authenticated;
grant select, insert, update on table public.requests to authenticated;
grant select, insert, update, delete on table public.purchase_items to authenticated;
grant select, insert, update, delete on table public.notes to authenticated;
grant select, insert, update, delete on table public.attachments to authenticated;
grant select on table public.deletion_log to authenticated;

-- Trusted local/admin tooling that uses sb_secret_... may manage app tables.
-- The secret key must never be placed in the public web app or GitHub.
grant select, insert, update, delete on table public.profiles to service_role;
grant select, insert, update, delete on table public.requesting_entities to service_role;
grant select, insert, update, delete on table public.requests to service_role;
grant select, insert, update, delete on table public.purchase_items to service_role;
grant select, insert, update, delete on table public.notes to service_role;
grant select, insert, update, delete on table public.attachments to service_role;
grant select, insert, update, delete on table public.deletion_log to service_role;
grant usage, select on sequence public.request_number_seq to service_role;

-- =========================================================
-- 13) Private Storage bucket policies
-- Create the bucket named purchase-files from Dashboard > Storage BEFORE using uploads.
-- Store files as: <request_uuid>/<unique-name.ext>
-- =========================================================

drop policy if exists purchase_files_select on storage.objects;
create policy purchase_files_select
on storage.objects
for select
to authenticated
using (
  bucket_id = 'purchase-files'
  and public.can_access_request_folder((storage.foldername(name))[1])
);

drop policy if exists purchase_files_insert on storage.objects;
create policy purchase_files_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'purchase-files'
  and public.can_access_request_folder((storage.foldername(name))[1])
);

drop policy if exists purchase_files_update on storage.objects;
create policy purchase_files_update
on storage.objects
for update
to authenticated
using (
  bucket_id = 'purchase-files'
  and public.can_access_request_folder((storage.foldername(name))[1])
)
with check (
  bucket_id = 'purchase-files'
  and public.can_access_request_folder((storage.foldername(name))[1])
);

drop policy if exists purchase_files_delete on storage.objects;
create policy purchase_files_delete
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'purchase-files'
  and public.can_access_request_folder((storage.foldername(name))[1])
);

commit;

-- =========================================================
-- AFTER THIS SCRIPT SUCCEEDS, set the delete password manually in SQL Editor:
--   select private.set_delete_password('<YOUR DELETE PASSWORD>');
-- Do not commit that password-setting statement to a public GitHub repository.
-- =========================================================

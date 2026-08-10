-- Basel Purchases V9.3 database patch
-- Run ONCE after V9.2.
-- Adds role: quick_user
-- admin/user: may access purchase requests + work orders + quick requests.
-- quick_user: may access quick requests only.

begin;

-- 1) Allow the new application role in public.profiles.
alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check
  check (role in ('admin', 'user', 'quick_user'));

-- 2) Central permission helper for purchase requests and work orders.
create or replace function public.can_access_purchase_requests()
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
      and p.role in ('admin', 'user')
  );
$$;

revoke all on function public.can_access_purchase_requests() from public, anon;
grant execute on function public.can_access_purchase_requests() to authenticated;

-- quick_user only needs its own profile row for login/session display.
drop policy if exists profiles_select_active_users on public.profiles;
create policy profiles_select_active_users
on public.profiles
for select
to authenticated
using (
  public.is_active_user()
  and (public.can_access_purchase_requests() or id = auth.uid())
);

-- 3) Child records of purchase requests inherit the same restriction.
create or replace function public.can_access_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.can_access_purchase_requests()
     and exists (
       select 1
       from public.requests r
       where r.id = p_request_id
         and r.deleted_at is null
     );
$$;

revoke all on function public.can_access_request(uuid) from public, anon;
grant execute on function public.can_access_request(uuid) to authenticated;

-- 4) Storage access: purchase folders require admin/user; quick-request folders
-- remain available to every active application user, including quick_user.
create or replace function public.can_access_request_folder(p_folder text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select (
      public.can_access_purchase_requests()
      and exists (
        select 1
        from public.requests r
        where r.id::text = p_folder
          and r.deleted_at is null
      )
    )
    or (
      public.is_active_user()
      and exists (
        select 1
        from public.quick_requests q
        where q.id::text = p_folder
      )
    );
$$;

revoke all on function public.can_access_request_folder(text) from public, anon;
grant execute on function public.can_access_request_folder(text) to authenticated;

-- 5) Guard the request triggers as well. This also blocks the SECURITY DEFINER
-- create/delete RPC paths from quick_user, even though those functions bypass RLS.
create or replace function public.assign_request_number_and_actor()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.can_access_purchase_requests() then
    raise exception 'This account is limited to quick requests';
  end if;

  if new.request_number is null or btrim(new.request_number) = '' then
    raise exception 'Request number is required';
  end if;

  new.request_number := btrim(new.request_number);

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
  if auth.uid() is not null and not public.can_access_purchase_requests() then
    raise exception 'This account is limited to quick requests';
  end if;

  new.updated_at := now();
  if auth.uid() is not null then
    new.updated_by := auth.uid();
  end if;

  new.created_by := old.created_by;

  if new.request_number is distinct from old.request_number then
    if new.request_number is null or btrim(new.request_number) = '' then
      raise exception 'Request number is required';
    end if;

    new.request_number := btrim(new.request_number);
  end if;

  return new;
end;
$$;

-- 6) Main requests RLS: only admin/user may see or change purchase/work-order rows.
drop policy if exists requests_select on public.requests;
create policy requests_select
on public.requests
for select
to authenticated
using (public.can_access_purchase_requests() and deleted_at is null);

drop policy if exists requests_insert on public.requests;
create policy requests_insert
on public.requests
for insert
to authenticated
with check (public.can_access_purchase_requests() and deleted_at is null);

drop policy if exists requests_update on public.requests;
create policy requests_update
on public.requests
for update
to authenticated
using (public.can_access_purchase_requests() and deleted_at is null)
with check (public.can_access_purchase_requests() and deleted_at is null);

-- Child-table policies already call public.can_access_request(), so they become
-- restricted automatically after redefining that helper above.

-- Deletion history belongs to the purchase/work-order area too.
drop policy if exists deletion_log_select on public.deletion_log;
create policy deletion_log_select
on public.deletion_log
for select
to authenticated
using (public.can_access_purchase_requests());

commit;

notify pgrst, 'reload schema';

-- =========================================================
-- ASSIGN AN EXISTING AUTH USER TO THE NEW ROLE
-- Replace the email below, then run this statement separately if needed.
-- =========================================================
-- update public.profiles p
-- set role = 'quick_user', active = true, updated_at = now()
-- from auth.users u
-- where p.id = u.id
--   and lower(u.email) = lower('new-user@example.com');

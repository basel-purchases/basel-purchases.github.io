-- Basel Purchases - small patch required before publishing V5.
-- Run once in Supabase Dashboard > SQL Editor.
-- Fixes secure soft-delete: direct client updates are still blocked by RLS when deleted_at becomes non-null.

begin;

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

  -- Client-editable updates may never rewrite the original creator or request number.
  -- deleted_at/deleted_by are intentionally NOT reset here: the secure deletion RPC
  -- must be able to set them. Ordinary authenticated updates are still prevented
  -- from soft-deleting rows by the requests_update RLS WITH CHECK condition.
  new.created_by := old.created_by;
  new.request_number := old.request_number;

  return new;
end;
$$;


-- Defense in depth: any future Auth user starts inactive until explicitly approved.
-- Existing five approved profiles keep their current active=true values.
alter table public.profiles alter column active set default false;

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
        v_item.price,
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

commit;

-- Basel Purchases V7 database patch
-- Run ONCE after the V6 patch (supabase-patch-v3.sql).
-- V7 adds: date of last entry for each material item.
-- Editing requests/items and adding request images use the existing V6 RLS policies,
-- which already allow authenticated active users to UPDATE/INSERT the relevant rows.

begin;

alter table public.purchase_items
  add column if not exists last_entry_date date;

-- Keep the same RPC signature used by V6.
-- V7 reads last_entry_date from each item object inside p_items JSON.
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
        last_entry_date date,
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
        last_entry_date,
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
        v_item.last_entry_date,
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

commit;

notify pgrst, 'reload schema';

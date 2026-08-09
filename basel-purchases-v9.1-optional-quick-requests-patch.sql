-- Basel Purchases V9.1 database patch
-- Safe to run after the original V9 patch.
-- Makes the quick-request location optional so a request can be captured with
-- any currently available information. Images are already optional at DB level.

begin;

alter table public.quick_requests
  alter column location set default '';

alter table public.quick_requests
  drop constraint if exists quick_requests_location_check;

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

commit;

notify pgrst, 'reload schema';

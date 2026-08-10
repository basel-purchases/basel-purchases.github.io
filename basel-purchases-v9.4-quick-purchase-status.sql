-- Basel Purchases V9.4 database patch
-- Run ONCE after the V9.3 patch.
-- Adds the purchase-request-created status to quick requests.

begin;

alter table public.quick_requests
  add column if not exists purchase_request_created boolean default false;

update public.quick_requests
set purchase_request_created = false
where purchase_request_created is null;

alter table public.quick_requests
  alter column purchase_request_created set default false,
  alter column purchase_request_created set not null;

create index if not exists quick_requests_purchase_created_idx
  on public.quick_requests (purchase_request_created, created_at desc);

commit;

notify pgrst, 'reload schema';

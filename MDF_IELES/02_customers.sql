-- AK Solar App, Phase 2: customers table
-- Run this once in Supabase: SQL Editor > New query > paste all > Run.
-- Safe to run again; it will not delete existing customers.
-- (If you already ran your original 02_customers.sql, you do NOT need to run this copy.)

create table if not exists public.customers (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 120),
  phone             text check (phone is null or phone ~ '^\+?[0-9]{10,15}$'),
  address           text,
  registration_type text not null default 'Unregistered' check (registration_type in ('Registered', 'Unregistered')),
  cnic_or_ntn       text check (cnic_or_ntn is null or cnic_or_ntn ~ '^([0-9]{7}|[0-9]{13})$'),
  created_by        uuid default auth.uid() references auth.users (id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint customers_registered_needs_number
    check (registration_type <> 'Registered' or cnic_or_ntn is not null)
);

create index if not exists customers_name_idx on public.customers (lower(name));
create index if not exists customers_phone_idx on public.customers (phone);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
  before update on public.customers
  for each row execute function public.set_updated_at();

alter table public.customers enable row level security;

revoke all on public.customers from anon;
grant select, insert, update, delete on public.customers to authenticated;

drop policy if exists "Signed-in users can view customers"   on public.customers;
drop policy if exists "Signed-in users can add customers"    on public.customers;
drop policy if exists "Signed-in users can edit customers"   on public.customers;
drop policy if exists "Signed-in users can delete customers" on public.customers;

create policy "Signed-in users can view customers"
  on public.customers for select to authenticated using (true);
create policy "Signed-in users can add customers"
  on public.customers for insert to authenticated with check (true);
create policy "Signed-in users can edit customers"
  on public.customers for update to authenticated using (true) with check (true);
create policy "Signed-in users can delete customers"
  on public.customers for delete to authenticated using (true);

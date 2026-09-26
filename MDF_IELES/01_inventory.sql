-- AK Solar App, Phase 1: inventory table
-- Run this once in Supabase: SQL Editor > New query > paste all > Run.
-- It is safe to run again; it will not delete existing stock.

create table if not exists public.inventory (
  id              uuid primary key default gen_random_uuid(),
  category        text not null check (category in ('battery', 'panel', 'accessory')),
  brand           text not null,
  model           text not null,
  type            text,                       -- battery: Lithium/Tubular/Lead-acid/Dry; panel and accessory: free text
  voltage         numeric(6,2)  check (voltage is null or voltage > 0),
  plates          integer       check (plates is null or plates > 0),
  ah_rating       numeric(8,2)  check (ah_rating is null or ah_rating > 0),
  wattage         integer       check (wattage is null or wattage > 0),
  warranty_months integer       check (warranty_months is null or warranty_months > 0),
  cost_price      numeric(12,2) not null default 0 check (cost_price >= 0),
  sale_price      numeric(12,2) not null default 0 check (sale_price >= 0),
  quantity        integer       not null default 0 check (quantity >= 0),
  reorder_level   integer       not null default 0 check (reorder_level >= 0),
  -- FBR-ready fields, used by invoices in Phase 3
  hs_code         text check (hs_code is null or hs_code ~ '^[0-9]{4}\.[0-9]{4}$'),
  uom             text not null default 'Numbers, pieces, units',
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists inventory_category_idx on public.inventory (category);
create index if not exists inventory_brand_model_idx on public.inventory (lower(brand), lower(model));

-- Keep updated_at correct on every edit
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

drop trigger if exists inventory_set_updated_at on public.inventory;
create trigger inventory_set_updated_at
  before update on public.inventory
  for each row execute function public.set_updated_at();

-- Security: only signed-in users can touch inventory. Nobody else can see it.
-- (Phase 8 will refine this into Owner / Staff / Accountant permissions.)
alter table public.inventory enable row level security;

revoke all on public.inventory from anon;
grant select, insert, update, delete on public.inventory to authenticated;

drop policy if exists "Signed-in users can view inventory"   on public.inventory;
drop policy if exists "Signed-in users can add inventory"    on public.inventory;
drop policy if exists "Signed-in users can edit inventory"   on public.inventory;
drop policy if exists "Signed-in users can delete inventory" on public.inventory;

create policy "Signed-in users can view inventory"
  on public.inventory for select to authenticated using (true);

create policy "Signed-in users can add inventory"
  on public.inventory for insert to authenticated with check (true);

create policy "Signed-in users can edit inventory"
  on public.inventory for update to authenticated using (true) with check (true);

create policy "Signed-in users can delete inventory"
  on public.inventory for delete to authenticated using (true);

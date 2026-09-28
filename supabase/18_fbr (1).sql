-- =====================================================================================================
-- AK Solar App, FBR Digital Invoicing, Phase D1: database  (file name: 18_fbr.sql)
-- Run ONCE in Supabase: SQL Editor > New query > paste ALL > Run.   Safe to run again.
--
-- Run this AFTER 01, 02, 03, 12, 16 and 17 (you already have them).
-- (The plan called this file "16_fbr.sql", but 16 and 17 are already used by roles and audit.)
--
-- What this does:
--   1. Adds FBR settings to business_profile (off by default).
--   2. Adds a province to customers, and FBR tax setup fields to inventory.
--   3. Creates the FBR tables: fbr_invoices, fbr_invoice_items, fbr_submissions,
--      fbr_reference, fbr_heartbeat.
--   4. Creates create_fbr_bill(): a wrapper that calls the EXISTING create_invoice() in the same
--      transaction, then saves the FBR record. If anything fails, nothing is saved.
--
-- What this does NOT do:
--   * It does not change create_invoice(), record_payment(), or any existing bill, payment,
--     stock movement or report. Old bills stay normal bills.
--   * It does not send anything to FBR. The sender (Phase D4) does that later.
--   * Nothing changes on screen until Phase D2. FBR stays OFF (fbr_enabled = false).
-- =====================================================================================================

-- ----------------------------------------------------------------------------------- 0. safety check
do $$
begin
  if to_regprocedure('public.role_in(text[])') is null then
    raise exception 'Run 16_roles_and_audit.sql and 17_role_enforcement.sql first (role_in() is missing).';
  end if;
  -- Your live create_invoice() has extra walk-in inputs (phone, address, registration type, CNIC),
  -- so we look it up by name instead of by one exact list of inputs.
  if not exists (
    select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'create_invoice'
  ) then
    raise exception 'Run 03_invoices.sql first (create_invoice() is missing).';
  end if;
end $$;

-- ----------------------------------------------------------------------------------- 1. business_profile
alter table public.business_profile
  add column if not exists fbr_enabled       boolean not null default false,
  add column if not exists fbr_environment   text    not null default 'sandbox',
  add column if not exists prices_include_tax boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_profile_fbr_environment_check'
      and conrelid = 'public.business_profile'::regclass
  ) then
    alter table public.business_profile
      add constraint business_profile_fbr_environment_check
      check (fbr_environment in ('sandbox', 'production'));
  end if;
end $$;

comment on column public.business_profile.prices_include_tax is
  'false = GST is added on top of the selling price (owner decision). Third Schedule items ignore this.';

-- ----------------------------------------------------------------------------------- 2. customers + inventory
alter table public.customers
  add column if not exists province text;   -- exact FBR spelling, e.g. Sindh

alter table public.inventory
  add column if not exists sale_type          text not null default 'Goods at standard rate (default)',
  add column if not exists fbr_rate_desc      text,                       -- e.g. '18%', '10%'. Set per item.
  add column if not exists is_taxable         boolean not null default true,
  add column if not exists retail_price       numeric(14,2),              -- printed price, Third Schedule items
  add column if not exists sro_schedule_no    text,
  add column if not exists sro_item_serial_no text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'inventory_retail_price_check' and conrelid = 'public.inventory'::regclass
  ) then
    alter table public.inventory
      add constraint inventory_retail_price_check check (retail_price is null or retail_price >= 0);
  end if;
end $$;

-- Rates are NEVER hard-coded in the app. They come from these item settings (later from the FBR lists).
-- Optional, do it later from the Inventory screen (Phase D3), or in the SQL editor once the accountant agrees:
--   update public.inventory set fbr_rate_desc = '18%' where category = 'accessory';
--   update public.inventory set fbr_rate_desc = '10%', sale_type = 'Goods at Reduced Rate' where category = 'panel';

-- ----------------------------------------------------------------------------------- 3. FBR tables
-- 3a. one row per FBR bill
create table if not exists public.fbr_invoices (
  invoice_id         uuid primary key references public.invoices (id) on delete restrict,
  environment        text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  buyer_province     text,
  buyer_address      text,
  invoice_ref_no     text,                 -- debit notes only
  scenario_id        text,                 -- sandbox only
  fbr_status         text not null default 'pending'
                       check (fbr_status in ('pending', 'sending', 'sent', 'failed', 'unknown')),
  fbr_invoice_number text unique,
  submitted_at       timestamptz,
  error_code         text,
  error_message      text,
  attempts           integer not null default 0,
  next_retry_at      timestamptz,
  created_offline    boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
create index if not exists fbr_invoices_status_idx on public.fbr_invoices (fbr_status, created_at);

-- 3b. one row per line: the FBR numbers exactly as they will be sent
create table if not exists public.fbr_invoice_items (
  invoice_item_id     uuid primary key references public.invoice_items (id) on delete cascade,
  invoice_id          uuid not null references public.invoices (id) on delete cascade,
  hs_code             text,
  product_description text,
  fbr_rate_desc       text,                -- FBR "rate", e.g. '18%'. NOT our price.
  uom                 text,
  quantity            numeric(14,4),
  total_values        numeric(14,2),
  value_sales_excl_st numeric(14,2),
  fixed_notified_value numeric(14,2),
  sales_tax_applicable numeric(14,2),
  sales_tax_withheld  numeric(14,2) not null default 0,
  extra_tax           numeric(14,2) not null default 0,
  further_tax         numeric(14,2) not null default 0,
  fed_payable         numeric(14,2) not null default 0,
  discount            numeric(14,2) not null default 0,
  sro_schedule_no     text,
  sro_item_serial_no  text,
  sale_type           text
);
create index if not exists fbr_invoice_items_invoice_idx on public.fbr_invoice_items (invoice_id);

-- 3c. log of every try
create table if not exists public.fbr_submissions (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.invoices (id) on delete cascade,
  environment     text,
  attempted_at    timestamptz not null default now(),
  http_status     integer,
  fbr_status_code text,
  error_code      text,
  error_message   text,
  request_json    jsonb,
  response_json   jsonb
);
create index if not exists fbr_submissions_invoice_idx on public.fbr_submissions (invoice_id, attempted_at desc);

-- 3d. cache of the FBR lists (provinces, HS codes, UOM, rates, SRO...)
create table if not exists public.fbr_reference (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('hs_code', 'uom', 'province', 'rate', 'sale_type', 'sro', 'hs_uom')),
  code       text not null default '',
  label      text,
  payload    jsonb,
  fetched_at timestamptz not null default now(),
  unique (kind, code)
);

-- 3e. one row the sender updates every minute ("sender offline" warning)
create table if not exists public.fbr_heartbeat (
  id             boolean primary key default true check (id),
  last_seen      timestamptz,
  environment    text,
  sender_version text,
  note           text
);
insert into public.fbr_heartbeat (id) values (true) on conflict (id) do nothing;

drop trigger if exists fbr_invoices_set_updated_at on public.fbr_invoices;
create trigger fbr_invoices_set_updated_at
  before update on public.fbr_invoices
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------------- 4. security
-- Signed-in team members can only READ. Only functions and the sender (service-role key) write.
alter table public.fbr_invoices      enable row level security;
alter table public.fbr_invoice_items enable row level security;
alter table public.fbr_submissions   enable row level security;
alter table public.fbr_reference     enable row level security;
alter table public.fbr_heartbeat     enable row level security;

revoke all on public.fbr_invoices, public.fbr_invoice_items, public.fbr_submissions,
              public.fbr_reference, public.fbr_heartbeat from anon, authenticated;
grant select on public.fbr_invoices, public.fbr_invoice_items, public.fbr_submissions,
                public.fbr_reference, public.fbr_heartbeat to authenticated;
grant all on public.fbr_invoices, public.fbr_invoice_items, public.fbr_submissions,
             public.fbr_reference, public.fbr_heartbeat to service_role;

drop policy if exists "Team can view fbr_invoices"      on public.fbr_invoices;
drop policy if exists "Team can view fbr_invoice_items" on public.fbr_invoice_items;
drop policy if exists "Owner can view fbr_submissions"  on public.fbr_submissions;
drop policy if exists "Team can view fbr_reference"     on public.fbr_reference;
drop policy if exists "Team can view fbr_heartbeat"     on public.fbr_heartbeat;

create policy "Team can view fbr_invoices"      on public.fbr_invoices
  for select to authenticated using ((select public.current_app_role()) is not null);
create policy "Team can view fbr_invoice_items" on public.fbr_invoice_items
  for select to authenticated using ((select public.current_app_role()) is not null);
create policy "Owner can view fbr_submissions"  on public.fbr_submissions
  for select to authenticated using ((select public.current_app_role()) in ('owner', 'accountant'));
create policy "Team can view fbr_reference"     on public.fbr_reference
  for select to authenticated using ((select public.current_app_role()) is not null);
create policy "Team can view fbr_heartbeat"     on public.fbr_heartbeat
  for select to authenticated using ((select public.current_app_role()) is not null);

-- ----------------------------------------------------------------------------------- 5. tax maths for one line
-- The ONE place where FBR line figures are calculated in the database (D2 adds lib/tax.ts to match it).
--   Standard / reduced / exempt goods:
--       GST on top:   value = quantity x price,  tax = value x rate,  total = value + tax
--       (if prices_include_tax = true:  value = price / (1 + rate), tax = price - value)
--   Third Schedule goods:  tax = printed retail price x rate. The customer still pays only the printed price.
--
-- PROVISIONAL (settle with PRAL and the sandbox in Phase D6, plan section 1):
--   * fixedNotifiedValueOrRetailPrice is stored as retail price x quantity (line total).
--   * For Third Schedule lines: value = selling line value, total = value + tax.
-- Only this function needs to change when PRAL answers.
create or replace function public._fbr_line_figures(
  p_sale_type   text,
  p_rate_desc   text,
  p_qty         numeric,
  p_price       numeric,
  p_retail      numeric,
  p_sro         text,
  p_sro_serial  text,
  p_incl        boolean,
  p_item        text,
  out o_value   numeric,
  out o_tax     numeric,
  out o_total   numeric,
  out o_fixed   numeric,
  out o_add     numeric      -- tax that is ADDED to what the customer pays
)
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_rate numeric;
  v_line numeric := round(p_qty * round(p_price, 2), 2);
  v_type text := coalesce(p_sale_type, '');
begin
  if p_rate_desc is null or btrim(p_rate_desc) = '' then
    raise exception 'Set the GST rate for "%" in Inventory before making an FBR bill (for example 18%%).', p_item;
  end if;

  if p_rate_desc ~* '^\s*exempt' then
    v_rate := 0;
  elsif btrim(p_rate_desc) ~ '^[0-9]+(\.[0-9]+)?\s*%$' then
    v_rate := replace(replace(btrim(p_rate_desc), '%', ''), ' ', '')::numeric;
  else
    raise exception 'The GST rate of "%" (%) is not valid. Use a form like 18%%.', p_item, p_rate_desc;
  end if;

  if v_type ilike '%reduced%' or v_type ilike 'exempt%' then
    if nullif(btrim(coalesce(p_sro, '')), '') is null or nullif(btrim(coalesce(p_sro_serial, '')), '') is null then
      raise exception 'Item "%" needs its SRO / Schedule number and item serial in Inventory (FBR errors 0077, 0078).', p_item;
    end if;
  end if;

  if v_type ilike '3rd schedule%' then
    if p_retail is null or p_retail <= 0 then
      raise exception 'Item "%" is a Third Schedule item. Enter its printed retail price in Inventory (FBR error 0090).', p_item;
    end if;
    o_fixed := round(p_retail * p_qty, 2);
    o_value := v_line;
    o_tax   := round(o_fixed * v_rate / 100, 2);
    o_total := o_value + o_tax;
    o_add   := 0;                                   -- printed price already carries the tax
  elsif p_incl then
    o_fixed := 0;
    o_value := round(v_line / (1 + v_rate / 100), 2);
    o_tax   := v_line - o_value;
    o_total := v_line;
    o_add   := 0;
  else
    o_fixed := 0;
    o_value := v_line;
    o_tax   := round(v_line * v_rate / 100, 2);
    o_total := o_value + o_tax;
    o_add   := o_tax;
  end if;
end;
$$;
revoke all on function public._fbr_line_figures(text, text, numeric, numeric, numeric, text, text, boolean, text)
  from public, anon, authenticated;

-- ----------------------------------------------------------------------------------- 6. create_fbr_bill
-- Same inputs as create_invoice() (including the walk-in phone/address/type/CNIC), plus the buyer province/address for FBR.
-- 1. Calls the existing create_invoice() (bill, lines, payment, stock, all in this transaction).
-- 2. Saves the FBR header and one FBR line per bill line.
-- 3. If GST is added on top, adds it to the bill total and takes the extra payment.
-- Any error anywhere = the whole thing is undone. The customer's item lines (invoice_items) are not touched.
create or replace function public.create_fbr_bill(
  p_customer_id     uuid,
  p_walkin_name     text,
  p_note            text,
  p_invoice_date    date,
  p_items           jsonb,
  p_paid            numeric,
  p_method          text,
  p_buyer_province  text    default null,
  p_buyer_address   text    default null,
  p_created_offline boolean default false,
  p_walkin_phone    text    default null,
  p_walkin_address  text    default null,
  p_walkin_registration_type text default null,
  p_walkin_cnic_or_ntn       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prof      public.business_profile%rowtype;
  v_cust      public.customers%rowtype;
  v_id        uuid;
  v_method    text := coalesce(nullif(p_method, ''), 'cash');
  v_paid      numeric(14,2) := round(coalesce(p_paid, 0), 2);
  v_pretax    numeric(14,2);
  v_paid_first numeric(14,2);
  v_tax_add   numeric(14,2) := 0;
  v_grand     numeric(14,2);
  v_prov      text;
  v_addr      text;
  v_line      record;
  f           record;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if not public.role_in(array['owner', 'counter_staff']) then
    raise exception 'Your role is not allowed to make bills. Ask the Owner.' using errcode = '42501';
  end if;

  select * into v_prof from public.business_profile where id;
  if not v_prof.fbr_enabled then
    raise exception 'FBR bills are switched off. The Owner can switch them on in the shop profile.';
  end if;
  if v_prof.ntn is null then
    raise exception 'The shop NTN is missing in the business profile.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the bill.';
  end if;

  -- Same total create_invoice() will calculate (price x quantity, before any GST added on top)
  select coalesce(sum(round(x.quantity * round(x.rate, 2), 2)), 0)
    into v_pretax
  from jsonb_to_recordset(p_items) as x(inventory_id uuid, quantity integer, rate numeric);

  v_paid_first := least(v_paid, v_pretax);

  if p_customer_id is not null then
    select * into v_cust from public.customers where id = p_customer_id;
  end if;

  v_prov := coalesce(nullif(btrim(p_buyer_province), ''), nullif(btrim(v_cust.province), ''), nullif(btrim(v_prof.province), ''));
  v_addr := coalesce(nullif(btrim(p_buyer_address), ''), nullif(btrim(v_cust.address), ''),
                     nullif(btrim(p_walkin_address), ''), nullif(btrim(v_prof.address), ''));
  if v_prov is null then
    raise exception 'Choose the buyer''s province (FBR error 0074).';
  end if;

  -- The normal bill (all existing checks, stock, payment)
  -- Named inputs, exactly as the app calls it today
  v_id := public.create_invoice(
    p_customer_id => p_customer_id,
    p_walkin_name => p_walkin_name,
    p_note        => p_note,
    p_invoice_date => p_invoice_date,
    p_items       => p_items,
    p_paid        => v_paid_first,
    p_method      => v_method,
    p_walkin_phone => p_walkin_phone,
    p_walkin_address => p_walkin_address,
    p_walkin_registration_type => p_walkin_registration_type,
    p_walkin_cnic_or_ntn => p_walkin_cnic_or_ntn
  );

  insert into public.fbr_invoices (invoice_id, environment, buyer_province, buyer_address, created_offline)
  values (v_id, v_prof.fbr_environment, v_prov, v_addr, coalesce(p_created_offline, false));

  for v_line in
    select ii.id, ii.description, ii.hs_code, ii.uom, ii.quantity, ii.rate,
           inv.sale_type, inv.fbr_rate_desc, inv.retail_price, inv.sro_schedule_no, inv.sro_item_serial_no
    from public.invoice_items ii
    join public.inventory inv on inv.id = ii.inventory_id
    where ii.invoice_id = v_id
    order by ii.created_at, ii.id
  loop
    if v_line.hs_code is null then
      raise exception 'Item "%" has no HS code. Add it in Inventory (FBR errors 0019, 0044).', v_line.description;
    end if;

    select * into f
    from public._fbr_line_figures(
      v_line.sale_type, v_line.fbr_rate_desc, v_line.quantity::numeric, v_line.rate, v_line.retail_price,
      v_line.sro_schedule_no, v_line.sro_item_serial_no, v_prof.prices_include_tax, v_line.description
    );

    insert into public.fbr_invoice_items (
      invoice_item_id, invoice_id, hs_code, product_description, fbr_rate_desc, uom, quantity,
      total_values, value_sales_excl_st, fixed_notified_value, sales_tax_applicable,
      sro_schedule_no, sro_item_serial_no, sale_type
    ) values (
      v_line.id, v_id, v_line.hs_code, v_line.description, v_line.fbr_rate_desc, v_line.uom, v_line.quantity,
      f.o_total, f.o_value, f.o_fixed, f.o_tax,
      v_line.sro_schedule_no, v_line.sro_item_serial_no, v_line.sale_type
    );

    v_tax_add := v_tax_add + f.o_add;
  end loop;

  v_grand := v_pretax + v_tax_add;

  if v_paid > v_grand then
    raise exception 'The amount paid (Rs %) is more than the bill total (Rs %).', v_paid, v_grand;
  end if;
  if p_customer_id is null and v_paid < v_grand then
    raise exception 'A walk-in customer must pay the full amount including GST (Rs %). Choose a customer for udhaar.', v_grand;
  end if;

  if v_tax_add > 0 then
    update public.invoices set total_value = v_grand where id = v_id;
  end if;
  if v_paid > v_paid_first then
    insert into public.payments (invoice_id, amount, method) values (v_id, v_paid - v_paid_first, v_method);
  end if;
  update public.invoices
     set payment_status = case when v_paid >= v_grand then 'Paid' when v_paid = 0 then 'Credit' else 'Partial' end
   where id = v_id;

  return v_id;
end;
$$;

revoke all on function public.create_fbr_bill(uuid, text, text, date, jsonb, numeric, text, text, text, boolean, text, text, text, text)
  from public, anon;
grant execute on function public.create_fbr_bill(uuid, text, text, date, jsonb, numeric, text, text, text, boolean, text, text, text, text)
  to authenticated;

-- ----------------------------------------------------------------------------------- done: quick checks
-- Run these one at a time (they only read):
--   select fbr_enabled, fbr_environment, prices_include_tax, business_name, ntn from public.business_profile;
--   select count(*) from public.fbr_invoices;                      -- 0
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc where proname in ('create_invoice','create_fbr_bill');
-- FBR stays OFF until you set:  update public.business_profile set fbr_enabled = true;   (Phase D2 testing, sandbox)

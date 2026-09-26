-- AK Solar App, Phase F1: Suppliers + Purchase invoice ("Receive stock")
-- Run this once in Supabase: SQL Editor > New query > paste all > Run.
-- Run 01, 02, 03, 05 first (and whatever created `distributors` -- 06_battery_services.sql). Safe to run again.
--
-- ****************************************************************************************************
-- CAUTION -- read before running: Task 1 of Phase F0 (exporting the real schema / the missing
-- 06_battery_services.sql etc.) was never completed, so the exact current shape of `public.distributors`
-- and its RLS policies is UNVERIFIED here. This file only assumes the columns already visible in the
-- app's own code: id, name, phone, address, note. Every ALTER below uses "add column if not exists" so
-- it will not fail if some of these already exist, but if `distributors` turns out to have extra
-- constraints or a different policy setup than assumed, check this file against the real schema before
-- (or right after) running it. Get that schema export when you can and diff it against this file.
-- ****************************************************************************************************
--
-- How it works (same shape as 03_invoices.sql):
--  * Purchases are saved ONLY through create_purchase() and cancel_purchase(). The browser cannot
--    insert or edit purchase invoices, items or stock directly.
--  * create_purchase() saves the bill, its lines, the stock increase, the cost-price update and an
--    optional payment made right now, in ONE transaction. If anything fails, nothing is saved.
--  * A new supplier or a brand-new product can be created inline, in that same transaction.
--  * `supplier_payments` is created here (create_purchase writes to it for "paid now" purchases), but
--    record_supplier_payment() / cancel_supplier_payment() and the Payments screen are Phase F2 --
--    this file does not add a way to record a payment on its own, only as part of a purchase.
--  * Decision D3: cost_price becomes the latest purchase cost, unless the line's "keep old cost" flag
--    is set.
--  * Decision D5: cheque fields are stored now; a bounced cheque is NEVER auto-applied to the ledger --
--    it always needs a separate, manual reversal payment (a future, negative-facing entry in F2/F6).
--    No view or function in this file reads `cheque_status` to adjust a balance.
--  * Decision D6: `stock_movements` keeps a full history, indexed by (inventory_id, created_at).

-- ---------------------------------------------------------------- 1. Suppliers = extended `distributors`
alter table public.distributors
  add column if not exists ntn_or_cnic         text,
  add column if not exists opening_balance     numeric(14,2) not null default 0,
  add column if not exists opening_balance_date date,
  add column if not exists is_active           boolean not null default true,
  add column if not exists created_at          timestamptz not null default now(),
  add column if not exists updated_at          timestamptz not null default now();

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'distributors_ntn_or_cnic_check'
  ) then
    alter table public.distributors
      add constraint distributors_ntn_or_cnic_check
      check (ntn_or_cnic is null or ntn_or_cnic ~ '^([0-9]{7}|[0-9]{13})$');
  end if;
end $$;

-- Name unique ignoring case (plan section 2, "Supplier fields"). Skipped, with a notice instead of
-- failing the whole script, if case-insensitive duplicate names already exist in production.
do $$
begin
  if not exists (select 1 from pg_indexes where schemaname = 'public' and indexname = 'distributors_name_lower_idx') then
    begin
      execute 'create unique index distributors_name_lower_idx on public.distributors (lower(name))';
    exception when unique_violation then
      raise notice 'Skipped unique index on distributors(name): case-insensitive duplicate names exist. Merge or rename them, then run: create unique index distributors_name_lower_idx on public.distributors (lower(name));';
    end;
  end if;
end $$;

drop trigger if exists distributors_set_updated_at on public.distributors;
create trigger distributors_set_updated_at
  before update on public.distributors
  for each row execute function public.set_updated_at();

-- Security: additive only. Does not touch whatever grants/policies 06_battery_services.sql already put
-- in place for Battery claims -- just makes sure signed-in users can at least read the table.
alter table public.distributors enable row level security;
revoke all on public.distributors from anon;
grant select on public.distributors to authenticated;

drop policy if exists "Signed-in users can view suppliers" on public.distributors;
create policy "Signed-in users can view suppliers" on public.distributors for select to authenticated using (true);

-- ---------------------------------------------------------------- 2. purchase_invoices
create sequence if not exists public.purchase_number_seq;

create table if not exists public.purchase_invoices (
  id                      uuid primary key default gen_random_uuid(),
  client_id               uuid unique,   -- set by the browser so an offline retry never double-posts
  purchase_number         text not null unique
                            default ('PB-' || lpad(nextval('public.purchase_number_seq')::text, 6, '0')),
  supplier_id             uuid not null references public.distributors (id) on delete restrict,
  supplier_invoice_number text,
  invoice_date            date not null,
  subtotal                numeric(14,2) not null check (subtotal >= 0),
  discount                numeric(14,2) not null default 0 check (discount >= 0),
  freight                 numeric(14,2) not null default 0 check (freight >= 0),
  total_value             numeric(14,2) not null check (total_value >= 0),
  note                    text,
  status                  text not null default 'Valid' check (status in ('Valid', 'Cancelled')),
  cancelled_at            timestamptz,
  cancel_reason           text,
  created_by              uuid default auth.uid() references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint purchase_invoices_discount_le_subtotal check (discount <= subtotal)
);
create unique index if not exists purchase_invoices_supplier_number_idx
  on public.purchase_invoices (supplier_id, lower(supplier_invoice_number))
  where supplier_invoice_number is not null and status = 'Valid';
create index if not exists purchase_invoices_supplier_idx on public.purchase_invoices (supplier_id);
create index if not exists purchase_invoices_date_idx     on public.purchase_invoices (invoice_date desc);
create index if not exists purchase_invoices_created_idx  on public.purchase_invoices (created_at desc);

-- ---------------------------------------------------------------- 3. purchase_items (max 20 per bill)
create table if not exists public.purchase_items (
  id            uuid primary key default gen_random_uuid(),
  purchase_id   uuid not null references public.purchase_invoices (id) on delete cascade,
  inventory_id  uuid not null references public.inventory (id) on delete restrict,
  description   text not null,
  quantity      integer not null check (quantity > 0),
  unit_cost     numeric(12,2) not null check (unit_cost >= 0),
  line_total    numeric(14,2) not null check (line_total >= 0),
  created_at    timestamptz not null default now()
);
create index if not exists purchase_items_purchase_idx   on public.purchase_items (purchase_id);
create index if not exists purchase_items_inventory_idx  on public.purchase_items (inventory_id);

-- Second safety net alongside the check inside create_purchase().
create or replace function public.enforce_purchase_item_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.purchase_items where purchase_id = new.purchase_id) >= 20 then
    raise exception 'A purchase bill can have up to 20 products. Save this one and make a second bill for the rest.';
  end if;
  return new;
end;
$$;

drop trigger if exists purchase_items_limit on public.purchase_items;
create trigger purchase_items_limit
  before insert on public.purchase_items
  for each row execute function public.enforce_purchase_item_limit();

-- ---------------------------------------------------------------- 4. supplier_payments
-- Table only, in F1 (create_purchase's "paid now" writes here). record_supplier_payment() /
-- cancel_supplier_payment() and the Payments screen itself are Phase F2 (13_supplier_payments.sql).
create sequence if not exists public.supplier_payment_number_seq;

create table if not exists public.supplier_payments (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid unique,
  payment_number  text not null unique
                    default ('SP-' || lpad(nextval('public.supplier_payment_number_seq')::text, 6, '0')),
  supplier_id     uuid not null references public.distributors (id) on delete restrict,
  purchase_id     uuid references public.purchase_invoices (id) on delete restrict,  -- null = on-account
  amount          numeric(14,2) not null check (amount > 0),
  method          text not null default 'cash' check (method in ('cash', 'cheque', 'online', 'easypaisa', 'jazzcash')),
  paid_at         date not null,
  reference       text,
  cheque_number   text,
  cheque_date     date,
  bank_name       text,
  cheque_status   text check (cheque_status is null or cheque_status in ('issued', 'cleared', 'bounced')),
  note            text,
  status          text not null default 'Valid' check (status in ('Valid', 'Cancelled')),
  cancel_reason   text,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint supplier_payments_cheque_needs_number check (method <> 'cheque' or cheque_number is not null)
);
create index if not exists supplier_payments_supplier_idx  on public.supplier_payments (supplier_id);
create index if not exists supplier_payments_purchase_idx  on public.supplier_payments (purchase_id);
create index if not exists supplier_payments_paid_at_idx   on public.supplier_payments (paid_at desc);

-- ---------------------------------------------------------------- 5. stock_movements (decision D6)
create table if not exists public.stock_movements (
  id            uuid primary key default gen_random_uuid(),
  inventory_id  uuid not null references public.inventory (id) on delete restrict,
  change        integer not null check (change <> 0),
  reason        text not null check (reason in ('opening', 'purchase', 'purchase_cancel', 'adjustment', 'sale')),
  ref_table     text,
  ref_id        uuid,
  note          text,
  created_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists stock_movements_inventory_created_idx on public.stock_movements (inventory_id, created_at);

-- ---------------------------------------------------------------- updated_at triggers
drop trigger if exists purchase_invoices_set_updated_at on public.purchase_invoices;
create trigger purchase_invoices_set_updated_at
  before update on public.purchase_invoices
  for each row execute function public.set_updated_at();

drop trigger if exists supplier_payments_set_updated_at on public.supplier_payments;
create trigger supplier_payments_set_updated_at
  before update on public.supplier_payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- security: same pattern as Phase 3
alter table public.purchase_invoices enable row level security;
alter table public.purchase_items    enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.stock_movements   enable row level security;

revoke all on public.purchase_invoices, public.purchase_items, public.supplier_payments, public.stock_movements from anon;
revoke all on public.purchase_invoices, public.purchase_items, public.supplier_payments, public.stock_movements from authenticated;
-- Signed-in users can only READ. All writing goes through the functions below.
grant select on public.purchase_invoices, public.purchase_items, public.supplier_payments, public.stock_movements to authenticated;

drop policy if exists "Signed-in users can view purchase invoices" on public.purchase_invoices;
drop policy if exists "Signed-in users can view purchase items"    on public.purchase_items;
drop policy if exists "Signed-in users can view supplier payments" on public.supplier_payments;
drop policy if exists "Signed-in users can view stock movements"   on public.stock_movements;

create policy "Signed-in users can view purchase invoices" on public.purchase_invoices for select to authenticated using (true);
create policy "Signed-in users can view purchase items"    on public.purchase_items    for select to authenticated using (true);
create policy "Signed-in users can view supplier payments" on public.supplier_payments for select to authenticated using (true);
create policy "Signed-in users can view stock movements"   on public.stock_movements   for select to authenticated using (true);

-- ---------------------------------------------------------------- 6. views used by the screens

-- purchase_balances: one row per purchase invoice, with paid/due, like invoice_balances.
create or replace view public.purchase_balances
with (security_invoker = true) as
select
  pi.*,
  coalesce(sp.paid, 0)                 as paid_total,
  pi.total_value - coalesce(sp.paid, 0) as due_total,
  case
    when coalesce(sp.paid, 0) <= 0            then 'Unpaid'
    when coalesce(sp.paid, 0) >= pi.total_value then 'Paid'
    else 'Part paid'
  end as payment_tag
from public.purchase_invoices pi
left join (
  select purchase_id, sum(amount) as paid
  from public.supplier_payments
  where status = 'Valid' and purchase_id is not null
  group by purchase_id
) sp on sp.purchase_id = pi.id;

grant select on public.purchase_balances to authenticated;
revoke all on public.purchase_balances from anon;

-- supplier_ledger: one row per event per supplier (opening balance, purchase bill, payment), with a
-- running balance ordered by date then created_at. Sign convention: positive = we owe the supplier.
-- IMPORTANT: this never reads `cheque_status` -- a bounced cheque needs its own manual reversal row
-- in supplier_payments (decision D5), it does not change what this view shows on its own.
create or replace view public.supplier_ledger
with (security_invoker = true) as
with events as (
  select
    d.id                                              as supplier_id,
    coalesce(d.opening_balance_date, d.created_at::date) as event_date,
    d.created_at                                      as event_created_at,
    'opening'::text                                   as entry_type,
    'Opening balance'::text                           as entry_label,
    null::text                                        as reference,
    null::uuid                                         as ref_id,
    d.opening_balance                                 as amount
  from public.distributors d
  where coalesce(d.opening_balance, 0) <> 0

  union all

  select
    pi.supplier_id,
    pi.invoice_date,
    pi.created_at,
    'purchase',
    'Purchase bill',
    pi.purchase_number || coalesce(' / Supplier inv ' || pi.supplier_invoice_number, ''),
    pi.id,
    pi.total_value
  from public.purchase_invoices pi
  where pi.status = 'Valid'

  union all

  select
    sp.supplier_id,
    sp.paid_at,
    sp.created_at,
    'payment',
    'Payment - ' || initcap(sp.method),
    sp.payment_number || coalesce(' / Chq ' || sp.cheque_number, ''),
    sp.id,
    -sp.amount
  from public.supplier_payments sp
  where sp.status = 'Valid'
)
select
  e.supplier_id,
  e.event_date,
  e.event_created_at,
  e.entry_type,
  e.entry_label,
  e.reference,
  e.ref_id,
  e.amount,
  sum(e.amount) over (
    partition by e.supplier_id
    order by e.event_date, e.event_created_at
    rows between unbounded preceding and current row
  ) as running_balance
from events e;

grant select on public.supplier_ledger to authenticated;
revoke all on public.supplier_ledger from anon;

-- supplier_balances: one row per supplier. Powers the Suppliers list and "Total we owe".
create or replace view public.supplier_balances
with (security_invoker = true) as
select
  d.id,
  d.name,
  d.phone,
  d.address,
  d.note,
  d.ntn_or_cnic,
  d.opening_balance,
  d.opening_balance_date,
  d.is_active,
  d.created_at,
  d.updated_at,
  coalesce(pb.total_bought, 0) as total_bought,
  coalesce(pp.total_paid, 0)   as total_paid,
  coalesce(d.opening_balance, 0) + coalesce(pb.total_bought, 0) - coalesce(pp.total_paid, 0) as balance,
  pb.last_purchase_date,
  pp.last_payment_date
from public.distributors d
left join (
  select supplier_id, sum(total_value) as total_bought, max(invoice_date) as last_purchase_date
  from public.purchase_invoices
  where status = 'Valid'
  group by supplier_id
) pb on pb.supplier_id = d.id
left join (
  select supplier_id, sum(amount) as total_paid, max(paid_at) as last_payment_date
  from public.supplier_payments
  where status = 'Valid'
  group by supplier_id
) pp on pp.supplier_id = d.id;

grant select on public.supplier_balances to authenticated;
revoke all on public.supplier_balances from anon;

-- ---------------------------------------------------------------- 7. create_purchase
-- p_lines is a JSON list: [{"inventory_id": "...", "quantity": 2, "unit_cost": 15500, "keep_old_cost": false}, ...]
-- or, for a brand-new product: [{"new_item": {"category": "battery", "brand": "...", "model": "...", ...},
-- "quantity": 2, "unit_cost": 15500}, ...]. Totals are calculated here from quantity x unit_cost, minus
-- discount, plus freight. Nothing typed by a person or an AI is trusted.
-- p_client_id: generated in the browser. A retried call with the same id returns the same purchase
-- instead of creating a second one (idempotent, needed for a safe offline retry in F5).
create or replace function public.create_purchase(
  p_client_id               uuid,
  p_supplier_id             uuid,
  p_new_supplier_name       text,
  p_new_supplier_phone      text,
  p_new_supplier_address    text,
  p_supplier_invoice_number text,
  p_invoice_date            date,
  p_note                    text,
  p_lines                   jsonb,
  p_discount                numeric,
  p_freight                 numeric,
  p_paid_now                numeric,
  p_method                  text,
  p_reference               text,
  p_cheque_number           text,
  p_cheque_date             date,
  p_bank_name               text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_today        date := (now() at time zone 'Asia/Karachi')::date;
  v_date         date;
  v_supplier_id  uuid;
  v_purchase_id  uuid;
  v_line         record;
  v_inv          public.inventory%rowtype;
  v_subtotal     numeric(14,2) := 0;
  v_discount     numeric(14,2) := round(coalesce(p_discount, 0), 2);
  v_freight      numeric(14,2) := round(coalesce(p_freight, 0), 2);
  v_total        numeric(14,2);
  v_paid         numeric(14,2) := round(coalesce(p_paid_now, 0), 2);
  v_method       text := coalesce(nullif(p_method, ''), 'cash');
  v_line_total   numeric(14,2);
  v_new_inv_id   uuid;
begin
  if v_uid is null then
    raise exception 'Please sign in again.';
  end if;

  -- Idempotency: a retried offline save with the same client id returns the same purchase, never a duplicate.
  if p_client_id is not null then
    select id into v_purchase_id from public.purchase_invoices where client_id = p_client_id;
    if found then
      return v_purchase_id;
    end if;
  end if;

  if p_lines is null or jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Add at least one product to the bill.';
  end if;
  if jsonb_array_length(p_lines) > 20 then
    raise exception 'A purchase bill can have up to 20 products. Save this one and make a second bill for the rest.';
  end if;

  v_date := coalesce(p_invoice_date, v_today);
  if v_date > v_today then
    raise exception 'The bill date cannot be in the future.';
  end if;

  if v_method not in ('cash', 'cheque', 'online', 'easypaisa', 'jazzcash') then
    raise exception 'Choose a valid payment method.';
  end if;

  -- Supplier: existing, or created inline right here
  if p_supplier_id is not null then
    select id into v_supplier_id from public.distributors where id = p_supplier_id for update;
    if not found then
      raise exception 'That supplier no longer exists. Choose the supplier again.';
    end if;
  elsif nullif(btrim(p_new_supplier_name), '') is not null then
    select id into v_supplier_id from public.distributors where lower(name) = lower(btrim(p_new_supplier_name));
    if not found then
      insert into public.distributors (name, phone, address)
      values (btrim(p_new_supplier_name), nullif(btrim(p_new_supplier_phone), ''), nullif(btrim(p_new_supplier_address), ''))
      returning id into v_supplier_id;
    end if;
  else
    raise exception 'Choose a supplier, or type a name to add a new one.';
  end if;

  -- Line shape + basic validation
  if exists (
    select 1
    from jsonb_to_recordset(p_lines) as x(inventory_id uuid, quantity integer, unit_cost numeric, keep_old_cost boolean, new_item jsonb)
    where (x.inventory_id is null and x.new_item is null)
       or x.quantity is null or x.quantity <= 0
       or x.unit_cost is null or x.unit_cost < 0
  ) then
    raise exception 'Each product needs a quantity of 1 or more and a cost of 0 or more.';
  end if;

  -- No duplicate existing products (same rule as sale bills; a brand-new product is always distinct)
  if (
    select count(*) - count(distinct x.inventory_id)
    from jsonb_to_recordset(p_lines) as x(inventory_id uuid, quantity integer, unit_cost numeric, keep_old_cost boolean, new_item jsonb)
    where x.inventory_id is not null
  ) > 0 then
    raise exception 'The same product appears twice on the bill. Combine it into one line.';
  end if;

  -- Duplicate supplier-invoice-number check
  if nullif(btrim(p_supplier_invoice_number), '') is not null
     and exists (
       select 1 from public.purchase_invoices
       where supplier_id = v_supplier_id
         and status = 'Valid'
         and lower(supplier_invoice_number) = lower(btrim(p_supplier_invoice_number))
     )
  then
    raise exception 'This bill number is already saved for this supplier.';
  end if;

  -- Subtotal, calculated here from quantity x unit_cost, never trusted from the browser
  select coalesce(sum(round(x.quantity * round(x.unit_cost, 2), 2)), 0)
    into v_subtotal
  from jsonb_to_recordset(p_lines) as x(inventory_id uuid, quantity integer, unit_cost numeric, keep_old_cost boolean, new_item jsonb);

  if v_discount > v_subtotal then
    raise exception 'The discount cannot be more than the subtotal.';
  end if;
  v_total := round(v_subtotal - v_discount + v_freight, 2);
  if v_total <= 0 then
    raise exception 'The bill total is zero. Check the quantities and costs.';
  end if;
  if v_paid < 0 or v_paid > v_total then
    raise exception 'The amount paid must be between 0 and the bill total.';
  end if;
  if v_paid > 0 and v_method = 'cheque' and nullif(btrim(p_cheque_number), '') is null then
    raise exception 'Enter the cheque number.';
  end if;

  insert into public.purchase_invoices (
    client_id, supplier_id, supplier_invoice_number, invoice_date, subtotal, discount, freight, total_value, note
  ) values (
    p_client_id, v_supplier_id, nullif(btrim(p_supplier_invoice_number), ''), v_date,
    v_subtotal, v_discount, v_freight, v_total, nullif(btrim(p_note), '')
  )
  returning id into v_purchase_id;

  -- Lines, stock and cost, in a fixed order so two purchases at once cannot deadlock
  for v_line in
    select
      x.inventory_id,
      x.quantity,
      round(x.unit_cost, 2) as unit_cost,
      coalesce(x.keep_old_cost, false) as keep_old_cost,
      x.new_item
    from jsonb_to_recordset(p_lines) as x(inventory_id uuid, quantity integer, unit_cost numeric, keep_old_cost boolean, new_item jsonb)
    order by x.inventory_id nulls last
  loop
    if v_line.inventory_id is not null then
      select * into v_inv from public.inventory where id = v_line.inventory_id for update;
      if not found then
        raise exception 'A product on this bill no longer exists. Refresh and try again.';
      end if;
    else
      -- Way 2: a brand-new product, created inline from this same bill
      insert into public.inventory (
        category, brand, model, type, voltage, plates, ah_rating, wattage, warranty_months,
        cost_price, sale_price, quantity, reorder_level, hs_code, uom
      ) values (
        v_line.new_item->>'category',
        v_line.new_item->>'brand',
        v_line.new_item->>'model',
        nullif(v_line.new_item->>'type', ''),
        nullif(v_line.new_item->>'voltage', '')::numeric,
        nullif(v_line.new_item->>'plates', '')::integer,
        nullif(v_line.new_item->>'ah_rating', '')::numeric,
        nullif(v_line.new_item->>'wattage', '')::integer,
        nullif(v_line.new_item->>'warranty_months', '')::integer,
        v_line.unit_cost, coalesce(nullif(v_line.new_item->>'sale_price', '')::numeric, 0), 0,
        coalesce(nullif(v_line.new_item->>'reorder_level', '')::integer, 0),
        nullif(v_line.new_item->>'hs_code', ''),
        coalesce(nullif(v_line.new_item->>'uom', ''), 'Numbers, pieces, units')
      )
      returning id into v_new_inv_id;
      select * into v_inv from public.inventory where id = v_new_inv_id for update;
    end if;

    update public.inventory
       set quantity   = quantity + v_line.quantity,
           cost_price = case when v_line.keep_old_cost then cost_price else v_line.unit_cost end
     where id = v_inv.id;

    insert into public.stock_movements (inventory_id, change, reason, ref_table, ref_id)
    values (v_inv.id, v_line.quantity, 'purchase', 'purchase_invoices', v_purchase_id);

    v_line_total := round(v_line.quantity * v_line.unit_cost, 2);
    insert into public.purchase_items (purchase_id, inventory_id, description, quantity, unit_cost, line_total)
    values (
      v_purchase_id, v_inv.id,
      v_inv.brand || ' ' || v_inv.model || coalesce(', ' || nullif(v_inv.type, ''), ''),
      v_line.quantity, v_line.unit_cost, v_line_total
    );
  end loop;

  if v_paid > 0 then
    insert into public.supplier_payments (
      supplier_id, purchase_id, amount, method, paid_at, reference,
      cheque_number, cheque_date, bank_name, cheque_status
    ) values (
      v_supplier_id, v_purchase_id, v_paid, v_method, v_date, nullif(btrim(p_reference), ''),
      nullif(btrim(p_cheque_number), ''), p_cheque_date, nullif(btrim(p_bank_name), ''),
      case when v_method = 'cheque' then 'issued' else null end
    );
  end if;

  return v_purchase_id;
end;
$$;

-- ---------------------------------------------------------------- 8. cancel_purchase
-- Never a hard delete: marks Cancelled, reverses stock, and (via the ledger view reading status = Valid
-- only) drops out of the ledger. Refused if reversing would make any item's stock negative. Any
-- payments already made on this bill are left exactly as they are -- they stay in the ledger as an
-- on-account advance, because that money really did move.
create or replace function public.cancel_purchase(
  p_purchase_id uuid,
  p_reason      text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.purchase_invoices%rowtype;
  v_item     record;
  v_inv      public.inventory%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;

  select * into v_purchase from public.purchase_invoices where id = p_purchase_id for update;
  if not found then
    raise exception 'This purchase bill could not be found.';
  end if;
  if v_purchase.status = 'Cancelled' then
    raise exception 'This purchase bill is already cancelled.';
  end if;

  for v_item in
    select inventory_id, quantity
    from public.purchase_items
    where purchase_id = p_purchase_id
    order by inventory_id
  loop
    select * into v_inv from public.inventory where id = v_item.inventory_id for update;
    if v_inv.quantity < v_item.quantity then
      raise exception 'Can''t cancel: % of ''%'' have already been sold. Use a purchase return instead.',
        (v_item.quantity - v_inv.quantity), (v_inv.brand || ' ' || v_inv.model);
    end if;
    update public.inventory set quantity = quantity - v_item.quantity where id = v_inv.id;
    insert into public.stock_movements (inventory_id, change, reason, ref_table, ref_id, note)
    values (v_inv.id, -v_item.quantity, 'purchase_cancel', 'purchase_invoices', p_purchase_id, nullif(btrim(p_reason), ''));
  end loop;

  update public.purchase_invoices
     set status = 'Cancelled', cancelled_at = now(), cancel_reason = nullif(btrim(p_reason), '')
   where id = p_purchase_id;
end;
$$;

-- ---------------------------------------------------------------- 9. supplier_summary (Home / Suppliers list)
create or replace function public.supplier_summary()
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'total_owed',             coalesce((select sum(balance) from public.supplier_balances where balance > 0), 0),
    'suppliers_we_owe_count', (select count(*) from public.supplier_balances where balance > 0),
    'total_advance',          coalesce((select sum(-balance) from public.supplier_balances where balance < 0), 0),
    'suppliers_advance_count',(select count(*) from public.supplier_balances where balance < 0)
  );
$$;

-- ---------------------------------------------------------------- who can run the functions
revoke all on function public.create_purchase(
  uuid, uuid, text, text, text, text, date, text, jsonb, numeric, numeric, numeric, text, text, text, date, text
) from public, anon;
revoke all on function public.cancel_purchase(uuid, text) from public, anon;
revoke all on function public.supplier_summary() from public, anon;

grant execute on function public.create_purchase(
  uuid, uuid, text, text, text, text, date, text, jsonb, numeric, numeric, numeric, text, text, text, date, text
) to authenticated;
grant execute on function public.cancel_purchase(uuid, text) to authenticated;
grant execute on function public.supplier_summary() to authenticated;

-- AK Solar App, Phase 3: invoicing core (FBR-shaped data)
-- Run this once in Supabase: SQL Editor > New query > paste all > Run.
-- Run 01_inventory.sql and 02_customers.sql first. Safe to run again.
--
-- How it works:
--  * Bills are saved ONLY through the functions create_invoice() and record_payment().
--    The browser cannot insert or edit invoices, items or payments directly.
--  * create_invoice() saves the bill, its lines, the payment and the stock decrease in ONE
--    transaction. If anything fails, nothing is saved and stock stays as it was.
--  * Customer and item details are copied (snapshotted) onto the bill, so old bills never change.
--  * Customers and items that have bills cannot be deleted (on delete restrict).

-- ---------------------------------------------------------------- seller details (FBR needs these later)
create table if not exists public.business_profile (
  id            boolean primary key default true check (id),   -- always exactly one row
  business_name text not null default 'Al Karam Battery and Solar',
  ntn           text check (ntn is null or ntn ~ '^([0-9]{7}|[0-9]{13})$'),
  address       text,
  province      text,
  phone         text,
  updated_at    timestamptz not null default now()
);
insert into public.business_profile (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------- invoices
create sequence if not exists public.invoice_number_seq;

create table if not exists public.invoices (
  id                      uuid primary key default gen_random_uuid(),
  invoice_number          text not null unique
                            default ('AK-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  invoice_type            text not null default 'Sale Invoice' check (invoice_type in ('Sale Invoice', 'Debit Note')),
  invoice_date            date not null,
  customer_id             uuid references public.customers (id) on delete restrict,   -- null = walk-in
  -- snapshot of the buyer at the time of sale
  buyer_name              text not null,
  buyer_registration_type text not null default 'Unregistered' check (buyer_registration_type in ('Registered', 'Unregistered')),
  buyer_cnic_or_ntn       text check (buyer_cnic_or_ntn is null or buyer_cnic_or_ntn ~ '^([0-9]{7}|[0-9]{13})$'),
  buyer_address           text,
  buyer_phone             text,
  note                    text,                                    -- vehicle or any note
  total_value             numeric(14,2) not null check (total_value >= 0),
  status                  text not null default 'Valid' check (status in ('Valid', 'Cancelled', 'Edited')),
  payment_status          text not null check (payment_status in ('Paid', 'Partial', 'Credit')),
  created_by              uuid default auth.uid() references auth.users (id) on delete set null,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  constraint invoices_registered_buyer_needs_number
    check (buyer_registration_type <> 'Registered' or buyer_cnic_or_ntn is not null)
);
create index if not exists invoices_customer_idx on public.invoices (customer_id);
create index if not exists invoices_date_idx on public.invoices (invoice_date desc);
create index if not exists invoices_created_idx on public.invoices (created_at desc);

-- ---------------------------------------------------------------- invoice lines
create table if not exists public.invoice_items (
  id              uuid primary key default gen_random_uuid(),
  invoice_id      uuid not null references public.invoices (id) on delete cascade,
  inventory_id    uuid not null references public.inventory (id) on delete restrict,
  -- snapshot of the item at the time of sale
  description     text not null,
  hs_code         text,
  uom             text not null,
  sale_type       text not null default 'Goods at standard rate (default)',
  cost_price      numeric(12,2) not null default 0,
  quantity        integer not null check (quantity > 0),
  rate            numeric(12,2) not null check (rate >= 0),
  value_excl_tax  numeric(14,2) not null check (value_excl_tax >= 0),
  sales_tax_rate  numeric(5,2)  not null default 0 check (sales_tax_rate >= 0),
  sales_tax       numeric(14,2) not null default 0 check (sales_tax >= 0),   -- filled when FBR is connected (Phase 9)
  total           numeric(14,2) not null check (total >= 0),
  created_at      timestamptz not null default now()
);
create index if not exists invoice_items_invoice_idx on public.invoice_items (invoice_id);
create index if not exists invoice_items_inventory_idx on public.invoice_items (inventory_id);

-- ---------------------------------------------------------------- payments (real udhaar balances)
create table if not exists public.payments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references public.invoices (id) on delete restrict,
  amount       numeric(14,2) not null check (amount > 0),
  method       text not null default 'cash' check (method in ('cash', 'bank', 'other')),
  paid_at      timestamptz not null default now(),
  received_by  uuid default auth.uid() references auth.users (id) on delete set null,
  note         text
);
create index if not exists payments_invoice_idx on public.payments (invoice_id);
create index if not exists payments_paid_at_idx on public.payments (paid_at desc);

drop trigger if exists invoices_set_updated_at on public.invoices;
create trigger invoices_set_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

drop trigger if exists business_profile_set_updated_at on public.business_profile;
create trigger business_profile_set_updated_at
  before update on public.business_profile
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- security (placeholder until Phase 8)
alter table public.business_profile enable row level security;
alter table public.invoices        enable row level security;
alter table public.invoice_items   enable row level security;
alter table public.payments        enable row level security;

revoke all on public.business_profile, public.invoices, public.invoice_items, public.payments from anon;
revoke all on public.business_profile, public.invoices, public.invoice_items, public.payments from authenticated;
-- Signed-in users can only READ. All writing goes through the functions below.
grant select on public.business_profile, public.invoices, public.invoice_items, public.payments to authenticated;

drop policy if exists "Signed-in users can view business profile" on public.business_profile;
drop policy if exists "Signed-in users can view invoices"         on public.invoices;
drop policy if exists "Signed-in users can view invoice items"    on public.invoice_items;
drop policy if exists "Signed-in users can view payments"         on public.payments;

create policy "Signed-in users can view business profile" on public.business_profile for select to authenticated using (true);
create policy "Signed-in users can view invoices"         on public.invoices         for select to authenticated using (true);
create policy "Signed-in users can view invoice items"    on public.invoice_items    for select to authenticated using (true);
create policy "Signed-in users can view payments"         on public.payments         for select to authenticated using (true);

-- ---------------------------------------------------------------- views used by the screens
-- security_invoker = the viewer's own permissions apply.
create or replace view public.invoice_balances
with (security_invoker = true) as
select
  i.*,
  coalesce(p.paid, 0)                     as paid_total,
  i.total_value - coalesce(p.paid, 0)     as due_total
from public.invoices i
left join (
  select invoice_id, sum(amount) as paid from public.payments group by invoice_id
) p on p.invoice_id = i.id;

grant select on public.invoice_balances to authenticated;
revoke all on public.invoice_balances from anon;

-- ---------------------------------------------------------------- create_invoice
-- p_items is a JSON list: [{"inventory_id": "...", "quantity": 2, "rate": 15500}, ...]
-- Totals are calculated here from quantity x rate. Nothing typed by a person or an AI is trusted.
create or replace function public.create_invoice(
  p_customer_id  uuid,
  p_walkin_name  text,
  p_note         text,
  p_invoice_date date,
  p_items        jsonb,
  p_paid         numeric,
  p_method       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid       uuid := auth.uid();
  v_today     date := (now() at time zone 'Asia/Karachi')::date;
  v_date      date;
  v_cust      public.customers%rowtype;
  v_inv       public.inventory%rowtype;
  v_line      record;
  v_id        uuid;
  v_total     numeric(14,2) := 0;
  v_paid      numeric(14,2) := coalesce(p_paid, 0);
  v_line_val  numeric(14,2);
  v_method    text := coalesce(nullif(p_method, ''), 'cash');
  v_seller    text;
  v_name      text;
  v_status    text;
begin
  if v_uid is null then
    raise exception 'Please sign in again.';
  end if;

  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one item to the bill.';
  end if;

  v_date := coalesce(p_invoice_date, v_today);
  if v_date > v_today then
    raise exception 'The bill date cannot be in the future.';
  end if;

  if v_method not in ('cash', 'bank', 'other') then
    raise exception 'Choose cash, bank or other as the payment method.';
  end if;

  -- Buyer snapshot
  if p_customer_id is not null then
    select * into v_cust from public.customers where id = p_customer_id;
    if not found then
      raise exception 'That customer no longer exists. Choose the customer again.';
    end if;
    v_name := v_cust.name;
  else
    v_name := coalesce(nullif(btrim(p_walkin_name), ''), 'Walk-in customer');
  end if;

  -- FBR rule: buyer and seller must not be the same registration number
  select ntn into v_seller from public.business_profile where id;
  if v_seller is not null and p_customer_id is not null and v_cust.cnic_or_ntn = v_seller then
    raise exception 'The buyer''s CNIC/NTN is the same as the shop''s NTN. A shop cannot bill itself.';
  end if;

  -- Check the lines first (also finds repeated items)
  if exists (
    select 1
    from jsonb_to_recordset(p_items) as x(inventory_id uuid, quantity integer, rate numeric)
    where x.inventory_id is null or x.quantity is null or x.quantity <= 0 or x.rate is null or x.rate < 0
  ) then
    raise exception 'Each item needs a quantity of 1 or more and a price of 0 or more.';
  end if;

  if (
    select count(*) - count(distinct x.inventory_id)
    from jsonb_to_recordset(p_items) as x(inventory_id uuid, quantity integer, rate numeric)
  ) > 0 then
    raise exception 'The same item appears twice on the bill. Combine it into one line.';
  end if;

  -- Total, calculated from quantity x rate
  select coalesce(sum(round(x.quantity * round(x.rate, 2), 2)), 0)
    into v_total
  from jsonb_to_recordset(p_items) as x(inventory_id uuid, quantity integer, rate numeric);

  if v_total <= 0 then
    raise exception 'The bill total is zero. Check the prices.';
  end if;

  if v_paid < 0 or v_paid > v_total then
    raise exception 'The amount paid must be between 0 and the bill total.';
  end if;

  if v_paid < v_total and p_customer_id is null then
    raise exception 'Udhaar needs a customer. Choose a customer, or take the full payment.';
  end if;

  v_status := case when v_paid >= v_total then 'Paid' when v_paid = 0 then 'Credit' else 'Partial' end;

  insert into public.invoices (
    invoice_date, customer_id, buyer_name, buyer_registration_type, buyer_cnic_or_ntn,
    buyer_address, buyer_phone, note, total_value, payment_status
  ) values (
    v_date, p_customer_id, v_name,
    coalesce(v_cust.registration_type, 'Unregistered'), v_cust.cnic_or_ntn,
    v_cust.address, v_cust.phone, nullif(btrim(p_note), ''), v_total, v_status
  )
  returning id into v_id;

  -- Lines and stock, in a fixed order so two bills at once cannot deadlock
  for v_line in
    select x.inventory_id, x.quantity, round(x.rate, 2) as rate
    from jsonb_to_recordset(p_items) as x(inventory_id uuid, quantity integer, rate numeric)
    order by x.inventory_id
  loop
    select * into v_inv from public.inventory where id = v_line.inventory_id for update;
    if not found then
      raise exception 'An item on this bill no longer exists. Refresh and try again.';
    end if;
    if v_inv.quantity < v_line.quantity then
      raise exception 'Only % of % left in stock. Lower the quantity and try again.',
        v_inv.quantity, v_inv.brand || ' ' || v_inv.model;
    end if;

    update public.inventory set quantity = quantity - v_line.quantity where id = v_inv.id;

    v_line_val := round(v_line.quantity * v_line.rate, 2);
    insert into public.invoice_items (
      invoice_id, inventory_id, description, hs_code, uom, cost_price,
      quantity, rate, value_excl_tax, total
    ) values (
      v_id, v_inv.id,
      v_inv.brand || ' ' || v_inv.model || coalesce(', ' || nullif(v_inv.type, ''), ''),
      v_inv.hs_code, v_inv.uom, v_inv.cost_price,
      v_line.quantity, v_line.rate, v_line_val, v_line_val
    );
  end loop;

  if v_paid > 0 then
    insert into public.payments (invoice_id, amount, method) values (v_id, v_paid, v_method);
  end if;

  return v_id;
end;
$$;

-- ---------------------------------------------------------------- record_payment (collect udhaar later)
create or replace function public.record_payment(
  p_invoice_id uuid,
  p_amount     numeric,
  p_method     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv    public.invoices%rowtype;
  v_paid   numeric(14,2);
  v_amount numeric(14,2) := round(coalesce(p_amount, 0), 2);
  v_method text := coalesce(nullif(p_method, ''), 'cash');
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if v_method not in ('cash', 'bank', 'other') then
    raise exception 'Choose cash, bank or other as the payment method.';
  end if;

  select * into v_inv from public.invoices where id = p_invoice_id for update;
  if not found then
    raise exception 'This bill could not be found.';
  end if;
  if v_inv.status = 'Cancelled' then
    raise exception 'This bill is cancelled. Payments cannot be added.';
  end if;

  select coalesce(sum(amount), 0) into v_paid from public.payments where invoice_id = p_invoice_id;

  if v_amount <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;
  if v_amount > v_inv.total_value - v_paid then
    raise exception 'That is more than the amount due (Rs %).', (v_inv.total_value - v_paid);
  end if;

  insert into public.payments (invoice_id, amount, method) values (p_invoice_id, v_amount, v_method);

  update public.invoices
     set payment_status = case
           when v_paid + v_amount >= total_value then 'Paid'
           when v_paid + v_amount = 0 then 'Credit'
           else 'Partial' end
   where id = p_invoice_id;
end;
$$;

-- ---------------------------------------------------------------- money_summary (Home cards)
-- p_day is a Pakistan-time date. "Udhaar to collect" is everything still owed on valid bills.
create or replace function public.money_summary(p_day date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'sales_total',   coalesce((select sum(total_value) from public.invoices
                               where invoice_date = p_day and status <> 'Cancelled'), 0),
    'sales_count',   (select count(*) from public.invoices
                      where invoice_date = p_day and status <> 'Cancelled'),
    'cash_received', coalesce((select sum(p.amount) from public.payments p
                               join public.invoices i on i.id = p.invoice_id
                               where i.status <> 'Cancelled'
                                 and (p.paid_at at time zone 'Asia/Karachi')::date = p_day), 0),
    'udhaar_total',  coalesce((select sum(due_total) from public.invoice_balances
                               where status <> 'Cancelled' and due_total > 0), 0),
    'udhaar_count',  (select count(*) from public.invoice_balances
                      where status <> 'Cancelled' and due_total > 0)
  );
$$;

-- ---------------------------------------------------------------- who can run the functions
revoke all on function public.create_invoice(uuid, text, text, date, jsonb, numeric, text) from public, anon;
revoke all on function public.record_payment(uuid, numeric, text) from public, anon;
revoke all on function public.money_summary(date) from public, anon;
grant execute on function public.create_invoice(uuid, text, text, date, jsonb, numeric, text) to authenticated;
grant execute on function public.record_payment(uuid, numeric, text) to authenticated;
grant execute on function public.money_summary(date) to authenticated;

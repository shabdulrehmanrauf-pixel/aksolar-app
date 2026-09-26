-- AK Solar App, Phase F3: Expenses
-- Run this once in Supabase: SQL Editor > New query > paste all > Run.
-- Run 01_inventory.sql first (reuses its set_updated_at() trigger function). Safe to run again.
-- Independent of F1/F2 -- does not touch distributors, purchase_invoices or supplier_payments.
--
-- ****************************************************************************************************
-- RECOVERY NOTE (rev. 1 of this file): this migration is not "new" work -- it is a reconstruction.
-- The app's front end for Expenses (app/expenses/*, components/ExpenseForm.tsx, lib/expenses.ts) was
-- present in the repo and already calling create_expense / update_expense / cancel_expense and reading
-- expense_categories / expense_details, but 14_expenses.sql itself was missing from BOTH the main export
-- and the MDF_IELES backup folder -- every earlier status note said "not yet run" without anyone ever
-- being able to check the file existed at all. This version was built to match the app code exactly:
-- create_expense()/update_expense()'s parameter names and order come straight from the p_* keys
-- components/ExpenseForm.tsx sends over .rpc(), cancel_expense()'s signature from ExpensesClient.tsx,
-- and expense_categories' seed list + excluded_from_profit flag from decision D11 as documented in
-- lib/types.ts. Treat this the same as 13_supplier_payments.sql was treated last revision: confirm it's
-- actually committed to the real GitHub repo, since nothing in /expenses will work without it.
-- ****************************************************************************************************
--
-- How it works (same shape as F1/F2):
--  * Expenses are saved ONLY through create_expense(), update_expense() and cancel_expense(). The
--    browser cannot insert or edit expense rows directly.
--  * create_expense() is idempotent via client_id -- a retried offline save returns the existing
--    expense instead of creating a second one.
--  * update_expense() is refused once an expense is Cancelled -- cancel and re-enter instead, so a
--    cancelled row's original numbers are never disturbed.
--  * cancel_expense() never hard-deletes: marks the row Cancelled and requires a reason.
--  * Decision D2: expenses share the same payment-method list as supplier payments
--    (cash, cheque, online, easypaisa, jazzcash) -- see SUPPLIER_PAYMENT_METHODS in lib/purchases.ts.
--  * Decision D11: expense_categories is seeded and fixed for now (no owner-added categories yet).
--    "Owner withdrawal" is the only category with excluded_from_profit = true -- it stays in the cash
--    book (F4) but is left out of Net profit (F4).

-- ---------------------------------------------------------------- 1. expense_categories (decision D11)
create table if not exists public.expense_categories (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null unique,
  sort_order            integer not null,
  excluded_from_profit  boolean not null default false,
  is_active             boolean not null default true,
  created_at            timestamptz not null default now()
);

insert into public.expense_categories (name, sort_order, excluded_from_profit) values
  ('Rent',               1, false),
  ('Electricity',        2, false),
  ('Salaries',           3, false),
  ('Transport',          4, false),
  ('Repairs',            5, false),
  ('Tea & food',         6, false),
  ('Fuel',               7, false),
  ('Internet & phone',   8, false),
  ('Marketing',          9, false),
  ('Other',             10, false),
  ('Owner withdrawal',  11, true)
on conflict (name) do nothing;

-- ---------------------------------------------------------------- 2. expenses
create sequence if not exists public.expense_number_seq;

create table if not exists public.expenses (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid unique,   -- set by the browser so an offline retry never double-posts
  expense_number  text not null unique
                    default ('EX-' || lpad(nextval('public.expense_number_seq')::text, 6, '0')),
  category_id     uuid not null references public.expense_categories (id) on delete restrict,
  amount          numeric(14,2) not null check (amount > 0),
  expense_date    date not null,
  method          text not null default 'cash' check (method in ('cash', 'cheque', 'online', 'easypaisa', 'jazzcash')),
  paid_to         text,
  reference       text,
  cheque_number   text,
  cheque_date     date,
  bank_name       text,
  note            text,
  status          text not null default 'Valid' check (status in ('Valid', 'Cancelled')),
  cancel_reason   text,
  created_by      uuid default auth.uid() references auth.users (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint expenses_cheque_needs_number check (method <> 'cheque' or cheque_number is not null)
);
create index if not exists expenses_category_idx     on public.expenses (category_id);
create index if not exists expenses_expense_date_idx on public.expenses (expense_date desc);
create index if not exists expenses_created_idx      on public.expenses (created_at desc);

drop trigger if exists expenses_set_updated_at on public.expenses;
create trigger expenses_set_updated_at
  before update on public.expenses
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------- security: same pattern as F1/F2
alter table public.expense_categories enable row level security;
alter table public.expenses           enable row level security;

revoke all on public.expense_categories from anon;
revoke all on public.expenses           from anon, authenticated;
-- Categories are seeded/fixed for now (no owner-editing screen yet) -- read-only for everyone signed in.
grant select on public.expense_categories to authenticated;
-- Signed-in users can only READ expenses. All writing goes through the functions below.
grant select on public.expenses to authenticated;

drop policy if exists "Signed-in users can view expense categories" on public.expense_categories;
drop policy if exists "Signed-in users can view expenses"           on public.expenses;

create policy "Signed-in users can view expense categories" on public.expense_categories for select to authenticated using (true);
create policy "Signed-in users can view expenses"            on public.expenses           for select to authenticated using (true);

-- ---------------------------------------------------------------- 3. expense_details view
create or replace view public.expense_details
with (security_invoker = true) as
select
  e.*,
  c.name                  as category_name,
  c.excluded_from_profit  as excluded_from_profit
from public.expenses e
join public.expense_categories c on c.id = e.category_id;

grant select on public.expense_details to authenticated;
revoke all on public.expense_details from anon;

-- ---------------------------------------------------------------- 4. create_expense
create or replace function public.create_expense(
  p_client_id      uuid,
  p_category_id    uuid,
  p_amount         numeric,
  p_expense_date   date,
  p_method         text,
  p_paid_to        text,
  p_reference      text,
  p_cheque_number  text,
  p_cheque_date    date,
  p_bank_name      text,
  p_note           text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_amount numeric(14,2) := round(coalesce(p_amount, 0), 2);
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;

  -- Idempotent: a retried offline save with the same client_id returns the existing row.
  if p_client_id is not null then
    select id into v_id from public.expenses where client_id = p_client_id;
    if v_id is not null then
      return v_id;
    end if;
  end if;

  if not exists (select 1 from public.expense_categories where id = p_category_id) then
    raise exception 'Choose a category.';
  end if;
  if v_amount <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;
  if p_expense_date is null then
    raise exception 'Choose a date.';
  end if;
  if p_expense_date > current_date then
    raise exception 'The expense date cannot be in the future.';
  end if;
  if p_method not in ('cash', 'cheque', 'online', 'easypaisa', 'jazzcash') then
    raise exception 'Choose a valid payment method.';
  end if;
  if p_method = 'cheque' and nullif(btrim(p_cheque_number), '') is null then
    raise exception 'Enter the cheque number.';
  end if;

  insert into public.expenses (
    client_id, category_id, amount, expense_date, method,
    paid_to, reference, cheque_number, cheque_date, bank_name, note, created_by
  ) values (
    p_client_id, p_category_id, v_amount, p_expense_date, p_method,
    nullif(btrim(p_paid_to), ''), nullif(btrim(p_reference), ''),
    case when p_method = 'cheque' then nullif(btrim(p_cheque_number), '') else null end,
    case when p_method = 'cheque' then p_cheque_date else null end,
    case when p_method = 'cheque' then nullif(btrim(p_bank_name), '') else null end,
    nullif(btrim(p_note), ''), auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.create_expense(uuid, uuid, numeric, date, text, text, text, text, date, text, text) from public, anon;
grant execute on function public.create_expense(uuid, uuid, numeric, date, text, text, text, text, date, text, text) to authenticated;

-- ---------------------------------------------------------------- 5. update_expense
create or replace function public.update_expense(
  p_expense_id     uuid,
  p_category_id    uuid,
  p_amount         numeric,
  p_expense_date   date,
  p_method         text,
  p_paid_to        text,
  p_reference      text,
  p_cheque_number  text,
  p_cheque_date    date,
  p_bank_name      text,
  p_note           text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_amount numeric(14,2) := round(coalesce(p_amount, 0), 2);
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;

  select status into v_status from public.expenses where id = p_expense_id;
  if v_status is null then
    raise exception 'This expense could not be found.';
  end if;
  if v_status = 'Cancelled' then
    raise exception 'This expense is cancelled. Add a new one instead of editing it.';
  end if;

  if not exists (select 1 from public.expense_categories where id = p_category_id) then
    raise exception 'Choose a category.';
  end if;
  if v_amount <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;
  if p_expense_date is null then
    raise exception 'Choose a date.';
  end if;
  if p_expense_date > current_date then
    raise exception 'The expense date cannot be in the future.';
  end if;
  if p_method not in ('cash', 'cheque', 'online', 'easypaisa', 'jazzcash') then
    raise exception 'Choose a valid payment method.';
  end if;
  if p_method = 'cheque' and nullif(btrim(p_cheque_number), '') is null then
    raise exception 'Enter the cheque number.';
  end if;

  update public.expenses set
    category_id    = p_category_id,
    amount         = v_amount,
    expense_date   = p_expense_date,
    method         = p_method,
    paid_to        = nullif(btrim(p_paid_to), ''),
    reference      = nullif(btrim(p_reference), ''),
    cheque_number  = case when p_method = 'cheque' then nullif(btrim(p_cheque_number), '') else null end,
    cheque_date    = case when p_method = 'cheque' then p_cheque_date else null end,
    bank_name      = case when p_method = 'cheque' then nullif(btrim(p_bank_name), '') else null end,
    note           = nullif(btrim(p_note), '')
  where id = p_expense_id;
end;
$$;

revoke all on function public.update_expense(uuid, uuid, numeric, date, text, text, text, text, date, text, text) from public, anon;
grant execute on function public.update_expense(uuid, uuid, numeric, date, text, text, text, text, date, text, text) to authenticated;

-- ---------------------------------------------------------------- 6. cancel_expense
create or replace function public.cancel_expense(p_expense_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_reason text := nullif(btrim(p_reason), '');
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if v_reason is null then
    raise exception 'Say why this expense is being cancelled.';
  end if;

  select status into v_status from public.expenses where id = p_expense_id;
  if v_status is null then
    raise exception 'This expense could not be found.';
  end if;
  if v_status = 'Cancelled' then
    raise exception 'This expense is already cancelled.';
  end if;

  update public.expenses
  set status = 'Cancelled', cancel_reason = v_reason
  where id = p_expense_id;
end;
$$;

revoke all on function public.cancel_expense(uuid, text) from public, anon;
grant execute on function public.cancel_expense(uuid, text) to authenticated;

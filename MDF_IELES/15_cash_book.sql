-- AK Solar App, Phase F4: Cash book + Reports + Home integration
-- Run this once in Supabase: SQL Editor > New query > paste all > Run.
-- Run first, in order: 01_inventory.sql, 02_customers.sql, 03_invoices.sql, 05_reports.sql,
-- 12_suppliers_purchases.sql, 12b_supplier_save.sql, 13_supplier_payments.sql, 14_expenses.sql.
-- This file only reads from tables those files (and the already-live battery-services / scrap-battery
-- tables) created -- it does not alter invoices, purchases, payments or expenses in any way. Safe to
-- run again.
--
-- ****************************************************************************************************
-- ON DECISION D8 (scrap/charging/claims cash amounts): the schema export from F0
-- (00_export_schema.sql) was still only partially pasted back (SCHEMA_INFO / SCHEMA_SO_FAR_IN_SUPABSE
-- in the MDF_IELES folder) when this was built -- it confirms `battery_claims`, `charging_jobs`,
-- `scrap_battery_inventory` and `scrap_battery_sales` all exist and are already granted to
-- `authenticated`, but it cuts off before listing their columns. The three columns this file reads --
-- `scrap_battery_sales.total_amount`, `charging_jobs.handover_amount` and `battery_claims.extra_charges`
-- -- are not guessed: they come straight from lib/types.ts and from the already-shipped
-- ChargingHandoverForm.tsx / BatteryClaimForm.tsx, which call the database with these exact names today.
-- Still, nobody has run a real "select these 3 columns, show me a row" check against production, so
-- treat the "Other cash income" figure below as unverified until the F4 smoke test (see the status doc)
-- is run for real. If any of the three columns turns out not to exist, this file's functions will fail
-- loudly (a missing-column error) rather than silently showing a wrong number -- nothing here swallows
-- that error.
--
-- Judgement call, not in the original decision: `battery_claims.claim_amount` (the amount recovered
-- FROM the distributor) is deliberately left OUT of "other cash income" -- unlike `extra_charges`
-- (charged to the customer directly, in cash, at intake), a distributor claim is typically settled by a
-- replacement battery or a running account, not a cash handover, and there's no column recording how a
-- settled claim was actually paid. Revisit this if that turns out to be wrong.
-- ****************************************************************************************************

-- ---------------------------------------------------------------- 1. cash_settings (the owner's one input)
-- One row, same pattern as business_profile (03_invoices.sql). opening_balance / opening_date is data
-- entry, not code -- same as decision D12's supplier opening balances, nobody here can invent this
-- number. Defaults to 0 as of the day this file is run, so the feature works immediately and simply
-- reads 0 for cash before that day until the owner sets a real figure.
create table if not exists public.cash_settings (
  id               boolean primary key default true check (id),   -- always exactly one row
  opening_balance  numeric(14,2) not null default 0 check (opening_balance >= 0),
  opening_date     date not null default current_date,
  updated_at       timestamptz not null default now()
);
insert into public.cash_settings (id) values (true) on conflict (id) do nothing;

drop trigger if exists cash_settings_set_updated_at on public.cash_settings;
create trigger cash_settings_set_updated_at
  before update on public.cash_settings
  for each row execute function public.set_updated_at();

alter table public.cash_settings enable row level security;
revoke all on public.cash_settings from anon, authenticated;
-- Signed-in users can only READ. Writing goes through save_cash_opening_balance() below.
grant select on public.cash_settings to authenticated;

drop policy if exists "Signed-in users can view cash settings" on public.cash_settings;
create policy "Signed-in users can view cash settings" on public.cash_settings for select to authenticated using (true);

-- ---------------------------------------------------------------- 2. save_cash_opening_balance
create or replace function public.save_cash_opening_balance(p_opening_balance numeric, p_opening_date date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_balance numeric(14,2) := round(coalesce(p_opening_balance, 0), 2);
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if p_opening_date is null then
    raise exception 'Choose the date this balance is as of.';
  end if;
  if p_opening_date > current_date then
    raise exception 'The opening-balance date cannot be in the future.';
  end if;
  if v_balance < 0 then
    raise exception 'Enter an opening cash balance of zero or more.';
  end if;

  update public.cash_settings
  set opening_balance = v_balance,
      opening_date    = p_opening_date
  where id;
end;
$$;

revoke all on function public.save_cash_opening_balance(numeric, date) from public, anon;
grant execute on function public.save_cash_opening_balance(numeric, date) to authenticated;

-- ---------------------------------------------------------------- 3. cash_book_summary(from, to)
-- Formula (per the F4 scope note): opening + cash sales + other cash income
--   - cash paid to suppliers - cash expenses = closing (cash in hand).
-- "Cash" throughout means method = 'cash' specifically -- a cheque or bank/online/EasyPaisa/JazzCash
-- movement never touches this number, on either side, same as a real cash drawer.
-- The opening figure shown for the requested period is the owner's saved opening balance rolled
-- forward by every cash movement between the saved opening_date and p_from -- so "This month"'s
-- opening line already reflects last month's cash activity without the owner re-entering anything.
create or replace function public.cash_book_summary(p_from date, p_to date)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  v_opening_balance numeric(14,2);
  v_opening_date    date;
  v_prior_sales     numeric(14,2);
  v_prior_income    numeric(14,2);
  v_prior_paid      numeric(14,2);
  v_prior_expenses  numeric(14,2);
  v_opening_period  numeric(14,2);
  v_sales           numeric(14,2);
  v_scrap           numeric(14,2);
  v_charging        numeric(14,2);
  v_claims          numeric(14,2);
  v_income          numeric(14,2);
  v_paid            numeric(14,2);
  v_expenses        numeric(14,2);
begin
  select opening_balance, opening_date into v_opening_balance, v_opening_date
  from public.cash_settings where id;

  -- Everything from the saved opening date up to (not including) p_from, rolled into one figure.
  select coalesce(sum(p.amount), 0) into v_prior_sales
  from public.payments p join public.invoices i on i.id = p.invoice_id
  where i.status <> 'Cancelled' and p.method = 'cash'
    and (p.paid_at at time zone 'Asia/Karachi')::date >= v_opening_date
    and (p.paid_at at time zone 'Asia/Karachi')::date <  p_from;

  select
      coalesce((select sum(total_amount) from public.scrap_battery_sales
                 where sale_date >= v_opening_date and sale_date < p_from), 0)
    + coalesce((select sum(handover_amount) from public.charging_jobs
                 where status = 'collected' and handover_amount is not null
                   and (collected_at at time zone 'Asia/Karachi')::date >= v_opening_date
                   and (collected_at at time zone 'Asia/Karachi')::date <  p_from), 0)
    + coalesce((select sum(extra_charges) from public.battery_claims
                 where extra_charges is not null
                   and received_date >= v_opening_date and received_date < p_from), 0)
  into v_prior_income;

  select coalesce(sum(amount), 0) into v_prior_paid
  from public.supplier_payments
  where status = 'Valid' and method = 'cash'
    and paid_at >= v_opening_date and paid_at < p_from;

  select coalesce(sum(amount), 0) into v_prior_expenses
  from public.expenses
  where status = 'Valid' and method = 'cash'
    and expense_date >= v_opening_date and expense_date < p_from;

  v_opening_period := v_opening_balance + v_prior_sales + v_prior_income - v_prior_paid - v_prior_expenses;

  -- The requested period itself.
  select coalesce(sum(p.amount), 0) into v_sales
  from public.payments p join public.invoices i on i.id = p.invoice_id
  where i.status <> 'Cancelled' and p.method = 'cash'
    and (p.paid_at at time zone 'Asia/Karachi')::date between p_from and p_to;

  select coalesce(sum(total_amount), 0) into v_scrap
  from public.scrap_battery_sales where sale_date between p_from and p_to;

  select coalesce(sum(handover_amount), 0) into v_charging
  from public.charging_jobs
  where status = 'collected' and handover_amount is not null
    and (collected_at at time zone 'Asia/Karachi')::date between p_from and p_to;

  select coalesce(sum(extra_charges), 0) into v_claims
  from public.battery_claims
  where extra_charges is not null and received_date between p_from and p_to;

  v_income := v_scrap + v_charging + v_claims;

  select coalesce(sum(amount), 0) into v_paid
  from public.supplier_payments
  where status = 'Valid' and method = 'cash' and paid_at between p_from and p_to;

  select coalesce(sum(amount), 0) into v_expenses
  from public.expenses
  where status = 'Valid' and method = 'cash' and expense_date between p_from and p_to;

  return jsonb_build_object(
    'opening_balance_as_of', v_opening_date,
    'opening_for_period',    v_opening_period,
    'cash_sales',            v_sales,
    'other_cash_income',     v_income,
    'other_cash_income_breakdown', jsonb_build_object(
      'scrap',    v_scrap,
      'charging', v_charging,
      'claims',   v_claims
    ),
    'cash_paid_to_suppliers', v_paid,
    'cash_expenses',          v_expenses,
    'closing_balance',        v_opening_period + v_sales + v_income - v_paid - v_expenses
  );
end;
$$;

revoke all on function public.cash_book_summary(date, date) from public, anon;
grant execute on function public.cash_book_summary(date, date) to authenticated;

-- ---------------------------------------------------------------- 4. financial_summary(from, to)
-- The rest of the F4 Reports cards. Deliberately separate from cash_book_summary (different meaning
-- of "paid"/"expenses" -- every method here, not just cash) and from report_summary (05_reports.sql,
-- unchanged) -- the Reports page combines all three. Net profit itself is left for the page to compute
-- as gross_profit (already in report_summary) minus (expenses_total - expenses_excluded_total) here,
-- so the profit formula for sales isn't duplicated in two places.
create or replace function public.financial_summary(p_from date, p_to date)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'expenses_total', coalesce((
      select sum(amount) from public.expenses
      where status = 'Valid' and expense_date between p_from and p_to
    ), 0),
    'expenses_excluded_total', coalesce((
      select sum(e.amount) from public.expenses e
      join public.expense_categories c on c.id = e.category_id
      where e.status = 'Valid' and c.excluded_from_profit and e.expense_date between p_from and p_to
    ), 0),
    'purchases_total', coalesce((
      select sum(total_value) from public.purchase_invoices
      where status = 'Valid' and invoice_date between p_from and p_to
    ), 0),
    'paid_to_suppliers_total', coalesce((
      select sum(amount) from public.supplier_payments
      where status = 'Valid' and paid_at between p_from and p_to
    ), 0),
    -- Point-in-time, like Reports' existing "Udhaar to collect" / "Stock value" -- not period-bound.
    'we_owe_total', coalesce((select sum(balance) from public.supplier_balances where balance > 0), 0),
    'we_owe_count', (select count(*) from public.supplier_balances where balance > 0)
  );
$$;

revoke all on function public.financial_summary(date, date) from public, anon;
grant execute on function public.financial_summary(date, date) to authenticated;

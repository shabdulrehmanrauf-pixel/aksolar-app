-- =====================================================================================================
-- AK Solar App, Phase 8 - PART 2 of 2: role enforcement in the database
-- Run ONLY after 16_roles_and_audit.sql has been run and your Team page shows you as Owner.
-- Run once in Supabase: SQL Editor > New query > paste ALL > Run.   Safe to run again.
--
-- After this file, the DATABASE itself refuses what a role may not do - even if someone bypasses the
-- screens. Rules (same as lib/roles.ts):
--   Owner          everything
--   Counter staff  make bills at the listed price, receive customer payments, add/edit customers,
--                  battery services, scrap intake. NOT: change prices, add/edit/delete stock,
--                  delete or cancel anything, purchases, suppliers, expenses, reports, scrap sales.
--   Accountant     read everything financial; record expenses, supplier payments, cash opening balance.
--                  NOT: make bills, change stock, customers, purchases.
--   No role / turned off   cannot read or write anything.
--
-- Changes made in the Supabase SQL Editor / dashboard (no signed-in user) are never blocked.
-- =====================================================================================================

-- ----------------------------------------------------------------------------------- 1. helpers
create or replace function public.role_in(p_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = any (p_roles), false)
$$;
revoke all on function public.role_in(text[]) from public, anon;
grant execute on function public.role_in(text[]) to authenticated;

-- ----------------------------------------------------------------------------------- 2. the write guard
-- Attached to tables that are only written through the app's database functions.
-- Arguments: who may INSERT, who may UPDATE, who may DELETE (each a comma list of roles, '' = nobody).
create or replace function public.role_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role    text;
  v_allowed text;
  v_verb    text;
begin
  if auth.uid() is null then                 -- SQL editor / dashboard / server job: not a shop user
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  v_allowed := case tg_op when 'INSERT' then tg_argv[0] when 'UPDATE' then tg_argv[1] else tg_argv[2] end;
  v_verb    := case tg_op when 'INSERT' then 'add' when 'UPDATE' then 'change' else 'delete' end;
  v_role    := public.current_app_role();

  if v_role is null then
    raise exception 'Your account has no access. Ask the Owner to check your role in Team.' using errcode = '42501';
  end if;

  if v_role <> all (string_to_array(coalesce(v_allowed, ''), ',')) then
    raise exception 'Your role (%) is not allowed to % this (%). Ask the Owner.',
      case v_role when 'counter_staff' then 'Counter staff' when 'accountant' then 'Accountant' else v_role end,
      v_verb,
      replace(tg_table_name, '_', ' ')
      using errcode = '42501';
  end if;

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;
revoke all on function public.role_guard() from public, anon, authenticated;

-- Counter staff may only bill at the price on the stock list.
create or replace function public.invoice_price_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_price numeric;
begin
  if auth.uid() is null or public.current_app_role() is distinct from 'counter_staff' then
    return new;
  end if;
  select sale_price into v_price from public.inventory where id = new.inventory_id;
  if v_price is not null and new.rate is distinct from v_price then
    raise exception 'The price of % is % (you entered %). Counter staff cannot change prices. Refresh the page if the Owner changed the price.',
      new.description, public.audit_rs(v_price), public.audit_rs(new.rate)
      using errcode = '42501';
  end if;
  return new;
end;
$$;
revoke all on function public.invoice_price_guard() from public, anon, authenticated;

do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- table                     insert                            update                            delete
      ('invoices',                'owner,counter_staff',            'owner,counter_staff',            'owner'),
      ('invoice_items',           'owner,counter_staff',            'owner',                          'owner'),
      ('payments',                'owner,counter_staff',            'owner',                          'owner'),
      ('purchase_invoices',       'owner',                          'owner',                          'owner'),
      ('purchase_items',          'owner',                          'owner',                          'owner'),
      ('supplier_payments',       'owner,accountant',               'owner,accountant',               'owner'),
      ('expenses',                'owner,accountant',               'owner,accountant',               'owner'),
      ('distributors',            'owner,counter_staff',            'owner',                          'owner'),
      ('charging_jobs',           'owner,counter_staff',            'owner,counter_staff',            'owner'),
      ('battery_claims',          'owner,counter_staff',            'owner,counter_staff',            'owner'),
      ('scrap_battery_inventory', 'owner,counter_staff',            'owner,counter_staff',            'owner'),
      ('scrap_battery_sales',     'owner',                          'owner',                          'owner'),
      ('cash_settings',           'owner,accountant',               'owner,accountant',               'owner'),
      ('business_profile',        'owner',                          'owner',                          'owner')
    ) as v(tbl, ins, upd, del)
  loop
    if to_regclass('public.' || r.tbl) is not null then
      execute format('drop trigger if exists aa_role_guard on public.%I', r.tbl);
      execute format(
        'create trigger aa_role_guard before insert or update or delete on public.%I
           for each row execute function public.role_guard(%L, %L, %L)', r.tbl, r.ins, r.upd, r.del);
    else
      raise notice 'Table % not found - skipped.', r.tbl;
    end if;
  end loop;
end $$;

drop trigger if exists aa_price_guard on public.invoice_items;
create trigger aa_price_guard
  before insert on public.invoice_items
  for each row execute function public.invoice_price_guard();

-- ----------------------------------------------------------------------------------- 3. direct-write tables (row rules)
-- inventory / customers / charging prices are saved straight from the screens, so they get row rules.
-- (Bills and purchases still change stock quantity through their own database functions - those are allowed.)
alter table public.inventory enable row level security;
drop policy if exists "Signed-in users can add inventory"    on public.inventory;
drop policy if exists "Signed-in users can edit inventory"   on public.inventory;
drop policy if exists "Signed-in users can delete inventory" on public.inventory;
drop policy if exists "Signed-in users can view inventory"   on public.inventory;
drop policy if exists "Owner can add inventory"    on public.inventory;
drop policy if exists "Owner can edit inventory"   on public.inventory;
drop policy if exists "Owner can delete inventory" on public.inventory;
drop policy if exists "Team can view inventory"    on public.inventory;
create policy "Team can view inventory"   on public.inventory for select to authenticated using ((select public.current_app_role()) is not null);
create policy "Owner can add inventory"   on public.inventory for insert to authenticated with check ((select public.current_app_role()) = 'owner');
create policy "Owner can edit inventory"  on public.inventory for update to authenticated
  using ((select public.current_app_role()) = 'owner') with check ((select public.current_app_role()) = 'owner');
create policy "Owner can delete inventory" on public.inventory for delete to authenticated using ((select public.current_app_role()) = 'owner');

alter table public.customers enable row level security;
drop policy if exists "Signed-in users can add customers"    on public.customers;
drop policy if exists "Signed-in users can edit customers"   on public.customers;
drop policy if exists "Signed-in users can delete customers" on public.customers;
drop policy if exists "Signed-in users can view customers"   on public.customers;
drop policy if exists "Owner and counter staff can add customers"  on public.customers;
drop policy if exists "Owner and counter staff can edit customers" on public.customers;
drop policy if exists "Owner can delete customers" on public.customers;
drop policy if exists "Team can view customers"    on public.customers;
create policy "Team can view customers" on public.customers for select to authenticated using ((select public.current_app_role()) is not null);
create policy "Owner and counter staff can add customers" on public.customers for insert to authenticated
  with check ((select public.current_app_role()) in ('owner', 'counter_staff'));
create policy "Owner and counter staff can edit customers" on public.customers for update to authenticated
  using ((select public.current_app_role()) in ('owner', 'counter_staff'))
  with check ((select public.current_app_role()) in ('owner', 'counter_staff'));
create policy "Owner can delete customers" on public.customers for delete to authenticated using ((select public.current_app_role()) = 'owner');

do $$
begin
  if to_regclass('public.charging_price_list') is not null then
    execute 'alter table public.charging_price_list enable row level security';
    execute 'drop policy if exists "Signed-in users can add charging prices"    on public.charging_price_list';
    execute 'drop policy if exists "Signed-in users can edit charging prices"   on public.charging_price_list';
    execute 'drop policy if exists "Signed-in users can delete charging prices" on public.charging_price_list';
    execute 'drop policy if exists "Signed-in users can view charging prices"   on public.charging_price_list';
    execute 'drop policy if exists "Owner can add charging prices"    on public.charging_price_list';
    execute 'drop policy if exists "Owner can edit charging prices"   on public.charging_price_list';
    execute 'drop policy if exists "Owner can delete charging prices" on public.charging_price_list';
    execute 'drop policy if exists "Team can view charging prices"    on public.charging_price_list';
    execute 'create policy "Team can view charging prices" on public.charging_price_list for select to authenticated using ((select public.current_app_role()) is not null)';
    execute 'create policy "Owner can add charging prices" on public.charging_price_list for insert to authenticated with check ((select public.current_app_role()) = ''owner'')';
    execute 'create policy "Owner can edit charging prices" on public.charging_price_list for update to authenticated using ((select public.current_app_role()) = ''owner'') with check ((select public.current_app_role()) = ''owner'')';
    execute 'create policy "Owner can delete charging prices" on public.charging_price_list for delete to authenticated using ((select public.current_app_role()) = ''owner'')';
  end if;
end $$;

-- ----------------------------------------------------------------------------------- 4. who may READ each table
-- Everyday tables: any active team member. Money-side tables: Owner and Accountant only.
do $$
declare
  r record;
begin
  for r in
    select * from (values
      -- table, old policy names to remove (pipe-separated), who may read
      ('invoices',                 'Signed-in users can view invoices',                 'all'),
      ('invoice_items',            'Signed-in users can view invoice items',            'all'),
      ('payments',                 'Signed-in users can view payments',                 'all'),
      ('business_profile',         'Signed-in users can view business profile',         'all'),
      ('battery_claims',           'Signed-in users can view battery claims',           'all'),
      ('charging_jobs',            'Signed-in users can view charging jobs',            'all'),
      ('scrap_battery_inventory',  'Signed-in users can view scrap inventory',          'all'),
      ('scrap_battery_sales',      'Signed-in users can view scrap sales',              'all'),
      ('distributors',             'Signed-in users can view distributors|Signed-in users can view suppliers', 'all'),
      ('expense_categories',       'Signed-in users can view expense categories',       'all'),
      ('purchase_invoices',        'Signed-in users can view purchase invoices',        'money'),
      ('purchase_items',           'Signed-in users can view purchase items',           'money'),
      ('supplier_payments',        'Signed-in users can view supplier payments',        'money'),
      ('expenses',                 'Signed-in users can view expenses',                 'money'),
      ('cash_settings',            'Signed-in users can view cash settings',            'money'),
      ('stock_movements',          'Signed-in users can view stock movements',          'money')
    ) as v(tbl, old_names, who)
  loop
    if to_regclass('public.' || r.tbl) is null then
      raise notice 'Table % not found - skipped.', r.tbl;
      continue;
    end if;
    declare
      n text;
    begin
      foreach n in array string_to_array(r.old_names, '|') loop
        execute format('drop policy if exists %I on public.%I', n, r.tbl);
      end loop;
      execute format('drop policy if exists %I on public.%I', 'Team can view ' || r.tbl, r.tbl);
      if r.who = 'all' then
        execute format(
          'create policy %I on public.%I for select to authenticated using ((select public.current_app_role()) is not null)',
          'Team can view ' || r.tbl, r.tbl);
      else
        execute format(
          'create policy %I on public.%I for select to authenticated using ((select public.current_app_role()) in (''owner'', ''accountant''))',
          'Team can view ' || r.tbl, r.tbl);
      end if;
    end;
  end loop;
end $$;

-- ----------------------------------------------------------------------------------- 5. reports: Owner and Accountant only
-- The original report functions are kept (renamed with a leading underscore) and locked away;
-- a thin wrapper with the SAME name and inputs checks the role and then calls the original.
-- Do not run 05_reports.sql or 15_cash_book.sql again after this - it would replace the wrappers.
do $$
declare
  f record;
begin
  for f in
    select * from (values
      ('report_summary',    'date, date, text'),
      ('financial_summary', 'date, date'),
      ('cash_book_summary', 'date, date'),
      ('supplier_summary',  '')
    ) as v(fname, args)
  loop
    if to_regprocedure(format('public.%s(%s)', f.fname, f.args)) is null then
      raise notice 'Function %(%) not found - skipped.', f.fname, f.args;
      continue;
    end if;
    if to_regprocedure(format('public._core_%s(%s)', f.fname, f.args)) is null then
      execute format('alter function public.%s(%s) rename to _core_%s', f.fname, f.args, f.fname);
    end if;
    execute format('revoke all on function public._core_%s(%s) from public, anon, authenticated', f.fname, f.args);
  end loop;
end $$;

do $$
begin
  if to_regprocedure('public._core_report_summary(date, date, text)') is not null then
    create or replace function public.report_summary(p_from date, p_to date, p_bucket text default 'day')
    returns jsonb language plpgsql security definer set search_path = '' as $f$
    begin
      if auth.uid() is not null and not public.role_in(array['owner', 'accountant']) then
        raise exception 'Reports are only for the Owner and the Accountant.' using errcode = '42501';
      end if;
      return public._core_report_summary(p_from, p_to, p_bucket);
    end $f$;
    revoke all on function public.report_summary(date, date, text) from public, anon;
    grant execute on function public.report_summary(date, date, text) to authenticated;
  end if;

  if to_regprocedure('public._core_financial_summary(date, date)') is not null then
    create or replace function public.financial_summary(p_from date, p_to date)
    returns jsonb language plpgsql security definer set search_path = '' as $f$
    begin
      if auth.uid() is not null and not public.role_in(array['owner', 'accountant']) then
        raise exception 'Reports are only for the Owner and the Accountant.' using errcode = '42501';
      end if;
      return public._core_financial_summary(p_from, p_to);
    end $f$;
    revoke all on function public.financial_summary(date, date) from public, anon;
    grant execute on function public.financial_summary(date, date) to authenticated;
  end if;

  if to_regprocedure('public._core_cash_book_summary(date, date)') is not null then
    create or replace function public.cash_book_summary(p_from date, p_to date)
    returns jsonb language plpgsql security definer set search_path = '' as $f$
    begin
      if auth.uid() is not null and not public.role_in(array['owner', 'accountant']) then
        raise exception 'Reports are only for the Owner and the Accountant.' using errcode = '42501';
      end if;
      return public._core_cash_book_summary(p_from, p_to);
    end $f$;
    revoke all on function public.cash_book_summary(date, date) from public, anon;
    grant execute on function public.cash_book_summary(date, date) to authenticated;
  end if;

  if to_regprocedure('public._core_supplier_summary()') is not null then
    create or replace function public.supplier_summary()
    returns jsonb language plpgsql security definer set search_path = '' as $f$
    begin
      if auth.uid() is not null and not public.role_in(array['owner', 'accountant']) then
        raise exception 'Supplier totals are only for the Owner and the Accountant.' using errcode = '42501';
      end if;
      return public._core_supplier_summary();
    end $f$;
    revoke all on function public.supplier_summary() from public, anon;
    grant execute on function public.supplier_summary() to authenticated;
  end if;
end $$;

-- Done. Check: select * from public.user_roles;  (you must still be 'owner' and active)

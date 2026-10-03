-- =====================================================================================================
-- AK Solar App: Daily Cash Book + Cash / Bank / Wallet accounts
-- Run once in Supabase: SQL Editor > New query > paste ALL > Run.   Safe to run again.
-- Run AFTER 17_role_enforcement.sql (needs is_owner(), role_in(), the audit log and role guards).
--
-- THE IDEA (so nothing is typed twice and nothing can drift):
--   * Money is NOT copied into a second table. The "ledger" is a VIEW that reads the places money
--     already lives: customer payments, supplier payments, expenses, scrap sales, charging hand-overs,
--     claim extra charges, plus the new manual entries (add cash, transfers).
--   * So every existing screen / offline queue / FBR bill keeps working untouched. A cancelled bill,
--     expense or supplier payment simply stops counting. Udhaar (unpaid) never appears because no
--     payment row exists for it.
--   * Each money row belongs to an ACCOUNT (Cash Counter, a bank, EasyPaisa, JazzCash). New rows get
--     the account from "method -> account" defaults (editable), or the owner/accountant picks one.
--   * Balances START FROM THE ACCOUNT'S OPENING DATE (today, with opening balance 0). Anything dated
--     before that is ignored, so old history never changes your cash.
--   * Only the OWNER can see balances or the cash book (enforced here in the database).
--
-- It does NOT change any existing function (create_invoice, record_payment, create_expense,
-- record_supplier_payment, cash_book_summary ...). It only adds columns/triggers/new functions.
-- =====================================================================================================

-- ----------------------------------------------------------------------------------- 1. accounts
create table if not exists public.cash_accounts (
  id               uuid primary key default gen_random_uuid(),
  name             text not null unique,
  kind             text not null check (kind in ('cash', 'bank', 'easypaisa', 'jazzcash')),
  account_number   text,
  opening_balance  numeric(14,2) not null default 0 check (opening_balance >= 0),
  opening_date     date not null default ((now() at time zone 'Asia/Karachi')::date),
  is_active        boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

drop trigger if exists cash_accounts_set_updated_at on public.cash_accounts;
create trigger cash_accounts_set_updated_at
  before update on public.cash_accounts
  for each row execute function public.set_updated_at();

insert into public.cash_accounts (name, kind, sort_order) values
  ('Cash Counter', 'cash',      1),
  ('Main Bank',    'bank',      2),
  ('EasyPaisa',    'easypaisa', 3),
  ('JazzCash',     'jazzcash',  4)
on conflict (name) do nothing;

-- ----------------------------------------------------------------------------------- 2. method -> account defaults
create table if not exists public.cash_method_defaults (
  method      text primary key,
  account_id  uuid not null references public.cash_accounts (id) on delete restrict,
  updated_at  timestamptz not null default now()
);

insert into public.cash_method_defaults (method, account_id)
select m.method, a.id
from (values ('cash', 'Cash Counter'), ('other', 'Cash Counter'),
             ('bank', 'Main Bank'), ('cheque', 'Main Bank'), ('online', 'Main Bank'), ('pos', 'Main Bank'),
             ('easypaisa', 'EasyPaisa'), ('jazzcash', 'JazzCash')) as m(method, account_name)
join public.cash_accounts a on a.name = m.account_name
on conflict (method) do nothing;

-- ----------------------------------------------------------------------------------- 3. account on existing money tables
alter table public.payments           add column if not exists account_id uuid references public.cash_accounts (id) on delete restrict;
alter table public.supplier_payments  add column if not exists account_id uuid references public.cash_accounts (id) on delete restrict;
alter table public.expenses           add column if not exists account_id uuid references public.cash_accounts (id) on delete restrict;

create index if not exists payments_account_idx          on public.payments (account_id);
create index if not exists supplier_payments_account_idx on public.supplier_payments (account_id);
create index if not exists expenses_account_idx          on public.expenses (account_id);

-- Which account a payment method lands in (the owner can change this on the Accounts screen).
create or replace function public._cash_default_account(p_method text)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select account_id from public.cash_method_defaults where method = coalesce(nullif(p_method, ''), 'cash')
$$;
revoke all on function public._cash_default_account(text) from public, anon, authenticated;

-- Fills in the account when a row is saved (never blocks a sale / payment / expense if anything is missing),
-- and re-derives it if the method is edited without the account being chosen on purpose.
create or replace function public._cash_stamp_account()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.account_id is null then
      new.account_id := public._cash_default_account(new.method);
    end if;
  elsif tg_op = 'UPDATE' then
    if new.method is distinct from old.method and new.account_id is not distinct from old.account_id then
      new.account_id := coalesce(public._cash_default_account(new.method), new.account_id);
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public._cash_stamp_account() from public, anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array['payments', 'supplier_payments', 'expenses'] loop
    execute format('drop trigger if exists zz_cash_stamp_account on public.%I', t);
    execute format(
      'create trigger zz_cash_stamp_account before insert or update on public.%I
         for each row execute function public._cash_stamp_account()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------------- 4. manual entries (add cash / transfers)
create sequence if not exists public.cash_entry_number_seq;

create table if not exists public.cash_entries (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid unique,
  entry_number   text not null unique
                   default ('CB-' || lpad(nextval('public.cash_entry_number_seq')::text, 6, '0')),
  entry_type     text not null check (entry_type in ('cash_in', 'transfer')),
  account_id     uuid not null references public.cash_accounts (id) on delete restrict,   -- cash_in: where it lands. transfer: FROM
  to_account_id  uuid references public.cash_accounts (id) on delete restrict,            -- transfer only: TO
  amount         numeric(14,2) not null check (amount > 0),
  entry_date     date not null,
  party          text,           -- who the money came from (cash_in) / short reason
  note           text,
  status         text not null default 'Valid' check (status in ('Valid', 'Cancelled')),
  cancel_reason  text,
  created_by     uuid default auth.uid() references auth.users (id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint cash_entries_transfer_shape check (
    (entry_type = 'transfer' and to_account_id is not null and to_account_id <> account_id)
    or (entry_type = 'cash_in' and to_account_id is null)
  )
);
create index if not exists cash_entries_date_idx    on public.cash_entries (entry_date desc);
create index if not exists cash_entries_account_idx on public.cash_entries (account_id);
create index if not exists cash_entries_to_idx      on public.cash_entries (to_account_id);

drop trigger if exists cash_entries_set_updated_at on public.cash_entries;
create trigger cash_entries_set_updated_at
  before update on public.cash_entries
  for each row execute function public.set_updated_at();

-- ----------------------------------------------------------------------------------- 5. end-of-day count
create table if not exists public.cash_day_closes (
  id           uuid primary key default gen_random_uuid(),
  account_id   uuid not null references public.cash_accounts (id) on delete restrict,
  close_date   date not null,
  expected     numeric(14,2) not null,      -- what the book said at the moment of closing
  counted      numeric(14,2) not null check (counted >= 0),
  difference   numeric(14,2) not null,      -- counted - expected  (negative = short)
  note         text,
  closed_by    uuid default auth.uid() references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (account_id, close_date)
);

-- ----------------------------------------------------------------------------------- 6. security: owner reads, nobody writes directly
do $$
declare
  t text;
begin
  foreach t in array array['cash_accounts', 'cash_method_defaults', 'cash_entries', 'cash_day_closes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('drop policy if exists "Owner can view %s" on public.%I', t, t);
    execute format(
      'create policy "Owner can view %s" on public.%I for select to authenticated using (public.is_owner())', t, t);
  end loop;
end $$;

-- Activity log ("who did what") for the new tables. The recorder never blocks real work.
do $$
declare
  t text;
begin
  foreach t in array array['cash_accounts', 'cash_method_defaults', 'cash_entries', 'cash_day_closes'] loop
    execute format('drop trigger if exists zz_audit_row_change on public.%I', t);
    execute format(
      'create trigger zz_audit_row_change after insert or update or delete on public.%I
         for each row execute function public.audit_row_change()', t);
  end loop;
end $$;

-- ----------------------------------------------------------------------------------- 7. THE LEDGER (internal view)
-- One row per money movement per account. direction 'in' adds to the account, 'out' takes from it.
-- Rows dated before the account's opening date are left out. Not readable by the browser at all:
-- only the owner-checked functions below read it.
create or replace view public.cash_ledger_all
with (security_invoker = false) as
with raw as (
  -- customer payments received (sale payments + udhaar collected later)
  select
    coalesce(p.account_id, public._cash_default_account(p.method))                as account_id,
    (p.paid_at at time zone 'Asia/Karachi')::date                                as entry_date,
    p.paid_at                                                                    as happened_at,
    'in'::text                                                                   as direction,
    p.amount                                                                     as amount,
    'sale_payment'::text                                                         as source,
    'payments'::text                                                             as source_table,
    p.id                                                                         as source_id,
    ('Payment on bill ' || coalesce(i.invoice_number, '?')
       || case when i.status = 'Cancelled' then ' (bill cancelled - refund?)' else '' end)::text as label,
    coalesce(nullif(btrim(i.buyer_name), ''), 'Walk-in customer')                as party,
    p.method                                                                     as method,
    p.received_by                                                                as by_user,
    p.note                                                                       as note
  from public.payments p
  join public.invoices i on i.id = p.invoice_id
  -- A cancelled bill's payments are KEPT: cancelling a bill does not hand the money back, so it is still in
  -- the drawer / bank until a refund is recorded (add it as an expense, e.g. category "Refund").

  union all
  -- scrap sold by weight (counted as cash)
  select
    public._cash_default_account('cash'), s.sale_date,
    (s.sale_date::timestamp at time zone 'Asia/Karachi') + interval '12 hours',
    'in', s.total_amount, 'scrap_sale', 'scrap_battery_sales', s.id,
    'Scrap sale ' || s.sale_number, coalesce(nullif(btrim(s.buyer_name), ''), 'Scrap buyer'),
    'cash', s.created_by, s.note
  from public.scrap_battery_sales s
  where s.total_amount > 0

  union all
  -- charging money collected at hand-over
  select
    public._cash_default_account('cash'), (j.collected_at at time zone 'Asia/Karachi')::date,
    j.collected_at,
    'in', j.handover_amount, 'charging', 'charging_jobs', j.id,
    'Charging ' || j.slip_number, coalesce(nullif(btrim(j.customer_name), ''), 'Customer'),
    'cash', j.created_by, j.handover_note
  from public.charging_jobs j
  where j.status = 'collected' and j.handover_amount is not null and j.handover_amount > 0 and j.collected_at is not null

  union all
  -- extra charges taken from the customer on a warranty claim
  select
    public._cash_default_account('cash'), c.received_date,
    (c.received_date::timestamp at time zone 'Asia/Karachi') + interval '12 hours',
    'in', c.extra_charges, 'claim_charge', 'battery_claims', c.id,
    'Claim charges ' || c.claim_number, coalesce(nullif(btrim(c.customer_name), ''), 'Customer'),
    'cash', c.created_by, c.note
  from public.battery_claims c
  where c.extra_charges is not null and c.extra_charges > 0

  union all
  -- money paid to suppliers (cheque counts when written, same as any money out)
  select
    coalesce(sp.account_id, public._cash_default_account(sp.method)), sp.paid_at,
    coalesce(sp.created_at, (sp.paid_at::timestamp at time zone 'Asia/Karachi') + interval '12 hours'),
    'out', sp.amount, 'supplier_payment', 'supplier_payments', sp.id,
    'Paid supplier ' || sp.payment_number, d.name,
    sp.method, sp.created_by, sp.note
  from public.supplier_payments sp
  join public.distributors d on d.id = sp.supplier_id
  where sp.status = 'Valid'

  union all
  -- expenses
  select
    coalesce(e.account_id, public._cash_default_account(e.method)), e.expense_date,
    coalesce(e.created_at, (e.expense_date::timestamp at time zone 'Asia/Karachi') + interval '12 hours'),
    'out', e.amount, 'expense', 'expenses', e.id,
    c.name || ' (' || e.expense_number || ')', coalesce(nullif(btrim(e.paid_to), ''), c.name),
    e.method, e.created_by, e.note
  from public.expenses e
  join public.expense_categories c on c.id = e.category_id
  where e.status = 'Valid'

  union all
  -- manual: cash added
  select
    m.account_id, m.entry_date, m.created_at,
    'in', m.amount, 'cash_in', 'cash_entries', m.id,
    'Cash added ' || m.entry_number, coalesce(nullif(btrim(m.party), ''), 'Owner'),
    null, m.created_by, m.note
  from public.cash_entries m
  where m.status = 'Valid' and m.entry_type = 'cash_in'

  union all
  -- manual: transfer, leaving the FROM account
  select
    m.account_id, m.entry_date, m.created_at,
    'out', m.amount, 'transfer_out', 'cash_entries', m.id,
    'Moved to ' || ta.name || ' ' || m.entry_number, ta.name,
    null, m.created_by, m.note
  from public.cash_entries m
  join public.cash_accounts ta on ta.id = m.to_account_id
  where m.status = 'Valid' and m.entry_type = 'transfer'

  union all
  -- manual: transfer, arriving in the TO account
  select
    m.to_account_id, m.entry_date, m.created_at,
    'in', m.amount, 'transfer_in', 'cash_entries', m.id,
    'Received from ' || fa.name || ' ' || m.entry_number, fa.name,
    null, m.created_by, m.note
  from public.cash_entries m
  join public.cash_accounts fa on fa.id = m.account_id
  where m.status = 'Valid' and m.entry_type = 'transfer'
)
select r.*
from raw r
join public.cash_accounts a on a.id = r.account_id
where r.entry_date >= a.opening_date;

revoke all on public.cash_ledger_all from public, anon, authenticated;

-- ----------------------------------------------------------------------------------- 8. helpers
create or replace function public._cash_require_owner()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.is_owner() then
    raise exception 'The cash book is only for the Owner.' using errcode = '42501';
  end if;
end;
$$;
revoke all on function public._cash_require_owner() from public, anon, authenticated;

-- Which kind of account suits which payment method.
create or replace function public._cash_kind_for_method(p_method text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case coalesce(p_method, 'cash')
    when 'cash' then 'cash'
    when 'other' then null            -- a customer payment marked "other" may be any account (e.g. EasyPaisa, JazzCash)
    when 'cheque' then 'bank' when 'online' then 'bank' when 'bank' then 'bank' when 'pos' then 'bank'
    when 'easypaisa' then 'easypaisa' when 'jazzcash' then 'jazzcash'
    else null end
$$;
revoke all on function public._cash_kind_for_method(text) from public, anon, authenticated;

create or replace function public._cash_check_account(p_account_id uuid, p_method text)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_acc public.cash_accounts%rowtype;
begin
  if p_account_id is null then
    return;   -- no account chosen: the default for the method is used
  end if;
  select * into v_acc from public.cash_accounts where id = p_account_id;
  if not found then
    raise exception 'That account could not be found.';
  end if;
  if not v_acc.is_active then
    raise exception '% is switched off. Choose another account.', v_acc.name;
  end if;
  if public._cash_kind_for_method(p_method) is not null
     and v_acc.kind <> public._cash_kind_for_method(p_method) then
    raise exception '% cannot be used for this payment method. Choose a matching account.', v_acc.name;
  end if;
end;
$$;
revoke all on function public._cash_check_account(uuid, text) from public, anon, authenticated;

create or replace function public._cash_balance(p_account_id uuid, p_up_to date)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select a.opening_balance + coalesce((
    select sum(case when l.direction = 'in' then l.amount else -l.amount end)
    from public.cash_ledger_all l
    where l.account_id = a.id and l.entry_date <= p_up_to
  ), 0)
  from public.cash_accounts a where a.id = p_account_id
$$;
revoke all on function public._cash_balance(uuid, date) from public, anon, authenticated;

-- ----------------------------------------------------------------------------------- 9. account list for forms (no balances)
-- Owner and Accountant can pick an account when recording an expense / supplier payment.
create or replace function public.cash_account_choices()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is not null and not public.role_in(array['owner', 'accountant']) then
    raise exception 'Not allowed.' using errcode = '42501';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', a.id, 'name', a.name, 'kind', a.kind,
      'default_for', coalesce((select jsonb_agg(d.method order by d.method)
                                from public.cash_method_defaults d where d.account_id = a.id), '[]'::jsonb)
    ) order by a.sort_order, a.name)
    from public.cash_accounts a where a.is_active
  ), '[]'::jsonb);
end;
$$;

-- ----------------------------------------------------------------------------------- 10. accounts overview (owner)
create or replace function public.cash_accounts_overview(p_day date default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_day date := coalesce(p_day, (now() at time zone 'Asia/Karachi')::date);
begin
  perform public._cash_require_owner();
  return jsonb_build_object(
    'day', v_day,
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id, 'name', a.name, 'kind', a.kind, 'account_number', a.account_number,
        'opening_balance', a.opening_balance, 'opening_date', a.opening_date,
        'is_active', a.is_active, 'sort_order', a.sort_order,
        'balance', public._cash_balance(a.id, v_day),
        'day_in',  coalesce((select sum(l.amount) from public.cash_ledger_all l
                              where l.account_id = a.id and l.entry_date = v_day and l.direction = 'in'), 0),
        'day_out', coalesce((select sum(l.amount) from public.cash_ledger_all l
                              where l.account_id = a.id and l.entry_date = v_day and l.direction = 'out'), 0),
        'default_for', coalesce((select jsonb_agg(d.method order by d.method)
                                  from public.cash_method_defaults d where d.account_id = a.id), '[]'::jsonb)
      ) order by a.sort_order, a.name)
      from public.cash_accounts a
    ), '[]'::jsonb)
  );
end;
$$;

-- ----------------------------------------------------------------------------------- 11. the cash book for a day / range (owner)
-- p_account_id null = every account together. Running balance is given when one account is chosen.
create or replace function public.cash_book(p_from date, p_to date, p_account_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_opening  numeric(14,2);
  v_in       numeric(14,2);
  v_out      numeric(14,2);
  v_entries  jsonb;
begin
  perform public._cash_require_owner();
  if p_from is null or p_to is null or p_from > p_to then
    raise exception 'Choose a valid date range.';
  end if;

  -- Opening for the range = each account's balance the day before p_from.
  -- An account that only opens later inside the range counts its opening balance from the start.
  select coalesce(sum(
           case when a.opening_date <= p_from then public._cash_balance(a.id, p_from - 1)
                else a.opening_balance end), 0)
    into v_opening
  from public.cash_accounts a
  where (p_account_id is null or a.id = p_account_id)
    and a.opening_date <= p_to;

  -- Money in / out inside the range.
  select
    coalesce(sum(case when l.direction = 'in'  then l.amount end), 0),
    coalesce(sum(case when l.direction = 'out' then l.amount end), 0)
  into v_in, v_out
  from public.cash_ledger_all l
  where l.entry_date between p_from and p_to
    and (p_account_id is null or l.account_id = p_account_id)
    -- Moving money between your own accounts nets to zero overall, so it is not "income" or "spending".
    and (p_account_id is not null or l.source not in ('transfer_in', 'transfer_out'));

  select coalesce(jsonb_agg(row_json order by happened_at, source_id), '[]'::jsonb) into v_entries
  from (
    select
      l.happened_at, l.source_id,
      jsonb_build_object(
        'key',          l.source_table || ':' || l.source_id::text || ':' || l.source || ':' || l.account_id::text,
        'entry_date',   l.entry_date,
        'happened_at',  l.happened_at,
        'direction',    l.direction,
        'amount',       l.amount,
        'source',       l.source,
        'source_table', l.source_table,
        'source_id',    l.source_id,
        'label',        l.label,
        'party',        l.party,
        'method',       l.method,
        'note',         l.note,
        'account_id',   l.account_id,
        'account_name', a.name,
        'account_kind', a.kind,
        'by_name',      coalesce(nullif(btrim(ur.full_name), ''), split_part(u.email, '@', 1), ''),
        'movable',      l.source in ('sale_payment', 'supplier_payment', 'expense'),
        'cancellable',  l.source in ('cash_in', 'transfer_out', 'transfer_in')
      ) as row_json
    from public.cash_ledger_all l
    join public.cash_accounts a on a.id = l.account_id
    left join auth.users u on u.id = l.by_user
    left join public.user_roles ur on ur.user_id = l.by_user
    where l.entry_date between p_from and p_to
      and (p_account_id is null or l.account_id = p_account_id)
  ) x;

  return jsonb_build_object(
    'from', p_from, 'to', p_to, 'account_id', p_account_id,
    'opening', v_opening,
    'total_in', v_in,
    'total_out', v_out,
    'closing', v_opening + v_in - v_out,
    'entries', v_entries,
    'closes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'account_id', c.account_id, 'close_date', c.close_date, 'expected', c.expected,
        'counted', c.counted, 'difference', c.difference, 'note', c.note))
      from public.cash_day_closes c
      where c.close_date between p_from and p_to and (p_account_id is null or c.account_id = p_account_id)
    ), '[]'::jsonb)
  );
end;
$$;

-- ----------------------------------------------------------------------------------- 12. write functions (owner only)
create or replace function public.save_cash_account(
  p_id              uuid,
  p_name            text,
  p_kind            text,
  p_account_number  text,
  p_opening_balance numeric,
  p_opening_date    date,
  p_is_active       boolean
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id      uuid;
  v_name    text    := btrim(coalesce(p_name, ''));
  v_balance numeric(14,2) := round(coalesce(p_opening_balance, 0), 2);
  v_today   date    := (now() at time zone 'Asia/Karachi')::date;
begin
  perform public._cash_require_owner();
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if v_name = '' then raise exception 'Enter a name for the account.'; end if;
  if p_kind is null or p_kind not in ('cash', 'bank', 'easypaisa', 'jazzcash') then
    raise exception 'Choose cash, bank, EasyPaisa or JazzCash.';
  end if;
  if v_balance < 0 then raise exception 'The opening balance cannot be negative.'; end if;
  if p_opening_date is null then raise exception 'Choose the date this opening balance is as of.'; end if;
  if p_opening_date > v_today then raise exception 'The opening date cannot be in the future.'; end if;

  if p_id is null then
    insert into public.cash_accounts (name, kind, account_number, opening_balance, opening_date, is_active, sort_order)
    values (v_name, p_kind, nullif(btrim(p_account_number), ''), v_balance, p_opening_date,
            coalesce(p_is_active, true),
            coalesce((select max(sort_order) from public.cash_accounts), 0) + 1)
    returning id into v_id;
  else
    if exists (select 1 from public.cash_accounts where id = p_id and kind <> p_kind) then
      raise exception 'The type of an existing account cannot be changed. Make a new account instead.';
    end if;
    if coalesce(p_is_active, true) = false
       and exists (select 1 from public.cash_method_defaults where account_id = p_id) then
      raise exception 'This account is the default for some payment methods. Choose another default first, then switch it off.';
    end if;
    update public.cash_accounts
       set name = v_name, account_number = nullif(btrim(p_account_number), ''),
           opening_balance = v_balance, opening_date = p_opening_date,
           is_active = coalesce(p_is_active, true)
     where id = p_id
    returning id into v_id;
    if v_id is null then raise exception 'That account could not be found.'; end if;
  end if;
  return v_id;
exception when unique_violation then
  raise exception 'There is already an account called "%".', v_name;
end;
$$;

create or replace function public.set_cash_method_default(p_method text, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public._cash_require_owner();
  if p_method is null or p_method not in ('cash', 'other', 'bank', 'cheque', 'online', 'easypaisa', 'jazzcash', 'pos') then
    raise exception 'Unknown payment method.';
  end if;
  perform public._cash_check_account(p_account_id, p_method);
  if p_account_id is null then raise exception 'Choose an account.'; end if;
  insert into public.cash_method_defaults (method, account_id) values (p_method, p_account_id)
  on conflict (method) do update set account_id = excluded.account_id, updated_at = now();
end;
$$;

create or replace function public.cash_add(
  p_client_id  uuid,
  p_account_id uuid,
  p_amount     numeric,
  p_date       date,
  p_party      text,
  p_note       text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id     uuid;
  v_amount numeric(14,2) := round(coalesce(p_amount, 0), 2);
  v_today  date := (now() at time zone 'Asia/Karachi')::date;
begin
  perform public._cash_require_owner();
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if p_client_id is not null then
    select id into v_id from public.cash_entries where client_id = p_client_id;
    if found then return v_id; end if;
  end if;
  if not exists (select 1 from public.cash_accounts where id = p_account_id and is_active) then
    raise exception 'Choose an account.';
  end if;
  if v_amount <= 0 then raise exception 'Enter an amount greater than zero.'; end if;
  if p_date is null then raise exception 'Choose a date.'; end if;
  if p_date > v_today then raise exception 'The date cannot be in the future.'; end if;

  insert into public.cash_entries (client_id, entry_type, account_id, amount, entry_date, party, note)
  values (p_client_id, 'cash_in', p_account_id, v_amount, p_date, nullif(btrim(p_party), ''), nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

-- Deposit cash to the bank, withdraw from the bank, or move between wallets.
create or replace function public.cash_transfer(
  p_client_id uuid,
  p_from      uuid,
  p_to        uuid,
  p_amount    numeric,
  p_date      date,
  p_note      text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id        uuid;
  v_amount    numeric(14,2) := round(coalesce(p_amount, 0), 2);
  v_today     date := (now() at time zone 'Asia/Karachi')::date;
  v_from      public.cash_accounts%rowtype;
  v_available numeric;
begin
  perform public._cash_require_owner();
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if p_client_id is not null then
    select id into v_id from public.cash_entries where client_id = p_client_id;
    if found then return v_id; end if;
  end if;
  if p_from is null or p_to is null then raise exception 'Choose both accounts.'; end if;
  if p_from = p_to then raise exception 'Choose two different accounts.'; end if;
  select * into v_from from public.cash_accounts where id = p_from and is_active;
  if not found then raise exception 'The "from" account could not be found.'; end if;
  if not exists (select 1 from public.cash_accounts where id = p_to and is_active) then
    raise exception 'The "to" account could not be found.';
  end if;
  if v_amount <= 0 then raise exception 'Enter an amount greater than zero.'; end if;
  if p_date is null then raise exception 'Choose a date.'; end if;
  if p_date > v_today then raise exception 'The date cannot be in the future.'; end if;

  v_available := public._cash_balance(p_from, p_date);
  if v_amount > v_available then
    raise exception '% only has % on that date. You cannot move %.',
      v_from.name, public.audit_rs(v_available), public.audit_rs(v_amount);
  end if;

  insert into public.cash_entries (client_id, entry_type, account_id, to_account_id, amount, entry_date, note)
  values (p_client_id, 'transfer', p_from, p_to, v_amount, p_date, nullif(btrim(p_note), ''))
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.cancel_cash_entry(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.cash_entries%rowtype;
begin
  perform public._cash_require_owner();
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Say why this entry is being cancelled -- it is kept for the record.';
  end if;
  select * into v_row from public.cash_entries where id = p_id for update;
  if not found then raise exception 'This entry could not be found.'; end if;
  if v_row.status = 'Cancelled' then raise exception 'This entry is already cancelled.'; end if;
  update public.cash_entries set status = 'Cancelled', cancel_reason = btrim(p_reason) where id = p_id;
end;
$$;

-- Move a payment / supplier payment / expense to another account (e.g. which bank it really went to).
create or replace function public.cash_move_entry(p_source_table text, p_id uuid, p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_method text;
begin
  perform public._cash_require_owner();
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if p_account_id is null then raise exception 'Choose an account.'; end if;

  if p_source_table = 'payments' then
    select method into v_method from public.payments where id = p_id;
  elsif p_source_table = 'supplier_payments' then
    select method into v_method from public.supplier_payments where id = p_id;
  elsif p_source_table = 'expenses' then
    select method into v_method from public.expenses where id = p_id;
  else
    raise exception 'This kind of entry cannot be moved.';
  end if;
  if v_method is null then raise exception 'That entry could not be found.'; end if;

  perform public._cash_check_account(p_account_id, v_method);

  if p_source_table = 'payments' then
    update public.payments set account_id = p_account_id where id = p_id;
  elsif p_source_table = 'supplier_payments' then
    update public.supplier_payments set account_id = p_account_id where id = p_id;
  else
    update public.expenses set account_id = p_account_id where id = p_id;
  end if;
end;
$$;

-- End-of-day count. The "expected" figure is calculated here, not trusted from the browser.
create or replace function public.cash_close_day(p_date date, p_account_id uuid, p_counted numeric, p_note text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected numeric(14,2);
  v_counted  numeric(14,2) := round(coalesce(p_counted, -1), 2);
  v_today    date := (now() at time zone 'Asia/Karachi')::date;
begin
  perform public._cash_require_owner();
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if p_date is null or p_date > v_today then raise exception 'Choose today or an earlier date.'; end if;
  if not exists (select 1 from public.cash_accounts where id = p_account_id) then
    raise exception 'Choose an account.';
  end if;
  if v_counted < 0 then raise exception 'Enter the amount you counted (zero or more).'; end if;

  v_expected := public._cash_balance(p_account_id, p_date);

  insert into public.cash_day_closes (account_id, close_date, expected, counted, difference, note)
  values (p_account_id, p_date, v_expected, v_counted, v_counted - v_expected, nullif(btrim(p_note), ''))
  on conflict (account_id, close_date) do update
    set expected = excluded.expected, counted = excluded.counted, difference = excluded.difference,
        note = excluded.note, closed_by = auth.uid(), created_at = now();

  return jsonb_build_object('expected', v_expected, 'counted', v_counted, 'difference', v_counted - v_expected);
end;
$$;

-- ----------------------------------------------------------------------------------- 13. wrappers: expense / supplier payment WITH an account
-- Thin: they call the existing, unchanged functions, then stamp the chosen account. One transaction.
create or replace function public.create_expense_from_account(
  p_client_id      uuid,
  p_account_id     uuid,
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
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if not public.role_in(array['owner', 'accountant']) then
    raise exception 'Your role is not allowed to add expenses.' using errcode = '42501';
  end if;
  perform public._cash_check_account(p_account_id, p_method);
  v_id := public.create_expense(
    p_client_id => p_client_id, p_category_id => p_category_id, p_amount => p_amount,
    p_expense_date => p_expense_date, p_method => p_method, p_paid_to => p_paid_to,
    p_reference => p_reference, p_cheque_number => p_cheque_number, p_cheque_date => p_cheque_date,
    p_bank_name => p_bank_name, p_note => p_note);
  if p_account_id is not null then
    update public.expenses set account_id = p_account_id where id = v_id and account_id is distinct from p_account_id;
  end if;
  return v_id;
end;
$$;

create or replace function public.update_expense_from_account(
  p_expense_id     uuid,
  p_account_id     uuid,
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
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if not public.role_in(array['owner', 'accountant']) then
    raise exception 'Your role is not allowed to change expenses.' using errcode = '42501';
  end if;
  perform public._cash_check_account(p_account_id, p_method);
  perform public.update_expense(
    p_expense_id => p_expense_id, p_category_id => p_category_id, p_amount => p_amount,
    p_expense_date => p_expense_date, p_method => p_method, p_paid_to => p_paid_to,
    p_reference => p_reference, p_cheque_number => p_cheque_number, p_cheque_date => p_cheque_date,
    p_bank_name => p_bank_name, p_note => p_note);
  -- Only when an account was chosen on purpose. If none was chosen, the account it already has is kept
  -- (and the stamping trigger re-routes it only if the payment method itself was changed).
  if p_account_id is not null then
    update public.expenses set account_id = p_account_id where id = p_expense_id and account_id is distinct from p_account_id;
  end if;
end;
$$;

create or replace function public.record_supplier_payment_from_account(
  p_client_id     uuid,
  p_account_id    uuid,
  p_supplier_id   uuid,
  p_purchase_id   uuid,
  p_amount        numeric,
  p_method        text,
  p_paid_at       date,
  p_reference     text,
  p_cheque_number text,
  p_cheque_date   date,
  p_bank_name     text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'Please sign in again.'; end if;
  if not public.role_in(array['owner', 'accountant']) then
    raise exception 'Your role is not allowed to pay suppliers.' using errcode = '42501';
  end if;
  perform public._cash_check_account(p_account_id, p_method);
  v_id := public.record_supplier_payment(
    p_client_id => p_client_id, p_supplier_id => p_supplier_id, p_purchase_id => p_purchase_id,
    p_amount => p_amount, p_method => p_method, p_paid_at => p_paid_at, p_reference => p_reference,
    p_cheque_number => p_cheque_number, p_cheque_date => p_cheque_date, p_bank_name => p_bank_name);
  if p_account_id is not null then
    update public.supplier_payments set account_id = p_account_id where id = v_id and account_id is distinct from p_account_id;
  end if;
  return v_id;
end;
$$;

-- ----------------------------------------------------------------------------------- 14. who may call what
revoke all on function public.cash_account_choices()                                   from public, anon;
revoke all on function public.cash_accounts_overview(date)                             from public, anon;
revoke all on function public.cash_book(date, date, uuid)                              from public, anon;
revoke all on function public.save_cash_account(uuid, text, text, text, numeric, date, boolean) from public, anon;
revoke all on function public.set_cash_method_default(text, uuid)                      from public, anon;
revoke all on function public.cash_add(uuid, uuid, numeric, date, text, text)          from public, anon;
revoke all on function public.cash_transfer(uuid, uuid, uuid, numeric, date, text)     from public, anon;
revoke all on function public.cancel_cash_entry(uuid, text)                            from public, anon;
revoke all on function public.cash_move_entry(text, uuid, uuid)                        from public, anon;
revoke all on function public.cash_close_day(date, uuid, numeric, text)                from public, anon;
revoke all on function public.create_expense_from_account(uuid, uuid, uuid, numeric, date, text, text, text, text, date, text, text) from public, anon;
revoke all on function public.update_expense_from_account(uuid, uuid, uuid, numeric, date, text, text, text, text, date, text, text) from public, anon;
revoke all on function public.record_supplier_payment_from_account(uuid, uuid, uuid, uuid, numeric, text, date, text, text, date, text) from public, anon;

grant execute on function public.cash_account_choices()                                   to authenticated;
grant execute on function public.cash_accounts_overview(date)                             to authenticated;
grant execute on function public.cash_book(date, date, uuid)                              to authenticated;
grant execute on function public.save_cash_account(uuid, text, text, text, numeric, date, boolean) to authenticated;
grant execute on function public.set_cash_method_default(text, uuid)                      to authenticated;
grant execute on function public.cash_add(uuid, uuid, numeric, date, text, text)          to authenticated;
grant execute on function public.cash_transfer(uuid, uuid, uuid, numeric, date, text)     to authenticated;
grant execute on function public.cancel_cash_entry(uuid, text)                            to authenticated;
grant execute on function public.cash_move_entry(text, uuid, uuid)                        to authenticated;
grant execute on function public.cash_close_day(date, uuid, numeric, text)                to authenticated;
grant execute on function public.create_expense_from_account(uuid, uuid, uuid, numeric, date, text, text, text, text, date, text, text) to authenticated;
grant execute on function public.update_expense_from_account(uuid, uuid, uuid, numeric, date, text, text, text, text, date, text, text) to authenticated;
grant execute on function public.record_supplier_payment_from_account(uuid, uuid, uuid, uuid, numeric, text, date, text, text, date, text) to authenticated;

-- Check after running:
--   select * from public.cash_accounts;               (4 accounts, opening balance 0, opening date = today)
--   select * from public.cash_method_defaults;        (7 rows)
--   select public.cash_accounts_overview();           (as the Owner, in the app; the SQL editor is not signed in)

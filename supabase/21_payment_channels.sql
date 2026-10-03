-- =====================================================================================================
-- AK Solar App: more ways for a customer to pay  (Cash / Bank / EasyPaisa / JazzCash / POS machine)
--                + a "which bank / which EasyPaisa / which POS" note on the payment.
--
-- Run in Supabase: SQL Editor > New query > paste ALL > Run.     RUN 20_cash_ledger.sql FIRST (updated version).
-- If Supabase warns about "destructive operations": it is only the old copy of a function being replaced by
-- the new one with one extra optional field. No table data is deleted. Choose "Run and enable RLS" (nothing
-- new here needs it) or run as is.
--
-- Everything runs inside ONE transaction: if anything at all fails, NOTHING is changed.
--
-- What it changes (and nothing else):
--   1. payments.method now also accepts easypaisa, jazzcash, pos.            (old values keep working)
--   2. create_invoice, record_payment, create_fbr_bill get ONE new OPTIONAL field p_pay_note.
--      Old callers (the current app, queued offline bills) do not send it and behave exactly as before.
--      These three bodies are the live ones from your database; only the lines for the new methods and
--      the note were touched.
--   3. Reports "received by method" also lists EasyPaisa, JazzCash and POS (so the totals add up).
--
-- DEPLOY ORDER: run this SQL FIRST, then deploy the new app files. (Old app + new SQL works fine.)
-- =====================================================================================================
begin;

-- 1. allowed payment methods
alter table public.payments drop constraint if exists payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method = any (array['cash', 'bank', 'easypaisa', 'jazzcash', 'pos', 'other']));

-- 2. the three bill / payment functions (old signature removed, new one with the optional note created)
drop function if exists public.create_invoice(uuid, text, text, date, jsonb, numeric, text, text, text, text, text);
drop function if exists public.record_payment(uuid, numeric, text);
drop function if exists public.create_fbr_bill(uuid, text, text, date, jsonb, numeric, text, text, text, boolean, text, text, text, text);

-- create_invoice
CREATE OR REPLACE FUNCTION public.create_invoice(p_customer_id uuid, p_walkin_name text, p_note text, p_invoice_date date, p_items jsonb, p_paid numeric, p_method text, p_walkin_phone text DEFAULT NULL::text, p_walkin_address text DEFAULT NULL::text, p_walkin_registration_type text DEFAULT 'Unregistered'::text, p_walkin_cnic_or_ntn text DEFAULT NULL::text, p_pay_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
  -- buyer snapshot: either from the saved customer, or typed directly on this bill
  v_reg_type  text;
  v_cnic      text;
  v_addr      text;
  v_phone     text;
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

  if v_method not in ('cash', 'bank', 'easypaisa', 'jazzcash', 'pos', 'other') then
    raise exception 'Choose cash, bank, EasyPaisa, JazzCash, POS or other as the payment method.';
  end if;

  -- Buyer snapshot
  if p_customer_id is not null then
    select * into v_cust from public.customers where id = p_customer_id;
    if not found then
      raise exception 'That customer no longer exists. Choose the customer again.';
    end if;
    v_name     := v_cust.name;
    v_reg_type := coalesce(v_cust.registration_type, 'Unregistered');
    v_cnic     := v_cust.cnic_or_ntn;
    v_addr     := v_cust.address;
    v_phone    := v_cust.phone;
  else
    v_name     := coalesce(nullif(btrim(p_walkin_name), ''), 'Walk-in customer');
    v_reg_type := case when p_walkin_registration_type in ('Registered', 'Unregistered')
                    then p_walkin_registration_type else 'Unregistered' end;
    v_cnic     := nullif(regexp_replace(coalesce(p_walkin_cnic_or_ntn, ''), '[\s-]', '', 'g'), '');
    v_addr     := nullif(btrim(coalesce(p_walkin_address, '')), '');
    v_phone    := nullif(regexp_replace(coalesce(p_walkin_phone, ''), '[\s().-]', '', 'g'), '');

    if v_cnic is not null and v_cnic !~ '^([0-9]{7}|[0-9]{13})$' then
      raise exception 'Enter a valid CNIC (13 digits) or NTN (7 digits) for the customer, or leave it empty.';
    end if;
    if v_reg_type = 'Registered' and v_cnic is null then
      raise exception 'A registered customer needs a CNIC (13 digits) or an NTN (7 digits).';
    end if;
  end if;

  -- FBR rule: buyer and seller must not be the same registration number
  select ntn into v_seller from public.business_profile where id;
  if v_seller is not null and v_cnic = v_seller then
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
    v_reg_type, v_cnic,
    v_addr, v_phone, nullif(btrim(p_note), ''), v_total, v_status
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
    insert into public.payments (invoice_id, amount, method, note) values (v_id, v_paid, v_method, left(nullif(btrim(p_pay_note), ''), 200));
  end if;

  return v_id;
end;
$function$;

-- record_payment
CREATE OR REPLACE FUNCTION public.record_payment(p_invoice_id uuid, p_amount numeric, p_method text, p_pay_note text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_inv    public.invoices%rowtype;
  v_paid   numeric(14,2);
  v_amount numeric(14,2) := round(coalesce(p_amount, 0), 2);
  v_method text := coalesce(nullif(p_method, ''), 'cash');
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if v_method not in ('cash', 'bank', 'easypaisa', 'jazzcash', 'pos', 'other') then
    raise exception 'Choose cash, bank, EasyPaisa, JazzCash, POS or other as the payment method.';
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

  insert into public.payments (invoice_id, amount, method, note) values (p_invoice_id, v_amount, v_method, left(nullif(btrim(p_pay_note), ''), 200));

  update public.invoices
     set payment_status = case
           when v_paid + v_amount >= total_value then 'Paid'
           when v_paid + v_amount = 0 then 'Credit'
           else 'Partial' end
   where id = p_invoice_id;
end;
$function$;

-- create_fbr_bill
CREATE OR REPLACE FUNCTION public.create_fbr_bill(p_customer_id uuid, p_walkin_name text, p_note text, p_invoice_date date, p_items jsonb, p_paid numeric, p_method text, p_buyer_province text DEFAULT NULL::text, p_buyer_address text DEFAULT NULL::text, p_created_offline boolean DEFAULT false, p_walkin_phone text DEFAULT NULL::text, p_walkin_address text DEFAULT NULL::text, p_walkin_registration_type text DEFAULT NULL::text, p_walkin_cnic_or_ntn text DEFAULT NULL::text, p_pay_note text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    p_walkin_cnic_or_ntn => p_walkin_cnic_or_ntn,
    p_pay_note   => p_pay_note
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
    insert into public.payments (invoice_id, amount, method, note) values (v_id, v_paid - v_paid_first, v_method, left(nullif(btrim(p_pay_note), ''), 200));
  end if;
  update public.invoices
     set payment_status = case when v_paid >= v_grand then 'Paid' when v_paid = 0 then 'Credit' else 'Partial' end
   where id = v_id;

  return v_id;
end;
$function$;

-- Reports: received-by-method (same signature, grants kept)
CREATE OR REPLACE FUNCTION public._core_report_summary(p_from date, p_to date, p_bucket text DEFAULT 'day'::text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
  with inv as (
    select * from public.invoices
    where invoice_date between p_from and p_to and status <> 'Cancelled'
  ),
  itm as (
    select ii.* from public.invoice_items ii join inv on inv.id = ii.invoice_id
  ),
  pay as (
    select p.*, i.invoice_date
    from public.payments p
    join public.invoices i on i.id = p.invoice_id
    where i.status <> 'Cancelled'
      and (p.paid_at at time zone 'Asia/Karachi')::date between p_from and p_to
  ),
  chg as (
    select * from public.charging_jobs
    where received_date between p_from and p_to
  ),
  clm as (
    select * from public.battery_claims
    where received_date between p_from and p_to and extra_charges > 0
  ),
  buckets as (
    select generate_series(
             date_trunc(case when p_bucket = 'month' then 'month' else 'day' end, p_from::timestamp),
             p_to::timestamp,
             case when p_bucket = 'month' then interval '1 month' else interval '1 day' end
           )::date as b
  )
  select jsonb_build_object(
    'sales_total',     coalesce((select sum(total_value) from inv), 0)
                      + coalesce((select sum(price) from chg), 0)
                      + coalesce((select sum(extra_charges) from clm), 0),
    'invoice_count',   (select count(*) from inv) + (select count(*) from chg) + (select count(*) from clm),
    'gross_profit',    coalesce((select sum(value_excl_tax - cost_price * quantity) from itm), 0),
    'cash_received',   coalesce((select sum(amount) from pay), 0),
    'received_on_older_bills',
                       coalesce((select sum(amount) from pay where invoice_date < p_from), 0),
    'by_method',       jsonb_build_object(
                         'cash',  coalesce((select sum(amount) from pay where method = 'cash'), 0),
                         'bank',  coalesce((select sum(amount) from pay where method = 'bank'), 0),
                         'other', coalesce((select sum(amount) from pay where method = 'other'), 0),
                         'easypaisa', coalesce((select sum(amount) from pay where method = 'easypaisa'), 0),
                         'jazzcash',  coalesce((select sum(amount) from pay where method = 'jazzcash'), 0),
                         'pos',       coalesce((select sum(amount) from pay where method = 'pos'), 0)),
    'credit_given',    coalesce((select sum(due_total) from public.invoice_balances b
                                 where b.id in (select id from inv) and b.due_total > 0), 0),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', to_char(bk.b, 'YYYY-MM-DD'),
               'sales', coalesce(s.sales, 0) + coalesce(c.sales, 0) + coalesce(k.sales, 0),
               'count', coalesce(s.cnt, 0) + coalesce(c.cnt, 0) + coalesce(k.cnt, 0)) order by bk.b)
      from buckets bk
      left join (
        select date_trunc(case when p_bucket = 'month' then 'month' else 'day' end, invoice_date::timestamp)::date as b,
               sum(total_value) as sales, count(*) as cnt
        from inv group by 1
      ) s on s.b = bk.b
      left join (
        select date_trunc(case when p_bucket = 'month' then 'month' else 'day' end, received_date::timestamp)::date as b,
               sum(price) as sales, count(*) as cnt
        from chg group by 1
      ) c on c.b = bk.b
      left join (
        select date_trunc(case when p_bucket = 'month' then 'month' else 'day' end, received_date::timestamp)::date as b,
               sum(extra_charges) as sales, count(*) as cnt
        from clm group by 1
      ) k on k.b = bk.b
    ), '[]'::jsonb),
    'top_items', coalesce((
      select jsonb_agg(t order by t.revenue desc)
      from (
        select description,
               sum(quantity)::int as quantity,
               sum(value_excl_tax) as revenue
        from itm
        group by description
        order by sum(value_excl_tax) desc
        limit 8
      ) t
    ), '[]'::jsonb)
  );
$function$;

-- same permissions as before: signed-in users only, never anonymous
revoke all on function public.create_invoice(uuid, text, text, date, jsonb, numeric, text, text, text, text, text, text) from public, anon;
revoke all on function public.record_payment(uuid, numeric, text, text)                                              from public, anon;
revoke all on function public.create_fbr_bill(uuid, text, text, date, jsonb, numeric, text, text, text, boolean, text, text, text, text, text) from public, anon;
grant execute on function public.create_invoice(uuid, text, text, date, jsonb, numeric, text, text, text, text, text, text) to authenticated;
grant execute on function public.record_payment(uuid, numeric, text, text)                                              to authenticated;
grant execute on function public.create_fbr_bill(uuid, text, text, date, jsonb, numeric, text, text, text, boolean, text, text, text, text, text) to authenticated;

commit;

-- Check after running (should list 3 rows, each with p_pay_note):
--   select proname, pg_get_function_identity_arguments(oid) from pg_proc
--   where pronamespace = 'public'::regnamespace and proname in ('create_invoice','record_payment','create_fbr_bill');

-- AK Solar App, Phase F2: Payments to suppliers
-- Run this once in Supabase: SQL Editor > New query > paste all > Run. Safe to run again.
-- Run 12_suppliers_purchases.sql and 12b_supplier_save.sql first -- this file only adds to what
-- they already created (the `supplier_payments` table, its RLS and its indexes all exist already).
--
-- How it works (same shape as 03_invoices.sql's record_payment):
--  * A payment is saved ONLY through record_supplier_payment(). The browser cannot insert or edit
--    supplier_payments directly (12_suppliers_purchases.sql already revoked that).
--  * A payment can be AGAINST ONE PURCHASE BILL (p_purchase_id set -- capped at that bill's amount
--    still due) or ON ACCOUNT (p_purchase_id null -- a general payment to the supplier, not tied to
--    any one bill, the same idea as the "we owe them" opening balance).
--  * Idempotent the same way create_purchase() is: a retried offline save with the same client id
--    returns the same payment instead of creating a second one.
--  * cancel_supplier_payment() never deletes a row -- it marks it Cancelled, and every view that
--    already reads supplier_payments (purchase_balances, supplier_ledger, supplier_balances -- all
--    from 12_suppliers_purchases.sql) already filters on status = 'Valid', so a cancelled payment
--    drops out of every balance and the ledger automatically. Nothing here changes stock.
--  * Decision D5 still holds: a bounced cheque is never auto-applied. Cancelling a payment because a
--    cheque bounced is a manual, reasoned action here -- same manual-reversal idea as F1, just via
--    Cancelled status instead of a separate reversal row (cheque clear/bounce buttons are F6).

-- ---------------------------------------------------------------- 1. record_supplier_payment
create or replace function public.record_supplier_payment(
  p_client_id     uuid,
  p_supplier_id   uuid,
  p_purchase_id   uuid,   -- null = on-account, not tied to one bill
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
  v_uid          uuid := auth.uid();
  v_today        date := (now() at time zone 'Asia/Karachi')::date;
  v_paid_at      date := coalesce(p_paid_at, v_today);
  v_amount       numeric(14,2) := round(coalesce(p_amount, 0), 2);
  v_method       text := coalesce(nullif(p_method, ''), 'cash');
  v_supplier     public.distributors%rowtype;
  v_purchase     public.purchase_invoices%rowtype;
  v_paid_so_far  numeric(14,2);
  v_payment_id   uuid;
begin
  if v_uid is null then
    raise exception 'Please sign in again.';
  end if;

  -- Idempotency: a retried offline save with the same client id returns the same payment, never a duplicate.
  if p_client_id is not null then
    select id into v_payment_id from public.supplier_payments where client_id = p_client_id;
    if found then
      return v_payment_id;
    end if;
  end if;

  if p_supplier_id is null then
    raise exception 'Choose a supplier.';
  end if;
  if v_method not in ('cash', 'cheque', 'online', 'easypaisa', 'jazzcash') then
    raise exception 'Choose a valid payment method.';
  end if;
  if v_amount <= 0 then
    raise exception 'Enter an amount greater than zero.';
  end if;
  if v_paid_at > v_today then
    raise exception 'The payment date cannot be in the future.';
  end if;
  if v_method = 'cheque' and nullif(btrim(p_cheque_number), '') is null then
    raise exception 'Enter the cheque number.';
  end if;

  select * into v_supplier from public.distributors where id = p_supplier_id for update;
  if not found then
    raise exception 'This supplier could not be found.';
  end if;

  if p_purchase_id is not null then
    select * into v_purchase from public.purchase_invoices where id = p_purchase_id for update;
    if not found then
      raise exception 'This purchase bill could not be found.';
    end if;
    if v_purchase.supplier_id <> p_supplier_id then
      raise exception 'This bill does not belong to this supplier.';
    end if;
    if v_purchase.status = 'Cancelled' then
      raise exception 'This bill is cancelled. Payments cannot be added to it.';
    end if;

    select coalesce(sum(amount), 0) into v_paid_so_far
    from public.supplier_payments
    where purchase_id = p_purchase_id and status = 'Valid';

    if v_amount > v_purchase.total_value - v_paid_so_far then
      raise exception 'That is more than the amount due (Rs %).', (v_purchase.total_value - v_paid_so_far);
    end if;
  end if;

  insert into public.supplier_payments (
    client_id, supplier_id, purchase_id, amount, method, paid_at, reference,
    cheque_number, cheque_date, bank_name, cheque_status
  ) values (
    p_client_id, p_supplier_id, p_purchase_id, v_amount, v_method, v_paid_at, nullif(btrim(p_reference), ''),
    nullif(btrim(p_cheque_number), ''), p_cheque_date, nullif(btrim(p_bank_name), ''),
    case when v_method = 'cheque' then 'issued' else null end
  )
  returning id into v_payment_id;

  return v_payment_id;
end;
$$;

-- ---------------------------------------------------------------- 2. cancel_supplier_payment
-- Never a hard delete: marks Cancelled. Does not touch stock (payments never did). Every balance and
-- the ledger read status = 'Valid' only, so a cancelled payment simply stops counting everywhere.
create or replace function public.cancel_supplier_payment(
  p_payment_id uuid,
  p_reason     text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pay public.supplier_payments%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'Say why this payment is being cancelled -- it''s kept with the payment for the record.';
  end if;

  select * into v_pay from public.supplier_payments where id = p_payment_id for update;
  if not found then
    raise exception 'This payment could not be found.';
  end if;
  if v_pay.status = 'Cancelled' then
    raise exception 'This payment is already cancelled.';
  end if;

  update public.supplier_payments
     set status = 'Cancelled', cancel_reason = btrim(p_reason)
   where id = p_payment_id;
end;
$$;

-- ---------------------------------------------------------------- 3. payment_details (Payments screen)
-- One row per payment, with the supplier's name and (if against a specific bill) that bill's number
-- already joined in, so the Payments list and voucher print don't need extra round trips.
create or replace view public.payment_details
with (security_invoker = true) as
select
  sp.*,
  d.name                as supplier_name,
  pi.purchase_number    as purchase_number
from public.supplier_payments sp
join public.distributors d on d.id = sp.supplier_id
left join public.purchase_invoices pi on pi.id = sp.purchase_id;

grant select on public.payment_details to authenticated;
revoke all on public.payment_details from anon;

-- ---------------------------------------------------------------- who can run the functions
revoke all on function public.record_supplier_payment(
  uuid, uuid, uuid, numeric, text, date, text, text, date, text
) from public, anon;
revoke all on function public.cancel_supplier_payment(uuid, text) from public, anon;

grant execute on function public.record_supplier_payment(
  uuid, uuid, uuid, numeric, text, date, text, text, date, text
) to authenticated;
grant execute on function public.cancel_supplier_payment(uuid, text) to authenticated;

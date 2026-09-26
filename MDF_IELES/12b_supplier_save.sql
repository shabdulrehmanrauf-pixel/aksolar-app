-- AK Solar App, Phase F1 Part 2: direct Supplier create/edit
-- Run once in Supabase SQL Editor, AFTER 12_suppliers_purchases.sql. Safe to run again.
--
-- Why this file exists: 12_suppliers_purchases.sql locked distributors down to
-- `grant select ... to authenticated` only -- every write goes through a security definer
-- function, same pattern as invoices. But it only ever writes a *new* supplier from inside
-- create_purchase() (name/phone/address only, no NTN or opening balance). The Suppliers list
-- needs its own Add/Edit screen (decision D12: owner enters opening balances per supplier
-- before go-live) with NTN and opening balance fields, which needs its own function.
--
-- No hard delete: `distributors` is shared with Battery claims (decision D1), and a supplier
-- with purchase history must never disappear from the audit trail. A supplier is deactivated
-- instead (is_active = false) -- it stays visible in history, drops out of the "pick a
-- supplier" list for new purchases, matching the existing friendlyDeleteError() copy
-- ("Mark it inactive instead") already shipped in Part 1's lib/invoices.ts.

-- ---------------------------------------------------------------- save_supplier (insert or update)
create or replace function public.save_supplier(
  p_id                   uuid,
  p_name                 text,
  p_phone                text,
  p_address              text,
  p_note                 text,
  p_ntn_or_cnic          text,
  p_opening_balance      numeric,
  p_opening_balance_date date
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id   uuid;
  v_name text := nullif(btrim(p_name), '');
  v_ntn  text := nullif(btrim(p_ntn_or_cnic), '');
  v_ob   numeric(14,2) := round(coalesce(p_opening_balance, 0), 2);
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if v_name is null then
    raise exception 'Enter the supplier''s name.';
  end if;
  if v_ntn is not null and v_ntn !~ '^([0-9]{7}|[0-9]{13})$' then
    raise exception 'Use 7 digits for an NTN or 13 digits for a CNIC.';
  end if;
  if v_ob <> 0 and p_opening_balance_date is null then
    raise exception 'Add the "as of" date for the opening balance.';
  end if;

  if p_id is not null then
    if exists (select 1 from public.distributors where id <> p_id and lower(name) = lower(v_name)) then
      raise exception 'A supplier with this name already exists.';
    end if;
    update public.distributors set
      name                   = v_name,
      phone                  = nullif(btrim(p_phone), ''),
      address                = nullif(btrim(p_address), ''),
      note                   = nullif(btrim(p_note), ''),
      ntn_or_cnic             = v_ntn,
      opening_balance        = v_ob,
      opening_balance_date   = case when v_ob <> 0 then p_opening_balance_date else null end
    where id = p_id
    returning id into v_id;
    if v_id is null then
      raise exception 'This supplier could not be found.';
    end if;
  else
    if exists (select 1 from public.distributors where lower(name) = lower(v_name)) then
      raise exception 'A supplier with this name already exists.';
    end if;
    insert into public.distributors (
      name, phone, address, note, ntn_or_cnic, opening_balance, opening_balance_date, is_active
    ) values (
      v_name, nullif(btrim(p_phone), ''), nullif(btrim(p_address), ''), nullif(btrim(p_note), ''),
      v_ntn, v_ob, case when v_ob <> 0 then p_opening_balance_date else null end, true
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

revoke all on function public.save_supplier(uuid, text, text, text, text, text, numeric, date) from public, anon;
grant execute on function public.save_supplier(uuid, text, text, text, text, text, numeric, date) to authenticated;

-- ---------------------------------------------------------------- set_supplier_active (soft "delete")
create or replace function public.set_supplier_active(p_id uuid, p_is_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  update public.distributors set is_active = coalesce(p_is_active, true) where id = p_id;
  if not found then
    raise exception 'This supplier could not be found.';
  end if;
end;
$$;

revoke all on function public.set_supplier_active(uuid, boolean) from public, anon;
grant execute on function public.set_supplier_active(uuid, boolean) to authenticated;

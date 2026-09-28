-- =====================================================================================================
-- AK Solar App, FBR Digital Invoicing, Phases D2 + D3: helper functions.
-- Run ONCE in Supabase: SQL Editor > New query > paste ALL > Run.   Safe to run again.
-- Run AFTER 18_fbr.sql.
--
-- 1. create_unreported_bill(): the ONLY way to save a bill that has taxable items but no FBR bill,
--    while FBR is switched on. Owner only. Writes a line to the Activity log.
-- 2. import_fbr_reference(): Owner loads an FBR list (HS codes, UOM, provinces...) into fbr_reference.
--    Until the sender program (phase D4) exists, the lists are loaded by hand from the FBR portal.
-- Neither function changes create_invoice() or any existing bill.
-- =====================================================================================================

do $$
begin
  if to_regclass('public.fbr_reference') is null or to_regprocedure('public.create_fbr_bill(uuid, text, text, date, jsonb, numeric, text, text, text, boolean, text, text, text, text)') is null then
    raise exception 'Run 18_fbr.sql first.';
  end if;
end $$;

-- ----------------------------------------------------------------------------------- 1. unreported bill (Owner only)
create or replace function public.create_unreported_bill(
  p_customer_id  uuid,
  p_walkin_name  text,
  p_note         text,
  p_invoice_date date,
  p_items        jsonb,
  p_paid         numeric,
  p_method       text,
  p_walkin_phone text default null,
  p_walkin_address text default null,
  p_walkin_registration_type text default null,
  p_walkin_cnic_or_ntn text default null,
  p_reason       text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id    uuid;
  v_name  text;
  v_email text;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if not public.role_in(array['owner']) then
    raise exception 'Only the Owner can save a taxable bill without an FBR bill.' using errcode = '42501';
  end if;

  v_id := public.create_invoice(
    p_customer_id => p_customer_id,
    p_walkin_name => p_walkin_name,
    p_note        => p_note,
    p_invoice_date => p_invoice_date,
    p_items       => p_items,
    p_paid        => p_paid,
    p_method      => p_method,
    p_walkin_phone => p_walkin_phone,
    p_walkin_address => p_walkin_address,
    p_walkin_registration_type => p_walkin_registration_type,
    p_walkin_cnic_or_ntn => p_walkin_cnic_or_ntn
  );

  select coalesce(nullif(ur.full_name, ''), 'Owner') into v_name from public.user_roles ur where ur.user_id = auth.uid();
  select u.email into v_email from auth.users u where u.id = auth.uid();

  insert into public.audit_log (actor_id, actor_name, actor_email, actor_role, action, table_name, record_id, summary, new_data)
  values (
    auth.uid(), coalesce(v_name, 'Owner'), v_email, 'owner', 'create', 'invoices', v_id::text,
    'Bill saved WITHOUT an FBR bill although it has taxable items' || coalesce(' (' || nullif(btrim(p_reason), '') || ')', ''),
    jsonb_build_object('fbr_skipped', true, 'reason', nullif(btrim(p_reason), ''))
  );

  return v_id;
end;
$$;
revoke all on function public.create_unreported_bill(uuid, text, text, date, jsonb, numeric, text, text, text, text, text, text) from public, anon;
grant execute on function public.create_unreported_bill(uuid, text, text, date, jsonb, numeric, text, text, text, text, text, text) to authenticated;

-- ----------------------------------------------------------------------------------- 2. load an FBR list (Owner only)
-- p_items: [{"code": "8507.2000", "label": "Lead-acid accumulators", "payload": {...}}, ...]
-- p_replace = true replaces the whole list of that kind (in one step). Nothing changes if anything fails.
create or replace function public.import_fbr_reference(
  p_kind    text,
  p_items   jsonb,
  p_replace boolean default true
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null then
    raise exception 'Please sign in again.';
  end if;
  if not public.role_in(array['owner']) then
    raise exception 'Only the Owner can load the FBR lists.' using errcode = '42501';
  end if;
  if p_kind not in ('hs_code', 'uom', 'province', 'rate', 'sale_type', 'sro', 'hs_uom') then
    raise exception 'Unknown list type: %', p_kind;
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'The list is empty. Nothing was loaded.';
  end if;

  if p_replace then
    delete from public.fbr_reference where kind = p_kind;
  end if;

  insert into public.fbr_reference (kind, code, label, payload, fetched_at)
  select p_kind, btrim(x.code), nullif(btrim(coalesce(x.label, '')), ''), x.payload, now()
  from jsonb_to_recordset(p_items) as x(code text, label text, payload jsonb)
  where nullif(btrim(coalesce(x.code, '')), '') is not null
  on conflict (kind, code) do update
    set label = excluded.label, payload = excluded.payload, fetched_at = now();

  select count(*) into v_count from public.fbr_reference where kind = p_kind;
  return v_count;
end;
$$;
revoke all on function public.import_fbr_reference(text, jsonb, boolean) from public, anon;
grant execute on function public.import_fbr_reference(text, jsonb, boolean) to authenticated;

-- Quick check (read only):
--   select kind, count(*) from public.fbr_reference group by kind;

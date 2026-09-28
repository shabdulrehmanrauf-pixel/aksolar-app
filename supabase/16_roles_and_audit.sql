-- =====================================================================================================
-- AK Solar App, Phase 8 - PART 1 of 2: team roles + activity log ("who did what")
-- Run once in Supabase: SQL Editor > New query > paste ALL > Run.   Safe to run again.
--
-- What this does:
--   1. Creates the team list (user_roles): each login gets a role - owner / counter_staff / accountant.
--   2. Makes YOUR existing login the Owner (so you can never be locked out).
--   3. Creates the activity log (audit_log) and switches it on for every business table.
--      From now on, every add / edit / delete of stock, customers, bills, payments, purchases,
--      supplier payments, expenses, suppliers, battery services, scrap, and team roles is written
--      down automatically, with WHO did it, WHEN, and WHAT changed.
--
-- What this does NOT do (that is Part 2): it does not restrict anybody yet. Nothing about how bills,
-- stock, prices or reports work changes. It only starts watching and remembering.
-- =====================================================================================================

-- ----------------------------------------------------------------------------------- 1. team list
create table if not exists public.user_roles (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  role       text not null check (role in ('owner', 'counter_staff', 'accountant')),
  full_name  text not null default '',
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists user_roles_set_updated_at on public.user_roles;
create trigger user_roles_set_updated_at
  before update on public.user_roles
  for each row execute function public.set_updated_at();

alter table public.user_roles enable row level security;
revoke all on public.user_roles from anon, authenticated;
grant select on public.user_roles to authenticated;

drop policy if exists "Users can read their own role" on public.user_roles;
create policy "Users can read their own role"
  on public.user_roles for select to authenticated using (user_id = auth.uid());

-- ----------------------------------------------------------------------------------- 2. make the owner the Owner
-- Your login (the one that exists today) becomes the Owner.
insert into public.user_roles (user_id, role, full_name)
select id, 'owner', 'Owner'
from auth.users
where lower(email) = 'sh.abdulrehmanrauf@gmail.com'
on conflict (user_id) do nothing;

-- Safety net: if that email was not found, the oldest login becomes the Owner instead.
insert into public.user_roles (user_id, role, full_name)
select id, 'owner', 'Owner'
from auth.users
where not exists (select 1 from public.user_roles where role = 'owner')
order by created_at
limit 1
on conflict (user_id) do nothing;

-- Last check: refuse to finish (and change nothing) if there is still no Owner.
do $$
begin
  if not exists (select 1 from public.user_roles where role = 'owner' and is_active) then
    raise exception 'No Owner could be created: there is no login in Supabase > Authentication > Users. Create your login first, then run this file again.';
  end if;
end $$;

-- ----------------------------------------------------------------------------------- 3. who am I? helpers
create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select ur.role from public.user_roles ur where ur.user_id = auth.uid() and ur.is_active
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(public.current_app_role() = 'owner', false)
$$;

-- What the app asks right after sign-in: my role, my name, is my account on.
create or replace function public.my_role_info()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select jsonb_build_object('role', ur.role, 'full_name', ur.full_name, 'is_active', ur.is_active)
       from public.user_roles ur where ur.user_id = auth.uid()),
    jsonb_build_object('role', null, 'full_name', null, 'is_active', false)
  )
$$;

-- ----------------------------------------------------------------------------------- 4. team management (Owner only)
create or replace function public.team_list()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_owner() then
    raise exception 'Only the Owner can see the team.';
  end if;

  return coalesce((
    select jsonb_agg(
      jsonb_build_object(
        'user_id',         u.id,
        'email',           u.email,
        'full_name',       coalesce(ur.full_name, ''),
        'role',            ur.role,
        'is_active',       coalesce(ur.is_active, false),
        'has_role',        ur.user_id is not null,
        'last_sign_in_at', u.last_sign_in_at,
        'created_at',      u.created_at
      )
      order by u.created_at
    )
    from auth.users u
    left join public.user_roles ur on ur.user_id = u.id
  ), '[]'::jsonb);
end;
$$;

create or replace function public.set_user_role(
  p_user_id   uuid,
  p_role      text,
  p_full_name text,
  p_is_active boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_active boolean := coalesce(p_is_active, true);
  v_name   text    := btrim(coalesce(p_full_name, ''));
begin
  if not public.is_owner() then
    raise exception 'Only the Owner can change roles.';
  end if;
  if p_user_id is null or not exists (select 1 from auth.users where id = p_user_id) then
    raise exception 'That login could not be found.';
  end if;
  if p_role is null or p_role not in ('owner', 'counter_staff', 'accountant') then
    raise exception 'Choose Owner, Counter staff or Accountant.';
  end if;
  if v_name = '' then
    raise exception 'Enter the person''s name, so the activity log can show who did what.';
  end if;
  if p_user_id = auth.uid() and not v_active then
    raise exception 'You cannot turn off your own account.';
  end if;

  -- The shop must always keep at least one active Owner.
  if (p_role <> 'owner' or not v_active)
     and exists (select 1 from public.user_roles where user_id = p_user_id and role = 'owner' and is_active)
     and not exists (select 1 from public.user_roles where role = 'owner' and is_active and user_id <> p_user_id) then
    raise exception 'There must always be at least one active Owner.';
  end if;

  insert into public.user_roles (user_id, role, full_name, is_active)
  values (p_user_id, p_role, v_name, v_active)
  on conflict (user_id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
        is_active = excluded.is_active;
end;
$$;

-- Names only (no emails): lets any signed-in screen show "Made by Ali".
create or replace function public.user_display_names(p_ids uuid[])
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    jsonb_object_agg(
      u.id::text,
      coalesce(nullif(btrim(ur.full_name), ''), split_part(u.email, '@', 1))
    ),
    '{}'::jsonb
  )
  from auth.users u
  left join public.user_roles ur on ur.user_id = u.id
  where u.id = any (coalesce(p_ids, '{}'::uuid[]))
$$;

-- ----------------------------------------------------------------------------------- 5. the activity log
create table if not exists public.audit_log (
  id              uuid primary key default gen_random_uuid(),
  created_at      timestamptz not null default now(),
  actor_id        uuid,                                   -- who (kept even if the login is later deleted)
  actor_name      text not null default 'Unknown',
  actor_email     text,
  actor_role      text,
  action          text not null check (action in ('create', 'update', 'delete')),
  table_name      text not null,
  record_id       text,
  summary         text not null,                          -- plain-language sentence shown on the Activity screen
  changed_fields  text[],
  old_data        jsonb,
  new_data        jsonb,
  is_detail       boolean not null default false,         -- automatic side effects (stock change from a sale, bill lines)
  is_side_effect  boolean not null default false,
  txid            bigint not null default txid_current()  -- rows saved by the same click share this
);

create index if not exists audit_log_created_idx on public.audit_log (created_at desc);
create index if not exists audit_log_actor_idx   on public.audit_log (actor_id, created_at desc);
create index if not exists audit_log_table_idx   on public.audit_log (table_name, created_at desc);
create index if not exists audit_log_txid_idx    on public.audit_log (txid);

alter table public.audit_log enable row level security;
revoke all on public.audit_log from anon, authenticated;
grant select on public.audit_log to authenticated;      -- nobody can insert, edit or delete from the browser

drop policy if exists "Owner can read the activity log" on public.audit_log;
create policy "Owner can read the activity log"
  on public.audit_log for select to authenticated using (public.is_owner());

-- ----------------------------------------------------------------------------------- 6. wording helpers
create or replace function public.audit_rs(p_n numeric)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_n is null then '?'
              else 'Rs ' || regexp_replace(to_char(p_n, 'FM999,999,999,990.99'), '\.$', '') end
$$;

create or replace function public.audit_val(p_key text, p_val text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_val is null then
    return '(empty)';
  end if;
  if p_key = any (array['cost_price','sale_price','price','total_value','subtotal','discount','freight','amount',
                        'handover_amount','claim_amount','extra_charges','opening_balance','unit_cost','line_total',
                        'rate','total_amount','rate_per_kg'])
     and p_val ~ '^-?[0-9]+(\.[0-9]+)?$' then
    return public.audit_rs(p_val::numeric);
  end if;
  return left(p_val, 40);
end;
$$;

-- Turns one database change into one plain sentence.
create or replace function public.audit_describe(
  p_table   text,
  p_action  text,
  p_old     jsonb,
  p_new     jsonb,
  p_changed text[]
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  r         jsonb := coalesce(p_new, p_old);
  v_label   text;
  v_name    text := '';
  v_extra   text := '';
  v_prefix  text := 'Added';
  v_tmp     text;
  v_deltas  text;
begin
  case p_table
    when 'inventory' then
      v_label := 'stock item';
      v_name  := btrim(coalesce(r->>'brand', '') || ' ' || coalesce(r->>'model', ''));
      v_extra := 'quantity ' || coalesce(r->>'quantity', '?') || ', sale price ' || public.audit_rs((r->>'sale_price')::numeric);
    when 'customers' then
      v_label := 'customer';
      v_name  := coalesce(r->>'name', '');
    when 'invoices' then
      v_label := 'bill'; v_prefix := 'Made';
      v_name  := coalesce(r->>'invoice_number', '') || ' for ' || coalesce(r->>'buyer_name', '');
      v_extra := public.audit_rs((r->>'total_value')::numeric) || ' (' || coalesce(r->>'payment_status', '?') || ')';
    when 'invoice_items' then
      v_label := 'bill line';
      v_name  := coalesce(r->>'description', '');
      v_extra := coalesce(r->>'quantity', '?') || ' x ' || public.audit_rs((r->>'rate')::numeric);
    when 'payments' then
      v_label := 'payment'; v_prefix := 'Received';
      select invoice_number into v_tmp from public.invoices where id = nullif(r->>'invoice_id', '')::uuid;
      v_name  := public.audit_rs((r->>'amount')::numeric) || ' (' || coalesce(r->>'method', '?') || ') on bill ' || coalesce(v_tmp, '?');
    when 'purchase_invoices' then
      v_label := 'purchase bill'; v_prefix := 'Recorded';
      select name into v_tmp from public.distributors where id = nullif(r->>'supplier_id', '')::uuid;
      v_name  := coalesce(r->>'purchase_number', '') || ' from ' || coalesce(v_tmp, '?');
      v_extra := public.audit_rs((r->>'total_value')::numeric);
    when 'purchase_items' then
      v_label := 'purchase line';
      v_name  := coalesce(r->>'description', '');
      v_extra := coalesce(r->>'quantity', '?') || ' x ' || public.audit_rs((r->>'unit_cost')::numeric);
    when 'supplier_payments' then
      v_label := 'supplier payment'; v_prefix := 'Recorded';
      select name into v_tmp from public.distributors where id = nullif(r->>'supplier_id', '')::uuid;
      v_name  := coalesce(r->>'payment_number', '') || ' to ' || coalesce(v_tmp, '?');
      v_extra := public.audit_rs((r->>'amount')::numeric) || ' (' || coalesce(r->>'method', '?') || ')';
    when 'expenses' then
      v_label := 'expense'; v_prefix := 'Recorded';
      select name into v_tmp from public.expense_categories where id = nullif(r->>'category_id', '')::uuid;
      v_name  := coalesce(r->>'expense_number', '') || ' - ' || coalesce(v_tmp, '?');
      v_extra := public.audit_rs((r->>'amount')::numeric) || coalesce(', to ' || nullif(r->>'paid_to', ''), '');
    when 'distributors' then
      v_label := 'supplier';
      v_name  := coalesce(r->>'name', '');
    when 'charging_jobs' then
      v_label := 'charging slip'; v_prefix := 'Made';
      v_name  := coalesce(r->>'slip_number', '') || ' - ' || coalesce(r->>'customer_name', '')
                 || ' (' || btrim(coalesce(r->>'battery_brand', '') || ' ' || coalesce(r->>'battery_model', '')) || ')';
      v_extra := public.audit_rs((r->>'price')::numeric);
    when 'battery_claims' then
      v_label := 'battery claim'; v_prefix := 'Made';
      v_name  := coalesce(r->>'claim_number', '') || ' - ' || coalesce(r->>'customer_name', '')
                 || ' (' || btrim(coalesce(r->>'battery_brand', '') || ' ' || coalesce(r->>'battery_model', '')) || ')';
    when 'scrap_battery_inventory' then
      v_label := 'scrap batch'; v_prefix := 'Took in';
      v_name  := coalesce(r->>'intake_number', '') || ' - ' || btrim(coalesce(r->>'brand', '') || ' ' || coalesce(r->>'model', ''));
      v_extra := 'quantity ' || coalesce(r->>'quantity', '?');
    when 'scrap_battery_sales' then
      v_label := 'scrap sale'; v_prefix := 'Made';
      v_name  := coalesce(r->>'sale_number', '') || ' to ' || coalesce(r->>'buyer_name', '');
      v_extra := public.audit_rs((r->>'total_amount')::numeric);
    when 'cash_settings' then
      v_label := 'cash opening balance';
      v_extra := public.audit_rs((r->>'opening_balance')::numeric) || ' as of ' || coalesce(r->>'opening_date', '?');
    when 'business_profile' then
      v_label := 'shop details';
    when 'charging_price_list' then
      v_label := 'charging price';
      v_name  := coalesce(r->>'name', r->>'label', r->>'battery_type', r->>'description', '');
    when 'user_roles' then
      v_label := 'team member';
      v_name  := coalesce(r->>'full_name', '');
      v_extra := 'role ' || coalesce(r->>'role', '?') || case when (r->>'is_active') = 'false' then ', account turned off' else '' end;
    else
      v_label := replace(p_table, '_', ' ');
  end case;

  if p_action = 'delete' then
    return btrim('Deleted ' || v_label || ' ' || v_name);
  end if;

  if p_action = 'create' then
    return btrim(v_prefix || ' ' || v_label || ' ' || v_name)
           || case when v_extra <> '' then ' - ' || v_extra else '' end;
  end if;

  -- update
  if 'status' = any (p_changed) and p_new->>'status' = 'Cancelled' then
    return btrim('Cancelled ' || v_label || ' ' || v_name)
           || coalesce(' - reason: ' || nullif(btrim(p_new->>'cancel_reason'), ''), '');
  end if;

  select string_agg(
           replace(s.k, '_', ' ') || ': ' || public.audit_val(s.k, p_old->>s.k) || ' -> ' || public.audit_val(s.k, p_new->>s.k),
           ', ' order by s.k)
    into v_deltas
    from (
      select k
      from unnest(p_changed) as k
      where k <> all (array['updated_at','created_at','created_by','id','client_id','cancelled_at'])
      order by k
      limit 6
    ) s;

  return btrim('Edited ' || v_label || ' ' || v_name) || case when v_deltas is not null then ': ' || v_deltas else '' end;
end;
$$;

-- ----------------------------------------------------------------------------------- 7. the recorder
-- Runs after every add / edit / delete on the business tables. If writing the log ever fails,
-- the shop's work is NOT blocked (a warning is raised instead).
create or replace function public.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old     jsonb;
  v_new     jsonb;
  v_row     jsonb;
  v_changed text[];
  v_action  text;
  v_uid     uuid := auth.uid();
  v_name    text;
  v_email   text;
  v_role    text;
  v_summary text;
  v_side    boolean := false;
  v_detail  boolean := false;
  v_tx      bigint := txid_current();
  v_record  text;
begin
  begin
    if tg_op = 'INSERT' then
      v_action := 'create';
      v_new := to_jsonb(new);
      v_row := v_new;
    elsif tg_op = 'UPDATE' then
      v_action := 'update';
      v_old := to_jsonb(old);
      v_new := to_jsonb(new);
      v_row := v_new;
      select coalesce(array_agg(k order by k), '{}'::text[])
        into v_changed
        from jsonb_object_keys(v_new) as k
       where k <> 'updated_at' and (v_old -> k) is distinct from (v_new -> k);
      if coalesce(array_length(v_changed, 1), 0) = 0 then
        return null;                       -- nothing really changed (e.g. a re-sync): do not log
      end if;
    else
      v_action := 'delete';
      v_old := to_jsonb(old);
      v_row := v_old;
    end if;

    v_record := v_row ->> 'id';

    if v_uid is not null then
      select coalesce(nullif(btrim(ur.full_name), ''), split_part(au.email, '@', 1)), au.email, ur.role
        into v_name, v_email, v_role
        from auth.users au
        left join public.user_roles ur on ur.user_id = au.id
       where au.id = v_uid;
    end if;
    v_name := coalesce(v_name, case when v_uid is null then 'System (database)' else 'Unknown user' end);

    -- Automatic knock-on changes are kept, but tucked away by default on the Activity screen.
    if tg_op = 'UPDATE' then
      v_side := coalesce(case tg_table_name
        when 'inventory'               then v_changed <@ array['quantity', 'cost_price']
        when 'invoices'                then v_changed <@ array['payment_status']
        when 'scrap_battery_inventory' then v_changed <@ array['status', 'sold_in_sale_id']
        else false
      end, false);
    end if;
    v_detail := tg_table_name in ('invoice_items', 'purchase_items');
    if v_side then
      v_detail := exists (
        select 1 from public.audit_log a
         where a.txid = v_tx and not a.is_side_effect and not a.is_detail
      );
    end if;

    begin
      v_summary := public.audit_describe(tg_table_name, v_action, v_old, v_new, v_changed);
    exception when others then
      v_summary := initcap(v_action) || ' in ' || replace(tg_table_name, '_', ' ');
    end;

    insert into public.audit_log (
      actor_id, actor_name, actor_email, actor_role, action, table_name, record_id,
      summary, changed_fields, old_data, new_data, is_detail, is_side_effect, txid
    ) values (
      v_uid, v_name, v_email, v_role, v_action, tg_table_name, v_record,
      v_summary, v_changed, v_old, v_new, v_detail, v_side, v_tx
    );

    -- A real action just happened: earlier knock-on rows of the same click become "details".
    if not v_side and not v_detail then
      update public.audit_log
         set is_detail = true
       where txid = v_tx and is_side_effect and not is_detail;
    end if;
  exception when others then
    raise warning 'Activity log could not be written: %', sqlerrm;
  end;

  return null;
end;
$$;

-- ----------------------------------------------------------------------------------- 8. switch the recorder on
do $$
declare
  t text;
begin
  foreach t in array array[
    'inventory', 'customers', 'invoices', 'invoice_items', 'payments',
    'purchase_invoices', 'purchase_items', 'supplier_payments', 'expenses', 'distributors',
    'charging_jobs', 'charging_price_list', 'battery_claims',
    'scrap_battery_inventory', 'scrap_battery_sales',
    'cash_settings', 'business_profile', 'user_roles'
  ] loop
    if to_regclass('public.' || t) is not null then
      execute format('drop trigger if exists zz_audit_row_change on public.%I', t);
      execute format(
        'create trigger zz_audit_row_change after insert or update or delete on public.%I
           for each row execute function public.audit_row_change()', t);
    else
      raise notice 'Table % not found - skipped.', t;
    end if;
  end loop;
end $$;

-- ----------------------------------------------------------------------------------- 9. who may call what
revoke all on function public.current_app_role()                      from public, anon;
revoke all on function public.is_owner()                              from public, anon;
revoke all on function public.my_role_info()                          from public, anon;
revoke all on function public.team_list()                             from public, anon;
revoke all on function public.set_user_role(uuid, text, text, boolean) from public, anon;
revoke all on function public.user_display_names(uuid[])              from public, anon;
grant execute on function public.current_app_role()                      to authenticated;
grant execute on function public.is_owner()                              to authenticated;
grant execute on function public.my_role_info()                          to authenticated;
grant execute on function public.team_list()                             to authenticated;
grant execute on function public.set_user_role(uuid, text, text, boolean) to authenticated;
grant execute on function public.user_display_names(uuid[])              to authenticated;

-- Internal helpers: only the database itself may use these.
revoke all on function public.audit_rs(numeric)                                   from public, anon, authenticated;
revoke all on function public.audit_val(text, text)                               from public, anon, authenticated;
revoke all on function public.audit_describe(text, text, jsonb, jsonb, text[])    from public, anon, authenticated;
revoke all on function public.audit_row_change()                                  from public, anon, authenticated;

-- Done. Check: select * from public.user_roles;   (you should see yourself as owner)

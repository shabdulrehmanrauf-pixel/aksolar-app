-- AK Solar App, Phase 5: reports
-- Run this once in Supabase: SQL Editor > New query > paste all > Run.
-- Run 03_invoices.sql first. Safe to run again. It only reads data, it never changes it.

-- report_summary(from, to): everything the Reports page shows, in one call.
-- Dates are Pakistan-time dates. Cancelled bills are left out.
-- p_bucket is 'day' or 'month' (how the sales chart is grouped).
create or replace function public.report_summary(p_from date, p_to date, p_bucket text default 'day')
returns jsonb
language sql
stable
set search_path = ''
as $$
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
  buckets as (
    select generate_series(
             date_trunc(case when p_bucket = 'month' then 'month' else 'day' end, p_from::timestamp),
             p_to::timestamp,
             case when p_bucket = 'month' then interval '1 month' else interval '1 day' end
           )::date as b
  )
  select jsonb_build_object(
    'sales_total',     coalesce((select sum(total_value) from inv), 0),
    'invoice_count',   (select count(*) from inv),
    'gross_profit',    coalesce((select sum(value_excl_tax - cost_price * quantity) from itm), 0),
    'cash_received',   coalesce((select sum(amount) from pay), 0),
    'received_on_older_bills',
                       coalesce((select sum(amount) from pay where invoice_date < p_from), 0),
    'by_method',       jsonb_build_object(
                         'cash',  coalesce((select sum(amount) from pay where method = 'cash'), 0),
                         'bank',  coalesce((select sum(amount) from pay where method = 'bank'), 0),
                         'other', coalesce((select sum(amount) from pay where method = 'other'), 0)),
    'credit_given',    coalesce((select sum(due_total) from public.invoice_balances b
                                 where b.id in (select id from inv) and b.due_total > 0), 0),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
               'day', to_char(bk.b, 'YYYY-MM-DD'),
               'sales', coalesce(s.sales, 0),
               'count', coalesce(s.cnt, 0)) order by bk.b)
      from buckets bk
      left join (
        select date_trunc(case when p_bucket = 'month' then 'month' else 'day' end, invoice_date::timestamp)::date as b,
               sum(total_value) as sales, count(*) as cnt
        from inv group by 1
      ) s on s.b = bk.b
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
$$;

revoke all on function public.report_summary(date, date, text) from public, anon;
grant execute on function public.report_summary(date, date, text) to authenticated;

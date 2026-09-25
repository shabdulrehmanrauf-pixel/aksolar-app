# AK Solar — Phase F0 Output (Groundwork, no code)

**Date:** 25 Sep 2026
**Source:** `AK-Solar-Purchases-Payments-Expenses-Plan.md` section 12, and
`AK-Solar-Build-Prompts-By-Phase.md`'s F0 prompt.
**Status: decisions (Task 2) are now fully confirmed. Only Task 1 (real schema export) is still outstanding before F1 can start.**

---

## Task 1 of 2 — Missing SQL files / schema export

**Not fully resolved yet — this needs one action from you.**

I cannot reach your live Supabase from here, so I can't pull the real schema myself.
What I did instead:

1. **`00_export_schema.sql`** (in this same file set) — a **read-only** script.
   Run it once in Supabase → SQL Editor → Run. It returns one JSON blob covering
   every table, column, constraint, index, view, function, RLS policy, trigger,
   sequence and grant in your `public` schema. **Paste that JSON back to me** and F1
   gets built against your real database, not a guess.

2. **`RECOVERED-DRAFT-schema-06-07-10-11.sql`** — my best-effort reconstruction of
   the 6 missing files (`06_battery_services.sql`, `06_delete_invoice.sql`,
   `07_charging_handover.sql`, `07_scrap_battery.sql`, `10_ai_actions.sql`,
   `11_ai_rate_limit.sql`), built only from your TS types and every `.rpc(...)` call
   site in the repo — **not** the real files. It's there so you have something to
   diff against step 1's real output, and so F1 has a working guess if you'd
   rather not wait. **Treat every column type, default and index in it as
   unverified** until checked against the export.

**Next free SQL number:** the plan assumes `12_suppliers_purchases.sql`, but
`08`/`09` might exist in production and just never got pulled into the zip. The
export's `functions` and `tables` list will show what's already there — once you
paste it back, I'll confirm the real next number instead of assuming 12.

---

## Task 2 of 2 — Owner decisions D1–D13

**Done — recommended defaults recorded below.** These are the plan's own
recommendations; nothing here commits you. Read the "why it matters" column for
the five flagged ones (D1, D3, D7, D8, D12) before F1/F2 — they're the ones that
change *what gets built*, not just a label. I'll ask you to confirm or override
the flagged ones directly after this file.

| # | Question | Confirmed answer | Why it matters |
|---|---|---|---|
| **D1** | Suppliers = Battery-claim distributors, one list? | ✅ **CONFIRMED by owner: Yes — extend `distributors`.** UI says "Supplier"; claims screens keep saying "distributor". | If you say **no** instead, F1 builds a brand-new `suppliers` table and a link/migration step, which is a bigger F1. |
| **D2** | Payment methods for supplier payments/expenses | Cash, Cheque, Online, EasyPaisa, JazzCash. Customer receipts (cash/bank/other) stay as-is for now; EasyPaisa/JazzCash added there later as a separate small change. | Low-risk — accepted as-is unless you object. |
| **D3** | What happens to `cost_price` on a purchase? | **Latest purchase cost**, with a per-line "keep old cost" checkbox. | Switching to weighted-average later means recalculating history — worth deciding once, permanently. |
| **D4** | Can we pay a supplier more than we owe? | **Yes, with a warning** — recorded as "Advance paid". | Low-risk — accepted as-is. |
| **D5** | Track cheque clearing (issued/cleared/bounced)? | Store the fields now (`cheque_number`, `cheque_date`, `bank_name`, `cheque_status`); clear/bounce **buttons** deferred to F6. ✅ **CONFIRMED data-model rule: manual reversal entry.** A bounced cheque does NOT silently flip the ledger by itself — staff must enter a separate reversal (a negative/offsetting `supplier_payments` row, reason = "cheque bounced"), so the ledger always has an explicit, auditable line for it instead of a payment quietly changing meaning after the fact. | This is now locked in for F1's `supplier_ledger` view and F2's cheque workflow — no ledger logic should ever read `cheque_status` to auto-adjust a balance. |
| **D6** | Keep `stock_movements` history? | **Yes.** | Add an index on `(inventory_id, created_at)` from the start (noted for the F1 build prompt). |
| **D7** | Phone nav: Option A (More + Home tiles) or B (center "+")? | ✅ **CONFIRMED by owner: Option B** — a center **"+"** button in the phone bottom bar opens a quick-actions sheet with real tappable buttons: **New bill, Receive stock, Make payment, Add expense, Add customer.** Owner said plainly "I need buttons" — Option A (everything tucked one level down inside More) doesn't satisfy that; Option B puts the actions themselves one tap away from every screen. | **Concrete effect on the bottom bar:** today it's Home · Inventory · Customers · Sales · More. Under B, the center slot becomes **+** and **Customers moves into the More menu** (it's not lost — still one tap away, just no longer a bottom-bar icon). Home, Inventory, Sales, More stay put. If losing Customers' own bottom-bar icon isn't actually wanted, say so before F2 and we'll do **A + Home quick tiles** instead (same visible buttons, bottom bar unchanged) — this is the only other way to get real buttons without removing an existing tab, since the bar is capped at 5 icons. |
| **D8** | Scrap/charging/claims money counted in the cash book? | **Yes**, as "Other cash income" lines; read-only aggregation, no schema change to those modules. | Needs the *actual* column names for scrap/charging/claim cash amounts confirmed from the export before F4 — don't let F4 guess field names. |
| **D9** | Who sees expenses/supplier balances/cash book once roles exist? | Owner + Accountant; **not** Counter Staff. | Matches the existing Phase 8 plan — accepted as-is. |
| **D10** | Offline purchases in v1? | **No.** Purchase invoices are online-only in F1–F5; only expenses and payments-to-existing-suppliers work offline. | Accepted as-is — this is what keeps F1/F5 scoped down. |
| **D11** | Expense categories default list OK? "Owner withdrawal" excluded from profit? | **Yes** — Rent, Electricity, Salaries, Transport, Repairs, Tea & food, Fuel, Internet & phone, Marketing, Other, **Owner withdrawal** (counts in cash book, excluded from Net profit). | Accepted as-is. |
| **D12** | Existing suppliers' opening balances — who provides them, and cut-over date? | **Owner supplies a list before go-live** (name, amount, "we owe" or "they owe", as-of date). | **This is on you, not code** — F1's supplier UI will have a place to enter it per-supplier, but nobody can invent the actual numbers. Needs your list before go-live, not before F1 is *built*. |
| **D13** | Battery claim "settled" — auto-credit the supplier ledger? | **No** — offer a button "Credit to supplier account" on settle; not automatic. | Accepted as-is. |

---

## Two things flagged in the build-prompts file that D5/D8 above don't fully close

These aren't blockers to reading this file, but say so explicitly so they don't
get decided ad hoc inside F2/F4 code:

1. **Cheque-bounce reversal (affects F1's `supplier_ledger` design, not just F2's UI).**
   When a cheque flips `issued → bounced`, does the ledger un-apply the payment
   automatically (ledger reads `cheque_status`), or does staff enter a manual
   reversal payment? This changes how `supplier_ledger`'s running-balance view is
   written in F1, so it's worth answering before F1 starts, even though the
   clear/bounce buttons themselves are F6.
2. **D8's real column names.** Before F4, get the actual table/column names Battery
   claims / charging jobs / scrap use for cash amounts (the export in Task 1 will
   show these) — don't let the cash-book query guess field names.

---

## What F0 does **not** include (by design, per the plan)

No application code, no new SQL run against your database, no UI. F0 is
schema-recovery + sign-off only, so F1 (Suppliers + Purchase invoice) starts from
verified ground instead of a guessed `distributors` table that could silently
break Battery claims.

## Exact next step

All flagged decisions are confirmed (D1: one combined list; D5: cheque bounce is a
manual reversal entry, never automatic; D7: Option B, center "+" with real
buttons, Customers moves into More). D8's exact column names still get checked
against the export, not guessed, before F4 — no action needed from you now.

**The only thing left before F1 can start:**

1. Run `00_export_schema.sql` in Supabase SQL Editor.
2. Paste the JSON result back here.

Once that lands, F1 (Suppliers + Purchase invoice) gets built directly against
your real schema, and I'll generate `12_suppliers_purchases.sql` (or whatever
number the export shows is actually next).

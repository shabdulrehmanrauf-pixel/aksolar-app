# AK Solar App — Project Status (consolidated)

**Last updated:** 26 Sep 2026 (rev. 4 — F3 Expenses built; F2's `13_supplier_payments.sql` confirmed present)
**Replaces:** `F0-Decisions-and-Status.md`, `F1-Part1-Status-and-Handoff.md`, `F1-Part2-Status-and-Handoff.md`. Keep this one file going forward instead of a new doc per phase — update it in place as each phase lands.

---

## 1. Where things stand, at a glance

| Phase | What it is | Status |
|---|---|---|
| **F0** | Groundwork — schema export, 13 owner decisions (D1–D13) | ✅ Done. All decisions confirmed. |
| **F1** | Suppliers + Purchase invoice ("Receive stock") | ✅ Built (schema + screens). ⚠️ Not yet fully verified live — see §3. |
| **F2** | Payments to suppliers | ✅ Built (schema + screens). File check passed — see §4. ⚠️ Not yet verified live. |
| **F3** | Expenses | ✅ Built (schema + screen). ⚠️ Not yet verified live — see §5. |
| **F4** | Cash book + Reports + Home integration | ❌ Not started (needs F1–F3 live first) |
| **F5** | Offline support + command-palette search | ❌ Not started (needs F1–F4 live first) |
| **F6** | Extras (cheque clear/bounce buttons, etc.) | ❌ Not started — build only what's actually wanted |

**Bottom line:** F1, F2 and F3 are all code-complete. F3 additionally passed a clean `next build`
(23/23 pages) and `npx tsc --noEmit`, run against your actual repo files including the previously-missing
`13_supplier_payments.sql` — see the note in §4. None of the three has been run against the real Supabase
project yet. Before any of them is "done": run each phase's smoke test (§3, §4, §5) against production
data, and confirm all the SQL files actually ran clean in Supabase, in order.

---

## 2. F0 — Groundwork (done)

All 13 decisions are locked in. The five that actually change what gets built:

| # | Decision |
|---|---|
| **D1** | Suppliers = Battery-claim distributors, one list. Extends `distributors`, never a separate table. |
| **D3** | Purchase cost updates inventory's `cost_price` to the **latest purchase cost**, with a per-line "keep old cost" checkbox. |
| **D5** | Cheque fields stored now; clear/bounce **buttons** are F6. A bounced cheque is **never** auto-applied — always a manual reversal row. |
| **D7** | Phone nav = **Option B**: center **+** quick-actions button. Customers moved off the bottom bar into More. |
| **D8** | Scrap/charging/claims cash counted in the cash book as "Other cash income" — real column names still need confirming from a schema export before F4 builds this. |
| **D12** | Supplier opening balances: owner supplies the list — this is data entry, not code, and is still outstanding; nobody can invent these numbers. |

**Still open from F0:** the real schema export (F0's `00_export_schema.sql` → paste the JSON back) was never actually done. Everything since has been built defensively (`if not exists` / `or replace`) against what the app's own TypeScript said the schema was, not the verified real thing. Low risk at this point since nothing has broken, but it's the one loose thread from the very start of this project.

---

## 3. F1 — Suppliers + Purchase invoice (built)

### SQL (run in this order, in Supabase → SQL Editor)
1. `12_suppliers_purchases.sql` — ✅ confirmed run.
2. `12b_supplier_save.sql` — ✅ confirmed run.

### What exists now
- **Suppliers:** list (`/suppliers`), add/edit, per-supplier ledger + purchase history (`/suppliers/[id]`). Opening balance, NTN/CNIC, active/inactive toggle (no hard delete — supplier history can never disappear, since `distributors` is shared with Battery claims).
- **Purchases:** list (`/purchases`), new purchase / "Receive stock" (`/purchases/new`), detail + cancel (`/purchases/[id]`), print (`/print/purchase/[id]`).
- **Inventory hooks:** "Receive stock" header button, per-item "Restock" action, lazy "Stock history" section in the item edit sheet.
- **Nav (D7):** phone bottom bar is now Home · Inventory · **+** · Sales · More. The **+** opens a quick-actions sheet — New bill, Receive stock, Add customer, Make payment (F2) and Add expense (F3) are all live now. Suppliers, Purchases, Payments and Expenses shortcuts live under More; Suppliers/Purchases/Payments/Expenses are also on the desktop sidebar.
- **Home page:** the "Quick actions" tile grid (`app/page.tsx`) has Purchases and Suppliers next to Sales/Customers. ✅ confirmed live. (Payments and Expenses were deliberately not added to this grid — Home integration is F4's job.)

### Known gaps, on purpose (not bugs)
- No cheque clear/bounce buttons — F6.
- No PDF/WhatsApp/email for a purchase bill, only Print — it's an internal record, not a supplier-facing document.
- Home screen quick-tile grid untouched beyond what's noted above — that's F4's job.

### ⚠️ Still needs verifying (do this before calling F1 done)
1. **Confirm `next build` passes clean** in your real environment.
2. ~~Confirm Suppliers/Purchases are actually reachable in the deployed UI~~ — ✅ **Resolved.**
3. **Run the smoke test:**
   - Add a supplier with an opening balance ("we owe them") → check the ledger shows it as the first line with the right running balance.
   - Receive stock for a brand-new product from a brand-new supplier, part payment by cheque → inventory qty/cost update, supplier balance updates, bill prints.
   - Repeat the same supplier-invoice number → blocked.
   - Sell some received stock, then try cancelling that purchase → refused.
   - Cancel a different, untouched purchase → stock and ledger both reverse.

---

## 4. F2 — Payments to suppliers (built)

### SQL (run in this order, in Supabase → SQL Editor)
1. `12_suppliers_purchases.sql` / `12b_supplier_save.sql` — must already be run (F1).
2. `13_supplier_payments.sql` — ⚠️ **not yet run against the real project.** Run this next.

**Note on this file (rev. 4):** an earlier packaging of this repo did not include
`13_supplier_payments.sql` in its export, even though the status doc said F2 was built. That's now
resolved — the file exists and was checked directly: its `record_supplier_payment()` signature matches
what `app/payments/new/NewPayment.tsx` calls, `cancel_supplier_payment()` matches what
`PaymentsClient.tsx` calls, and its payment-method list (`cash, cheque, online, easypaisa, jazzcash`)
matches the check constraint already in `supplier_payments` from `12_suppliers_purchases.sql`. If your
actual GitHub repo is missing this file too, add it before doing anything else with Payments — nothing
in `/payments` will work without it.

It only adds two functions and one view — it does not touch `distributors`, `purchase_invoices` or
`purchase_items`, and it does not alter the `supplier_payments` table (F1 already created it with every
column F2 needed, including the cheque fields).

### What exists now
- **`record_supplier_payment()`** — saves one payment, either **against a specific purchase bill**
  (capped at that bill's amount still due) or **on account** (a general payment to the supplier, not
  tied to one bill — `purchase_id` is null). Idempotent via `client_id`, same pattern as F1's
  `create_purchase()`: a retried offline save returns the existing payment instead of duplicating it.
  Requires the cheque number when the method is cheque. Rejects a future-dated payment.
- **`cancel_supplier_payment()`** — never a hard delete, marks the row `Cancelled` and requires a
  reason. Doesn't touch stock (payments never did). Because `purchase_balances`, `supplier_ledger` and
  `supplier_balances` (all from F1) already only count `status = 'Valid'` rows, a cancelled payment
  drops out of every balance and the ledger automatically — no other SQL needed.
- **`payment_details` view** — `supplier_payments` joined with the supplier's name and (if against a
  bill) that bill's number, so the Payments screen doesn't need extra round trips.
- **`/payments` screen** — **Payments · Purchase bills · Suppliers** tabs, search, and a cancel-payment
  dialog (reason required), matching the look of `/purchases`.
- **`/payments/new`** — pick a supplier, then choose **on account** or one of that supplier's unpaid
  bills, amount/date/method, cheque fields when the method is cheque, optional reference. Accepts
  `?supplier=ID` and `?purchase=ID` to arrive pre-filled.
- **`/print/payment/[id]`** — the payment voucher, A4, same styling as the purchase-bill print view.
- **Nav:** **Payments** added to the desktop sidebar and the More menu shortcuts. The bottom-bar **+**
  quick action **"Make payment"** is unlocked.
- **Buttons added to existing screens:** a supplier's page (`/suppliers/[id]`) has **Make payment**; a
  purchase bill's page (`/purchases/[id]`) has **Record payment**.

### Known gaps, on purpose (not bugs)
- No offline queueing for payments yet — that's F5's job.
- No cheque clear/bounce buttons, same as F1 — F6.
- The supplier ledger page's "Ledger" tab already lists every payment (via F1's `supplier_ledger`
  view), so no separate "Payments" tab was added there.

### ⚠️ Still needs verifying (do this before calling F2 done)
1. **Run `13_supplier_payments.sql`** in Supabase — not yet done.
2. **Confirm `next build` passes clean in the real environment.**
3. **Run the F2 smoke test:**
   - Make a purchase bill with nothing paid (F1), then record a payment against it for part of the due
     amount → bill's due total drops, supplier's balance drops, ledger shows the payment.
   - Pay off the rest of that same bill → bill flips to "Paid".
   - Try to pay more than a bill's due amount → blocked with the correct due figure in the message.
   - Record an on-account payment for a supplier with no unpaid bills → succeeds.
   - Pay by cheque with no cheque number → blocked. Fill it in → succeeds, voucher print shows it.
   - Cancel a payment (with a reason) → the bill's due total and supplier's balance both go back up.
   - Print a payment voucher, both for an against-a-bill payment and an on-account one.

**Depends on:** F1 (done). **Unlocks:** the "Make payment" quick-action button — done.

---

## 5. F3 — Expenses (built)

### SQL (run in this order, in Supabase → SQL Editor)
1. `01_inventory.sql` — must already be run (F3 reuses its `set_updated_at()` trigger function).
2. `14_expenses.sql` — ⚠️ **not yet run against the real project.** Run this next. Does not depend on
   F1 or F2; can be run before, after, or independently of either.

### What exists now
- **`expense_categories`** — seeded exactly per D11: Rent, Electricity, Salaries, Transport, Repairs,
  Tea & food, Fuel, Internet & phone, Marketing, Other, **Owner withdrawal**. Each row carries an
  `excluded_from_profit` flag, true only for Owner withdrawal, stored now so F4's Net-profit card can
  read it later without another migration.
- **`create_expense()` / `update_expense()` / `cancel_expense()`** — same shape as F1/F2's functions:
  idempotent via `client_id`, security-definer, rejects a future date, requires the cheque number when
  the method is cheque. `cancel_expense()` never hard-deletes, marks `Cancelled` and requires a reason.
  `update_expense()` is refused once an expense is cancelled — cancel and re-enter instead, so a
  cancelled row's original numbers are never disturbed.
- **`expense_details` view** — `expenses` joined with its category's name and profit flag.
- **`/expenses` screen** — search; **This month / All time** toggle; clickable category-total chips
  (tap one to filter the list to that category, with its own running total); add/edit via a slide-in
  sheet; cancel-with-reason dialog, matching the look of `/payments`.
- **Payment methods:** reuses `SUPPLIER_PAYMENT_METHODS` from `lib/purchases.ts` as-is (decision D2:
  cash, cheque, online, EasyPaisa, JazzCash — the same list for supplier payments and expenses).
- **Nav:** **Expenses** added to the desktop sidebar and the More menu (both the list and a direct "Add
  expense" shortcut). The bottom-bar **+** quick action **"Add expense"** is unlocked (was greyed out
  "Coming soon" since F1).

### Known gaps, on purpose (not bugs)
- No offline queueing yet — F5's job, same as it will be for payments to an existing supplier.
- No custom/owner-added categories — the list is seeded and fixed for now. Easy small addition later
  if wanted.
- Reports/cash book/Net profit don't read expenses yet — that's F4's job. `app/reports/page.tsx` still
  says "Expenses ... are not tracked yet" on purpose, until F4 lands.

### ⚠️ Still needs verifying (do this before calling F3 done)
1. **Run `14_expenses.sql`** in Supabase — not yet done.
2. ~~Confirm `next build` passes clean~~ — ✅ **Resolved in this sandbox.** `npx tsc --noEmit` and a
   full `next build` (23/23 pages, `/expenses` included) both passed clean against your actual repo
   files, with the same one caveat F2 already documented: this sandbox can't reach
   `fonts.googleapis.com`, worked around locally just to finish the check and reverted before handing
   the files back. Your real environment should build without that workaround. Still worth a real
   `next build` once the files are in your repo, same as any other phase.
3. **Run the F3 smoke test:**
   - Add an expense in a few different categories, including one by cheque with no cheque number →
     blocked; fill it in → succeeds.
   - Edit an expense (change category/amount/date) → list and category totals update correctly.
   - Cancel an expense (reason required) → stays in the list marked Cancelled, drops out of the
     category totals and the "Total shown" figure.
   - Try to add an expense dated in the future → blocked.
   - Switch This month / All time and the category chips → totals and list match what's shown.

**Depends on:** nothing — built independently of F1/F2. **Unlocks:** the "Add expense" quick-action
button — done, no longer greyed out.

---

## 6. F4 — Cash book + Reports + Home integration (not started)

**Scope:** opening cash balance, the full cash-book formula (opening + cash sales + other cash income − cash paid to suppliers − cash expenses), Reports gets Expenses/Net profit/Purchases/Paid-to-suppliers/We-owe cards (Net profit excludes any expense row where `expense_categories.excluded_from_profit` is true — that flag is already in place from F3), Home gets quick tiles.

**Depends on:** F1, F2, and F3 all live — this phase reads all three.

**Blocked on:** D8's real column names (scrap/charging/claims cash amounts) — still needs the schema export from F0 before this can be built without guessing.

---

## 7. F5 — Offline support + command-palette search (not started)

**Scope:** cache suppliers/purchases/payments/expenses for offline viewing; make **Add expense** and **payments to an existing supplier** work offline (queued sync); add supplier/purchase/payment/expense names to Ctrl+K search. **Purchase invoices stay online-only** (decision D10) — never queued, on purpose (a purchase can create a supplier, products, and stock in one call, which isn't safe to replay from a queue).

**Depends on:** F1–F4 live.

---

## 8. F6 — Extras (not started, build only what's actually wanted)

Cheque clear/bounce buttons, and whatever else the owner actually prioritizes once F1–F5 are live. Not a fixed scope — revisit this list when you get there.

---

## 9. Immediate next actions (in order)

1. ~~Resolve the "where's the Suppliers/Purchases button" question~~ — done.
2. ~~Confirm `13_supplier_payments.sql` actually exists~~ — done this revision: it's present and its
   function signatures match the app code that calls it. **Double-check it's actually committed in your
   GitHub repo**, since one earlier export of this project didn't include it.
3. Add F3's six new files and four small edits (see the F3 file drop / README) to your repo.
4. Get a clean `next build` in the real project (F1 + F2 + F3 code together).
5. Run, in Supabase, in this exact order: `12_suppliers_purchases.sql` → `12b_supplier_save.sql` →
   `13_supplier_payments.sql` → `14_expenses.sql` (skip any already run).
6. Run the F1 smoke test (§3), the F2 smoke test (§4), and the F3 smoke test (§5).
7. Once F1, F2 and F3 are all confirmed solid end-to-end, start F4 (Cash book + Reports + Home) — it's
   the first phase that needs all three of them live.

# AK Solar App — Project Status (consolidated)

**Last updated:** 26 Sep 2026 (rev. 3 — F2 Payments to suppliers built)
**Replaces:** `F0-Decisions-and-Status.md`, `F1-Part1-Status-and-Handoff.md`, `F1-Part2-Status-and-Handoff.md`. Keep this one file going forward instead of a new doc per phase — update it in place as each phase lands.

---

## 1. Where things stand, at a glance

| Phase | What it is | Status |
|---|---|---|
| **F0** | Groundwork — schema export, 13 owner decisions (D1–D13) | ✅ Done. All decisions confirmed. |
| **F1** | Suppliers + Purchase invoice ("Receive stock") | ✅ Built (schema + screens). ⚠️ Not yet fully verified live — see §3. |
| **F2** | Payments to suppliers | ✅ Built (schema + screens). ⚠️ Not yet verified live — see §4. |
| **F3** | Expenses | ❌ Not started |
| **F4** | Cash book + Reports + Home integration | ❌ Not started (needs F1–F3 live first) |
| **F5** | Offline support + command-palette search | ❌ Not started (needs F1–F4 live first) |
| **F6** | Extras (cheque clear/bounce buttons, etc.) | ❌ Not started — build only what's actually wanted |

**Bottom line:** F1 and F2 are both code-complete and pass a clean `next build` (verified locally with dependencies installed — see §4 for the one caveat). Neither has been run against the real Supabase project yet. Before either is "done": run F1's smoke test (§3) and F2's smoke test (§4) against production data, and confirm the SQL files actually ran clean in Supabase.

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
- **Nav (D7):** phone bottom bar is now Home · Inventory · **+** · Sales · More. The **+** opens a quick-actions sheet — New bill, Receive stock, Add customer are live; Make payment, Add expense are shown greyed out ("Coming soon") until F2/F3 exist. Suppliers, Purchases, and Customers were added as shortcuts under More, and Suppliers/Purchases were added to the desktop sidebar.
- **Home page:** the "Quick actions" tile grid (`app/page.tsx`, the same colorful gradient-badge buttons as New bill / Sales / Stock / Scrap etc.) now also has **Purchases** (next to Sales) and **Suppliers** (next to Customers). ✅ confirmed live.

### Known gaps, on purpose (not bugs)
- No way to record a payment **after** a purchase is saved, or pay a supplier outside of a purchase — needs F2's `record_supplier_payment()`.
- No cheque clear/bounce buttons — F6.
- No PDF/WhatsApp/email for a purchase bill, only Print — it's an internal record, not a supplier-facing document.
- Home screen untouched — that's F4's job.

### ⚠️ Still needs verifying (do this before calling F1 done)
1. **Confirm `next build` passes clean** in your real environment. Nothing here has been checked against your actual `node_modules` — a missing-file error (`NewPurchase.tsx` not present in the repo) already turned up once and was fixed; there may be others.
2. ~~Confirm Suppliers/Purchases are actually reachable in the deployed UI~~ — ✅ **Resolved.** Confirmed present in the sidebar. Home page tiles and More-menu shortcuts also confirmed as of this revision.
3. **Run the smoke test** (once #1 above is confirmed):
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
- **`/payments`** screen — **Payments · Purchase bills · Suppliers** tabs, search, and a cancel-payment
  dialog (reason required), matching the look of `/purchases`. "Purchase bills" shows every bill with a
  **Pay** shortcut on any that still have something due; "Suppliers" shows every active supplier with a
  **Pay** shortcut on any with a positive balance.
- **`/payments/new`** — pick a supplier, then choose **on account** or one of that supplier's unpaid
  bills (picking one fills in the amount still due), amount/date/method, cheque fields when the method
  is cheque, optional reference. Accepts `?supplier=ID` and `?purchase=ID` to arrive pre-filled (used by
  the buttons below).
- **`/print/payment/[id]`** — the payment voucher, A4, same styling as the purchase-bill print view.
  Internal record, not a supplier-facing document (same rule as F1's purchase print).
- **Nav:** **Payments** added to the desktop sidebar (`components/nav.ts`) and to the More menu shortcuts
  (phone). The bottom-bar **+** quick action **"Make payment"** is unlocked (was greyed out "Coming
  soon" since F1) and now opens `/payments/new`.
- **Buttons added to existing screens:** a supplier's page (`/suppliers/[id]`) now has a **Make payment**
  button when they're owed something; a purchase bill's page (`/purchases/[id]`) now has a **Record
  payment** button when it still has something due, replacing the old "coming with Payments to
  suppliers" placeholder text.

### Known gaps, on purpose (not bugs)
- No offline queueing for payments yet — that's F5's job (spec explicitly calls out making payments to
  an existing supplier work offline in F5, same as it does for expenses).
- No cheque clear/bounce buttons, same as F1 — F6. `cheque_status` still defaults to `'issued'` and
  nothing reads it to change a balance.
- The supplier ledger page doesn't get a dedicated "Payments" tab of its own — its existing "Ledger" tab
  already lists every payment as a ledger line (it always has, since F1's `supplier_ledger` view reads
  `supplier_payments`), so a second, duplicate list wasn't added.

### ⚠️ Still needs verifying (do this before calling F2 done)
1. **Run `13_supplier_payments.sql`** in Supabase — not yet done.
2. **Confirm `next build` passes clean in the real environment.** It was verified clean in a sandbox
   build here (`npx tsc --noEmit` clean, and a full `next build` clean once Google Fonts were reachable
   — see the one caveat below) but never against the actual deployed project or its real
   `node_modules`/env vars.
   - *Caveat:* the build sandbox used to test this could not reach `fonts.googleapis.com` (network
     allowlist), which made `next build` fail on font fetching alone — unrelated to any F2 code. That
     was worked around locally just to finish the verification and reverted before packaging; your real
     environment should have normal internet access and won't hit this.
3. **Run the F2 smoke test** (once #1 and #2 above are confirmed):
   - Make a purchase bill with nothing paid (F1), then record a payment against it for part of the due
     amount → bill's due total drops, supplier's balance drops, ledger shows the payment.
   - Pay off the rest of that same bill → bill flips to "Paid", `payment_tag` on `/purchases` updates.
   - Try to pay more than a bill's due amount → blocked with the correct due figure in the message.
   - Record an on-account payment for a supplier with no unpaid bills → succeeds, supplier's balance
     drops, no bill is affected.
   - Pay by cheque with no cheque number → blocked. Fill it in → succeeds, voucher print shows the
     cheque number/date/bank.
   - Cancel a payment (with a reason) → the bill's due total and the supplier's balance both go back up;
     the payment still shows in lists, marked Cancelled, not deleted.
   - Print a payment voucher, both for an against-a-bill payment and an on-account one.

**Depends on:** F1 (done).

**Unlocks:** the "Make payment" quick-action button — done, no longer greyed out.

---

## 5. F3 — Expenses (not started)

**Scope:** `expense_categories` (seeded list, including **Owner withdrawal**, per D11) + `expenses` table; `create_expense()` / `update_expense()` / `cancel_expense()`; `/expenses` screen with add/list/filter/category-breakdown; **Expenses** navbar button.

**Depends on:** nothing — can be built independently of F1/F2, in parallel if useful.

**Unlocks:** the "Add expense" quick-action button (currently greyed out).

---

## 6. F4 — Cash book + Reports + Home integration (not started)

**Scope:** opening cash balance, the full cash-book formula (opening + cash sales + other cash income − cash paid to suppliers − cash expenses), Reports gets Expenses/Net profit/Purchases/Paid-to-suppliers/We-owe cards, Home gets quick tiles.

**Depends on:** F1, F2, and F3 all live — this phase reads all three.

**Blocked on:** D8's real column names (scrap/charging/claims cash amounts) — still needs the schema export from F0 before this can be built without guessing.

---

## 7. F5 — Offline support + command-palette search (not started)

**Scope:** cache suppliers/purchases/payments/expenses for offline viewing; make **Add expense** and **payments to an existing supplier** work offline (queued sync); add supplier/purchase/payment names to Ctrl+K search. **Purchase invoices stay online-only** (decision D10) — never queued, on purpose (a purchase can create a supplier, products, and stock in one call, which isn't safe to replay from a queue).

**Depends on:** F1–F4 live.

---

## 8. F6 — Extras (not started, build only what's actually wanted)

Cheque clear/bounce buttons, and whatever else the owner actually prioritizes once F1–F5 are live. Not a fixed scope — revisit this list when you get there.

---

## 9. Immediate next actions (in order)

1. ~~Resolve the "where's the Suppliers/Purchases button" question~~ — done, confirmed in sidebar, Home tiles, and More menu.
2. Get a clean `next build` in the real project (F1 + F2 code).
3. Run `13_supplier_payments.sql` in Supabase (F1's two SQL files must already be run first).
4. Run the F1 smoke test in §3 and the F2 smoke test in §4.
5. Once F1 and F2 are both confirmed solid end-to-end, start F3 (Expenses) — it doesn't depend on
   either of them, so it can be built any time, including in parallel with the verification above.

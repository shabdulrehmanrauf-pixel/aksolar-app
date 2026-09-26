# AK Solar App — Project Status (consolidated)

**Last updated:** 26 Sep 2026 (rev. 2 — Home page quick-action tiles added)
**Replaces:** `F0-Decisions-and-Status.md`, `F1-Part1-Status-and-Handoff.md`, `F1-Part2-Status-and-Handoff.md`. Keep this one file going forward instead of a new doc per phase — update it in place as each phase lands.

---

## 1. Where things stand, at a glance

| Phase | What it is | Status |
|---|---|---|
| **F0** | Groundwork — schema export, 13 owner decisions (D1–D13) | ✅ Done. All decisions confirmed. |
| **F1** | Suppliers + Purchase invoice ("Receive stock") | ✅ Built (schema + screens). ⚠️ Not yet fully verified live — see §3. |
| **F2** | Payments to suppliers | ❌ Not started |
| **F3** | Expenses | ❌ Not started |
| **F4** | Cash book + Reports + Home integration | ❌ Not started (needs F1–F3 live first) |
| **F5** | Offline support + command-palette search | ❌ Not started (needs F1–F4 live first) |
| **F6** | Extras (cheque clear/bounce buttons, etc.) | ❌ Not started — build only what's actually wanted |

**Bottom line:** F1 is code-complete, deployed, and confirmed reachable in the UI (sidebar + Home page tiles + More menu). Two things still open before calling it fully verified: the smoke test in §3, and confirming `next build` is clean end-to-end.

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

## 4. F2 — Payments to suppliers (not started)

**Scope:** `record_supplier_payment()` / `cancel_supplier_payment()`; a `/payments` screen with **Payments · Purchase bills · Suppliers** tabs (this is also how F1's screens were meant to get a proper navbar home, per the original plan — right now they're reachable via sidebar/More instead, which works fine as a substitute); payment voucher print; against-a-specific-bill vs. on-account payment; a **Payments** navbar button.

**Depends on:** F1 (done).

**Unlocks:** the "Make payment" quick-action button (currently greyed out).

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
2. Get a clean `next build` in the real project.
3. Run the F1 smoke test in §3.
4. Once F1 is confirmed solid end-to-end, start F2 (Payments) and/or F3 (Expenses) — they don't depend on each other, so either order works, or both in parallel.

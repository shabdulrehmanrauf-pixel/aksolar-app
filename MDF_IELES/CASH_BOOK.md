# AK Solar App: Daily Cash Book and Accounts

How it works, what it can do, and how it is wired into the rest of the app.

Files: `supabase/20_cash_ledger.sql` plus the front-end files listed in section 7.

---

## 1. The idea in one minute

Before this, "cash in hand" was a calculated number on the Reports page. There was no place to add cash, no bank accounts, and no record of who received what.

Now there is one **Cash Book** (Owner only) with **accounts**:

| Account | Type | Created for you |
|---|---|---|
| Cash Counter | Cash | yes |
| Main Bank | Bank | yes |
| EasyPaisa | Wallet | yes |
| JazzCash | Wallet | yes |

You can add more banks (for example Meezan, HBL) from the Accounts page.

**Every rupee that moves is counted in exactly one account.** Opening balance is **Rs 0, counted from the day you ran the SQL**. Anything dated before that is ignored, so old history never changes your cash.

**You never type anything twice.** A sale payment, an expense or a supplier payment is entered where it always was, and it appears in the Cash Book by itself.

---

## 2. How the money flows

```
 CUSTOMER PAYS ──────────────► payments table ─────────┐
 (bill, udhaar collected later)                         │
 SCRAP SOLD ─────────────────► scrap_battery_sales ────┤
 CHARGING PICKED UP ─────────► charging_jobs ──────────┤   ┌───────────────────┐
 CLAIM EXTRA CHARGES ────────► battery_claims ─────────┼──►│  cash_ledger_all  │──► Cash Book screen
 YOU ADD CASH ───────────────► cash_entries ───────────┤   │  (a database VIEW)│──► Account balances
 DEPOSIT / WITHDRAW / MOVE ──► cash_entries ───────────┤   └───────────────────┘──► Close day count
 EXPENSE ────────────────────► expenses table ─────────┤
 PAY SUPPLIER ───────────────► supplier_payments ──────┘
```

**Important design choice:** the ledger is a *view*, not a second copy of your money. It reads the tables where money already lives. So:

- Nothing can drift out of step. There is no copy to forget to update.
- Every existing screen, the offline queue and FBR bills keep working exactly as before.
- Cancelling an expense or supplier payment automatically removes it from the book.
- Udhaar (unpaid bills) never appears, because no payment row exists for it.

### Which account does a payment land in?

Each payment method has a **default account** (editable on the Accounts page):

| Method | Default account | Used by |
|---|---|---|
| Cash | Cash Counter | sales, expenses, supplier payments |
| Other | Cash Counter | customer payments marked "other". It can go to **any** account, for example EasyPaisa |
| Bank | Main Bank | customer bank transfers |
| Cheque | Main Bank | expenses, supplier payments (counted when written) |
| Online | Main Bank | expenses, supplier payments |
| EasyPaisa | EasyPaisa | expenses, supplier payments |
| JazzCash | JazzCash | expenses, supplier payments |

If you have **two or more accounts of the right type** (for example two banks), the expense and supplier-payment forms show a **"Paid from account"** choice. With only one, it is used silently.

---

## 3. Features (20)

### Viewing
1. **Daily Cash Book.** Pick **Today**, **Yesterday**, any date, or step with the previous and next arrows. Future dates are not allowed.
2. **Day summary.** Opening, money in, money out and closing for the chosen day.
3. **Entry list.** Every line shows time, description, who it came from or went to, account, method, who entered it, and the amount (green in, red out).
4. **Account cards.** Balance of every account at the end of the chosen day, plus that day's in and out. Tap a card to filter the whole book to that one account.
5. **Accounts page.** Add banks and wallets, set the opening balance and the "counted from" date, switch an account off, and set the default account for each payment method.

### Automatic entries (nothing to type)
6. **Customer payments.** Sale payments and udhaar collected later, with the customer name and who received it.
7. **Expenses.** Recorded on their date (you can add one for yesterday and it lands on yesterday).
8. **Supplier payments.** Appear as money out and reduce that supplier's balance as before.
9. **Scrap sales, charging pickups and claim extra charges.** Counted as cash.

### Manual entries
10. **Add cash.** Owner puts money into any account, with "received from" and a note.
11. **Deposit to bank.** Moves money from the Cash Counter into a bank account.
12. **Withdraw from bank.** The reverse of a deposit.
13. **Move money.** Between any two of your accounts, for example bank to EasyPaisa. It is refused if the "from" account does not have enough on that date.
14. **Pay supplier.** Opens your normal supplier payment screen, which now has the "Paid from account" choice.

### Corrections and control
15. **Change account.** Move a payment, expense or supplier payment to a different account (for example "this actually went through Meezan").
16. **Cancel a manual entry.** A reason is required. The entry is kept in the activity log, not erased.
17. **Close day.** Enter what you physically counted. The book shows the expected amount and tells you short or extra. The result is saved with the date.

### Around the app
18. **Expense form upgrades.** Today and Yesterday quick buttons, plus the date picker and the account choice.
19. **Owner-only security.** Only the Owner can open the Cash Book. The database refuses everyone else, not just the screen.
20. **Activity log.** Every account change, cash-in, transfer and day-close is recorded in your existing Activity screen with who did it.

---

## 4. How each feature is wired

| You do this | Screen or code | Database call | What happens |
|---|---|---|---|
| Take a customer payment | existing bill screens (unchanged) | `create_invoice`, `record_payment`, FBR bill, all **unchanged** | A trigger stamps the account on the new payment row. The ledger view picks it up. |
| Add an expense | `ExpenseForm` | `create_expense_from_account` → calls the old `create_expense` | Same checks as before, then the chosen account is saved. |
| Edit an expense | `ExpenseForm` | `update_expense_from_account` → calls the old `update_expense` | The existing account is kept unless you choose another or change the method. |
| Pay a supplier | `NewPayment` | `record_supplier_payment_from_account` → calls the old `record_supplier_payment` | Same checks as before, plus the account. |
| Open Cash Book | `/cash` | `cash_book`, `cash_accounts_overview` | Read-only, Owner-checked in the database. |
| Add cash | Add cash sheet | `cash_add` | New row in `cash_entries` (type `cash_in`). |
| Deposit, withdraw or move | Transfer sheet | `cash_transfer` | One row in `cash_entries` (type `transfer`) that leaves one account and arrives in the other. Balance is checked first. |
| Change account | Change account sheet | `cash_move_entry` | Updates `account_id` on the payment, supplier payment or expense. Type rules are checked. |
| Cancel manual entry | Cancel sheet | `cancel_cash_entry` | Marks it Cancelled with the reason. |
| Close day | Close day sheet | `cash_close_day` | The "expected" figure is calculated by the database, so the browser cannot fake it. |
| Manage accounts | `/cash/accounts` | `save_cash_account`, `set_cash_method_default` | Create or edit an account, or change a default. |
| Choose account in a form | `AccountPicker` | `cash_account_choices` | Lists account names only (no balances) for the Owner and Accountant. |

**If the SQL has not been run yet,** the expense and supplier-payment forms quietly fall back to the original functions, so they never break.

---

## 5. Who can do what

| Role | Cash Book and Accounts | Expense / supplier payment account choice | Normal sales and payments |
|---|---|---|---|
| Owner | Full access | Yes | Yes |
| Accountant | **No** | Yes | as before |
| Counter staff | **No** | No (default account used) | as before |

The new tables cannot be read or written directly from the browser. Everything goes through functions that check the Owner role first.

---

## 6. What was added to your database

**New tables (4):** `cash_accounts`, `cash_method_defaults`, `cash_entries`, `cash_day_closes`
**New sequence:** `cash_entry_number_seq` (numbers like CB-000001)
**New view:** `cash_ledger_all` (internal; not readable from the browser)
**New column:** `account_id` on `payments`, `supplier_payments`, `expenses`

**New triggers**
- `zz_cash_stamp_account` on payments, supplier payments and expenses. It fills in the account when a row is saved. It never blocks a sale or payment, and it runs after your role guard.
- Activity-log triggers and updated-at triggers on the new tables.

**New functions (19):**
- 6 helpers: `_cash_default_account`, `_cash_stamp_account`, `_cash_require_owner`, `_cash_kind_for_method`, `_cash_check_account`, `_cash_balance`
- 13 callable from the app: `cash_account_choices`, `cash_accounts_overview`, `cash_book`, `save_cash_account`, `set_cash_method_default`, `cash_add`, `cash_transfer`, `cancel_cash_entry`, `cash_move_entry`, `cash_close_day`, `create_expense_from_account`, `update_expense_from_account`, `record_supplier_payment_from_account`

**Not changed:** `create_invoice`, `record_payment`, `create_fbr_bill`, `create_purchase`, `create_expense`, `update_expense`, `record_supplier_payment`, `cancel_invoice`, `delete_invoice`, and the Reports functions (`cash_book_summary` and the others).

---

## 7. Front-end files

**New**
- `app/cash/layout.tsx`, `page.tsx`, `CashBookClient.tsx` (the Cash Book screen and its sheets)
- `app/cash/accounts/page.tsx`, `AccountsClient.tsx` (the Accounts screen)
- `lib/cash.ts` (types, labels, helpers)
- `components/AccountPicker.tsx`, `components/useCashAccounts.ts`

**Edited**
- `components/ExpenseForm.tsx`: quick date buttons, account choice, new save functions
- `app/payments/new/NewPayment.tsx`: account choice, new save function
- `app/reports/CashBookCard.tsx`: link pointing to the new Cash Book
- `components/nav.ts`, `app/more/page.tsx`: "Cash book" menu entry
- `lib/roles.ts`: `/cash` is Owner-only

---

## 8. Rules and behaviours to know

- **Cancelled bills keep their payments in the book**, labelled "(bill cancelled - refund?)". Cancelling a bill does not hand money back. If you really refund the customer, record it as an expense (for example a "Refund" category).
- **Deleting a bill (or a customer with bills)** removes its payments, so they leave the Cash Book too. This is how your existing delete function works.
- **Cheques count as money out when written**, not when cleared.
- **Scrap, charging and claim money** is assumed to be cash.
- **Reports page:** the older cash-only card still uses its own formula. It now links to the Cash Book, so the two numbers can differ.
- **Expense dates:** today or earlier only. Future dates are blocked by the database, as before.
- **Offline:** payments queued offline appear in the Cash Book once they sync. Adding an expense, paying a supplier, and every Cash Book action need a connection, the same as expenses did before.
- **A bounced cheque** to a supplier still counts as money out. Cancel that supplier payment so the money returns.
- **Day-close counts** are saved with the figure the book showed at that moment, so later cancellations do not rewrite past counts.
- **Moves between your own accounts** (like a bank deposit) are not counted as income or spending in the all-accounts totals.

---

## 9. Install steps

1. Take a Supabase backup, or run this when the shop is quiet.
2. **Supabase, SQL Editor:** paste `20_cash_ledger.sql` and run it. It is safe to run again. If Supabase warns about "destructive operations" or RLS, choose **Run and enable RLS**. The script only drops its own triggers and policies, and it already enables RLS.
3. Copy the front-end files into the project (same paths) and deploy.
4. Check `select * from public.cash_accounts;`. You should see 4 accounts with opening balance 0.

### Test checklist
- [ ] Sign in as Owner and open **Cash book**. All balances show Rs 0.
- [ ] Take a cash sale payment. It appears under Cash Counter.
- [ ] Take a bank payment. It appears under Main Bank.
- [ ] Add an expense dated yesterday. It appears on yesterday's page.
- [ ] Pay a supplier in cash. It appears as money out, and the supplier balance drops.
- [ ] **Add cash**, then **Deposit to bank**. Both balances change correctly.
- [ ] Try to deposit more than the cash balance. It is refused.
- [ ] **Close day** with a different counted amount. It shows short or extra.
- [ ] Sign in as counter staff. There is no Cash book, and normal sales still work.

### If something goes wrong
Copy the exact red error text and send it over. Because the new SQL only adds things and leaves your existing functions alone, a failed run does not damage existing data.

---

## 10. Not included (possible next steps)

- Cash tiles on the Home screen
- A refund feature (refunds go in as expenses for now)
- Offline entry for expenses and supplier payments
- Printing the cash book
- Counting cheques only when they clear
- Choosing a payment account for scrap, charging and claim money (all go to the Cash Counter)
- Editing or cancelling bills and expenses from inside the Cash Book (done on their own screens)

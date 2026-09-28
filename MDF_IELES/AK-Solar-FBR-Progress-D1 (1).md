# AK Solar — FBR Digital Invoicing: Build Progress (after D1)

**Updated:** 28 September 2026
**Seller name for FBR:** Al Karam Enterprises | **NTN in app:** 4022617 | **Province:** Sindh
**Static IP:** 103.245.193.47 | **Sender PC:** DESKTOP-1OQEDVK (install on the SSD)

---

## Phase status

| Phase | What | Status |
|---|---|---|
| D0 | Decisions and paperwork | In progress (see "Still open") |
| **D1** | **Database (`18_fbr.sql`)** | **Built. Waiting for you to run it in Supabase and test** |
| D2 | FBR tick, tax maths, New Bill screen | Next |
| D3 | FBR reference data and dropdowns | Not started |
| D4 | FBR sender on the shop PC | Not started |
| D5 | Status, FBR number, QR in the app | Not started |
| D6 | PRAL registration and sandbox tests | Not started |
| D7 | Corrections and debit notes | Not started |
| D8 | Go live | Not started (Phase 8 roles already exist: files 16 and 17) |
| D9 | After go-live | Not started |

---

## D1: what was built

File: `18_fbr.sql` (named 18 because 16 and 17 are already roles and audit).

**Changed tables (new columns only, nothing removed)**
- `business_profile`: `fbr_enabled` (off), `fbr_environment` (sandbox), `prices_include_tax` (false = GST on top).
- `customers`: `province`.
- `inventory`: `sale_type`, `fbr_rate_desc`, `is_taxable`, `retail_price`, `sro_schedule_no`, `sro_item_serial_no`.

**New tables**
- `fbr_invoices`: one row per FBR bill, with status pending / sending / sent / failed / unknown.
- `fbr_invoice_items`: FBR numbers exactly as they will be sent.
- `fbr_submissions`: log of every try (owner and accountant can read).
- `fbr_reference`: cache of FBR lists.
- `fbr_heartbeat`: sender "I am alive" row.
- Team can read; only functions and the sender can write.

**New functions**
- `create_fbr_bill(...)`: calls the existing `create_invoice()` in one transaction, then saves the FBR record. If GST is added on top it raises the bill total and takes the extra payment. Only Owner and Counter staff can use it, and only when `fbr_enabled = true`.
- `_fbr_line_figures(...)`: the one place that calculates FBR line tax (internal).

**Not changed:** `create_invoice()`, `record_payment()`, existing bills, stock, reports, `invoice_items`.

**Fix (28 Sept):** the first version failed with "create_invoice() is missing" because your live `create_invoice()` has 4 extra walk-in inputs (phone, address, registration type, CNIC) that the old `03_invoices.sql` in the zip does not show. The file now finds the function by name and passes those inputs, and `create_fbr_bill()` accepts them too.

**Checked:** the file parses as valid SQL and PL/pgSQL. It has **not** been run against your live database (I have no access), so run the test below.

---

## Your steps for D1

1. Supabase, SQL Editor, New query, paste all of `18_fbr.sql`, Run. Run it a second time: it must give no error.
2. Run the check queries at the bottom of the file. Expect `fbr_enabled = false`, `0` FBR bills, and the function name returned.
3. Open the app: sales, stock, customers and reports must work as before.
4. Do not switch `fbr_enabled` on yet. That is for D2 testing.

---

## Rules to remember (provisional, settle in D6)

- **Standard items:** value = price, tax = price x rate, customer pays price + GST.
- **Panels (10%):** same maths, sale type "Goods at Reduced Rate", and the SRO / Schedule number and item serial must be filled per item.
- **Third Schedule batteries:** tax = printed retail price x rate, but the customer pays only the printed price. Retail price is stored as **line total** for now. PRAL's answer may change this. Only `_fbr_line_figures` needs to change.
- **Item rates are not set yet.** Every item needs its GST rate (`fbr_rate_desc`) before it can go on an FBR bill. The Inventory form gets this in D2/D3, or set them in SQL after the accountant agrees.
- **Further tax** for unregistered buyers is 0 for now (accountant question 9).
- **Sandbox test bills** go into the real bills table (they reduce stock). Use test items or adjust stock afterwards.

---

## Still open in D0

- [ ] Confirm in IRIS that the registration is active and shows **Retailer**
- [ ] Choose Business Nature and Sector (likely Retailer and Wholesale / Retails)
- [ ] Create the CRM login (owner only)
- [ ] Confirm the shop PC stays on during shop hours; check the Windows version
- [ ] Accountant answers: panel rate and schedule, lithium HS code, further tax, accessories
- [ ] Confirm `4022617` is accepted as the seller number in the sandbox (fallback: the 13-digit CNIC)

---

## Next: D2 (FBR tick, tax, New Bill screen)

Files D2 will change (from your code): `app/sales/new/NewBill.tsx` (1372 lines), `lib/offline/sync.ts`, `lib/offline/db.ts`, `lib/types.ts`, the print/PDF tax lines, plus a new `lib/tax.ts`. Start it after D1 runs cleanly.

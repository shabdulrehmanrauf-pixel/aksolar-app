# AK Solar — FBR Digital Invoicing: Done and Left

**Updated:** 28 September 2026
**Seller name for FBR:** Al Karam Enterprises | **NTN in app:** 4022617 | **Province:** Sindh

---

## 1. Phase overview

| Phase | What | Status |
|---|---|---|
| D0 | Decisions and paperwork | In progress (see section 5) |
| D1 | Database (`18_fbr.sql`) | Done |
| D2 | FBR tick, tax maths, New Bill screen | Done (installed) |
| D3 | FBR lists, Inventory and Customer forms | Done (installed) |
| D4 | FBR sender on the shop PC | Installed. Testing not finished (see section 4) |
| **D5a** | **FBR status badge on Sales list and on each bill** | **Built. Ready to install (this drop)** |
| D5b | Print page: FBR tax lines, FBR number, FBR logo, QR (1 x 1 inch) | Not started (next) |
| D5c | PDF, Share PDF, WhatsApp and email: same tax lines, number, QR | Not started |
| D5d | Home warnings (sender offline, failed, unknown, taxable items sold without FBR bill) | Not started |
| D6 | PRAL registration and sandbox tests | Not started |
| D7 | Corrections and debit notes | Not started |
| D8 | Go live | Not started |
| D9 | After go-live | Not started |

---

## 2. D5a: what was made

**No new SQL. No new packages. No change to how bills are saved, paid or printed.**

### New files
| File | What it does |
|---|---|
| `lib/fbrStatus.ts` | Status names, colours, the plain sentence for each state, and the rule for when a badge shows |
| `lib/fbrStatusLoad.ts` | Reads `fbr_invoices` (server side). If the FBR tables are missing or the read fails it returns nothing, so Sales never breaks |
| `app/sales/FbrBadge.tsx` | The small coloured tag |
| `app/sales/[id]/FbrCard.tsx` | The "FBR" box on one bill |

### Changed files
| File | Change |
|---|---|
| `app/sales/page.tsx` | Also loads FBR status for the latest 1,000 bills |
| `app/sales/SalesClient.tsx` | Shows the FBR badge next to the payment badge (desktop table and phone cards) |
| `app/sales/[id]/page.tsx` | Loads FBR status for the bill |
| `app/sales/[id]/InvoiceDetail.tsx` | FBR badge in the top banner, and the FBR box above "Customer" |

### What you will see
- **Sales list:** next to Paid / Udhaar, a tag: **FBR waiting**, **FBR sending**, **FBR sent**, **FBR failed**, **FBR unsure**. Sandbox bills say **(test)**, for example "FBR sent (test)", so a test bill is never mistaken for a real one.
- **Bills that are not FBR bills** show no FBR tag at all (the list looks as before).
- **Cancelled bills** that never reached FBR show no tag.
- **Bill page, FBR box:** status, one plain sentence saying what it means, the **FBR invoice number** with a Copy button once sent, when it was sent, and the next retry time while waiting.
- **Owner and Accountant** also see **what FBR said** (error code and message) on failed or unsure bills, and the number of tries.
- **Owner only** also sees the exact retry command for that bill (`node src/cli.js retry AK-000123`; for `unknown` bills it adds `--yes-i-checked-fbr` and tells you to check the FBR portal first).
- **Counter staff** on a failed or unsure bill see only "There is a problem with this bill at FBR. Please tell the Owner."

### Checked and not checked
- **Checked:** full TypeScript check of the whole app passes with no errors.
- **Not checked:** a real run on your Supabase. The badge shows only after the sender creates rows in `fbr_invoices` (step 4 of section 4 below).

### How to install
1. Unzip `aksolar-fbr-d5a-files.zip` on top of your project (same folder paths, 8 files).
2. Deploy. No SQL.
3. Open Sales. Bills made before FBR was switched on show no tag. That is correct.

### How to test D5a
1. Turn `fbr_enabled = true` (sandbox), make one FBR bill. It appears as **FBR waiting (test)**.
2. Start the sender. Within about 15 seconds refresh: **FBR sent (test)** and an FBR number in the bill's FBR box.
3. Stop the sender, make another bill: stays **FBR waiting (test)**.
4. If a bill fails, open it as Owner: you should see FBR's error text and the retry command.
5. Sign in as counter staff: no error text, only "tell the Owner".

---

## 3. Known gaps (not bugs)

| Gap | When |
|---|---|
| Status is read when the page loads. It does not update live: refresh the page to see a new status | Could be added later if wanted |
| When the phone/PC is offline, the Sales page shows the FBR status from the last time it loaded | Expected |
| Bills created offline show "Pending sync" first. The FBR tag appears after they sync and the sender picks them up | Expected |
| Printed bill / PDF / WhatsApp show no FBR tax lines, FBR number or QR | D5b, D5c |
| Home warnings not built yet | D5d |
| Deleting a bill that has an FBR row is blocked by the database (`on delete restrict` in D1). Delete a test FBR bill from SQL, or handle in D7 | D7 |
| A failed bill is retried with the same saved figures. Fixing the item does not change that bill | D7 |
| Debit notes: field is passed through, reason and 180-day rule not built | D7 |
| A bill mixing sale types gets one sandbox scenario. Production sends no scenario | D6 |
| Third Schedule figures are provisional | D6, with PRAL |
| Further tax for unregistered buyers is 0 | Accountant answer |
| Sender has never run against the real FBR sandbox | D6 (first real run may need small fixes) |

---

## 4. D4 testing still left (unchanged, do in this order)

Run all commands in Command Prompt inside `C:\fbr-sender`.

- [ ] **Fill in `.env`:** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FBR_SANDBOX_POST_TOKEN`, `FBR_SANDBOX_GET_TOKEN`. Leave the two `PRODUCTION` lines empty. Keep `FBR_BUSINESS_MODE=retailer` and `FBR_EXTRA_TAX_STYLE=empty`
- [ ] **Delete the extra copy** `.env (2)` in the folder if it is still there
- [ ] **1. `npm run test-connection`**: want `Supabase: OK` and `FBR sandbox: OK - token accepted`. If FBR refuses: wrong token, or the shop's public IP is not approved by PRAL yet
- [ ] **2. `npm run lists`**: then check in the app (More, FBR lists) that provinces, units, HS codes and sale types show rows. Check the province spelling
- [ ] **3. `npm run check-items`**: fix what it lists in Inventory
- [ ] **4.** Set `fbr_enabled = true` (sandbox) and make one FBR bill in the app
- [ ] **5.** Double-click `start-sender.bat`. Within about 15 seconds `npm run status` should show the bill as `sent` (and D5a should show **FBR sent (test)**)
- [ ] **6.** Repeat with one bill of each kind: standard, reduced rate, 3rd Schedule. If one fails, read the error text (now visible on the bill for the Owner) and send it to me
- [ ] **7.** Unplug the internet, make a bill, plug it back in: it should send by itself
- [ ] **8.** Stop the sender, make a bill, run `npm run status`: it should say NOT RUNNING and one pending
- [ ] **9.** Put a shortcut to `start-sender.bat` in `shell:startup` and set Windows power settings so the PC never sleeps in shop hours (do this after testing works)

---

## 5. D0 items still open (paperwork)

- [ ] Confirm in IRIS that the registration is active and shows **Retailer** (if it shows Wholesaler, change `FBR_BUSINESS_MODE` to `wholesaler`)
- [ ] Choose Business Nature and Sector (likely Retailer and Wholesale / Retails). This decides the sandbox scenarios
- [ ] Create the CRM login (owner only)
- [ ] Confirm the shop PC stays on during shop hours
- [ ] Accountant answers: panel rate and schedule, lithium HS code, further tax, accessories
- [ ] Confirm `4022617` is accepted as the seller number in the sandbox (fallback: 13-digit CNIC)
- [ ] Get the real Get URLs from the dashboard (yours showed "undefined"). The sender uses the standard spec URLs (`/pdi/v1/...`, `/pdi/v2/...`)
- [ ] **Security:** use a new token if the real one was ever shared. Tokens go only in the shop PC `.env`. Never upload `.env` to GitHub or Vercel

---

## 6. Phases still to build

| Phase | What it will do |
|---|---|
| **D5b** | Print page: FBR tax lines, FBR invoice number, FBR logo and QR (1 x 1 inch). Needs a QR library and the FBR logo file. I will check the spec for what the QR must contain |
| **D5c** | PDF, Share PDF, WhatsApp and email: same tax lines, number and QR |
| **D5d** | Home warnings: sender offline (from the heartbeat), failed bills, unknown bills, taxable items sold without an FBR bill |
| **D6** | PRAL registration, sandbox tests for each scenario, decide `extraTax` style (`empty` or `zero`), check Third Schedule figures, buyer NTN/CNIC check with `Get_Reg_Type` |
| **D7** | Corrections, edited and cancelled bills, debit notes (reason and the 180-day rule), deleting bills that have an FBR row |
| **D8** | Go live: production tokens, `fbr_enabled` on production, production sends no scenario |
| **D9** | After go-live checks and support |

---

## 7. Everyday commands (in `C:\fbr-sender`)

| Command | What it does |
|---|---|
| `npm run status` | Is the sender running? How many bills pending / sent / failed |
| `npm run test-connection` | Checks Supabase and the FBR token / IP |
| `npm run lists` | Reloads all FBR lists now |
| `npm run check-items` | Shows items not ready for FBR |
| `node src/cli.js retry AK-000123` | Puts a failed bill back in the queue after the cause is fixed |
| `node src/cli.js retry AK-000123 --yes-i-checked-fbr` | Only for `unknown` bills, after you checked the FBR portal and the bill is not there |
| `npm test` | Runs the 13 built-in self tests |

**Bill states:** `pending` waiting or retrying, `sending` being sent now, `sent` FBR accepted, `failed` FBR rejected (fix then retry), `unknown` no clear answer (check FBR portal first).

---

## 8. Next step

Install D5a (section 2). When it looks right, say **"go D5b"**. Finishing the D4 sandbox tests (section 4) is still needed before D6, but D5b to D5d can be built in the meantime.

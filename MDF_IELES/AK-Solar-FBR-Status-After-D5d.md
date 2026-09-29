# AK Solar — FBR Digital Invoicing: What's Built and What's Left

**Updated:** 29 September 2026
**Seller name for FBR:** Al Karam Enterprises | **NTN in app:** 4022617 | **Province:** Sindh

---

## 1. Phase overview

| Phase | What | Status |
|---|---|---|
| D0 | Decisions and paperwork | In progress (see section 4) |
| D1 | Database (`18_fbr.sql`) | Done |
| D2 | FBR tick, tax maths, New Bill screen | Done (installed) |
| D3 | FBR lists, Inventory and Customer forms | Done (installed) |
| D4 | FBR sender on the shop PC | Installed. Testing not finished (see section 3) |
| D5a | FBR status badge on Sales list and on each bill | Done (installed) |
| D5b | Print page: FBR tax lines, FBR number, FBR logo, QR (1 x 1 inch) | Done, ready to install (this drop) |
| D5c | PDF, Share PDF, WhatsApp and email: same tax lines, number, QR | Done, ready to install (this drop) |
| **D5d** | **Home warnings (sender offline, failed, unknown, taxable items sold without FBR bill)** | **Done, ready to install (this drop)** |
| D6 | PRAL registration and sandbox tests | Not started |
| D7 | Corrections and debit notes | Not started |
| D8 | Go live | Not started |
| D9 | After go-live | Not started |

---

## 2. What each phase built

### D1–D4 (already installed, unchanged in this drop)
- Database tables for FBR bills, statuses and reference lists (`18_fbr.sql`, `19_fbr_d2_d3.sql`).
- New Bill screen: FBR tick, tax maths matching the database, blocks saving with the FBR wording when an item is missing HS code, GST rate, etc.
- FBR lists page (Owner only), Inventory "Tax details for FBR" section, Customer province field.
- The FBR sender program on the shop PC (`fbr-sender/`), which posts queued bills to FBR and writes their status back.

### D5a (installed)
- FBR badge (waiting / sending / sent / failed / unsure) on the Sales list and on each bill, sandbox bills marked "(test)".
- The FBR box on a bill: status, plain-language meaning, FBR invoice number with Copy, FBR's error text (Owner and Accountant), and the retry command (Owner only). Counter staff see only "tell the Owner".

### D5b (this drop): the printed bill
- Title becomes **Sales Tax Invoice** for FBR bills.
- Item table gets Value excl. tax, GST %, GST and Amount columns; totals show Items total / GST added; Third Schedule or tax-included lines are marked with a note.
- FBR block at the bottom: QR code (Version 2, 25x25, 1 x 1 inch), FBR logo, FBR invoice number, time reported.
- **Save and print** waits up to 90 seconds for the FBR number, then opens the print box; if it never comes you can still print, and the paper says so.
- Sandbox bills print a **TEST INVOICE** box. Normal and old bills print exactly as before.

### D5c (this drop): PDF, Share PDF, WhatsApp, email
- Download PDF and Share PDF now carry the same FBR tax lines, Items total / GST added, and the FBR QR + number, drawn directly in the PDF (no image library).
- WhatsApp and email text get the same GST lines, totals and the FBR number (or "not received yet" / "cancelled").
- If the FBR number hasn't arrived yet, a plain note appears under the buttons; sending is never blocked, just flagged.
- One real gap: the hand-built PDF writer draws text, lines and boxes only, so the FBR **logo picture** is not in the PDF (it is on the printed page).

### D5d (this drop): Home screen warnings
- Shown only to **Owner and Accountant** (the same people who see FBR error detail on a bill). Counter staff see nothing extra on Home.
- Appears only when FBR is switched on, and only when there is something to say — otherwise the block is invisible.
- **Sender offline:** if the shop PC's FBR sender hasn't reported in for more than 10 minutes (it reports about once a minute), a red strip says so.
- **Failed bills:** count and a short list (linking to each bill) of bills FBR refused.
- **Unknown bills:** count and list of bills with no clear answer from FBR — check the FBR portal before retrying.
- **Taxable items sold without an FBR bill, today:** count and list of bills the Owner saved today without an FBR bill despite having taxable items (tracked from the existing Activity log entry `create_unreported_bill()` already writes).

---

## 3. D4 testing still left (do in this order, unchanged)

Run all commands in Command Prompt inside `C:\fbr-sender`.

- [ ] Fill in `.env`: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `FBR_SANDBOX_POST_TOKEN`, `FBR_SANDBOX_GET_TOKEN`. Leave the two `PRODUCTION` lines empty
- [ ] Delete the extra copy `.env (2)` in the folder if it is still there
- [ ] `npm run test-connection`: want `Supabase: OK` and `FBR sandbox: OK - token accepted`
- [ ] `npm run lists`, then check More, FBR lists shows rows and correct province spelling
- [ ] `npm run check-items`: fix what it lists in Inventory
- [ ] Set `fbr_enabled = true` (sandbox), make one FBR bill in the app
- [ ] Double-click `start-sender.bat`. Within about 15 seconds `npm run status` should show `sent`, and the bill's print/PDF/WhatsApp should now carry the FBR number and QR
- [ ] Repeat with standard, reduced rate and 3rd Schedule bills. Send me any error text
- [ ] Unplug the internet, make a bill, plug it back in: it should send by itself
- [ ] Stop the sender, make a bill, run `npm run status`: NOT RUNNING and one pending — Home should show the "sender offline" warning after about 10 minutes
- [ ] Put a shortcut to `start-sender.bat` in `shell:startup`, and stop the PC from sleeping in shop hours

---

## 4. D0 items still open (paperwork, unchanged)

- [ ] Confirm in IRIS that the registration is active and shows Retailer
- [ ] Choose Business Nature and Sector
- [ ] Create the CRM login (owner only)
- [ ] Confirm the shop PC stays on during shop hours
- [ ] Accountant answers: panel rate and schedule, lithium HS code, further tax, accessories
- [ ] Confirm `4022617` is accepted as the seller number in the sandbox (fallback: 13-digit CNIC)
- [ ] Get the real Get URLs from the dashboard
- [ ] Security: a fresh token if the real one was ever shared; tokens stay only in the shop PC `.env`, never on GitHub or Vercel

---

## 5. Known gaps across everything built so far

| Gap | When |
|---|---|
| FBR status on Sales list/bill only updates on page load, not live | Could be added later |
| A bill made offline shows "Pending sync" until it syncs; the FBR tag appears after the sender picks it up | Expected |
| PDF has no FBR logo picture (only text) | Could add if needed |
| No dedicated "show me the failed/unknown FBR bills" filter on the Sales list yet — Home links straight to each bill instead | Could add later |
| Deleting a bill with an FBR row is blocked by the database | Delete a test bill from SQL, or handle in D7 |
| A failed bill retries with the same saved figures; fixing the item does not change that bill | D7 |
| Debit notes: not built | D7 |
| Third Schedule figures are provisional | D6, with PRAL |
| The QR's content (FBR invoice number) and the "verify with Tax Asaan" line are my best reading of the public spec, not yet confirmed against a real FBR number | D6 |
| Sender has never run against the real FBR sandbox | D6 |

---

## 6. Everyday commands (unchanged, in `C:\fbr-sender`)

| Command | What it does |
|---|---|
| `npm run status` | Is the sender running? How many bills pending / sent / failed |
| `npm run test-connection` | Checks Supabase and the FBR token / IP |
| `npm run lists` | Reloads all FBR lists now |
| `npm run check-items` | Shows items not ready for FBR |
| `node src/cli.js retry AK-000123` | Puts a failed bill back in the queue after the cause is fixed |
| `node src/cli.js retry AK-000123 --yes-i-checked-fbr` | Only for `unknown` bills |
| `npm test` | Runs the 13 built-in self tests |

---

## 7. Install this drop (D5b + D5c + D5d)

1. Unzip the three zips (`aksolar-fbr-d5b-files.zip`, `aksolar-fbr-d5c-files.zip`, `aksolar-fbr-d5d-files.zip`) on top of the project, in that order. No SQL.
2. Put the official FBR Digital Invoicing logo at `public/fbr-logo.png` (still missing — take it from the PRAL DI API v1.12 PDF, section 6, or your PRAL pack).
3. Push to GitHub, let Vercel deploy.

**Checked:** TypeScript compiles with no errors across all of D5b, D5c and D5d. The QR code (Version 2, 25x25) was verified to decode back to the exact invoice number.
**Not checked:** a real print, a real generated PDF opened in a reader, a real WhatsApp/email send, or the Home warnings against real data (they need real `fbr_invoices`/`fbr_heartbeat` rows, which only exist once the sender runs, D4).

---

## 8. Next step

D5 (status, print, PDF/share, home warnings) is now fully built. What's left before D6:
- Finish the D4 sandbox tests (section 3) — needed before D6.
- Get the FBR logo file to me.
- D6: PRAL registration, sandbox tests for each scenario, confirm the QR content and Third Schedule figures with PRAL.

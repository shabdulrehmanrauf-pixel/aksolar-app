# AK Solar — FBR Digital Invoicing: Build Progress (after D4)

**Updated:** 28 September 2026
**Seller name for FBR:** Al Karam Enterprises | **NTN in app:** 4022617 | **Province:** Sindh

## Phase status

| Phase | What | Status |
|---|---|---|
| D0 | Decisions and paperwork | In progress (see "Still open") |
| D1 | Database (`18_fbr.sql`) | Built, run by you |
| D2 | FBR tick, tax maths, New Bill screen | Built. You are installing it now |
| D3 | FBR lists, Inventory and Customer forms | Built. You are installing it now. **One fix in this drop (`lib/fbr.ts`)** |
| **D4** | **FBR sender on the shop PC** | **Built. Needs your test (sandbox)** |
| D5 | Status, FBR number, QR, print tax lines, home warnings | Next |
| D6 | PRAL registration and sandbox tests | Not started |
| D7 | Corrections and debit notes | Not started |
| D8 | Go live | Not started |
| D9 | After go-live | Not started |

## What I checked against the official PRAL spec (v1.12, July 2025)

I read the spec itself, not only the sample you pasted. Result:

- **D2/D3 database and screens need no change.** Every FBR field already has a column.
- **One D3 bug fixed:** FBR's sale types list uses the key `transactioN_DESC`. The FBR lists page did not know that key, so a pasted sale types list would have loaded 0 rows. Fixed in `lib/fbr.ts` (replace that one file).
- **Scenarios matter for your registration.** PRAL sandbox scenarios depend on Business Nature and Sector. For **Retailer + Wholesale/Retails** the allowed scenarios are only **SN026** (standard), **SN027** (3rd Schedule), **SN028** (reduced rate) and **SN008** (3rd Schedule). SN001 and SN002 are NOT in that list. SN026 to SN028 only work if IRIS shows you as **Retailer**. The sender picks the scenario by the setting `FBR_BUSINESS_MODE` (retailer or wholesaler).
- **FBR's answer has two levels.** Sometimes the header says `statusCode 00` but the lines say invalid. The sender checks both, so a bad bill is never marked as sent.
- **The token is tied to the seller number** (error 0401). So the NTN in the app must be the one the token was issued for.
- **The sample JSON disagrees on `extraTax`** (`""` in your dashboard sample, `0.00` in the spec). Setting `FBR_EXTRA_TAX_STYLE` switches it. Confirm in sandbox (D6).

## D4 built: how it works

A small Node.js program in `fbr-sender/`, run on the shop PC. It only writes to the FBR tables. It never touches bills, payments or stock.

- **Sending:** takes `pending` bills (oldest first), builds the FBR JSON from the saved FBR lines (no tax maths in the sender), posts it, saves every attempt in `fbr_submissions`.
- **If FBR accepts:** status `sent` and the FBR invoice number is saved.
- **If FBR rejects the bill:** status `failed`, with FBR's error code and message (line by line). No automatic retry; fix the cause, then `retry`.
- **No internet / FBR down (HTTP 5xx, 429):** status stays `pending`, tries again after 1, 2, 5, 10, 20, 30, then 60 minutes; gives up after 10 tries.
- **Token / IP refused (401 or error 0401):** the bill is fine; tries again in 10 minutes and does not use up a try. The heartbeat note says so.
- **No clear answer (timeout, power cut mid-send):** status `unknown`. The bill is **never resent automatically**, because FBR may already have it. Check the FBR portal, then `retry AK-000123 --yes-i-checked-fbr`.
- **Result cannot be saved** right after FBR accepted: retried 5 times, then copied to `logs/unsaved-results.jsonl`.
- **Only one sender per PC** (lock file). Cancelled or edited bills are not sent (D7 handles those).
- **Heartbeat** every 30 seconds into `fbr_heartbeat` (D5 turns this into the "sender offline" warning).
- **Lists:** loads provinces, units, HS codes, sale types, rates, SRO schedules and the allowed units for each of your HS codes. At first start, then weekly, or on demand. A list is only replaced if the new one arrived complete.
- **Helper commands:** `npm run status`, `test-connection`, `lists`, `check-items` (finds items FBR would refuse, including a wrong unit for the HS code), `retry`.
- **Tests:** 13 self tests (FBR answers, JSON format, scenarios, retry timing). All pass.

## How to install

1. **D2/D3 first (if not done):** run `19_fbr_d2_d3.sql`, unzip `aksolar-fbr-d2-d3-files.zip`, deploy.
2. Unzip `aksolar-fbr-d4-files.zip`: it has the `fbr-sender/` folder and the fixed `lib/fbr.ts`. Replace `lib/fbr.ts` in your project, deploy.
3. Copy `fbr-sender/` to the shop PC (for example `C:\fbr-sender`) and follow `fbr-sender/README.md`.
4. No new SQL for D4.

**Checked by me:** all files pass a syntax check, and the 13 self tests pass. **Not checked:** a real run against your Supabase or the FBR sandbox (I have no access to either), and the real FBR list answers. Expect small fixes in the first real run.

## Test plan (sandbox, in this order)

1. `npm install`, fill `.env`, `npm run test-connection`. Expect Supabase OK and FBR token accepted. If FBR refuses: token, or the PC's public IP is not approved yet.
2. `npm run lists`. Then check in the app (More, FBR lists) that provinces, units, HS codes and sale types show rows. Check the province spelling.
3. `npm run check-items`. Fix what it lists in Inventory.
4. Set `fbr_enabled = true` (sandbox). Make one FBR bill in the app.
5. Start `start-sender.bat`. Within about 15 seconds `npm run status` should show it `sent`. In Supabase: `select * from fbr_invoices; select * from fbr_submissions order by attempted_at desc;`
6. Repeat with one bill of each kind (standard, reduced rate, 3rd Schedule). PRAL wants each scenario to pass. Read the error text if one fails, and send me that text.
7. Unplug the internet, make a bill, plug in: it should send by itself.
8. Stop the sender, make a bill, look at `npm run status`: it says NOT RUNNING and one pending.

## Still open in D0

- [ ] Confirm in IRIS that the registration is active and shows **Retailer**
- [ ] Choose Business Nature and Sector (likely Retailer and Wholesale / Retails). This decides the sandbox scenarios
- [ ] Create the CRM login (owner only)
- [ ] Confirm the shop PC stays on during shop hours; check the Windows version (needs Windows 10 or 11)
- [ ] Accountant answers: panel rate and schedule, lithium HS code, further tax, accessories
- [ ] Confirm `4022617` is accepted as the seller number in the sandbox. The spec says 7 or 13 digits are fine. Fallback: 13-digit CNIC
- [ ] Get the real Get URLs from the dashboard (yours showed "undefined"). The sender uses the URLs from the spec (`/pdi/v1/...`, `/pdi/v2/...`), which are the standard ones
- [ ] **Security:** use a new token if the real one was ever shared. Tokens only go in the shop PC `.env`

## Known gaps (not bugs)

| Gap | When |
|---|---|
| Printed bill / PDF / WhatsApp show no FBR tax lines, FBR number or QR (spec: QR 1 x 1 inch, plus the FBR logo) | D5 |
| Home warnings: sender offline, failed and unknown bills, taxable items sold without an FBR bill | D5 |
| A failed bill is retried with the **same saved figures**. If the cause was wrong item data, fixing the item does not change that bill | D7 |
| Debit notes: field is passed through, but reason and the 180-day rule are not built | D7 |
| A bill mixing sale types gets one sandbox scenario (highest priority type). Production sends no scenario | D6 |
| Third Schedule figures (error 0102 checks the formula) are provisional | D6, with PRAL |
| Further tax for unregistered buyers is 0 | Accountant answer 9 |
| Buyer NTN/CNIC of a registered buyer is not checked with `Get_Reg_Type` before sending | D5 or D6 |
| Sender has never run against the real FBR sandbox | D6 |

## Next: D5 (status, FBR number, QR, print tax lines)

Shows the FBR status on each bill, the FBR invoice number and QR code on the printed bill, and the warnings on Home. It reads the same tables the sender writes, so D4 must be working first.

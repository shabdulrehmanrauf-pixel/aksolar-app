# AK Solar — FBR Digital Invoicing: The Complete Picture

**Updated:** 29 September 2026
**Seller name for FBR:** Al Karam Enterprises | **NTN in app:** 4022617 | **Province:** Sindh

This is the one file that has everything: what every phase built, what's still open, and how the whole
FBR system fits together. Where a phase has its own detailed doc or checklist, this file says so and
summarises it — read this one first, then the detail doc if you need it.

---

## Part 1 — Phase status, all of D0 to D9

| Phase | What | Status |
|---|---|---|
| D0 | Decisions and paperwork | In progress — see Part 4 |
| D1 | Database (`18_fbr.sql`) | Done |
| D2 | FBR tick, tax maths, New Bill screen | Done, installed |
| D3 | FBR lists, Inventory and Customer forms | Done, installed |
| D4 | FBR sender on the shop PC | Installed. Testing not finished — see Part 4 |
| D5a | FBR status badge on Sales list and each bill | Done, installed |
| D5b | Print page: FBR tax lines, number, logo, QR | Built — install `aksolar-fbr-d5b-files.zip` |
| D5c | PDF, Share PDF, WhatsApp, email: same particulars | Built — install `aksolar-fbr-d5c-files.zip` |
| D5d | Home screen warnings (sender offline, failed, unknown, unreported) | Built — install `aksolar-fbr-d5d-files.zip` |
| **D6** | **PRAL registration and sandbox tests** | **No app code — checklist only, see `AK-Solar-FBR-D6-Checklist.md`** |
| D7 | Cancel a bill, debit notes (database only), safe delete of sandbox bills | Built — install `aksolar-fbr-d7-files.zip` + run `20_fbr_d7.sql` |
| D8 | Go live | Go-live readiness panel built (in `app/fbr/page.tsx`). Rest is checklist — see `AK-Solar-FBR-D8-D9-Checklist.md` |
| D9 | After go-live | Routine, not a build — see the same checklist |

**Everything through D7 that hasn't been installed yet, in order:** D5b zip → D5c zip → D5d zip →
`20_fbr_d7.sql` + D7 zip → the D8-readiness file below (`app/fbr/page.tsx`, `lib/fbrReadiness.ts`,
`lib/fbrHomeLoad.ts` addition). Check Part 5 for the exact file list.

---

## Part 2 — How the whole system works

### The shape of it
```
Shop PC / phone (AK Solar app)                Shop PC only (fbr-sender/)          FBR / PRAL
─────────────────────────────                 ──────────────────────────          ──────────
New bill screen                                                                    
   │ (FBR tick on)
   ▼
create_fbr_bill() in Supabase  ──────────────► fbr_invoices row: "pending"
   │                                                    │
   │                                                    │ picked up by
   ▼                                                    ▼
Bill saved normally                            fbr-sender polls Supabase,
(same as any other bill:                       builds the FBR JSON payload,
 stock, payment, printing)                     POSTs it            ──────────────►  FBR sandbox
                                                        │                            or production
                                                        │ writes result back
                                                        ▼
                                                fbr_invoices row: "sent"
                                                (or "failed" / "unknown")
                                                        │
                                                        ▼
Sales list, bill page, printed bill,           reads the same row back
PDF, WhatsApp, email, Home warnings   ◄────────────────┘
all show the current status
```

**The key design choice, all the way through:** the web app (Vercel) never talks to FBR directly. Only
the program on the shop PC (`fbr-sender/`) has the FBR tokens, and it's the only thing that ever makes a
network call to FBR. The web app only reads and writes Supabase. This is why the FBR tokens live only in
`fbr-sender/.env`, never in GitHub or Vercel, and why a buyer registration check (`Get_Reg_Type`) or the
scenario logic has to be built into the sender, not the web app — the web app has no way to reach FBR at
all.

### What each piece does

- **`New Bill` screen (D2):** when FBR is on and an item is taxable, ticks an "FBR bill" box automatically.
  Calculates the tax the same way the database will (so what the cashier sees matches what gets sent),
  and blocks saving if something FBR needs is missing (HS code, GST rate, province, etc).
- **`create_fbr_bill()` (database function, D1/D2):** wraps the existing `create_invoice()` so a normal
  bill is created exactly as before, then adds one `fbr_invoices` row and one `fbr_invoice_items` row per
  line, with the exact figures FBR will need. If anything fails, nothing is saved — the customer's bill
  is never half-created.
- **`fbr-sender/` (D4, shop PC only):** a small Node.js program that polls Supabase every few seconds for
  `pending` bills, builds the JSON FBR wants, posts it to the sandbox or production endpoint (depending on
  `business_profile.fbr_environment`), and writes the result — `sent` with an FBR invoice number, or
  `failed`/`unknown` with FBR's own error text — back onto the `fbr_invoices` row. It also sends a
  heartbeat about once a minute so the app can tell if it's running.
- **Status everywhere (D5a-D5d):** the Sales list, each bill's page, the printed bill, the downloaded PDF,
  WhatsApp/email text, and the Home screen all read the *same* `fbr_invoices` row and show the same
  status, in whatever form suits that screen. Sandbox bills are marked "(test)" everywhere so they're
  never mistaken for a real FBR invoice.
- **Corrections (D7):** cancelling a bill is a purely local action — it never contacts FBR, and the app
  says so on screen. A real correction to something FBR already accepted needs a **debit note**, which is
  its own new FBR-accepted bill referencing the original (`create_fbr_debit_note()`), inside FBR's 180-day
  window. The database function exists; the on-screen form doesn't yet (see Part 4).

### Who sees what (by role)
| | Counter staff | Accountant | Owner |
|---|---|---|---|
| FBR badge on Sales list / bill | Yes | Yes | Yes |
| "There is a problem, tell the Owner" on a failed/unknown bill | Yes | — | — |
| FBR's actual error text and code | No | Yes | Yes |
| The exact retry command | No | No | Yes |
| Home screen FBR warnings | No | Yes | Yes |
| Cancel a bill, delete a sandbox test bill, FBR lists page, Go-live readiness | No | No | Yes |
| Untick the automatic FBR tick on a bill | No (locked) | — | Yes (online only) |

---

## Part 3 — File map: everything FBR-related

| File | Phase | What it is |
|---|---|---|
| `supabase/18_fbr.sql` | D1 | FBR tables, `create_fbr_bill()`, `business_profile`/`inventory`/`customers` FBR columns |
| `supabase/19_fbr_d2_d3.sql` | D2/D3 | supporting SQL for the tick and the lists screen |
| `supabase/20_fbr_d7.sql` | D7 | `cancel_invoice()`, `create_fbr_debit_note()`, `delete_sandbox_fbr_bill()` |
| `lib/tax.ts` | D2 | tax maths in the browser, matching the database |
| `lib/fbr.ts`, `lib/fbrRef.ts` | D3 | FBR reference-list loading and lookups |
| `app/fbr/page.tsx`, `FbrListsClient.tsx` | D3, D8 | Owner FBR lists screen + Go-live readiness panel |
| `lib/fbrStatus.ts`, `lib/fbrStatusLoad.ts` | D5a | status names, plain-language meaning, the loader |
| `app/sales/FbrBadge.tsx`, `app/sales/[id]/FbrCard.tsx` | D5a | the badge tag and the bill-page status box |
| `lib/fbrPrint.ts`, `lib/fbrPrintLoad.ts`, `lib/fbrQr.ts` | D5b/D5c | shared print/PDF figures and the QR generator |
| `components/FbrQr.tsx`, `components/FbrLogo.tsx` | D5b | the on-screen/print QR and logo |
| `app/print/[id]/page.tsx`, `PrintView.tsx` | D5b | the printed bill |
| `lib/pdf.ts`, `lib/invoiceShare.ts`, `lib/invoiceDoc.ts` | D5c | PDF generation, WhatsApp/email text, the shared bill loader |
| `app/sales/[id]/InvoiceActions.tsx` | D5c | Print/PDF/WhatsApp/Email buttons and the "not ready yet" note |
| `lib/fbrHome.ts`, `lib/fbrHomeLoad.ts`, `components/FbrHomeWarnings.tsx` | D5d | Home screen warnings |
| `lib/fbrCorrections.ts` | D7 | the 180-day debit-note window check |
| `lib/fbrReadiness.ts` | D8 | go-live readiness checks |
| `fbr-sender/` | D4 | the shop-PC program (not in this GitHub repo — lives only on the shop PC) |
| `public/fbr-logo.png` | D5b | **still missing** — the official FBR logo image |

---

## Part 4 — Everything still open

### Needs a person, not code
- [ ] D0 paperwork: IRIS registration confirmed Retailer, Business Nature/Sector chosen, CRM login created, shop PC confirmed always-on, accountant answers (panel rate/schedule, lithium HS code, further tax, accessories), NTN 4022617 confirmed accepted by the sandbox
- [ ] D4 sandbox connection tests (`test-connection`, `lists`, `check-items`, first real send, offline/online test) — full list in `AK-Solar-FBR-D6-Checklist.md`'s companion D4 section of the earlier status docs, and repeated in Part 5's D4 note below
- [ ] D6: PRAL registration, real sandbox tests per scenario, confirm `extraTax` style, confirm the QR content, confirm Third Schedule rules — full checklist in `AK-Solar-FBR-D6-Checklist.md`
- [ ] D8/D9: going live and the ongoing routine — full checklist in `AK-Solar-FBR-D8-D9-Checklist.md`
- [ ] The official FBR logo file, `public/fbr-logo.png`

### Needs code, once the above answers are in
- [ ] **Debit note screen.** The database function is ready; I'm deliberately not building the form until D6 confirms the exact figures/rules with PRAL, so it doesn't produce wrong numbers on a real tax document.
- [ ] **Edited bills.** The `Edited` status exists in the database schema but has no flow behind it yet — not asked for so far, tell me if you want it.
- [ ] **`Get_Reg_Type` buyer check.** Sender-side code (`fbr-sender/`), not in this repo. Needs that folder uploaded before I can touch it.
- [ ] **Live status updates.** The FBR badge/status only updates when a page is loaded/refreshed, not automatically. Could be added later if wanted.
- [ ] **FBR logo inside the PDF.** The printed page shows it once the file is added; the hand-built PDF generator currently draws text/lines/boxes only, no images. Buildable if you want it.
- [ ] **A dedicated "failed/unknown FBR bills" filter on the Sales list.** Right now Home links straight to each bill instead.

---

## Part 5 — Install order for everything not yet on GitHub

Based on the last check of your repo (29 September 2026), these are still missing:

1. `aksolar-fbr-d5c-files.zip` — PDF/Share/WhatsApp/email FBR particulars
2. `aksolar-fbr-d5d-files.zip` — Home screen warnings
3. `aksolar-fbr-d7-files.zip` + run `20_fbr_d7.sql` in Supabase — cancel, debit-note function, safe sandbox delete
4. This session's D8 readiness addition: `app/fbr/page.tsx` (changed), `lib/fbrReadiness.ts` (new), the addition to `lib/fbrHomeLoad.ts` (changed) — package these into a small `aksolar-fbr-d8-files.zip` if you'd like, or tell me and I'll zip it
5. `public/fbr-logo.png` — the real FBR logo file, still outstanding since D5b

`D5b` (`aksolar-fbr-d5b-files.zip`) is already on GitHub and confirmed installed.

---

## Part 6 — Everyday commands (unchanged, in `C:\fbr-sender`)

| Command | What it does |
|---|---|
| `npm run status` | Is the sender running? How many bills pending / sent / failed |
| `npm run test-connection` | Checks Supabase and the FBR token / IP |
| `npm run lists` | Reloads all FBR lists now |
| `npm run check-items` | Shows items not ready for FBR |
| `node src/cli.js retry AK-000123` | Puts a failed bill back in the queue after the cause is fixed |
| `node src/cli.js retry AK-000123 --yes-i-checked-fbr` | Only for `unknown` bills |
| `npm test` | Runs the 13 built-in self tests |

**Bill states:** `pending` waiting/retrying, `sending` being sent now, `sent` FBR accepted, `failed` FBR
rejected, `unknown` no clear answer (check FBR portal first).

---

## Part 7 — What to do next

1. Upload the missing zips (Part 5) so GitHub matches everything built through D7.
2. Work through `AK-Solar-FBR-D6-Checklist.md` — this unblocks the debit-note screen and confirms the QR/logo/scenario questions.
3. When D6 is answered, tell me and I'll build the debit-note screen.
4. Work through `AK-Solar-FBR-D8-D9-Checklist.md` when ready to go live.

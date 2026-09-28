# AK Solar — FBR Digital Invoicing: D5b (print page)

**Updated:** 28 September 2026

## What D5b does (printed bill only, FBR bills only)
- Title becomes **Sales Tax Invoice**.
- Item table gets: Value excl. tax, GST %, GST, Amount.
- Totals show **Items total** and **GST added** when GST is added on top. Third Schedule / tax-included lines are marked * with a note.
- FBR block at the bottom: **QR (Version 2, 25x25, 1 x 1 inch)**, FBR logo, **FBR invoice number**, time reported, verify line.
- **Save and print** now waits for the FBR number (checks every 3 seconds, up to 90 seconds), then opens the print box by itself. If the number does not come, a yellow note shows and the Print button still works (paper says "FBR invoice number: not received yet").
- Sandbox bills print a red box: **TEST INVOICE (FBR sandbox). Not a real FBR invoice.**
- Normal bills and old bills print exactly as before.

## Files (8)
New: `lib/fbrPrint.ts`, `lib/fbrPrintLoad.ts`, `components/FbrQr.tsx`, `components/FbrLogo.tsx`
Changed: `app/print/[id]/page.tsx`, `app/print/[id]/PrintView.tsx`, `package.json`, `package-lock.json` (adds `qrcode-generator` 1.4.4)

## Install
1. Unzip on top of the project. No SQL.
2. **Put the official FBR Digital Invoicing logo at `public/fbr-logo.png`.** Take it from the PRAL DI API v1.12 PDF (section 6) or from your PRAL onboarding pack. Until then no logo is drawn (nothing breaks).
3. Push to GitHub, Vercel deploys.

## Checked / not checked
- Checked: TypeScript passes. QR is Version 2 (25x25) and decodes back to the exact invoice number (22 and 28 character numbers). Table maths gives bill total = items + GST added.
- Not checked: a real print in your browser, and a real FBR number (sender has not run against the sandbox yet).

## Assumptions to confirm in D6
- The PRAL spec gives QR size and version but not the QR content. The QR holds the **FBR invoice number**. Confirm with PRAL / a scan test.
- The line "Verify this invoice with the FBR Tax Asaan mobile app." comes from public guides, not the PRAL spec. Remove it if PRAL does not want it (`FBR_VERIFY_TEXT` in `lib/fbrPrint.ts`).
- Third Schedule figures on the paper follow the provisional D2 maths.

## Known gaps
| Gap | When |
|---|---|
| **Download PDF and Share PDF have no FBR lines, number or QR.** The print page says so. Use Print, Save as PDF for now | D5c |
| WhatsApp and email text | D5c |
| Home warnings | D5d |
| A bill printed offline before sync has no number | Expected |

## Test
1. FBR on (sandbox), sender running. Make an FBR bill, tap Save and print. Yellow "waiting" note, then the print box opens with QR, number and TEST box.
2. Stop the sender, make a bill: after 90 seconds the note says number not received. Print gives "not received yet".
3. Open a normal old bill: same as before.
4. Scan the QR with a phone: it should show the FBR number.

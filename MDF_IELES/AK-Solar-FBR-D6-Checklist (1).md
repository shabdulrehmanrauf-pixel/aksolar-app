# AK Solar — D6: PRAL Registration and Sandbox Tests (Checklist)

**Updated:** 29 September 2026

D6 has no app code of its own — it's registration steps you do on the PRAL/IRIS side, decisions the
accountant gives, and real tests run against the live FBR sandbox. Do these roughly in order; several
can happen in parallel.

## 1. Registration (IRIS / PRAL)

- [ ] Log in to IRIS, confirm the sales tax registration is **active**
- [ ] Confirm it shows **Retailer**. If it shows Wholesaler instead, tell me — one line in `fbr-sender/.env` changes (`FBR_BUSINESS_MODE`)
- [ ] Choose **Business Nature** and **Sector** in IRIS (likely *Retailer* and *Wholesale / Retails*) — this decides which sandbox scenarios apply to you
- [ ] Register for **Digital Invoicing** on the PRAL portal, get the **sandbox POST and GET tokens**
- [ ] Create the **PRAL CRM login** (Owner only)
- [ ] Get the shop's public IP allow-listed by PRAL: **103.245.193.47**
- [ ] From the PRAL dashboard, copy the real **Get URLs** (yours showed "undefined" before) — the app's built-in ones follow the standard spec paths, but confirm they match yours

## 2. Confirm with the accountant

- [ ] GST rate and sale-type/schedule for **solar panels**
- [ ] HS code for **lithium batteries**
- [ ] **Further tax** rate for unregistered buyers (currently set to 0 in the app — confirm this is right)
- [ ] GST treatment for **accessories** (cables, connectors, etc.)
- [ ] Whether **4022617** is accepted as the seller number in the sandbox, or whether the 13-digit CNIC should be used instead

## 3. Security

- [ ] If the real sandbox token was ever shared over chat, email, or screenshot, get a **fresh one** from PRAL
- [ ] Confirm tokens only ever go in the shop PC's `fbr-sender/.env` — never in GitHub, Vercel, or any chat
- [ ] Confirm the shop PC stays on and doesn't sleep during shop hours (needed for D4's sender to run continuously)

## 4. Sandbox tests (once tokens and IP are approved)

Run these from `C:\fbr-sender`, after the D4 checklist in the main status doc is fully ticked off:

- [ ] One bill of each kind: **standard rate**, **reduced rate**, **Third Schedule**. Confirm each is accepted and read back correctly on the printed bill / PDF / WhatsApp (D5b/D5c)
- [ ] A bill mixing more than one sale type on the same invoice — confirm which sandbox `scenario_id` FBR expects (the app currently sends none in production, one guessed scenario in sandbox — this needs PRAL's confirmation)
- [ ] Decide `FBR_EXTRA_TAX_STYLE`: `empty` or `zero` — whichever the sandbox actually accepts
- [ ] A **registered** buyer (with NTN/CNIC) and an **unregistered** (walk-in) buyer
- [ ] Confirm the **walk-in shop-address fallback** is accepted when a customer has no address on file
- [ ] Try the **buyer NTN/CNIC check** (`Get_Reg_Type`) manually against the sandbox, so we know the exact response shape before I build it into the sender
- [ ] Confirm the **QR code content** — scan a real FBR-issued invoice's QR (if you can get one) or ask PRAL directly what it must encode; the app currently assumes it's the FBR invoice number
- [ ] Confirm the **Third Schedule** retail-price rules: per-unit vs line-total, and how a discount below the printed price is handled

## 5. What I need back from you after this

- The exact sandbox response to a `Get_Reg_Type` call (so I can build that check into the sender)
- Which `scenario_id` FBR expects for a mixed-sale-type bill
- Confirmation of the QR content
- The official FBR Digital Invoicing logo file (`public/fbr-logo.png` — still outstanding since D5b)

Once these are answered, D6 is effectively done and D8 (go live) becomes mostly a settings flip: real tokens,
`fbr_enabled` on in production, and watching the first real day of bills.

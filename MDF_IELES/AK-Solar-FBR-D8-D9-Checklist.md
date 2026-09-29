# AK Solar — D8 (Go Live) and D9 (After Go-Live): Checklist

**Updated:** 29 September 2026

Like D6, these two phases are mostly steps and settings, not new code — with one exception: I added a
**Go-live readiness** panel to **More → FBR lists** (Owner only) that checks what the app itself can see
before you flip the switch. It cannot check anything on the PRAL/FBR side (registration, tokens, IP
approval) — that's still section 4 of the D6 checklist.

---

## D8: Go live

### Before you flip anything
- [ ] Everything in the D6 checklist is done and confirmed with PRAL/the accountant
- [ ] Open **More → FBR lists** and check the **Go-live readiness** panel — every line should be green/good
- [ ] Run through the D4 sandbox test list one more time in full, on the real FBR sandbox, with no failures
- [ ] Load the **real, final** provinces, units, HS codes and sale-type lists (not the built-in placeholder spelling)

### Switching over
- [ ] Get the **production** tokens from PRAL (separate from the sandbox ones)
- [ ] Put them in `fbr-sender/.env` as `FBR_PRODUCTION_POST_TOKEN` and `FBR_PRODUCTION_GET_TOKEN` (leave the sandbox lines in place too — you may want to go back to testing later)
- [ ] In Supabase: `update public.business_profile set fbr_environment = 'production';`
- [ ] Restart the sender (`start-sender.bat`) so it picks up the new environment
- [ ] Make **one real bill**, watch it all the way through: FBR badge → sent → real FBR invoice number → printed bill/PDF/WhatsApp all show it correctly
- [ ] Confirm that bill really appears on the FBR/PRAL side (IRIS or the FBR portal), not just as "sent" in AK Solar
- [ ] Confirm the **Go-live readiness** panel now shows **PRODUCTION**

### First real day
- [ ] Keep an eye on **Home** (Owner/Accountant) for the FBR warnings strip throughout the day
- [ ] At the end of the day: `npm run status` in `C:\fbr-sender` — should show 0 pending, 0 failed
- [ ] Confirm the shop PC didn't sleep, and the sender restarted automatically if the PC rebooted (the `shell:startup` shortcut from D4)

---

## D9: After go-live

This is ongoing, not a one-time checklist — a routine to keep coming back to.

### Daily (Owner)
- [ ] Glance at the **Home** FBR warnings strip: sender offline, failed bills, unknown bills, or taxable items sold without an FBR bill
- [ ] Any **failed** bill: open it, read FBR's error text, fix the cause (usually an item missing HS code/rate, or a buyer detail), then run the retry command shown on the bill
- [ ] Any **unknown** bill: check the FBR portal first — if it's genuinely not there, use the `--yes-i-checked-fbr` retry

### Weekly
- [ ] `npm run lists` to refresh HS codes, units, sale types and rates from FBR — these can change
- [ ] `npm run check-items` to catch any newly-added item that's missing FBR details

### As needed
- [ ] A real correction on a bill FBR already accepted: needs a **debit note**. The database side is built (D7), but I haven't built the on-screen form yet — it needs the exact figures/rules confirmed with PRAL first (see the D6 checklist). Tell me once that's confirmed and I'll build the screen.
- [ ] A bill that needs editing after FBR already accepted it: not built yet (`Edited` status exists in the database but has no flow behind it) — tell me if you want this built next.
- [ ] Token rotation: if a production token is ever exposed, get a fresh one from PRAL immediately and update `fbr-sender/.env` only — never GitHub or Vercel.

### Things to keep watching, not fully solved
- Third Schedule figures were provisional at D6 — recheck if PRAL's guidance changes.
- The QR code content and the "verify with Tax Asaan" line are my best reading of the public spec, not a PRAL confirmation — worth double-checking once you've seen a real scanned invoice.

# AK Solar (AK Power) — Shop Management App
## Full Project Plan & Reference Document

**Business:** Al Karam Battery and Solar — short name "AK Solar"
**Website:** akpower.pk (existing, separate project)
**Prepared:** September 2026
**Purpose of this document:** Single source of truth for what we are building, why, and in what order. Share this with any developer — it should be enough for them to understand the full scope without a call.

---

## 1. What This App Is

Not just an "app" — a small **business management system** for a battery/solar retail + installation shop, covering:

1. **Inventory management**
2. **Sales & Invoicing**
3. **Customer records / CRM**
4. **Reports & dashboard**
5. **AI assistant layer** (phase 2)
6. **FBR Digital Invoicing compliance** (required by law)

It replaces manual registers/Excel with one system usable on desktop and mobile, by the owner and staff.

---

## 2. Current Assets (What We Already Have)

| Asset | What it is | Status |
|---|---|---|
| **akpower.pk** | Next.js 16 + Tailwind marketing website (products, services, blog, lead form, WhatsApp float button) | Live, public-facing |
| **Supabase** | Wired into the website via env vars only (URL + anon key) | Not yet used for real data |
| **Vercel** | Hosting for the website | Working |
| **GitHub** | Repo for the website (`akpower_nextjs`) | Working |
| **FBR Documents** | Error Message Guide, DI FAQs, DI User Manual v1.6, Technical Documentation, Sandbox Scenarios JSON | Reviewed — see Section 8 |

**Key decision:** The website and the shop-management app will be **two separate applications**, sharing the same tech stack (and optionally the same Supabase account) but **not the same codebase**.

**Why:**
- Website = public, SEO-facing, simple, low-risk.
- Shop app = private, login-required, handles sensitive data (prices, customers, financials, FBR tax data) — a different security and complexity profile.
- Keeps deploys independent: a shop-app bug should never be able to break the public website, and vice versa.

**Recommended setup:**
- New repo (e.g. `aksolar-app`)
- New Vercel project, deployed at a subdomain like `app.akpower.pk` or `shop.akpower.pk`
- Same or a second Supabase project
- Same stack as the website: **Next.js + Supabase (Postgres, Auth, Storage) + Vercel**

This stack is a genuinely good fit for this app: built-in auth, relational database, file storage (for invoice PDFs, IP-whitelist files, etc.), low cost, and it scales fine for a single shop or a few branches.

---

## 3. "App" Experience on Desktop & Mobile (Without Building 3 Separate Apps)

We do **not** need separate native codebases for desktop, iOS, and Android. Plan:

1. **Build one web app**, make it a **PWA (Progressive Web App)**.
   - On mobile: user taps "Add to Home Screen" once → opens full-screen with its own icon, no browser bar, no typing URLs. Feels like a real app.
   - On desktop: Chrome/Edge "Install App" gives it its own window/icon, separate from the browser.
2. **Later, if needed:** wrap the same code with **Capacitor** to publish on Play Store / App Store — useful once we need offline mode, camera-based barcode scanning, or store presence for credibility. This is a wrapper, not a rewrite.
3. **Desktop-only app (optional, later):** Tauri or Electron, again wrapping the same web app.

**Conclusion:** Build the core web app once, make it installable (PWA) from day one. Only invest in native wrapping once a concrete need appears (offline counter sales, barcode hardware, etc.).

---

## 4. Core Modules (Build Scope)

### 4.1 Inventory
Track everything the shop sells and installs:
- **Batteries:** brand, model, type (Lithium / Tubular / Lead-Acid / Dry), plates, voltage, Ah rating, cost price, sale price, quantity on hand, reorder level, warranty period.
- **Solar panels:** brand, wattage, type, price, qty.
- **Solar accessories:** MC4 connectors, solar cables/wire, inverters, charge controllers, mounting structure parts.
- **Battery accessories:** battery water, terminals, other consumables.
- Low-stock alerts and reorder suggestions.
- Purchase/supplier tracking (what we buy, from whom, at what landed cost) — needed for real profit-per-item calculation, not just sales tracking.

### 4.2 Sales & Invoicing
- Create invoice: pick customer, add line items from inventory (auto-decrements stock).
- Support both **retail invoices** (simple sale) and **solar system quotes/proposals** (bundled package: panels + inverter + batteries + wiring + structure + installation) — these are different documents with different purposes.
- Print invoice, download as PDF, share via **WhatsApp / Email** directly from the app.
- Support **cash and credit (installment) sales** — running customer balance, due dates, reminders.
- Invoice numbering, tax fields, and structure should be **shaped like the FBR JSON format from day one** (see Section 8) — so going live with FBR later is a mapping exercise, not a rebuild.

### 4.3 Customer Records (CRM)
- Every customer: name, contact, address, registration type (for FBR: Registered/Unregistered, CNIC/NTN).
- One search (name, invoice number, or date) → shows everything: all invoices, amounts, dates, balance due, warranty records for items sold to them.
- No need to search multiple screens — one click / one search shows full customer picture.

### 4.4 Reports & Dashboard
- Daily / monthly / quarterly / yearly sales.
- Stock value on hand.
- Best-selling items.
- Total receivables (money owed by customers).
- Daily cash-closing report: total sales, cash vs credit, for end-of-day reconciliation.

### 4.5 Roles & Access
- **Owner:** full access.
- **Counter staff:** create sales/invoices only, cannot edit prices or view reports.
- **Accountant:** reports and financial data, no inventory editing.
- **Audit log:** every stock/price/invoice edit recorded — who did what, when.

---

## 5. Data Entry: Three Ways In (All Three, In This Order)

1. **Manual forms** — the ground truth UI, must exist regardless of anything else.
2. **CSV import/export** — for bulk-loading existing stock lists once, and for backups/accounting exports.
3. **AI command layer** — sits on top of the above, does not replace them (see Section 6).

---

## 6. AI Assistant Layer (Phase 2 — Claude API Integration)

**Goal:** Let staff type/speak natural requests ("add 20 Osaka 200Ah tubular batteries at 45,000 each", "make an invoice for Ahmed Traders: 2 Phoenix 150Ah, 1 MC4 pair", "what does Bilal Furniture owe us?") instead of clicking through forms.

**Safety pattern — "Propose → Confirm → Execute":**
1. AI turns the sentence into a structured action (e.g. `add_inventory: {brand: Osaka, model: 200Ah, type: Tubular, qty: 20, rate: 45000}`), checked against real product/customer data — never invents IDs or brands.
2. App shows this back in plain language: *"Add 20 × Osaka 200Ah Tubular at Rs 45,000 each — confirm?"* with **Yes / Edit / Cancel**.
3. Only after explicit human confirmation does the app run the **same normal, tested backend function** that the manual "Add Stock" button uses. The AI never writes to the database directly.
4. Every AI-proposed action is logged (who asked, what was proposed, who confirmed) for trust and error-catching.
5. **Read-only questions** (search invoices, check balance) can skip confirmation — no risk there. Only actions that **write/change data** require confirmation.

This avoids hallucination risk entirely by design: the AI is a translator from human language to a structured proposal; a human always approves the final write.

**Build this after** the core CRUD app is stable — it's a powerful layer on top of a working system, not the foundation.

---

## 7. Website ↔ App Connection (Future)

- The website's `SavingsCalculator` and lead form already gesture toward solar quoting — eventually link website leads directly into the app's quote builder, so a website inquiry becomes a draft quote automatically.
- Consider shared Supabase Auth if we want one login across both properties later — not required for launch.

---

## 8. FBR Digital Invoicing — What We Learned & What To Do

### What FBR/PRAL requires (from the uploaded documents)
- Digital Invoicing is **mandatory** for registered taxpayers — real-time, per-invoice submission (not monthly batch). Even nil-sale periods require a null submission.
- Integration is via REST/JSON API:
  - `postinvoicedata` — real-time invoice posting
  - `validateinvoicedata` — pre-submission validation
  - Separate **Sandbox** and **Production** URLs and tokens.
  - Auth header: `Authorization: Bearer <Security_Token>`
- **Reference APIs** must be used to validate fields before submission: HS Code, UOM, Rate, Province, SRO Items, STATL Status.
- **Integrator choice:** PRAL (free, including sandbox testing) or another Licensed Integrator (capped at Rs. 10/invoice, or Rs. 100,000/taxpayer, or Rs. 1,000,000/year). **Recommendation: use PRAL** — free and sufficient for our scale.
- **Go-live process:**
  1. Register via IRIS portal → Digital Invoicing → API Integration.
  2. Submit Technical Details (contact person, ERP/software info, CRM login).
  3. **IP Whitelisting** — requires a **static public IP** (PRAL approves/rejects within ~2 working hours). ⚠️ Important: Vercel serverless functions don't have a fixed outbound IP by default — we will likely need a small proxy/VPS with a static IP specifically for the FBR API calls, or a Vercel static-IP add-on.
  4. **Sandbox testing** — submit scenario-based test invoices matching our declared Business Nature/Sector (likely "Goods at Standard Rate," possibly "3rd Schedule Goods," and "Services" for installation work). Minimum 1 successful invoice per assigned scenario.
  5. On success, system auto-generates a **Production Token** → switch to production endpoint → start real-time live invoicing.

### Key validation rules our Invoice module must follow (from the Error Message Guide — this is effectively our field checklist)
- Buyer/Seller registration number format: **CNIC = 13 digits, NTN = 7 digits**, no special characters.
- Invoice date format: **YYYY-MM-DD**; cannot be in the future; cannot be edited to more than 3 days before current date.
- HS Code format: **4 digits + decimal + 4 digits** (e.g. `0101.2100`), must match sale type and UOM (UOM is case-sensitive, e.g. "KG" not "kg").
- Sales tax must be calculated from the correct base depending on sale type:
  - Standard: Sale Value × Rate
  - Or Quantity × Rate
  - **3rd Schedule Goods:** must use `fixedNotifiedValueOrRetailPrice`, not sale value.
- Debit notes: require reference invoice, reason code (with remarks if "Others"), date ≥ original invoice date, within 180 days.
- Buyer and Seller registration numbers cannot be the same (no self-invoicing).
- Decimal limits: 2 decimal places generally, 4 for quantity.
- Numeric fields must not be negative, null, empty, or string type.

### Invoice cancellation/edit rules (from the User Manual, v1.6 update)
- Only invoices submitted via DI Integration are eligible for correction.
- Corrections/cancellations only within **72 hours** of the invoice's insertion date.
- Invoice **number and header info are fixed** — only individual line items can be edited.
- Once an item is edited, it **cannot** later be cancelled (and vice versa) — each item editable once.
- Invoices already reported in a submitted tax return, or moved to return status (after 72 hrs / month-end), **cannot** be changed.
- **Cancellation cap: total cancelled value cannot exceed 10% of last month's sales** — applies cumulatively across all invoices/items, not per invoice.
- Editing/cancelling produces a revised invoice PDF, marked "E" (edited) or "C" (cancelled) per item, keeping the original invoice number and date.

### Support & Troubleshooting
- FBR/PRAL support via the **DI CRM portal**: https://dicrm.pral.com.pk (log in via IRIS for us, or DI-Support with the registered technical contact email).
- Raise a support case with priority/query type/title/description, attach PDF evidence (max 20MB).
- Common errors and fixes are documented in the Error Message Guide (sales error codes 0002–0302) and in the FAQ (invalid UOM, invalid HS Code, unauthorized token, calculated tax mismatch, etc.).

### Recommendation
Design our internal invoice data model **from day one** using the FBR JSON field names/structure (seller/buyer info, HS code, UOM, rate, sale type, tax breakdown fields) — even before we flip the switch to go live with FBR. That way, "going live" becomes: register → whitelist IP → sandbox test → get production token → point the existing invoice flow at the production endpoint. No separate invoice format to maintain.

---

## 9. Suggested Additional Features (Beyond the Core Ask)

| Feature | Why it helps |
|---|---|
| **Barcode/QR labels** on batteries | Scan to sell or check stock — big time-saver at the counter |
| **Purchase/supplier module** | Real profit-per-item (landed cost vs sale price), not just sales tracking |
| **Warranty tracking** | Batteries have warranty periods — instantly check if a sold unit is still covered |
| **Installment/credit ledger with reminders** | Track partial payments, send WhatsApp due-date reminders |
| **Multi-user roles** | Owner / counter staff / accountant — different access levels |
| **Daily cash-closing report** | One-click end-of-day reconciliation |
| **Solar system quote/proposal builder** | Separate from retail invoices — bundles full system components into a client-facing proposal PDF |
| **WhatsApp Business API integration** | Auto-send invoices/reminders instead of manual share (bigger lift, high value) |
| **Full audit log** | Every stock/price/invoice edit tracked, once more than one person has access |

---

## 10. Recommended Build Order (For Developer)

1. **Core schema + manual CRUD** — Inventory, Customers, Invoices (fields shaped to match FBR JSON structure from the start; see Section 8).
2. **Invoicing** — create, print, PDF export, WhatsApp/email share.
3. **Dashboard + customer search/history.**
4. **CSV import/export.**
5. **PWA setup** — installable app experience on desktop + mobile.
6. **FBR integration** — Sandbox registration → scenario testing → Production Token → go live.
7. **AI assistant (Claude API)** — Propose → Confirm → Execute pattern, layered on the now-stable CRUD functions.
8. **Extra features** (Section 9) — prioritized by whatever slows down counter staff the most in real use.

---

## 11. Open Decisions / Things To Confirm Before Building

- [ ] Confirm business nature/sector to declare with FBR (Manufacturer / Importer / Distributor / Retailer / Service Provider — likely multiple, e.g. Retailer + Service Provider for installations).
- [ ] Confirm whether we register with **PRAL** as Licensed Integrator (recommended, free) or another LI.
- [ ] Decide hosting solution for the **static public IP** needed for FBR IP whitelisting (small VPS vs a Vercel static-IP proxy add-on).
- [ ] Confirm subdomain for the app (e.g. `app.akpower.pk`).
- [ ] Confirm whether app and website share one Supabase project or use two.
- [ ] Decide initial user roles needed at launch (just Owner? Or Owner + Counter staff from day one?).

---

*This document reflects the plan as discussed. No code has been written yet — this is the reference plan to build from.*

# AK Solar App — Step-by-Step Build Instructions for Developer

**Purpose of this document:** A phase-by-phase build order so the app is built **in small pieces, one at a time** — not all at once. This matters because building is being done using Claude (AI coding assistant), and asking it to "build the whole app" in one go burns through free tokens fast and can fail midway. Each phase below is sized to be **one focused Claude session** (one day or one sitting), with a clear deliverable, before moving to the next.

Companion document: `AK-Solar-App-Plan.md` (full feature list, FBR field requirements, reasoning) — read that first for context, this file is the **execution checklist**.

---

## How to Use This Document (Read This First)

- Do **not** tell Claude "build the whole AK Solar app." Instead, work through **one phase at a time**, in a **new/focused conversation** for each phase.
- After each phase: **test it, commit it to GitHub, deploy it to Vercel** — then move to the next phase. Don't stack unfinished phases.
- Each phase below has: what to build, why, and a **ready-to-use instruction you can give Claude** to start that phase.
- Two tracks run **in parallel**, not one-after-another:
  - **Track A (Developer/Claude):** the app itself, phase by phase.
  - **Track B (Owner/Admin):** IRIS + PRAL registration + static IP — paperwork, not code. Do not wait for Track A to finish before starting Track B — start both in Week 1.

---

## SETUP — Phase 0: Project Foundation (Do Once, Before Any Feature)

**Goal:** Empty but correctly wired project — repo, hosting, database connected, nothing else.

**Steps:**
1. Create new GitHub repo: `aksolar-app` (separate from the `akpower_nextjs` website repo).
2. Create new Next.js project (same stack as website: Next.js + TypeScript + Tailwind), push to the repo.
3. Create a **new Supabase project** (or a new schema in the existing one) — do not mix with website data.
4. Connect Supabase to the Next.js app (env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, plus a service-role key kept server-side only).
5. Connect the repo to a **new Vercel project**, deploy the empty app to confirm the pipeline works (repo → Vercel → live URL).
6. Set up basic Supabase Auth (email/password login) — just the login screen, one test user (the owner).

**Claude prompt to use:**
> "Set up a new Next.js + TypeScript + Tailwind project called aksolar-app, connect it to a new Supabase project for auth and database, and prepare it for Vercel deployment. Add a simple login page using Supabase Auth email/password. Do not build any business features yet — this is just the foundation."

**Deliverable:** A live URL with a working login screen, nothing else. Confirm this works before continuing.

---

## Phase 1: Inventory Module (Core)

**Goal:** Add, view, edit, delete inventory items — batteries, panels, accessories.

**Supabase table needed:** `inventory`
- id, category (battery/panel/accessory), brand, model, type (lithium/tubular/lead-acid/dry — for batteries), voltage, plates, ah_rating, cost_price, sale_price, quantity, reorder_level, created_at, updated_at

**Build:**
1. Inventory list page (table view, search/filter by brand/type).
2. Add/Edit item form.
3. Delete item (with confirmation).
4. Low-stock indicator (highlight items below reorder level).

**Claude prompt to use:**
> "In the aksolar-app project, create the Supabase 'inventory' table with these fields: [paste field list above]. Then build an Inventory page: a list/table view with search and filter, and an Add/Edit form. Include a low-stock visual indicator. Do not build invoicing or customers yet."

**Deliverable:** Owner can log in and manage the full battery/solar stock list.

---

## Phase 2: Customer Records Module

**Goal:** Store customers and search their full history (this phase just stores customers — invoice linking happens in Phase 3).

**Supabase table needed:** `customers`
- id, name, phone, address, registration_type (Registered/Unregistered — for FBR), cnic_or_ntn, created_at

**Build:**
1. Customer list page (search by name/phone).
2. Add/Edit customer form.
3. Customer detail page (empty for now — invoices will populate it in Phase 3).

**Claude prompt to use:**
> "Add a 'customers' table to the aksolar-app Supabase database with these fields: [paste list]. Build a Customers page: list with search, Add/Edit form, and a customer detail page (leave a placeholder section for 'Invoices' — we'll connect that in the next phase)."

**Deliverable:** Owner can add/search customers, click into a customer profile.

---

## Phase 3: Invoicing Module — Core (Build the Data Model FBR-Ready From Day 1)

**Goal:** Create invoices, linked to customers and inventory (auto-decrements stock). **Important: fields must match FBR's JSON structure from the start** — see `AK-Solar-App-Plan.md` Section 8 for the exact field list (HS Code, UOM, Rate, Sale Type, tax breakdown, buyer/seller registration format, etc.) even though we are **not** connecting to FBR yet in this phase.

**Supabase tables needed:** `invoices` and `invoice_items`
- `invoices`: id, invoice_number, customer_id, invoice_date, invoice_type (Sale Invoice/Debit Note), total_value, status (Valid/Cancelled/Edited), payment_status (Paid/Partial/Credit), created_at
- `invoice_items`: id, invoice_id, inventory_id, hs_code, uom, quantity, rate, sale_type, value_excl_tax, sales_tax, total

**Build:**
1. Create Invoice page: pick customer → add items from inventory → auto-calculate totals → save (decrements inventory quantity).
2. Invoice list page (search by customer/date/invoice number).
3. Invoice detail/view page.
4. Basic validation matching FBR rules (CNIC 13 digits / NTN 7 digits, 2 decimal places, quantity mandatory, etc. — from the Error Message Guide in the plan doc).

**Claude prompt to use:**
> "Add 'invoices' and 'invoice_items' tables to Supabase with these fields: [paste lists]. Build an invoice creation flow: select customer, add line items from inventory (auto-fill price, allow quantity/rate edit), calculate totals, save (and decrement inventory stock). Add an invoice list with search and a detail view. Apply these validations: [paste key FBR validation rules from the plan doc — CNIC/NTN format, date format YYYY-MM-DD, decimal limits, HS code format]. Do NOT connect to any FBR API yet — this is just our internal invoice system, built FBR-shaped for later."

**Deliverable:** Owner/staff can create a full invoice end-to-end, stock updates automatically, customer's invoice history now shows on their profile (connects back to Phase 2).

---

## Phase 4: Invoice Output — Print / PDF / Share

**Goal:** Turn a saved invoice into something that can leave the app.

**Build:**
1. Print-friendly invoice view.
2. Download as PDF.
3. Share button: WhatsApp (opens WhatsApp with invoice link/PDF), Email (send PDF as attachment).

**Claude prompt to use:**
> "Add PDF generation for the invoice detail page in aksolar-app, plus a print-friendly view, and Share buttons for WhatsApp and Email that send the invoice PDF or a link to it."

**Deliverable:** A real invoice can be printed, downloaded, and sent to a customer.

---

## Phase 5: Dashboard & Reports

**Goal:** At-a-glance business numbers.

**Build:**
1. Dashboard: total sales (daily/monthly), stock value, total receivables (credit/due amounts), low-stock count.
2. Simple charts (daily sales trend).
3. Daily cash-closing report (total sales, cash vs credit breakdown).

**Claude prompt to use:**
> "Build a Dashboard page for aksolar-app showing: total sales this month, stock value on hand, total money owed by customers (from unpaid/partial invoices), and a low-stock items count. Include a simple daily sales chart and a daily cash-closing summary (cash vs credit sales)."

**Deliverable:** Owner opens the app and sees business health in one screen.

---

## Phase 6: CSV Import/Export

**Goal:** Bulk-load existing stock, and export data for backup/accounting.

**Build:**
1. CSV import for inventory (with a downloadable template).
2. CSV export for inventory, customers, and invoices.

**Claude prompt to use:**
> "Add CSV import for the Inventory page (with a downloadable template matching our fields) and CSV export buttons for Inventory, Customers, and Invoices in aksolar-app."

**Deliverable:** Existing paper/Excel stock list can be loaded in one go.

---

## Phase 7: PWA — Installable App Experience

**Goal:** App installs like a real app on phone/desktop.

**Build:**
1. Add PWA manifest + icons + service worker so "Add to Home Screen" (mobile) and "Install App" (desktop Chrome/Edge) work properly.

**Claude prompt to use:**
> "Convert aksolar-app into an installable PWA: add manifest.json, app icons, and a service worker so it can be installed on mobile home screen and as a desktop app via Chrome/Edge."

**Deliverable:** App can be installed like a native app, no more opening via browser URL.

---

## Phase 8: Roles & Access (Owner / Staff / Accountant)

**Goal:** Not everyone should see everything.

**Build:**
1. Add role field to users (Owner, Counter Staff, Accountant).
2. Restrict: Counter Staff → sales/invoice only, no price editing, no reports. Accountant → reports + financials only, no inventory editing.
3. Basic audit log: record who edited/added/deleted what and when.

**Claude prompt to use:**
> "Add user roles (Owner, Counter Staff, Accountant) to aksolar-app using Supabase Auth + a roles table. Restrict page access per role as follows: [paste rules above]. Add a simple audit_log table that records user, action, and timestamp for every add/edit/delete."

**Deliverable:** Safe to give staff their own logins.

---

# TRACK B — FBR / PRAL Registration (Parallel, Non-Code Work)

**Start this in Week 1, alongside Phase 0-1 of Track A. Do not wait for the app to be finished.**

### B1 — Check current status
- Log into IRIS portal, open "Digital Invoicing" section, note current status.

### B2 — Arrange a static IP
- Contact Storm Fiber: ask if static/fixed public IP is available on current plan or as an add-on.
- If not available: arrange a small VPS (DigitalOcean/AWS Lightsail/etc., ~Rs 1,500–2,500/month) — this will host only the FBR API connector later (see Phase 9 below).

### B3 — Prepare Technical Details
- Decide Business Nature (likely: Retailer + Service Provider) and Sector.
- Prepare: technical contact name/mobile/email, software name ("AK Solar App"), software type (Cloud), CRM login email/password.

### B4 — Register with PRAL
- In IRIS → Digital Invoicing → API Integration → choose "Proceed with PRAL as Licensed Integrator."
- Submit Technical Details (B3) and IP Whitelisting (B2's static IP).
- Wait for PRAL approval (~2 working hours for IP).

**This entire Track B can be done by the owner/office staff without touching code, while Track A Phases 0-3 are being built.**

---

## Phase 9: FBR Integration (Track A + Track B Come Together)

**When to start this phase:** Only after **both** are true:
- Track A: Phase 3 (Invoicing core) is built and stable.
- Track B: PRAL registration + IP whitelisting is approved, Sandbox access is available.

**Build:**
1. Build a small connector (hosted on the static-IP VPS from B2, or via an IP-proxy service) that takes our internal invoice and posts it to FBR's Sandbox `postinvoicedata_sb` endpoint in the required JSON format.
2. Map our invoice fields (Phase 3) to FBR's JSON structure exactly.
3. Handle FBR's response/error codes (from the Error Message Guide) — show clear errors back in our app if FBR rejects something.
4. Run through all required Sandbox test scenarios for our business type until a **Production Token** is issued.
5. Switch endpoint to Production, go live.

**Claude prompt to use (once ready):**
> "Build an FBR Digital Invoicing connector for aksolar-app. It should take a saved invoice from our 'invoices'/'invoice_items' tables, map it to FBR's required JSON format [paste the field mapping/sample JSON from AK-Solar-App-Plan.md and the Technical Documentation], and POST it to the Sandbox endpoint using the security token, from [our static-IP VPS / proxy — specify]. Handle and display FBR error codes clearly if the submission fails."

**Deliverable:** Every invoice created in the app is automatically transmitted to FBR in real time, compliant with the law.

---

## Phase 10: AI Assistant (Optional, Do Last)

**Goal:** Natural-language commands for adding stock, creating invoices, searching — with a mandatory confirm step before any write (see `AK-Solar-App-Plan.md` Section 6 for the full safety pattern).

**Only start this after Phases 0–9 are stable and in daily use.**

**Claude prompt to use (when ready):**
> "Add an AI assistant to aksolar-app using the Claude API. It should translate natural-language requests (e.g. 'add 20 Osaka 200Ah tubular batteries at 45000') into a structured action, show the user a plain-language confirmation ('Add 20 × Osaka 200Ah Tubular at Rs 45,000 — confirm?') with Yes/Edit/Cancel, and only call our existing add-inventory/create-invoice functions after explicit confirmation. Read-only queries (search, balance check) can skip confirmation."

---

## Quick Reference — Order Summary

| Order | Phase | Track |
|---|---|---|
| 1 | Project setup | A |
| 1 (same week) | Check IRIS status, arrange static IP | B |
| 2 | Inventory module | A |
| 3 | Customer module | A |
| 3 (parallel) | PRAL registration + technical details | B |
| 4 | Invoicing core (FBR-shaped fields) | A |
| 5 | Invoice print/PDF/share | A |
| 6 | Dashboard & reports | A |
| 7 | CSV import/export | A |
| 8 | PWA install | A |
| 9 | Roles & access | A |
| 10 | **FBR live connection** (needs A Phase 4 + B done) | A + B |
| 11 | AI assistant (optional, last) | A |

**Golden rule for Claude sessions:** One phase = one focused session = test → commit to GitHub → deploy to Vercel → then start the next phase in a fresh conversation. Never ask for more than one phase at a time.

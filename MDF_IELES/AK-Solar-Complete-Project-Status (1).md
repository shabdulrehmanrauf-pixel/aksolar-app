# AK Solar App — Complete Project Status & Developer Handoff

**Business:** Al Karam Battery and Solar ("AK Solar"), Pakistan
**Document date:** 22 September 2026 (supersedes the 21 September 2026 version)
**Who this is for:** any developer (or AI coding assistant such as Claude) who is joining the project and has seen nothing before. **This one file is enough to continue the work.**

---

## 0. Read this first (60-second summary)

**What the app is:** a private, login-only web app for a battery + solar shop. It replaces paper registers and Excel with one system for **stock, customers, invoicing and reporting**, usable on the counter computer and on phones. Later it must also send every invoice to **FBR (Pakistan tax authority) in real time** — this is required by law.

**Where we are:** Foundation, Inventory, Customers, the app shell, **and now full Invoicing, Print/PDF/Share, and Reports are built and deployed.** **CSV import/export is next.**

| Step | What | Status |
|---|---|---|
| Phase 0 | Project foundation (GitHub, Vercel, Supabase, login) | ✅ Done |
| Phase 1 | Inventory (add / edit / delete / search / low-stock) | ✅ Done |
| Phase 2 | Customers (list / search / add / edit / delete / detail page) | ✅ Done |
| UI-A | App shell (sidebar/bottom bar), Home screen, search + voice box | ✅ Done |
| **Phase 3** | **Invoicing core (New bill, atomic stock decrement, cash/part/udhaar, payments, invoice list + detail)** | ✅ **Done** |
| **Phase 4** | **Invoice output: Print (A4), PDF download, Share PDF (phone), WhatsApp, Email** | ✅ **Done** |
| **Phase 5** | **Reports: sales by period, cash closing, best sellers, stock/udhaar snapshot, sales chart** | ✅ **Done** |
| Phase 6 | CSV import / export | ⬜ **NEXT** |
| Phase 7 | PWA (installable app) | ⬜ |
| Phase 8 | Roles (Owner / Counter Staff / Accountant) + audit log + real database security | ⬜ |
| Phase 9 | FBR live integration (needs owner's Track B paperwork first) | ⬜ |
| Phase 10 | AI assistant ("Ali Khan ko 2 battery… bill bana do") | ⬜ optional, last |
| Track B | IRIS / PRAL registration + static IP (paperwork, not code) | ❓ status unknown, confirm with owner |

**The working rule for everything:** build **one phase per session**. After each phase: **test → upload to GitHub → run any new SQL in Supabase → let Vercel deploy → confirm it works → only then start the next phase.** Never ask for "the whole app" at once.

**Important ordering note (learned in Phase 3):** SQL should be run in Supabase **before or immediately after** the GitHub upload. If files are uploaded first, the app does **not** break — Sales, Reports and the Home money cards just show a friendly "run 0X_....sql" message until the SQL is run, then work normally after a refresh. No data is lost either way.

---

# PART A — WHAT IS DONE AND HOW IT WORKS

## 1. Project facts

| Item | Value |
|---|---|
| App repo | GitHub: `shabdulrehmanrauf-pixel/aksolar-app`, branch `main` |
| Hosting | Vercel, auto-deploys on every commit to `main` |
| Planned URL | `shop.akpower.com` (subdomain). Needs a Vercel domain entry + DNS `CNAME`. **Still unconfirmed — check with owner** |
| Database + login | Supabase (Postgres, Auth email/password, Row Level Security) — a **separate** project from any website data |
| Marketing website | `akpower.pk` / `akpower.com`, repo `akpower_nextjs`, **separate Vercel project. Do not merge the two codebases** |
| Users today | Only the owner account (created manually in Supabase). Public sign-ups are turned **off** |
| How code reaches GitHub | The owner uploads files **manually through the GitHub website** (no command line). See section 9 |

---

## 2. Tech stack and version pins

| Piece | Choice |
|---|---|
| Framework | Next.js **15.5.x** (App Router), React 19, TypeScript 5.9 |
| Styling | Tailwind CSS **v4** (`@tailwindcss/postcss`; theme tokens live in `app/globals.css`) |
| Supabase client | `@supabase/supabase-js` + `@supabase/ssr` (cookie-based sessions) |
| Fonts | Barlow and Barlow Condensed via `next/font/google` |
| Icons | Own inline SVG set in `components/Icons.tsx`. **No icon library** |
| PDF generation | **Hand-written, dependency-free PDF writer** (`lib/pdf.ts`) — no `@react-pdf/renderer` or similar added. Standard Helvetica fonts only (see section 6 limitation) |
| Charts | Plain inline SVG bar chart (`app/reports/SalesChart.tsx`) — **no chart library** |
| Extra npm packages added in Phases 3–5 | **None.** Still zero extra dependencies beyond the Phase 0 baseline |

**Deliberate pins — do not change casually:**
- **Next.js stays on 15.x.** Next 16 renames `middleware.ts` to `proxy.ts`. Upgrade later as its own separate task.
- **TypeScript stays on 5.x.**
- `package-lock.json` is committed so Vercel installs exactly what was tested.

---

## 3. Environment variables

Set in **Vercel → Project → Settings → Environment Variables**:

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase **anon / publishable** key |

- `NEXT_PUBLIC_*` values are baked in at **build time** → after changing them, **redeploy**.
- **Never** use the `service_role` / secret key in browser code. Phase 8/9 will need it as `SUPABASE_SERVICE_ROLE_KEY`, server-side only, never in GitHub.
- Phase 10 will need a server-only Claude API key, no `NEXT_PUBLIC_` prefix.

---

## 4. Supabase setup (state of the database)

Run once each, in this exact order, in **Supabase → SQL Editor → New query → Run** (all are safe to re-run):

1. `supabase/01_inventory.sql` — Phase 1
2. `supabase/02_customers.sql` — Phase 2
3. **`supabase/03_invoices.sql`** — Phase 3 ✅ **must be run** (creates `business_profile`, `invoices`, `invoice_items`, `payments`, the `invoice_balances` view, and the functions `create_invoice()`, `record_payment()`, `money_summary()`)
4. **`supabase/05_reports.sql`** — Phase 5 ✅ **must be run** (creates the `report_summary()` function)

(There is no `04_....sql` — Phase 4 was output-only, front-end, no schema change.)

Also fill in **Table Editor → `business_profile`** (one row already exists by default): `address`, `phone`, `ntn`, `province`. These print on every bill and will be needed by FBR in Phase 9.

### Table `public.inventory` (Phase 1) — unchanged, see section 17 index if you need the column list.

### Table `public.customers` (Phase 2) — unchanged.

### Table `public.business_profile` (Phase 3) — new

Single row (`id boolean primary key default true`). `business_name`, `ntn`, `address`, `province`, `phone`, `updated_at`.

### Table `public.invoices` (Phase 3) — new

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | |
| `invoice_number` | text, unique | auto `AK-000001`, `AK-000002`… via `invoice_number_seq` |
| `invoice_type` | text | `Sale Invoice` / `Debit Note` |
| `invoice_date` | date | not in the future |
| `customer_id` | uuid, FK → customers, **on delete restrict** | null = walk-in |
| `buyer_name`, `buyer_registration_type`, `buyer_cnic_or_ntn`, `buyer_address`, `buyer_phone` | — | **snapshot** of the customer at sale time — never changes even if the customer record is later edited |
| `note` | text | vehicle / note field (owner's Phase 3 decision: yes) |
| `total_value` | numeric(14,2) | calculated by the database function, never trusted from the client |
| `status` | text | `Valid` / `Cancelled` / `Edited` (Cancelled/Edited not used by any screen yet — reserved for Phase 9 edit/cancel rules) |
| `payment_status` | text | `Paid` / `Partial` / `Credit`, kept correct by `create_invoice()` / `record_payment()` |
| `created_by`, `created_at`, `updated_at` | — | same pattern as inventory |

### Table `public.invoice_items` (Phase 3) — new

Snapshot of each line at sale time (`description`, `hs_code`, `uom`, `cost_price`, `quantity`, `rate`, `value_excl_tax`, `sales_tax_rate`, `sales_tax`, `total`). `inventory_id` is **on delete restrict**. `sales_tax` fields exist and default to 0 — wired up for real in Phase 9.

### Table `public.payments` (Phase 3) — new (owner's decision: **yes**, built)

`invoice_id`, `amount`, `method` (`cash` / `bank` / `other`), `paid_at`, `received_by`, `note`. This is what makes real udhaar balances and "cash received today" possible — a single `payment_status` column alone could not.

### View `public.invoice_balances` (Phase 3)

`invoices.*` plus `paid_total` and `due_total`, computed live from `payments`. **Every screen reads invoices through this view**, never the raw `invoices` table, so paid/due is always correct.

### Database functions (all `security definer`, `search_path = ''`, granted only to `authenticated`)

- **`create_invoice(customer_id, walkin_name, note, invoice_date, items jsonb, paid, method)`** — the **only** way a bill is created. In one transaction: validates everything (positive quantities, no duplicate items, date not in the future, payment method valid, udhaar requires a customer, buyer ≠ seller NTN), locks and decrements stock row by row (`for update`, in a fixed `inventory_id` order to avoid deadlocks), refuses if any line would oversell, computes the total itself from `quantity × rate` (**never trusts a client-sent total**), inserts the invoice + line snapshots + an optional first payment. If anything fails, **nothing is saved and stock is untouched.**
- **`record_payment(invoice_id, amount, method)`** — adds a later payment (collecting udhaar); refuses more than what's due; updates `payment_status`.
- **`money_summary(day date)`** — returns `sales_total`, `sales_count`, `cash_received`, `udhaar_total`, `udhaar_count` for Home.
- **`report_summary(from date, to date, bucket text)`** (Phase 5, in `05_reports.sql`) — returns everything the Reports page needs in one call: totals, gross profit, money by method, credit given, a day/month bucketed chart series, and top 8 best-selling items by revenue.

### Security (Row Level Security) — **still the Phase 2 placeholder, must be replaced in Phase 8**

- All new tables have RLS on. `anon` has no access.
- **Reading** `invoices`, `invoice_items`, `payments`, `business_profile`: any `authenticated` user, via `using (true)` policies.
- **Writing** invoices/items/payments: **nobody can `INSERT`/`UPDATE`/`DELETE` directly** — all grants on those three tables are revoked except `SELECT`. The **only** way to create a bill or add a payment is through the two `security definer` functions above. This is already more locked-down than the placeholder policies on `inventory`/`customers`, but it is still "any signed-in user may create/collect any bill" — Phase 8 must add real role checks inside those functions (e.g. Counter Staff cannot edit price, Accountant cannot create bills).
- `inventory` and `customers` keep their Phase 1/2 `using (true)` policies, now with **delete protection**: both tables are referenced by `invoices`/`invoice_items` with `on delete restrict`, so a customer or item that has bills **cannot be deleted** at the database level (the screens show a friendly message explaining why — see section 6).

---

## 5. Code layout (repo root must contain `package.json` directly)

```
aksolar-app/
├── middleware.ts
├── package.json / package-lock.json / tsconfig.json / postcss.config.mjs
├── app/
│   ├── globals.css                Theme tokens, .btn/.input/.card classes, animations, PRINT rules (Phase 4)
│   ├── layout.tsx
│   ├── icon.svg
│   ├── page.tsx                   HOME — now also: money cards (Sales/Cash/Udhaar today), New bill tile, Recent bills list
│   ├── login/
│   ├── inventory/                 (unchanged from Phase 1, delete now shows "item is on a bill" message)
│   ├── customers/
│   │   ├── layout.tsx, loading.tsx, page.tsx
│   │   ├── CustomersClient.tsx, CustomerForm.tsx, RegistrationBadge.tsx
│   │   └── [id]/
│   │       ├── page.tsx           now also loads that customer's bills
│   │       ├── CustomerProfile.tsx   now also shows Bills list, Billed/Paid/Balance-due, "New bill" button
│   │       ├── loading.tsx, not-found.tsx
│   ├── sales/                     ★ NEW (Phase 3/4)
│   │   ├── layout.tsx, loading.tsx
│   │   ├── page.tsx, SalesClient.tsx      invoice list: search, All/Udhaar due/Paid tabs, table (desktop) / cards (phone)
│   │   ├── PayBadge.tsx                    small Paid/Part paid/Udhaar/Cancelled tag, used across Sales/Home/Customer/Reports
│   │   ├── new/
│   │   │   ├── page.tsx, NewBill.tsx       the New bill screen (customer picker, item search, qty/rate rows, payment mode, save)
│   │   │   └── loading.tsx
│   │   └── [id]/
│   │       ├── page.tsx, InvoiceDetail.tsx   invoice detail: items, totals, customer, payments list, "Receive payment" sheet
│   │       ├── InvoiceActions.tsx            Print / Download PDF / Share PDF / WhatsApp / Email buttons (Phase 4)
│   │       ├── loading.tsx, not-found.tsx
│   ├── print/                     ★ NEW (Phase 4)
│   │   ├── layout.tsx             bare layout, no sidebar/nav — just the printable page
│   │   └── [id]/
│   │       ├── page.tsx, PrintView.tsx     A4 print view; auto-opens the print dialog when linked with ?auto=1
│   ├── reports/                   ★ NEW (Phase 5)
│   │   ├── layout.tsx, loading.tsx
│   │   ├── page.tsx                today/yesterday/month/quarter/year, cash closing, best sellers, shop snapshot
│   │   └── SalesChart.tsx          plain inline-SVG bar chart, no chart library
│   └── more/                      account, shortcuts (now includes New bill / Udhaar due / Reports), sign out
├── components/
│   ├── nav.ts                     ★ Sales and Reports tabs added. Reports is `desktopOnly: true` (sidebar only — the phone
│   │                                bottom bar stays at Home/Inventory/Customers/Sales/More, 5 tabs max; Reports lives under More on phone)
│   ├── NavLinks.tsx                skips `desktopOnly` items in the bottom bar
│   ├── AppShell.tsx, Sidebar.tsx, TopBar.tsx    TopBar has a "New bill" primary button (desktop)
│   ├── CommandHost.tsx
│   ├── CommandPalette.tsx          ★ Ctrl+K now also searches bills (by number, customer, date) and jumps to /sales/[id];
│   │                                added shortcuts: New bill, Sales, Reports
│   ├── HomeCommandBar.tsx
│   ├── Sheet.tsx, ConfirmDialog.tsx, Toast.tsx, PageHeader.tsx, Skeletons.tsx
│   ├── Avatar.tsx
│   ├── Icons.tsx                  ★ new icons: receipt, printer, download, share, mail, chart, minus
│   ├── SignOutButton.tsx, LogoMark.tsx
├── lib/
│   ├── types.ts                   ★ adds Invoice, InvoiceItem, Payment, BusinessProfile, PaymentMethod/Status types
│   ├── inventory.ts, customers.ts, format.ts, command.ts, speech.ts, formFocus.ts   (unchanged)
│   ├── invoices.ts                ★ NEW — money math (round2/lineAmount, always computed, never typed), parseAmount/parseQty,
│   │                                payment status/labels, Pakistan-time date helpers, invoice search matching, friendly
│   │                                Supabase-error-to-sentence translators (friendlyInvoiceError, friendlyDeleteError)
│   ├── invoiceDoc.ts               ★ NEW — server-only loader: one invoice + its items + payments + business_profile in one call
│   ├── invoiceShare.ts             ★ NEW — builds the plain-text bill for WhatsApp/email, and the wa.me / mailto links
│   ├── pdf.ts                      ★ NEW — the whole PDF writer (see section 6), zero dependencies
│   ├── reports.ts                  ★ NEW — report date-range helpers (today/yesterday/month/quarter/year → from/to/bucket)
│   └── supabase/                  client.ts, server.ts, middleware.ts, lazy.ts   (unchanged)
└── supabase/
    ├── 01_inventory.sql
    ├── 02_customers.sql
    ├── 03_invoices.sql            ★ NEW (Phase 3)
    └── 05_reports.sql             ★ NEW (Phase 5)
```

**Cleanup still pending on GitHub** (safe to delete, confirmed unused): `aksolar-app-phase1.zip` at repo root; `components/CustomerForm.tsx`, `components/CustomersClient.tsx`, `components/RegistrationBadge.tsx`, `components/layout.tsx`, `components/loading.tsx`, `components/page.tsx` (these are wrong-folder duplicates — the real ones live under `app/customers/`).

---

## 6. How the app works today

### Sign-in and security flow — unchanged from Phase 2.

### Home (`/`)
Everything from Phase 2, **plus (Phase 3):**
- **Money cards:** Sales today, Cash received today, Udhaar to collect — from `money_summary()`, real numbers or a "run 03_invoices.sql" hint if the function is missing.
- **New bill** is the first quick tile and a primary hero button.
- **Recent bills** list (last 5), each showing customer, bill number, date, total, due amount and a status tag; empty state offers "Make first bill".

### Inventory (`/inventory`)
Unchanged, **plus:** deleting an item that appears on any bill is refused by the database (`on delete restrict`) and the screen now explains why, suggesting "set quantity to 0 instead."

### Customers (`/customers`, `/customers/[id]`)
Unchanged, **plus (Phase 3):**
- Customer detail page has a **Bills** section: Billed / Paid / Balance-due summary cards and a list of every bill for that customer, each linking to `/sales/[id]`.
- "New bill" button on the customer card, pre-selects that customer on `/sales/new`.
- Deleting a customer who has bills is refused with an explanation (`on delete restrict`).

### Sales — invoice list (`/sales`) — Phase 3
- Search (bill number, customer name/phone, note, date, "21 Sep" style) and tabs **All / Udhaar due / Paid**.
- Desktop: table. Phone: stacked cards. Shows count and total for the current filter, plus "X still due" when relevant.
- Empty state: "Make first bill".

### New bill (`/sales/new`) — Phase 3, the most-used screen
- **Customer:** pick an existing customer (search by name/phone) or leave as walk-in with an optional typed name; "Add new customer" opens the existing Customer form inline without leaving the page.
- **Vehicle / note** field (owner's decision: yes).
- **Items:** type-ahead search across brand/model/type/Ah/W, press Enter or tap to add; quantity stepper + editable rate per line (rate defaults to `sale_price`, editing it shows "Price changed from Rs X"; a rate below cost is flagged); **remove** per line; a line that would oversell is blocked with the exact stock count shown.
- **Bill total panel:** items count, subtotal, a note that tax is "Added when FBR is connected" (Phase 9), and the total — **always calculated in code from `quantity × rate`, the same numbers sent to the database, which recalculates independently and is the final authority.**
- **Payment:** three modes — **Paid in full / Part payment / Udhaar** — with a payment method (cash/bank/other); shows Paid now and Due (udhaar) live; udhaar with no customer selected is refused with a clear message.
- Phone: total + Save bill bar pinned above the bottom tab bar. Desktop: sticky right-hand panel, **Ctrl+S** saves, **Save and print** goes straight to the print view.
- On save, calls `create_invoice()` — the same function used everywhere, so there is exactly one code path that can create a bill.

### Invoice detail (`/sales/[id]`) — Phase 3/4
- Hero card: bill number, date, status tag, total, due amount; **Print / Download PDF / Share PDF (phone) / WhatsApp / Email** buttons (Phase 4, see below).
- Items table, totals (Total / Paid / Still due).
- Customer card (links to their profile if they're a saved customer).
- **Payments** list with a **Receive payment** button (sheet: amount defaults to what's due, "Pay everything due" shortcut, payment method) — calls `record_payment()`.

### Invoice output (Phase 4)

- **Print (`/print/[id]`):** a clean A4 layout with no app chrome, opens the browser's print dialog automatically when reached via "Print" or "Save and print" (`?auto=1`). Works for **any script** (Urdu, English, mixed) because it's rendered by the browser, not converted to a font.
- **Download PDF:** built by `lib/pdf.ts`, a **from-scratch PDF writer with zero external packages** — hand-assembles the PDF byte format directly (objects, xref table, content streams) using the standard Helvetica/Helvetica-Bold fonts with correct character-width tables, manual text wrapping, and automatic multi-page pagination for long bills. The PDF code is dynamically `import()`-ed only when a PDF button is tapped, so it costs nothing on every other page load.
  - **Known limitation:** the standard PDF fonts only cover Latin/ASCII characters. **Non-Latin characters (e.g. Urdu names) are replaced with `?` in the downloaded PDF.** The Print view has no such limitation — for a bill with Urdu text, tell the user to use **Print → Save as PDF** instead of the Download PDF button. This is documented in-app (a hint under the print buttons).
- **Share PDF** (phone only, uses the Web Share API with a file attachment when available; falls back to Download).
- **WhatsApp:** opens `wa.me/<customer phone>` (or a blank chat if no phone saved) pre-filled with a plain-text version of the bill (`lib/invoiceShare.ts`).
- **Email:** opens a `mailto:` link with the same plain-text bill in the body.

### Reports (`/reports`) — Phase 5
- Period picker: **Today / Yesterday / This month / This quarter / This year** (dates computed in Pakistan time via `lib/reports.ts`).
- Hero cards: Total sales, Bills, Money received, Gross profit.
- **Daily cash closing** (for "Today"/"Yesterday") or **Cash and credit** (for longer ranges): billed, received by cash/bank/other, total received, how much of that was collected on *older* bills, and what's still unpaid on bills from this period.
- **Sales chart:** plain SVG bar chart, day-bucketed for a single day (shows the trailing 14 days for context) or day/month-bucketed for longer ranges, with the peak bar labelled.
- **Best sellers:** top 8 items by revenue in the period, with a proportional bar and units sold.
- **Shop right now:** current stock value (at cost and at sale price), current total udhaar to collect (not period-limited — this is a live snapshot), and how many items are currently running low, with quick links to the filtered Sales/Inventory views.
- All numbers come from the single `report_summary()` + `money_summary()` calls — nothing is computed by summing client-side over unfiltered data.
- Reachable from the desktop sidebar; on phone it's under **More** (kept out of the 5-tab bottom bar to match the Phase 2 rule of "≤5 tabs").

### Search / voice box (Ctrl+K)
Unchanged behaviour, **plus (Phase 3):** now also indexes the latest 500 bills and matches by invoice number, customer name, date; jumping to a result opens `/sales/[id]`. Shortcuts list now includes New bill, Sales, Reports.

### Navigation
`components/nav.ts` now has 5 entries: Home, Inventory, Customers, Sales, Reports. Reports is flagged `desktopOnly` so the phone bottom bar still shows exactly Home / Inventory / Customers / Sales / More (Reports reachable from More on phone, from the sidebar on desktop) — this keeps the Phase 2 "only 5 tabs, only real screens" rule intact.

### Design system
**Unchanged** — same tokens, same component classes, same battery-gauge motif, same motion rules. `PayBadge.tsx` (new) reuses the existing badge/tag visual language (green/amber/red) rather than inventing a new one. The Reports chart is drawn with the same `casing`/`sun` colours as the rest of the app, not a chart library's default palette.

### Speed rules
**Still followed:** no new npm packages across Phases 3–5. `lib/pdf.ts` (the heaviest new code, a hand-written PDF writer) is lazy-loaded only inside the button handlers that need it, exactly like the Supabase browser client pattern from Phase 2. Home's first-load JS is still ≈113 kB (measured in this session's build).

---

## 7. Verification status — what was and was not tested

**Tested in this session (22 Sep 2026), before delivery:**
- The **actual SQL** (`03_invoices.sql`, `05_reports.sql`) run against a real local Postgres: `create_invoice()` correctly decrements stock, computes totals server-side, blocks overselling with the exact item name in the error, blocks udhaar without a customer, blocks future dates, blocks duplicate line items, blocks self-billing; a failed call leaves stock and invoice count unchanged (proven with row counts before/after); `record_payment()` blocks over-payment and correctly recalculates `payment_status`; delete protection on customers/inventory confirmed (`on delete restrict` fires); direct `INSERT` into `invoices` as the `authenticated` role confirmed **blocked**; `money_summary()` and `report_summary()` outputs checked by hand against the seeded data.
- **`next build`** (production build, type-checking on) passes cleanly with all new routes listed in the output.
- All new screens exercised in a **real headless browser** (not just read) against a mock Supabase API, at **390px (phone)** and **1280px (desktop)**: Home, Sales list, New bill (including adding items, changing quantity/rate, switching payment mode, and an actual end-to-end save that correctly decremented mock stock and redirected to the new bill), invoice detail (including Receive payment), Reports, Print view — no horizontal overflow found, no console errors other than expected sandbox font-loading noise.
- The **PDF output** was generated and rendered to images to visually check layout, multi-page pagination (tested with 40 line items → correctly split across 2 pages with repeated header/footer), and totals.

**NOT tested — please verify on the live site:**
1. All of the above against the **real** Supabase project and the **real** Vercel deployment.
2. `03_invoices.sql` and `05_reports.sql` have actually been run in the production Supabase project.
3. Real WhatsApp/email share behaviour on actual phones (the links are standards-based `wa.me`/`mailto`, but device-specific app behaviour wasn't tested).
4. PDF download and Share PDF on real iOS/Android devices (Web Share API support varies by browser).
5. Printing to an actual receipt/A4 printer at the shop.
6. Everything listed as not-tested in the Phase 1/2 handoff that's still open (domain/DNS, microphone with real staff voices).

---

## 8. Known limitations and risks (be aware, do not be surprised)

| # | Item | Plan |
|---|---|---|
| 1 | RLS/function checks are "any signed-in user can do everything" (now including creating/collecting bills) | Replace in Phase 8 (database-enforced roles) |
| 2 | Inventory, Customers and Sales lists filter/search in the browser; Sales list caps at latest 1,000 bills, search palette at latest 500 | Fine for the shop's likely volume. Move to server-side search if it grows into the tens of thousands |
| 3 | Bills **cannot be edited or cancelled** yet — `status` supports `Cancelled`/`Edited` in the schema but no screen uses it | Needed before Phase 9 (FBR's 72-hour edit/cancel rules); could also be a small Phase 3.5 if the owner needs it sooner (e.g. a wrong item on a bill) |
| 4 | Downloaded PDF cannot render non-Latin characters (shows `?`) | Print → Save as PDF is the correct workaround today; a proper fix means embedding a Unicode font, which adds real weight — revisit only if the owner needs it |
| 5 | No PWA icons / manifest / service worker | Phase 7 |
| 6 | "Cash received" is not "cash in hand" — no cash book (opening balance, expenses) | Owner decision pending (section 13, still open) |
| 7 | Reports udhaar and stock-value figures are live snapshots, not period-filtered (by design — "how much is currently owed" doesn't have a meaningful "yesterday" version) | Documented in-app; revisit if the owner wants historical udhaar aging |
| 8 | Only one user, no audit log | Phase 8 |
| 9 | No province field on customers/business_profile beyond what Phase 3 added to `business_profile`; customers still lack `province` | Confirm against FBR's Technical Documentation before Phase 9 |
| 10 | Voice search still browser-only, unproven in the shop (carried over from Phase 2) | Test in the shop |

---

## 9. How deployment works here (owner uploads manually on GitHub)

**Unchanged from Phase 2 — same process.** Summary:

1. Unzip locally. Never upload the `.zip` itself.
2. GitHub → repo → branch `main`, top level → **Add file → Upload files** → drag in the folders (`app`, `components`, `lib`, `supabase`) → commit to `main`.
3. **Run any new numbered SQL file(s)** in Supabase → SQL Editor, in order, before or right after the upload.
4. Vercel builds automatically (1–2 min). Wait for **Ready**, hard refresh (Ctrl+Shift+R).
5. If files are uploaded before the SQL is run: **not an error** — affected screens (Sales, Reports, Home money cards) show a "run 0X_....sql" message until you run it, then work after a refresh. Nothing else breaks, no data is lost.

**Same common mistakes to watch for** as Phase 1/2 (`.tsx` vs `.ts`, exact bracket folder names, capitalisation, wrong-folder uploads causing `Module not found`). SQL files are still never run automatically by GitHub/Vercel — always manual, in Supabase, in number order.

---

## 10. Smoke test — run on the live site before starting the next phase

**Phases 1–2** — same checks as before (see section 17 for file locations if something needs fixing).

**Phase 3 (Invoicing)** — after running `03_invoices.sql`
1. Home shows three real money cards (not a setup hint) and a working "New bill" tile.
2. `/sales/new`: search an item that exists in stock, add it, change quantity with +/−, edit the rate — total updates live.
3. Try a quantity above what's in stock: red message, cannot save.
4. Choose **Udhaar** with no customer selected: refused with a message.
5. Pick a real customer, choose **Part payment**, enter an amount less than the total, save: lands on the new bill's detail page; check Inventory — the item's quantity dropped by the right amount.
6. On that bill: **Receive payment** for the remaining balance → status becomes **Paid**.
7. Open that customer's profile: **Bills** section shows the bill with the right Billed/Paid/Balance-due numbers.
8. Try deleting that customer, and try setting that inventory item's quantity to 0 and deleting it: both refused with a clear explanation.

**Phase 4 (Output)**
1. On a bill: **Print** opens the browser print dialog with a clean A4 layout (no sidebar/nav visible).
2. **Download PDF** downloads a real PDF; open it and check the numbers match the bill.
3. On a phone: **Share PDF** opens the native share sheet.
4. **WhatsApp** opens a chat (to the customer's number if saved) with the bill text ready to send. **Email** opens the mail app similarly.

**Phase 5 (Reports)**
1. `/reports` (sidebar on desktop, under More on phone): switch Today / This month / This quarter / This year — numbers change and stay consistent with what's in Sales.
2. The sales chart renders with at least one bar after you've made a bill today.
3. Best sellers lists the items you've actually sold, ranked by revenue.
4. "Shop right now" numbers (stock value, udhaar to collect, low-stock count) match Inventory and Sales.

---

# PART B — WHAT IS LEFT TO BUILD

## 11. Build order and what each phase must contain

One phase = one focused session. Each has a ready-to-paste prompt in section 14.

### ▶ Phase 6 — CSV import / export (NEXT)

**Goal:** let the owner bulk-load stock from a spreadsheet, and export data out for backup/accounting, without touching the database by hand.

- **Inventory CSV import** with a downloadable template matching the exact `inventory` columns (section 4's table, or `01_inventory.sql`); validate every row using the **same rules** the Add/Edit item form already uses (`lib/inventory.ts`) — don't re-implement them; show a clear per-row error summary before committing anything (all-or-nothing import, or a clearly labelled partial-import with a results list — decide and document which).
- **CSV export** for Inventory, Customers, and Invoices (with their items) — useful for the owner's accountant and as an informal backup. Reuse `formatRs`/date helpers only for on-screen previews; raw CSV values should stay plain numbers/ISO dates, not formatted strings.
- **Reuse, don't copy:** phone/CNIC/NTN cleaning and validation already exists in `lib/customers.ts`; inventory validation already exists in `lib/inventory.ts` and `ItemForm.tsx`. Import must call the same functions, not re-implement similar-but-different rules.
- No new npm package should be needed for CSV parsing/writing at this scale (a few hundred to a few thousand rows) — a small hand-written parser is enough and keeps Lighthouse scores intact; only reach for a package if row counts or edge cases (quoted commas, embedded newlines) make that clearly unsafe, and say so explicitly if you do.

### Phase 7 — PWA (installable app)
- `app/manifest.ts` (or `manifest.json`), **PNG icons 192×192 and 512×512** (only an SVG exists now), and a service worker, so "Add to Home Screen" (phone) and "Install app" (desktop Chrome/Edge) work.
- Later, only if a concrete need appears (offline counter sales, barcode camera), wrap with Capacitor for Play Store/App Store. Not now.

### Phase 8 — Roles, database security, audit log
- `roles` table linked to `auth.users`. Roles: **Owner** (everything), **Counter Staff** (create sales/invoices and receive payments only; cannot edit prices; cannot see Reports or Home money cards), **Accountant** (Reports/financials, can view everything; cannot edit inventory or customers).
- **Replace every placeholder `using (true)` policy** — on `inventory`, `customers`, and the read policies on `invoices`/`invoice_items`/`payments`/`business_profile` — with role-based ones, enforced in the database. Also add role checks **inside** `create_invoice()`, `record_payment()`, `report_summary()` and `money_summary()` (these currently trust any authenticated caller).
- `audit_log` table (user, action, table, record id, timestamp, before/after where practical) for every add/edit/delete, including bill creation and payment collection.
- Hide the Home money cards and the Reports tab entirely from Counter Staff (not just visually — the underlying RPCs must also refuse them).
- This is also the natural point to add the bill **edit/cancel** flow mentioned in section 8, item 3, since it needs a defined "who is allowed to cancel a bill" answer.

### Phase 9 — FBR live integration (needs Track B done; see section 12)
Start only when Phase 8 is stable **and** PRAL registration, IP whitelisting and Sandbox access are approved. The invoice/customer schema was **deliberately built FBR-shaped in Phase 3** (snapshotted buyer/seller fields, `hs_code`, `uom`, per-line `sales_tax` fields already present but zeroed, `invoice_type` including `Debit Note`) specifically so this phase is a mapping and connector-building exercise, not a data-model rebuild.
1. Vercel serverless has **no fixed outbound IP.** Build a small connector on a **static-IP host** (a small VPS ≈ Rs 1,500–2,500/month, or an IP-proxy service) that receives an invoice and posts it to FBR's Sandbox `postinvoicedata_sb`.
2. Map our invoice fields to FBR's JSON **exactly**. Use FBR's reference APIs (HS Code, UOM, Rate, Province, SRO items, STATL status) to validate before sending; consider `validateinvoicedata` (pre-check) before `postinvoicedata`.
3. Show FBR error codes clearly in the app (Error Message Guide, sales codes 0002–0302).
4. Run all Sandbox scenarios for the declared business type until a **Production Token** is issued; then switch to the production endpoint.
5. Uses `SUPABASE_SERVICE_ROLE_KEY` server-side only. Auth header: `Authorization: Bearer <Security_Token>`.
6. Implement FBR's edit/cancel rules (72 hours, 10% monthly cancellation cap, line-item-only edits, "E"/"C" marking) — this is also where the Phase 8 `status: Cancelled/Edited` groundwork gets used for real.
7. Even nil-sale periods need a null submission.

### Phase 10 — AI assistant (optional, last)
Unchanged plan from the original document — follow **Propose → Confirm → Execute**:
1. User types/speaks a request in English, Roman Urdu, Urdu script, or mixed.
2. Claude API (server route only, key server-side) returns a **structured proposal** (e.g. `create_bill` with customer/items/quantities/rates/payment) — data, not prose.
3. App validates against real data: items matched to real inventory rows (never invented), customer matched or offered as new, a stated rate overrides default and is marked "price changed", over-stock warned; **totals computed by the app**, exactly like the manual New bill screen already does.
4. Confirmation card (Confirm bill / Edit — Edit opens the real `/sales/new` screen pre-filled).
5. Only on Confirm does it call **the same `create_invoice()` RPC** the manual screen uses — the AI never writes to the database directly.
6. Read-only questions answered without confirmation, respecting the viewer's role (once Phase 8 exists).
7. Log every proposal in an `ai_actions` table.
8. Voice: extend the existing browser mic; must accept Urdu script and mixed text, always show recognised text before acting; test with real staff voices first.
9. Check current Claude model names in Anthropic's docs when building — do not assume names from this document.

### Extra features (after the core, prioritise by what slows counter staff down most)
Barcode/QR labels; purchase/supplier module (landed cost → real profit per item); warranty tracking per sold battery; installment/credit ledger with WhatsApp reminders; solar system quote/proposal builder (separate from retail invoices); WhatsApp Business API auto-send; full Urdu right-to-left UI; link website leads into draft quotes; a proper bill edit/cancel flow if the owner needs it before Phase 8/9; a cash book (opening balance + expenses) if "cash received" isn't enough for the owner.

---

## 12. Track B — FBR / PRAL registration (owner's paperwork, runs in parallel, not code)

**Unchanged from the original document — still not started as far as these project files show. Ask the owner for current status.** See the previous handoff's full text (IRIS status check, static IP, PRAL registration, Sandbox testing, FBR field names, and the edit/cancel rules) — nothing here has changed and it isn't repeated to keep this file shorter; the FBR-shaped schema built in Phase 3 already anticipates the field list.

---

## 13. Owner decisions — status update

From the original list of 12 open questions:

| # | Question | Status |
|---|---|---|
| 1 | Build a `payments` table? | ✅ **Answered: yes — built in Phase 3** |
| 2 | Vehicle/note field on bills? | ✅ **Answered: yes — built in Phase 3** |
| 3 | Who sees money cards once roles exist? | ⬜ **Still open** — needed before Phase 8 |
| 4 | Daily cash book with expenses, or is "Cash received today" enough? | ⬜ **Still open** — Reports currently shows "Cash received", explicitly labelled as not the same as cash in hand |
| 5 | App name — keep "AK Solar"? | ⬜ Still open (low priority) |
| 6 | Full Urdu UI later? | ⬜ Still open |
| 7 | Phones vs counter computer — which to polish first? | ⬜ Still open, though both are built and tested at 390px/1280px |
| 8 | Business nature/sector for FBR | ⬜ Still open — needed for Track B |
| 9 | Static IP solution (ISP add-on / VPS / proxy) | ⬜ Still open — needed for Phase 9 |
| 10 | `shop.akpower.com` DNS finished? | ⬜ Still open — confirm |
| 11 | One or two Supabase projects | Confirmed still separate (unchanged) |
| 12 | Roles needed at launch — Owner only, or Owner + Counter Staff? | ⬜ Still open — needed before Phase 8 |

**New question from Phase 3–5:**
13. Bills currently **cannot be edited or cancelled** at all. Is that acceptable until Phase 8/9, or is a lightweight "cancel a bill" (with stock restored) needed sooner as a small Phase 3.5?

---

## 14. Ready-to-paste prompts (one per session; start each in a NEW conversation)

**How to start any phase:** on GitHub press **Code → Download ZIP** (latest repo). In a new chat upload that ZIP + **this file**. Then paste the prompt. End each request with: *"Give me only new or changed files (with full paths), not the whole zip. Keep the same UI style and don't add new libraries unless you clearly explain why one is needed."*

**Phase 6 (next):**
> "Read the attached AK-Solar-Complete-Project-Status.md and the repo zip. Phases 0–5 are done (Inventory, Customers, Invoicing, Print/PDF/Share, Reports). Build Phase 6: CSV import for Inventory (with a downloadable template) using the existing validation in `lib/inventory.ts`/`ItemForm.tsx`, and CSV export for Inventory, Customers and Invoices. Reuse existing validation code, don't duplicate it. Keep the same UI style, avoid new npm packages unless truly necessary (explain why if you add one). Give me only new or changed files with full paths."

**Phase 7:**
> "Convert the app into an installable PWA: manifest, 192 and 512 PNG icons, service worker, so it installs on phone and desktop. Do not break Lighthouse scores."

**Phase 8:**
> "Add roles (Owner, Counter Staff, Accountant) with a roles table linked to Supabase Auth. Replace every placeholder `using (true)` RLS policy with role-based policies enforced in the database, and add the same role checks inside `create_invoice`, `record_payment`, `report_summary` and `money_summary`. Counter Staff: sales and payments only, no price edits, no Reports or Home money cards (hide the tab and refuse the RPC). Accountant: full read access and Reports, no inventory/customer editing, cannot create bills. Add an `audit_log` table recording user, action, table, record and time for every add/edit/delete. My answers to the owner questions in section 13: [WRITE ANSWERS HERE]."

**Phase 9 (only after Track B is approved):**
> "Build an FBR Digital Invoicing connector. It takes a saved invoice (already FBR-shaped from Phase 3) and posts it to FBR's Sandbox `postinvoicedata_sb` using the Bearer security token, from our static-IP host [VPS/proxy: specify]. Map our fields to FBR's JSON exactly [paste the field list and sample JSON from the Technical Documentation]. Show FBR error codes clearly in the app. Implement the 72-hour edit/cancel rules and 10% monthly cancellation cap using the `status: Cancelled/Edited` fields already in the schema. Service-role key stays server-side only."

**Phase 10:**
> "Add the AI assistant to the search box using the Claude API from a server route, following Propose → Confirm → Execute exactly as in section 11. It must return a structured create_bill proposal that the app validates against real inventory and customers (never invented), compute totals in code, show Confirm bill / Edit, then call the existing `create_invoice` RPC — the same one the manual New bill screen uses. Log every proposal in an `ai_actions` table. Accept English, Roman Urdu and Urdu script. Reuse the existing microphone button, always show recognised text before acting. Check current Claude model names in Anthropic's documentation before building."

---

## 15. Rules for whoever continues (developer or AI)

Unchanged from the original document — still the operating rules for this project:

1. Build **one phase at a time**; keep the app deployable after every phase.
2. **Reuse existing patterns and design tokens.** Don't introduce a second visual style. Don't add UI libraries or icon packs.
3. **New sections:** add a folder under `app/`, a `layout.tsx` using `AppShell`, and an entry in `components/nav.ts`. Only add a tab when the screen exists. Use `desktopOnly: true` in `nav.ts` if the phone bottom bar would exceed 5 tabs (see how Reports was added in Phase 5).
4. **New tables:** enable RLS, grant carefully (Phase 3 shows the pattern of revoking direct write access and forcing writes through a `security definer` function when data integrity matters — e.g. stock decrement — not just for every table), add `updated_at` and the `set_updated_at()` trigger, save the SQL as the next numbered file in `supabase/`, and tell the owner to run it in the Supabase SQL Editor **before or right after** the GitHub upload.
5. **JSX files end in `.tsx`.** Never export a constant from a `"use client"` file and import it into a server component — put shared constants in a plain `.ts` file.
6. Use `await getBrowserClient()` inside handlers; don't import the browser Supabase client at the top of page components.
7. **Never put the service-role key or the Claude API key in client code or in GitHub.**
8. **Never show placeholder or made-up numbers.** Real data or nothing. Empty states must say what to do next.
9. **Compute all money in code, and have the database recompute and verify it independently** for anything that changes stock or creates a financial record (this is exactly what `create_invoice()` does — never trust a client-sent total, even one the app itself calculated, for something this important).
10. Keep Next.js and TypeScript on their pinned major versions unless upgrading is the task itself.
11. **Acceptance for every screen:** works at 390px (phone) and 1280px (desktop) with no sideways scrolling; buttons easy to tap; visible keyboard focus and readable contrast; no numbers that aren't real; no tabs that lead nowhere; money uses `formatRs()` and tabular numerals; `next build` passes; committed and deployed; smoke test done.
12. Write UI text in short, plain sentences, sentence case, verb-first buttons. Errors say what happened and what to do next — reuse/extend `friendlyInvoiceError`/`friendlyDeleteError` in `lib/invoices.ts` for new database-error translations rather than inventing a new pattern.
13. When delivering code to the owner, follow section 9 (only changed files, full paths, note any SQL to run and any file that must be deleted).
14. When a new record type can be deleted while other tables reference it (like invoices referencing customers/inventory), use `on delete restrict` at the database level and make sure the screen's error message explains why in plain language — don't just let a raw database error reach the owner.

---

## 16. Glossary (shop words used in the UI)

| Word | Meaning |
|---|---|
| **Udhaar** | Credit sale; money a customer still owes |
| **Khata** | A customer's account / ledger |
| **Bill** | Sale invoice (printed and FBR copies are titled "Sale Invoice") |
| **Cash received** | Payments taken today, cash or transfer — **not** the same as cash in hand (see section 8, item 6) |
| **FBR** | Federal Board of Revenue (tax authority) |
| **PRAL** | Pakistan Revenue Automation Ltd — the free licensed integrator for FBR Digital Invoicing |
| **IRIS** | FBR's taxpayer portal |
| **NTN / CNIC** | Business tax number (7 digits) / national ID (13 digits) |
| **HS code** | Goods classification code, format `####.####` |
| **UOM** | Unit of measure (FBR's list, case-sensitive) |
| **Lac / Cr** | 100,000 / 10,000,000 |
| **RLS** | Row Level Security — database-level access rules in Supabase |
| **RPC** | Remote Procedure Call — a database function called from the app (e.g. `create_invoice`), used here so business rules are enforced in one place, not scattered across screens |
| **PWA** | Progressive Web App |
| **LCP / TBT / CLS** | Lighthouse speed measures |

---

## 17. Quick "where do I find…" index

| I want to… | Look at |
|---|---|
| Add a nav tab | `components/nav.ts` |
| Change colours / buttons / animations / print CSS | `app/globals.css` |
| Add an icon | `components/Icons.tsx` |
| Change customer rules (phone, CNIC/NTN) | `lib/customers.ts` |
| Change stock rules (low stock, specs text) | `lib/inventory.ts` |
| Change money formatting | `lib/format.ts` |
| Change invoice/payment math, dates, search, error text | `lib/invoices.ts` |
| Change how one bill is loaded (server) | `lib/invoiceDoc.ts` |
| Change the WhatsApp/email bill text | `lib/invoiceShare.ts` |
| Change the PDF layout | `lib/pdf.ts` |
| Change report date ranges | `lib/reports.ts` |
| Change the New bill screen | `app/sales/new/NewBill.tsx` |
| Change the invoice detail screen | `app/sales/[id]/InvoiceDetail.tsx` |
| Change Print/PDF/Share buttons | `app/sales/[id]/InvoiceActions.tsx` |
| Change the print layout | `app/print/[id]/PrintView.tsx` |
| Change the Reports page | `app/reports/page.tsx`, `app/reports/SalesChart.tsx` |
| Change the invoice-creation business rules (stock, totals, validation) | `supabase/03_invoices.sql` → function `create_invoice` |
| Change the payment-collection rules | `supabase/03_invoices.sql` → function `record_payment` |
| Change what Reports calculates | `supabase/05_reports.sql` → function `report_summary` |
| Change the search / voice box | `components/CommandPalette.tsx`, `lib/speech.ts` |
| Change the Home screen | `app/page.tsx` |
| Change login redirect / auth rules | `lib/supabase/middleware.ts` |
| Database setup, in run order | `supabase/01_inventory.sql` → `02_customers.sql` → `03_invoices.sql` → `05_reports.sql` |

*End of document. If anything here conflicts with an older document (Plan, Build Instructions, UI Redesign, previous Handoff versions), this file is the most recent and correct for the project's current state.*

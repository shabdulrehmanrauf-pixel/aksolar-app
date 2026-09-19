# AK Solar App — Developer Handoff & Status

**Business:** Al Karam Battery and Solar ("AK Solar")
**Status date:** 19 September 2026
**Companion documents:** `AK-Solar-App-Plan.md` (full scope and FBR reasoning), `AK-Solar-Build-Instructions.md` (phase-by-phase build order)

This file answers three questions for the next developer: **what is already built, how it is set up, and what to build next.**

---

## 1. Summary

| Phase | Scope | Status |
|---|---|---|
| 0 | Project foundation: repo, Vercel, Supabase, login | **Done** |
| 1 | Inventory module (add / view / edit / delete, search, low-stock) | **Done** |
| 2 | Customers | Not started |
| 3 | Invoicing core (FBR-shaped data) | Not started |
| 4 | Invoice print / PDF / share | Not started |
| 5 | Dashboard and reports | Not started |
| 6 | CSV import / export | Not started |
| 7 | PWA (installable app) | Not started |
| 8 | Roles and access, audit log | Not started |
| 9 | FBR live integration | Not started (needs Track B) |
| 10 | AI assistant | Not started (optional, last) |

**Track B (owner paperwork: IRIS, PRAL, static IP)** runs in parallel and is not code. Its status is not recorded here. Confirm with the owner.

### What was verified and what was not

- **Verified (in a test environment):** the production build (`next build`) passes with type-checking. Unauthenticated visits redirect to `/login`. The login page and the Inventory screen (table, mobile list, add/edit form, validation errors) render correctly with sample data.
- **Not verified by the author:** login and add/edit/delete against the **real** Supabase project, and the live Vercel deployment. Run the smoke test in section 8 before building on top of Phase 1.

---

## 2. Stack and hosting

| Piece | Choice |
|---|---|
| Framework | Next.js **15.5.x** (App Router), React 19, TypeScript 5.9 |
| Styling | Tailwind CSS **v4** (`@tailwindcss/postcss`; theme tokens in `app/globals.css`) |
| Database and auth | Supabase (Postgres, Auth email/password, Row Level Security) |
| Supabase client | `@supabase/supabase-js` + `@supabase/ssr` (cookie-based sessions) |
| Hosting | Vercel (auto-deploys on every commit to `main`) |
| Repo | GitHub: `shabdulrehmanrauf-pixel/aksolar-app`, branch `main` |
| Fonts | Barlow and Barlow Condensed via `next/font/google` |

**Separate from the marketing website.** The public site (`akpower.pk` / `akpower.com`, repo `akpower_nextjs`) is a different Vercel project. Do not merge the codebases.

**Planned URL:** `shop.akpower.com` (a subdomain, not `/shop` or `/admin`). Vercel domain entry and a DNS `CNAME` record at the DNS provider are required. **Confirm this is finished**: the Vercel project was deleted and re-imported during setup, so the CNAME value may differ from the first one shown.

### Version pins (deliberate)

- **Next.js is pinned to 15.x.** Next 16 renames `middleware.ts` to `proxy.ts`. Upgrade later as its own task.
- **TypeScript is pinned to 5.x.** TypeScript 7 exists but has not been checked with this Next version.
- `package-lock.json` is committed so Vercel installs the same versions that were tested.

---

## 3. Environment variables

Set in **Vercel → Project → Settings → Environment Variables** (type **Config**; both values are public by design):

| Name | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase Project URL (`https://xxxx.supabase.co`) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase **anon / publishable** key |

Notes:

- `NEXT_PUBLIC_*` values are **baked in at build time**. After changing them, **redeploy**.
- If they are missing, the middleware returns a plain-text "Setup needed" message instead of crashing.
- **Do not** use the `service_role` / secret key in this app yet. When Phase 9 needs it (server-side only), add it as `SUPABASE_SERVICE_ROLE_KEY` (**no** `NEXT_PUBLIC_` prefix) and never import it in client code.

---

## 4. Supabase setup (done once)

1. New Supabase project (separate from any website data).
2. Ran `supabase/01_inventory.sql` in the SQL Editor (safe to re-run).
3. Created the owner user under Authentication → Users (Auto Confirm ticked).
4. **Public sign-ups turned off** (Authentication → Sign In / Providers → "Allow new users to sign up" off).

Step 4 matters: the current RLS policies let **any signed-in user do everything**, so nobody unknown may be able to create an account.

### Table: `public.inventory`

| Column | Type | Notes |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `category` | text | check: `battery`, `panel`, `accessory` |
| `brand`, `model` | text, not null | |
| `type` | text | Batteries: Lithium / Tubular / Lead-acid / Dry. Panels and accessories: free text with suggestions |
| `voltage` | numeric(6,2) | batteries |
| `plates` | integer | batteries |
| `ah_rating` | numeric(8,2) | batteries |
| `wattage` | integer | panels |
| `warranty_months` | integer | |
| `cost_price`, `sale_price` | numeric(12,2), not null | `>= 0` |
| `quantity` | integer, not null | `>= 0` (database blocks negative stock) |
| `reorder_level` | integer, not null | `>= 0` |
| `hs_code` | text | optional, check `^[0-9]{4}\.[0-9]{4}$` (FBR format) |
| `uom` | text, not null | default `'Numbers, pieces, units'` (FBR UOM is case-sensitive) |
| `created_by` | uuid | `auth.uid()` default |
| `created_at`, `updated_at` | timestamptz | `updated_at` maintained by trigger `set_updated_at()` |

Extras beyond the original Phase 1 field list: `wattage`, `warranty_months`, `hs_code`, `uom`. They were added so Phase 3 (invoice items) can copy tax fields straight from inventory without a schema change.

### Security (RLS)

- RLS enabled on `inventory`. `anon` has no access. `authenticated` has select / insert / update / delete via four policies (`using (true)`).
- **This is a placeholder.** Phase 8 must replace it with role-based policies (Owner / Counter Staff / Accountant).

---

## 5. Code layout

```
aksolar-app/
├── middleware.ts                 Runs on every page request; delegates to lib/supabase/middleware.ts
├── package.json / package-lock.json / tsconfig.json / postcss.config.mjs
├── app/
│   ├── globals.css               Tailwind v4 theme tokens + .btn / .input component classes
│   ├── icon.svg                  Favicon
│   ├── layout.tsx                Fonts, metadata (noindex: private app), viewport
│   ├── page.tsx                  Redirects "/" to "/inventory"
│   ├── login/
│   │   ├── page.tsx              Login screen (server component)
│   │   └── LoginForm.tsx         Email/password sign-in (client)
│   └── inventory/
│       ├── layout.tsx            Wraps the section in AppShell
│       ├── page.tsx              Server-side fetch of inventory; friendly error if table missing
│       ├── InventoryClient.tsx   Filters, table + mobile list, delete dialog, toast
│       ├── ItemForm.tsx          Add/Edit side panel, validation, save
│       └── StockGauge.tsx        Battery-shaped stock indicator
├── components/
│   ├── AppShell.tsx              Header + auth check (redirects to /login if no user)
│   ├── NavLinks.tsx              Nav list. ADD NEW SECTIONS HERE (see LINKS array)
│   ├── SignOutButton.tsx
│   └── LogoMark.tsx
├── lib/
│   ├── types.ts                  Category and InventoryItem types
│   ├── inventory.ts              Categories, type lists, isLow/isOut, spec text
│   ├── format.ts                 formatRs() -> "Rs 45,000"
│   └── supabase/
│       ├── client.ts             Browser client
│       ├── server.ts             Server client (async cookies())
│       └── middleware.ts         Session refresh + redirect rules
└── supabase/
    └── 01_inventory.sql          Database setup (run in Supabase SQL Editor)
```

### File naming rule (caused a failed deploy once)

Any file containing JSX **must** end in `.tsx`. During setup `components/AppShell.ts` was uploaded without the "x", which broke the Vercel build. Files in `lib/` and `middleware.ts` are plain `.ts`.

---

## 6. How it works

### Auth flow

- `middleware.ts` refreshes the Supabase session cookie on each request.
- Not signed in and not on `/login` → redirect to `/login`. Signed in and on `/login` → redirect to `/inventory`.
- `AppShell` checks `getUser()` again on the server as a second layer.
- There is **no sign-up page**. Users are created by the owner in the Supabase dashboard.

### Inventory behaviour

- The page fetches on the server (ordered by brand, then model). `InventoryClient` filters in the browser (fine for hundreds of items; revisit if the list reaches thousands).
- Writes (insert / update / delete) use the **browser** Supabase client, protected by RLS. After each write the page calls `router.refresh()`.
- **Low stock** means `quantity <= reorder_level` (this includes out of stock). The gauge is red when low, green otherwise; a full gauge is about 3× the reorder level.
- Form rules: brand and model required; battery type required; prices up to 2 decimals; quantity and reorder level whole numbers ≥ 0; HS code (if entered) must match `####.####`; UOM required. A warning (not a block) shows if sale price is below cost.
- Fields not relevant to a category (for example plates on a panel) are saved as `null`.

### Design system

- **Colours** (Tailwind theme tokens): `casing #1c2b33` (dark header), `plate #eef0ec` (page background), `line #d3d8d2`, `lead #5a686e` (secondary text), `sun #f5b400` (primary buttons), `terminal #c23b2e` (warnings and delete), `cell #2e7d4f` (healthy stock), `focus #1d5fd0` (keyboard focus ring).
- **Type:** Barlow (body), Barlow Condensed (headings and big numbers).
- **Signature element:** the battery gauge (login screen artwork and stock indicator).
- **Component classes:** `.btn`, `.btn-primary`, `.btn-quiet`, `.btn-danger`, `.btn-sm`, `.input`.
- Layout is responsive; the inventory table becomes a stacked list on phones. Keep new screens consistent with this.

---

## 7. Setup and deploy notes (how this project was published)

- Code was uploaded through the **GitHub website** (no command line). Repo root must contain `package.json` directly (not inside a sub-folder).
- Vercel imported the repo; framework preset **Next.js**; Root Directory empty.
- Every commit to `main` triggers a build. Vercel showed "No Deployment" at first and the project was deleted and re-imported before it built.
- **Cleanup to check:** an accidental `aksolar-app-phase1.zip` was uploaded to the repo root. Delete it if it is still there.
- Local development (optional): `npm install`, create `.env.local` with the two variables above, `npm run dev`.

---

## 8. Smoke test (run before Phase 2)

1. Vercel → Deployments: latest deployment is **Ready**.
2. Open the live URL: login page appears.
3. Sign in with the owner account.
4. Add a battery (for example Osaka 200Ah Tubular, cost 42000, price 45000, quantity 2, reorder level 3). It should show a red **Low** tag.
5. Edit it (change quantity to 10): the tag disappears.
6. Search for it, then use the category tabs and the Low stock button.
7. Delete it; confirm it disappears.
8. Sign out, then try opening `/inventory` directly: it must redirect to `/login`.
9. In Supabase → Authentication, confirm public sign-ups are off.

---

## 9. What to build next

Follow the phase order in `AK-Solar-Build-Instructions.md`. **One phase per session; test, commit, deploy, then continue.** Notes below are suggestions from Phase 1 experience.

### Phase 2 — Customers

- Table `customers`: id, name, phone, address, `registration_type` (Registered / Unregistered), `cnic_or_ntn`, created_at (add `updated_at` and the same trigger).
- List with search (name / phone), add/edit form, detail page with an empty "Invoices" placeholder.
- Add "Customers" to the `LINKS` array in `components/NavLinks.tsx`, and create `app/customers/layout.tsx` using `AppShell` (same pattern as inventory).
- Validate CNIC (13 digits) and NTN (7 digits), digits only, matching the FBR rules in the Plan document, section 8.
- Reuse the inventory patterns: server fetch, client filter, side-panel form, `.btn` / `.input` classes, RLS policies for `authenticated`.

### Phase 3 — Invoicing core (most important to get right)

- Tables `invoices` and `invoice_items` with FBR-shaped fields (see Build Instructions Phase 3 and Plan section 8).
- **Snapshot** item fields onto `invoice_items` (name, HS code, UOM, rate, sale type) at sale time. Do not rely on live inventory values for old invoices.
- **Stock decrement must be atomic.** Do invoice + items + stock update in one Postgres function (RPC) or transaction, so a failed save never leaves stock wrong. The `quantity >= 0` check already blocks overselling at the database level.
- **Deleting inventory items** will conflict with invoice history once `invoice_items.inventory_id` exists. Decide between restricting deletes (foreign key `on delete restrict`) or an `is_active` flag (soft delete) and adjust the Inventory delete button accordingly.
- Invoice numbering: unique and sequential; consider a database sequence.
- Apply FBR validation rules (date `YYYY-MM-DD` and not in the future, decimals, HS code format, buyer ≠ seller registration number).
- Do **not** call FBR in this phase.

### Phase 4 — Invoice output

- Print view, PDF download, WhatsApp and email sharing. Choose a PDF approach that works on Vercel serverless (client-side PDF generation or a library such as `@react-pdf/renderer`).

### Phase 5 — Dashboard and reports

- Monthly sales, stock value (`sum(cost_price × quantity)`), receivables, low-stock count, daily sales chart, daily cash-closing.

### Phase 6 — CSV import / export

- Inventory import with a downloadable template matching the columns in section 4. Validate rows with the same rules as `ItemForm.tsx` (share the validation code rather than copying it).

### Phase 7 — PWA

- Add `app/manifest.ts` (or `manifest.json`), **PNG icons at 192×192 and 512×512** (only an SVG icon exists now), and a service worker.

### Phase 8 — Roles and audit

- `roles` table linked to `auth.users`; roles Owner, Counter Staff, Accountant.
- **Replace the placeholder RLS policies** on every table with role-based ones. Enforce in the database, not only by hiding buttons.
- `audit_log` table (user, action, table, record id, timestamp) for add / edit / delete.
- Counter Staff must not edit prices or see reports; Accountant must not edit inventory.

### Phase 9 — FBR integration (needs Track B first)

Start only when Phase 3 is stable **and** PRAL registration, IP whitelisting and Sandbox access are approved.

- Vercel serverless has no fixed outbound IP, so the FBR connector needs a **static-IP host** (small VPS or IP-proxy service) that receives an invoice and posts it to FBR `postinvoicedata_sb` (Sandbox), then production.
- Uses `SUPABASE_SERVICE_ROLE_KEY` server-side only (see section 3).
- Handle FBR error codes and show clear messages in the app. Follow the cancellation and edit rules in Plan section 8 (72-hour window, 10% cap).

### Phase 10 — AI assistant (optional, last)

- "Propose → Confirm → Execute" pattern: the AI only proposes a structured action; the existing tested functions run only after explicit user confirmation. Read-only queries need no confirmation. Log every proposal.

### Owner-side (Track B) checklist

1. Check the IRIS "Digital Invoicing" status.
2. Arrange a static public IP (ISP add-on or small VPS).
3. Prepare technical details (business nature and sector, technical contact, software name "AK Solar App", software type Cloud).
4. Register with PRAL as Licensed Integrator, submit technical details and the IP for whitelisting.

### Open decisions (from the Plan, section 11)

- Business nature and sector to declare with FBR (likely Retailer + Service Provider).
- PRAL as integrator (recommended, free).
- Static IP solution (VPS vs proxy).
- Final app subdomain (`shop.akpower.com` planned).
- One Supabase project or two for website and app.
- Which user roles are needed at launch.

---

## 10. Rules for whoever continues

1. Build **one phase at a time**; keep the app deployable after each.
2. Reuse existing patterns and design tokens; don't introduce a second visual style.
3. New sections: add a folder under `app/`, a `layout.tsx` using `AppShell`, and a link in `NavLinks.tsx`.
4. New tables: enable RLS, grant only to `authenticated`, add `updated_at` and the `set_updated_at()` trigger, and save the SQL as a numbered file in `supabase/` (`02_customers.sql`, `03_invoices.sql`, ...).
5. JSX files end in `.tsx`.
6. Never put the service-role key in client code or in GitHub.
7. Keep Next.js and TypeScript on their pinned major versions unless upgrading is the task itself.

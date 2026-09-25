# How I'd Build a Shop-Management App (Like AK Solar) — Complete Phase Plan

**Purpose of this document:** a reusable, professional, time-saving procedure for building shop/retail-business management apps — inventory, customers, invoicing, reports, offline support, and optional AI assistant — the same category as AK Solar. Written so you can follow it for every new client, not just this one app.

I reviewed your AK Solar project files (Next.js 15 + Supabase + Dexie, phases 0–10, RLS-secured invoice functions, offline sync design). It's a strong, professionally structured build. This plan captures the approach that's already working for you, cleans it up into a repeatable playbook, and adds the pieces that matter most once you start **reselling and customizing it for other shop owners**.

---

## 0. Core Principle: One Phase Per Session, Never "Build the Whole App"

This is the single most important lesson your own project already proves (see your Build Instructions). Apps like this fail or become unmaintainable when built in one giant pass. The professional approach:

1. Build **one phase**.
2. Test it standalone.
3. Deploy it (Git push → auto-deploy).
4. Run any new SQL migration.
5. Confirm it works with real data.
6. Only then start the next phase.

This also makes the app **sellable in stages** — you can demo a working Phase 3 to a client while Phase 6 is still in progress, and you can quote clients per-phase instead of one scary lump sum.

---

## Phase 0 — Foundation (½–1 day)

**Goal:** a deployable skeleton with login, before any business logic exists.

- Repo (GitHub), hosting (Vercel or similar), database (Supabase: Postgres + Auth + Row Level Security).
- Pin your stack versions and commit the lockfile — don't let a client's Vercel build silently upgrade Next.js/React mid-project.
- Email/password auth, sign-ups disabled by default (private business tool, not a public app).
- Environment variables split correctly: `NEXT_PUBLIC_*` for anon/public keys only; service-role keys stay server-side, never in the repo.
- Empty app shell: sidebar/bottom nav, top bar, a placeholder Home screen.

**Recommendation:** keep a `.env.local.example` and a short `SETUP.md` in every project from day one — this is what turns "a project only you understand" into "a product you can hand off or resell."

---

## Phase 1 — Inventory / Stock

**Goal:** the single source of truth for what the shop has.

- CRUD: add/edit/delete/search items.
- Low-stock indicator (a gauge or badge, not just a number — owners scan visually, they don't read numbers).
- Every table gets `created_by`, `created_at`, `updated_at` from the start — you will need audit history later (Phase 8), and it's painful to retrofit.
- Decide unit-of-measure and category fields now; retrofitting them after invoices exist is expensive.

**Time-saving tip:** build inventory before customers. Customers is simpler and mostly copy-paste from the inventory CRUD pattern once it exists.

---

## Phase 2 — Customers

**Goal:** who owes money, who buys regularly.

- CRUD + search + a customer detail page (purchase history, balance).
- CNIC/NTN and registered/unregistered buyer type fields — required later for tax compliance (FBR/GST-style invoicing), so capture them from day one even before you build the tax phase.

---

## Phase 3 — Invoicing Core (the phase that makes or breaks the app)

**Goal:** create a bill without ever corrupting stock or money.

This is where most amateur builds fail, and it's where your AK Solar approach is genuinely correct. The pattern to always use:

- **One database function does the whole transaction** (e.g. `create_invoice()`), never client-side multi-step writes. Inside it:
  - Validate everything server-side (positive quantities, no duplicate line items, date not in the future, payment method valid, credit sales require a named customer).
  - Lock and decrement stock **row by row, in a fixed order**, to avoid deadlocks with concurrent sales.
  - Refuse the whole transaction if any line would oversell.
  - **Compute the total from `quantity × rate` inside the database — never trust a total sent from the browser.**
  - Insert the invoice, line-item snapshots, and first payment together, atomically.
- **Snapshot, don't reference, at sale time.** Line items store their own description/price/tax at the moment of sale, so editing an inventory item later never changes a historical invoice.
- Support partial payment / credit ("udhaar") as a first-class concept via a separate `payments` table, not a single status column — this is the only way "cash received today" and "amount still owed" stay accurate.
- Read screens from a **view** that joins invoices with a live-computed paid/due total, not the raw table.

**Why this matters for resale:** every shop owner's #1 fear is "will it let someone sell stock I don't have, or lose track of who owes money." Getting this phase right, and being able to explain *why* it's safe, is your strongest sales pitch.

---

## Phase 4 — Invoice Output (Print / PDF / Share)

- A4 print view, PDF download, and share-to-WhatsApp are the three formats shop owners actually use — build all three, not just PDF.
- A hand-written/lightweight PDF generator (no heavy dependency) keeps bundle size and build times down; only reach for a PDF library if the client needs complex layouts (logos, multi-language, barcodes).
- Keep the print/PDF template as one shared function fed by the same invoice data used on-screen — don't maintain two versions of "what an invoice looks like."

---

## Phase 5 — Reports

- One database function that returns everything a Reports page needs in a single call (totals, profit, cash vs. credit split, a chart-ready series, top sellers) — minimizes round trips, which matters a lot on shop-floor wifi/3G.
- A simple inline chart (no charting library) is enough for 90% of shop owners; only add a real charting library if a client specifically wants drill-down/export.
- Always include a **cash-closing** report — this is the report owners check every single day, more than any other.

---

## Phase 6 — Import/Export (CSV)

- Let owners bulk-import their existing Excel stock list on day one of onboarding — this removes the single biggest adoption barrier ("I don't want to re-type 400 items").
- Export should match the import format exactly, so it round-trips.

---

## Phase 7 — PWA (Installable App)

- Manifest + service worker + offline fallback page.
- This phase should come **before** offline data sync (Phase 7.5 below) — get "installs like an app, opens instantly" working first, then layer data behind it.

---

## Phase 7.5 — Offline-First Data Sync

**Goal:** shop keeps working when the internet drops (very common in areas with unreliable power/internet).

- Local database (IndexedDB via a wrapper like Dexie) mirroring the core tables, plus a `pending_sync` queue (table, record id, action, payload, timestamp, synced flag).
- **Last-write-wins** conflict resolution is enough for 1–3 devices per shop — don't over-engineer this with CRDTs unless a client has many simultaneous counters.
- Small, honest "Synced / Syncing… / Offline" status badge — owners trust the app more when it's visibly honest about its state.
- Keep this as **its own isolated session/phase** — never mix it with a feature phase, since sync bugs are hard to debug if new business logic changed in the same commit.

---

## Phase 8 — Roles, Permissions & Audit Log

- Move from "any signed-in user can do anything" to real roles: Owner / Counter Staff / Accountant (or equivalent per client).
- Enforce roles **inside the database functions**, not just by hiding UI buttons — a hidden button is not security.
- Add an audit log table now if you haven't already; owners ask for "who changed this price" constantly once staff are involved.

**This phase is a major upsell** when reselling — most shop owners start as a single user and only realize they need staff-role separation after 2–3 months of live use. Sell it as a natural "Phase 2 of your subscription," not something they should have paid for upfront.

---

## Phase 9 — Tax/Compliance Integration (e.g. FBR, GST, VAT depending on country)

- Do the **paperwork/registration track in parallel** with earlier dev phases, not after — it usually has the longest lead time (government approval, static IP, digital invoicing enrollment) and should never block your dev schedule.
- Keep tax fields (rate, registration type, buyer NTN/CNIC) in the schema from Phase 2–3 onward so this phase is "turn on real values" rather than "add new columns to a live table with data in it."
- Treat this as a distinct, carefully tested phase — tax integrations are the one place where a bug has legal/financial consequences, not just a bad user experience.

---

## Phase 10 — AI Assistant (Optional, Last)

- Natural-language actions ("bill 2 batteries to Ali Khan") are a genuine differentiator for a shop app, but should be the **last** phase — it depends on every other data model being stable.
- Keep AI-proposed actions as **proposals the human confirms**, never auto-committed writes — especially for anything touching stock or money.
- Server-side API key only; rate-limit it; log what it did.

---

## Cross-Cutting Practices (apply to every phase, every client build)

| Practice | Why |
|---|---|
| Database functions own business logic, not the frontend | Frontend code is easy to bypass (browser devtools); the database is the real security boundary |
| Snapshot data at transaction time | Historical invoices/records must never silently change when a linked record is edited later |
| `on delete restrict` on anything referenced by a financial record | Stops "delete a customer/item that has invoices" data-integrity bugs before they happen |
| One phase, one focused session, test → deploy → confirm → next | Keeps scope controlled and gives you a natural billing/demo checkpoint per client |
| Keep dependencies minimal | Faster builds, fewer breaking upgrades, easier to hand off to another developer later |
| A single "status/handoff" doc per project, updated after every phase | This is what makes a project resumable by you, a teammate, or an AI assistant months later — exactly what your own `AK-Solar-Complete-Project-Status.md` already does well |

---

## Turning This Into a Product You Resell (since you customize it per shop)

This is the part worth thinking about deliberately, since you're not just building one app — you're building a **template business**.

1. **Extract a clean "core" template** once AK Solar is fully done: inventory, customers, invoicing, reports, PWA, offline sync, roles — with the battery/solar-specific modules (battery services, scrap) clearly separated as optional add-on modules, not hard-coded into the core.
2. **Configuration over code, per client.** Business name, logo, currency, tax rules, invoice numbering format, and module toggles (does this shop need "scrap" or "charging services"?) should live in a settings table/screen, not require you to edit code for every new customer.
3. **Standard phase-based pricing.** Since you already build phase-by-phase, sell it that way: a fixed price for "Core" (Phases 0–7), then priced add-ons for Offline (7.5), Roles (8), Tax integration (9), AI Assistant (10). Clients self-select what they need and you reuse the same codebase for all of them.
4. **One multi-tenant option vs. one-deploy-per-client option.** Decide this early — multi-tenant (one Supabase project, `shop_id` on every table, shared codebase) is cheaper to maintain at scale; one-deploy-per-client is simpler to secure and easier to fully customize per business but multiplies your hosting/maintenance overhead. Given you're doing bespoke customization per shop owner right now, one-deploy-per-client is the right starting point — revisit multi-tenant once you have 8–10+ similar clients.
5. **A short onboarding checklist per new client**: business profile fields, initial CSV import of their stock, first admin login, WhatsApp/print test, and a 15-minute walkthrough call. This single checklist prevents most support tickets in week one.
6. **Keep a changelog/status doc per client deployment**, exactly like your `AK-Solar-Complete-Project-Status.md` — when a client calls six months later asking for a change, you want to open one file and know exactly where things stand, not re-read the whole codebase.

---

## Suggested Timeline (Solo Developer, Reasonably Experienced)

| Phase | Realistic time |
|---|---|
| 0 – Foundation | 0.5–1 day |
| 1 – Inventory | 1–2 days |
| 2 – Customers | 1 day |
| 3 – Invoicing core | 3–5 days (the phase to not rush) |
| 4 – Print/PDF/Share | 1–2 days |
| 5 – Reports | 1–2 days |
| 6 – CSV import/export | 1 day |
| 7 – PWA | 1 day |
| 7.5 – Offline sync | 2–3 days |
| 8 – Roles + audit | 2–3 days |
| 9 – Tax integration | Highly variable — paperwork-dependent, budget 1–2 weeks of dev time plus government lead time |
| 10 – AI assistant | 2–4 days |

**Core (Phases 0–7), first sellable version:** roughly 2–3 focused weeks for one developer. This is a realistic quote to give a new shop-owner client for a first working version.

---

## Recommended Reading Order for a New Developer/AI Assistant Joining Mid-Project

This mirrors what you've already set up well in `MDF_IELES/` — keep doing this for every client:

1. One "Complete Project Status" file — current phase, what's done, what's next, deliberate stack pins.
2. One "Build Instructions" file — the phase list and the one-phase-per-session rule.
3. Per-feature instruction files only when a feature is complex enough to need its own doc (offline sync, UI redesign) — don't split every small feature into its own file, or the docs become as hard to navigate as the code.

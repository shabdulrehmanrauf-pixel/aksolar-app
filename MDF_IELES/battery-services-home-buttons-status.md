# AK Solar App — Home "Claim" / "Charging" buttons + hand-over details

**Status date:** 22 September 2026
**Covers:** `app/page.tsx`, `app/battery-services/BatteryServicesClient.tsx`,
`app/battery-services/ChargingHandoverForm.tsx`, `lib/types.ts`,
`supabase/07_charging_handover.sql`.

This builds on top of the existing Battery services feature (see
`battery-services-status.md` in this same folder) — nothing here replaces
that, it only adds to it.

---

## Where to find it in the app

- **Home screen** now has two more quick-action tiles, next to the existing
  six: **Claim** and **Charging**.
- Tapping **Claim** opens `/battery-services?tab=claims` — a screen showing
  *only* claims.
- Tapping **Charging** opens `/battery-services?tab=charging` — a screen
  showing *only* charging jobs.
- Opening Battery services any other way (Sidebar, phone's More tab, or the
  "Batteries currently in the shop" card on Inventory) still gives the full
  combined screen with both tabs, exactly as before — that path did not
  change.

---

## What's built now

### 1. Home screen tiles
`app/page.tsx` — two new entries in the quick-actions grid:

| Tile | Links to |
|---|---|
| Claim | `/battery-services?tab=claims` |
| Charging | `/battery-services?tab=charging` |

### 2. Focused "solo" dashboards
`app/battery-services/BatteryServicesClient.tsx` reads the `tab` URL
parameter. When it's `claims` or `charging`, the screen drops into a
single-purpose view:

- Only that one stat card is shown (see below) — not both.
- The Charging jobs / Battery claims tab switcher is hidden — there's only
  one thing to look at, so nothing to switch between.
- The header shows only the one relevant action button: **New claim**, or
  **New charging slip**.
- The list below shows only that kind of record.

No form pops up automatically on arrival — you land on the dashboard first,
and only tapping "New claim" / "New charging slip" opens the form.

### 3. Stock summary cards
Shown at the top of both the solo and the combined views:

- **In shop for charging** — a live count of charging jobs currently
  `in_shop`.
- **Claimed batteries in stock** — a live count of claims still physically
  held (`received`, `sent_to_distributor`, or `approved`), broken down by
  who's holding each one: "With us", or the distributor's name once it's
  been sent off.

Both counts update on their own — nothing to maintain. A battery drops out
of "In shop for charging" the moment it's marked collected or unclaimed; a
claim drops out of "Claimed batteries in stock" once it reaches
`given_to_customer`, `settled`, or `rejected`.

### 4. Charging hand-over details (new)
Marking a charging job **Mark collected** now opens a small form
(`ChargingHandoverForm.tsx`) instead of an instant one-tap action. It asks
for:

- **Amount received** — pre-filled with the slip's price, editable.
- **Note** (optional).
- **Charged fine** or **Turned out faulty** — required.

Saving calls a new database function, `record_charging_handover`, which
marks the job `collected`, stamps `collected_at`, and stores the outcome,
amount and note. The job's row then shows a "Charged fine" / "Was faulty"
tag plus the amount and note.

**"Mark unclaimed" is unchanged** — still a single tap, no form, since there's
no hand-over to record when the customer never came back for it.

Claims already had an equivalent step — the existing **Move status** button
(which already includes an optional note) covers "delivered back to the
customer" for claims, so nothing new was needed there.

---

## Database change required

Run **`supabase/07_charging_handover.sql`** once in Supabase → SQL Editor
before using "Mark collected." It only *adds* things — new columns on
`charging_jobs` (`outcome`, `handover_amount`, `handover_note`) and a new
function (`record_charging_handover`) — it doesn't touch or replace
anything from the original battery-services migration.

**Note:** this project's export doesn't include `supabase/06_battery_services.sql`
— the migration that originally created `charging_jobs`, `battery_claims`,
and the other battery-services functions. The app clearly already has it
applied (it calls those functions successfully), it's just not saved in
this folder. Worth pulling a copy from Supabase's SQL Editor into the
project so there's a backup of it alongside `07_charging_handover.sql`.

---

## What's left (not built, on purpose)

- A dedicated way to edit or correct a hand-over after it's saved (right
  now, once "Mark collected" is submitted, the amount/note/outcome aren't
  editable from the UI).
- Showing the hand-over outcome (charged/faulty) anywhere in reports — it's
  only visible on the job's own row right now.
- Everything already listed as "not built yet" in `battery-services-status.md`
  (manage distributors, manage price list, automatic unclaimed rule,
  WhatsApp share, claim history timeline) is still not built — unchanged by
  this update.

# AK Solar App — Battery Charging Slips + Battery Claims

**Status date:** 22 September 2026
**Covers:** `supabase/06_battery_services.sql`, `lib/chargingJobs.ts`, `lib/batteryClaims.ts`,
`lib/types.ts`, plus the new screens added in this update.

---

## Where to find it in the app

There was no button anywhere for this before — that was the bug you ran into. It's fixed now.
Open it from any of these:

| Where | What you'll see |
|---|---|
| **Desktop sidebar** (left side, always visible) | A new "Battery services" link, under Reports |
| **Phone: bottom bar → More** | A new "Battery services" tile, under Low stock |
| **Search / ⌘K** (the search box or mic icon) | Type "battery" — jumps straight there |
| **Inventory page** | A "Batteries currently in the shop" card near the top, once at least one charging job or claim exists — tapping it also goes to Battery services |

The screen itself is at **`/battery-services`**. It has two tabs:

- **Charging jobs** — button **"New charging slip"** (top right) to take in a customer's own
  battery for charging.
- **Battery claims** — button **"New claim"** (top right, next to it) to take in a battery sold
  by you that's being sent back to the distributor under warranty.

Saving either one takes you straight to its **print preview** and opens the print dialog
automatically, the same way "Save and print" works on a sale bill. You can always reprint later
from the "Slip" button on each row.

---

## What's built now

### Charging jobs
- "New charging slip" form: pick a saved customer or enter walk-in name/phone, battery
  brand/model/number, price (tap a suggested price from `charging_price_list`, or type your own),
  note, date received.
- List of all charging jobs, searchable by slip number, customer or battery. Shows status and
  flags anything past its 3-day due date as **Past due**.
- **Mark collected** / **Mark unclaimed** buttons on any job still `in_shop`.
- Printable slip (`/print/charging/[id]`) headed "Battery Charging Slip — Not a tax invoice",
  with the standard shop terms (3-day pickup, shop hours) printed on every copy.

### Battery claims
- "New claim" form: customer/walk-in, battery brand/model/number, optional link to the original
  sale bill (search by bill number or customer name), distributor (pick from the list or type a
  brand-new one on the spot), claim amount and extra charges (both optional, both separate),
  note, date received.
- List of all claims, searchable, showing status and which distributor currently has the
  battery.
- **Move status** button walks a claim forward: `received → sent to distributor → approved /
  rejected → given to customer → settled`. Asks for a distributor only when you send it off (and
  lets you type a new one there too, same as on the form).
- Printable slip (`/print/claim/[id]`) headed "Battery Claim Slip — Not a tax invoice", showing
  the distributor and original bill when there is one.

### Inventory page
- New "Batteries currently in the shop" card: how many are in for charging, how many are out on
  claim, and a breakdown by distributor. Reads the `battery_stock_summary` and
  `battery_claims_by_distributor` views from your SQL — nothing new to set up.

### Everywhere else
- Neither slip type is ever written to `invoices` or shown anywhere near FBR/PRAL data — they're
  fully separate tables, exactly as the SQL comments describe.
- Every write still goes through your `create_charging_job` / `update_charging_job_status` /
  `create_battery_claim` / `update_battery_claim_status` functions — nothing bypasses them.

---

## What's left (not built yet, on purpose)

Nothing here is required to start using the feature — these are the "nice to have next" items:

- **Manage distributors screen** — right now a new distributor can only be added by typing its
  name on the claim form or the status-move form (which the database already supports). A
  dedicated list screen to edit a distributor's phone/address, or delete one, doesn't exist yet.
- **Manage charging price list screen** — the quick-pick prices on the New Charging Slip form
  (e.g. "Car battery", "UPS / Lithium") come from `charging_price_list`, but there's no screen to
  add/edit/delete those rows yet — for now that's done directly in the Supabase table editor.
- **Automatic "unclaimed" rule** — marking a charging job unclaimed is still a manual button tap.
  There's no automatic reminder or rule for how many days past due before it should flip. Your
  plan doc flagged this as an open decision — let me know the rule you want and I'll add it.
- **WhatsApp/share button on the slips** — the print pages have Print (and Save as PDF via the
  print dialog), same as bills, but not yet a dedicated "Send on WhatsApp" button like the
  invoice print page has.
- **Claim history detail view** — the list shows the current status, but not a full timeline of
  every status change on one screen (the dates are all stored — `sent_to_distributor_at`,
  `approved_at`, etc. — just not displayed as a timeline yet).

None of the above needs a database change — same as before, they're all just screens or small
additions on top of what already exists.

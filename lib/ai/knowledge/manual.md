## What this app is
AK Solar's own shop app — inventory, customers, billing, reports, battery
services and scrap, for the owner and counter staff. Works on phone and
desktop, installable as an app (PWA), and keeps working with no internet
(offline mode) — changes made offline sync automatically once back online.

## Where things are
- **Home** — today's sales, cash received, udhaar to collect, recent bills, a New bill button.
- **Inventory** — every battery, panel and accessory: name, spec, quantity, sale price. Add new items here; low/out-of-stock flagged.
- **Customers** — customer list; each customer's page shows their bills, total billed, paid, and balance due (udhaar).
- **Sales** — every bill ever made; search by bill number, customer, phone, date; tabs for All / Udhaar due / Paid.
- **New bill** (`/sales/new`) — the main screen for making a sale.
- **Reports** — sales, cash closing, best sellers, current stock value and udhaar, for Today/Yesterday/This month/quarter/year.
- **Battery services** — charging slips (customer's own battery brought in for charging) and battery claims (a battery you sold going back to the distributor under warranty).
- **Scrap** — old batteries taken in exchange, tracked and later sold by weight.
- **Assistant** — this chat. Can look up real stock, customer and scrap numbers and prepare (not save) a bill, item, customer, scrap battery, scrap sale, charging slip or battery claim for you to confirm.
- **More** (phone) / sidebar (desktop) — shortcuts to everything above, plus Install app and Sign out.

## How to make a sale (New bill)
1. Open New bill. Pick a saved customer (search by name/phone) or leave as walk-in (optional name). "Add new customer" saves one without leaving the page.
2. Search and add items by brand/model/type/Ah/W; set quantity; rate defaults to the item's sale price (editing it shows "price changed").
3. Choose payment: **Paid in full**, **Part payment**, or **Udhaar** (credit) — udhaar needs a saved customer, not a walk-in.
4. Save. The total is always calculated from quantity × rate and checked again by the database — it's never just typed in.
5. From the saved bill: Print, Download PDF, Share, WhatsApp or Email it. For bills with Urdu names, use Print → Save as PDF (the Download PDF button can't show non-Latin letters — Print has no such limit).

## Udhaar (credit) and payments
Udhaar is money a customer still owes on a bill. A customer's page and the Sales list both show what's due. Open a bill and tap **Receive payment** to record cash coming in against it — this doesn't need a new bill.

## Inventory basics
Add a new item with brand, model, type, spec (Ah/watts), cost price, sale price and starting quantity. Existing items can only be edited from the Inventory screen itself (open the item → Edit) — quantity and price can't be changed by asking the assistant. An item that's been sold on any bill can't be deleted (set its quantity to 0 instead).

## Battery services
- **Charging jobs**: take in a customer's battery for charging, print a slip, mark it collected (or unclaimed) later. Flags anything left more than 3 days.
- **Battery claims**: send a sold battery back to its distributor under warranty; status moves received → sent to distributor → approved/rejected → given to customer → settled.

## Scrap
Old batteries taken in (from customers or trade-ins) are logged, then sold later by weight; the screen tracks what's in stock and what's been sold.

## Offline mode
If the internet drops, the app keeps working from what's already loaded on that device: you can still view stock/customers/bills and create new invoices, add stock, add customers. A status dot shows Online / Offline (changes saved locally) / Syncing / All synced. Offline changes are per-device — stay online for a minute or two after a busy offline stretch so everything syncs before switching devices or closing the app for the day.

## Words used in the app
- **Udhaar** — money a customer still owes (credit).
- **Khata** — a customer's account/ledger.
- **Bill** — a sale invoice.
- **Cash received** — payments taken today; not the same as cash physically in the drawer.

## What the assistant itself can and can't do
It can answer questions using real numbers (never guesses), and it can **prepare** a bill, a new stock item, a new customer, an old battery for the scrap pile, a scrap sale, a charging slip or a battery claim — but never saves anything itself. A person always checks the card it shows and taps Confirm before anything is actually created. For a scrap sale it needs the batch numbers (or the whole pile), the buyer, the total weight and the rate per kg; for a charging slip it needs the price you state; a claim only needs the battery, and the bill number, distributor and amounts are optional. It cannot edit or delete a bill, change an existing item's price/stock, edit a customer, change a charging slip, or move a battery claim to its next status — those are done from their own screens (Inventory, Customers, Sales, Scrap, Battery services).

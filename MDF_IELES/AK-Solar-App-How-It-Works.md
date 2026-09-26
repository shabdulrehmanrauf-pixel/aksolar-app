# AK Solar — Shop Management System
## Complete "How It Works" Reference: Every Button, Every Screen, How They Connect

This document maps the entire app screen-by-screen and button-by-button, based on the actual code in the project. It's written so a non-technical reader (or a new staff member) can understand exactly what happens when they tap anything in the app.

---

## 1. The Big Picture

The app is one system with **12 connected areas**, all reachable from a **Dashboard (Home)** screen:

```
                              ┌───────────────┐
                              │   LOGIN        │
                              │ (email +       │
                              │  password)     │
                              └───────┬────────┘
                                      │
                                      ▼
                          ┌───────────────────────┐
                          │   HOME / DASHBOARD     │
                          │ (today's numbers,      │
                          │  quick actions, alerts) │
                          └───────────┬───────────┘
              ┌───────────┬───────────┼───────────┬──────────────┐
              ▼           ▼           ▼           ▼              ▼
        ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌───────────┐ ┌───────────┐
        │Inventory│ │  Sales & │ │Customers│ │ Suppliers │ │ Purchases │
        │         │ │ Invoicing│ │  (CRM)  │ │           │ │           │
        └─────────┘ └──────────┘ └─────────┘ └───────────┘ └───────────┘
              ▼           ▼           ▼           ▼              ▼
        ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌───────────┐ ┌───────────┐
        │ Payments│ │ Expenses │ │ Reports │ │  Battery  │ │   Scrap   │
        │         │ │          │ │         │ │ Services  │ │ Trade-In  │
        └─────────┘ └──────────┘ └─────────┘ └───────────┘ └───────────┘
                                      ▼
                              ┌───────────────┐
                              │ AI ASSISTANT   │
                              │ (type or speak,│
                              │ then confirm)  │
                              └───────────────┘
```

Every screen is reachable from three places (they all point to the **same** screens — nothing is duplicated):
- **Desktop:** a left **Sidebar** listing all 12 areas.
- **Phone:** a **bottom bar** with 5 slots (Home, Inventory, **+**, Sales, More) — everything else lives one tap under **More**.
- **Anywhere:** the **Command Palette** (keyboard search, opened with `Ctrl/Cmd + K`) and, on phone, the **voice/typed search** in it too.

---

## 2. How You Move Around the App (Navigation Wiring)

### 2.1 Desktop sidebar
Every one of the 12 areas has its own icon in the sidebar, always visible, in this fixed order:
`Home → Inventory → Customers → Sales → Suppliers → Purchases → Payments → Expenses → Reports → Battery Services → Scrap → Assistant`

Tapping any icon takes you straight to that screen. The currently-open screen is highlighted with a gold left-edge bar.

### 2.2 Phone bottom bar (only 5 slots, by design)
Phones only get 5 icons because more would be cramped. The decision was:

| Slot | Icon | Goes to |
|---|---|---|
| 1 | Home | `/` — the Dashboard |
| 2 | Inventory | `/inventory` — stock list |
| 3 (center, raised) | **+** | Opens the **Quick Actions sheet** (see 2.3) — not a page, a popup menu |
| 4 | Sales | `/sales` — all bills |
| 5 | More | `/more` — every other screen, one tap away |

### 2.3 The "+" Quick Actions sheet (phone only)
Tapping the center **+** button slides up a menu with 5 direct shortcuts:
- **New bill** → `/sales/new` (sell to a customer)
- **Receive stock** → `/purchases/new` (buy from a supplier)
- **Make payment** → `/payments/new` (pay a supplier)
- **Add expense** → `/expenses?add=1` (log rent, salary, fuel, etc.)
- **Add customer** → `/customers?add=1` (save a new customer)

This is the fastest way to *do* something without hunting through menus.

### 2.4 The "More" screen (phone only — everything not on the bottom bar)
`More` is a plain list of every remaining shortcut, each with an icon and a one-line explanation:

| Button | Where it goes | What it's for |
|---|---|---|
| Assistant | `/assistant` | Ask about stock, sales or customers in plain language |
| New bill | `/sales/new` | Make a sale and take payment |
| Udhaar to collect | `/sales?filter=due` | Bills that are not fully paid |
| Receive stock | `/purchases/new` | Record a new purchase bill |
| Make payment | `/payments/new` | Pay a supplier |
| Suppliers | `/suppliers` | Who you buy from, and what you owe them |
| Purchase bills | `/purchases` | Stock received, by supplier |
| Payments | `/payments` | Every payment made to suppliers |
| Add expense | `/expenses?add=1` | Log a cost |
| Expenses | `/expenses` | Every business expense, by category |
| Customers | `/customers` | Every saved customer |
| Reports | `/reports` | Sales, cash closing, best sellers |
| Add item | `/inventory?add=1` | Add a battery, panel or accessory |
| Add customer | `/customers?add=1` | Save a new customer |
| Low stock | `/inventory?filter=low` | Items that need reordering |
| Battery services | `/battery-services` | Charging slips and warranty claims |
| Scrap | `/scrap` | Old batteries taken in exchange |

This screen also shows **who is signed in** (top card) plus an **Install App** button and **Sign out** button at the bottom.

### 2.5 Command Palette (`Ctrl/Cmd + K`, any device)
A search box that jumps anywhere instantly, or finds a specific item, customer, or bill by typing (or speaking, using the microphone icon) things like *"Osaka 200Ah"*, *"Ali Khan"*, or an invoice number. Typing nothing shows a "Jump to" list of the same 8 core destinations as the sidebar.

---

## 3. Home / Dashboard — What Every Card Does

The Home screen is the app's control center. Everything on it is a live link — nothing is decoration.

| What you see | Tapping it goes to | Shows |
|---|---|---|
| **Hero header** (greeting + today's date) | — | Stock value, items running low, customer count, worth at sale price |
| **"New bill" button** (hero, tablet/desktop) | `/sales/new` | Starts a new sale |
| **"Add customer" button** (hero) | `/customers?add=1` | Opens the add-customer form |
| **Sales today** card | `/sales` | Today's total sales + bill count |
| **Cash received today** card | `/reports?range=today` | Today's cash-in |
| **Udhaar to collect** card | `/sales?filter=due` | Bills not yet fully paid |
| **Low-stock banner** | `/inventory?filter=low` | Every item at/below its reorder level |
| **13 Quick Action tiles** (grid) | Each tile's own screen | New bill, Sales, Purchases, Stock, Customers, Suppliers, Payments, Expenses, Add item, Add customer, Claim, Charging, Scrap |
| **Running low list** (up to 5 items) | Tapping an item → `/inventory?q=<item name>` | Search pre-filled to that exact item |
| **Recent customers list** (last 5) | `/customers/<id>` | That customer's full profile |
| **Recent bills list** (last 5) | `/sales/<id>` | That invoice's full detail |

**Key idea:** every number on the Home screen is a doorway, not just a statistic — tapping it always lands you on the filtered list that explains that number.

---

## 4. Module by Module — What Each Screen Does and Wires To

### 4.1 Inventory (`/inventory`)
- Search box: **"Search brand, model or type"**.
- Filter chip: **by type** (Lithium / Tubular / Lead-Acid / Dry / Panel / Accessory, etc.).
- **Add item** button → opens a form: brand, model, type, voltage/plates/Ah/wattage (whichever apply), cost price, sale price, quantity, warranty, reorder level.
- Tapping any item → its own page showing **Stock history** (every addition/removal, and why — sale, purchase, adjustment).
- **Low-stock filter** (`?filter=low`) is the same list the Home page's low-stock banner links to.
- Every sale (Sales & Invoicing) **auto-decreases** this stock. Every purchase (Purchases) **auto-increases** it. Nothing here is edited by two different screens in conflicting ways — Inventory is the single source of truth for stock count.

### 4.2 Sales & Invoicing (`/sales`, `/sales/new`, `/sales/<id>`)
- **`/sales`** — list of all bills, with a filter for **due (udhaar)** bills specifically.
- **`/sales/new`** (**"New bill"**) — pick a customer (or add one on the spot), add line items pulled live from Inventory (stock auto-decrements the moment the bill is saved), choose **cash or credit (udhaar)**, and save.
- **`/sales/<id>`** (an open bill) has an **Actions** row wired to:
  - **Print** → opens `/print/<id>` (a print-ready invoice layout)
  - **Download PDF** → generates and downloads a PDF of the invoice
  - **Share PDF** → opens the phone's native share sheet (WhatsApp, email, Drive, etc. — whatever the phone offers)
  - **WhatsApp** → opens WhatsApp directly with the bill details pre-filled to send
- A bill with an old battery taken in part-exchange automatically creates a row in **Scrap** — no separate re-entry.
- A bill that isn't fully paid shows up in **Payments/Udhaar** and in the Home page's "Udhaar to collect" card until it's settled.

### 4.3 Customers (`/customers`, `/customers/<id>`)
- Search box: **"Search name, phone or CNIC"**.
- **Add customer** form: name, phone, address, and **registration type** (Registered/Unregistered + CNIC or NTN — this is the field the FBR tax-invoicing feature will use).
- Tapping a customer → their full profile: every bill they've ever been given, total billed, total paid, current balance due, and contact details — **one search shows everything**, exactly as planned (no jumping between screens to piece together a customer's history).

### 4.4 Suppliers (`/suppliers`, `/suppliers/<id>`)
- Search: **"Search name, phone or NTN/CNIC"**.
- Each supplier's page shows: total bought from them, total paid, current balance owed, and every purchase bill and payment tied to them.
- Directly linked to **Purchases** (what you bought from them) and **Payments** (what you paid them).

### 4.5 Purchases (`/purchases`, `/purchases/new`, `/purchases/<id>`)
- **"Receive stock"** is the same action as **Purchases → New**: pick or add a supplier, add products (existing inventory items or brand-new products), enter cost, freight, discount — saving it **increases Inventory stock automatically**.
- Every purchase bill can be **paid in full, partly paid, or cancelled**; unpaid amounts show as "still owed" and flow into the Suppliers balance and the Payments module.

### 4.6 Payments (`/payments`, `/payments/new`)
- **"Make payment"** records money paid **to a supplier** — either against a specific purchase bill or as a general on-account payment. Method (cash/bank/etc.), reference number, and notes are captured.
- This is what clears (or reduces) a supplier's "still owed" balance shown on the Suppliers screen.
- *(Note: this is the outgoing side — money you pay suppliers. Money customers pay you is tracked inside each Sales bill, as cash-received vs. udhaar.)*

### 4.7 Expenses (`/expenses`)
- **"Add expense"** logs running costs — rent, salaries, fuel, utilities — by category, amount, date, method, and who was paid.
- Feeds directly into the **Reports → Gross profit** figure (sales minus cost of goods minus expenses).

### 4.8 Battery Services (`/battery-services`)
Two focused sub-areas, opened either together or directly:
- **Charging jobs** (`?tab=charging`) — a customer's battery is in the shop for charging; tracks battery details, price, and status until it's picked up.
- **Claims** (`?tab=claims`) — a warranty claim on a battery, tracking the distributor it's recovered from and the money involved.
- Arriving from the Home page's "Claim" or "Charging" quick-action tiles jumps straight into that one tab only (a focused, single-purpose screen); arriving from More/Sidebar shows both tabs with a switcher.

### 4.9 Scrap Trade-In (`/scrap`)
- **Two tabs:** *Batches in stock* (old batteries collected, not yet sold) and *Sales* (scrap already sold, by weight, to a buyer/kabari).
- **Add to scrap** — manually log an old battery received (separate from a sale's trade-in, which is added automatically).
- **Sell [n] selected** — select one or more batches in stock and record a scrap sale: buyer name/phone, weight, rate, total.

### 4.10 Reports & Dashboard (`/reports`)
- A period switcher: **Today / Yesterday / This month / This quarter / This year**.
- Headline numbers: **Total sales, Bills, Money received, Gross profit.**
- **Best sellers** — top items by revenue and quantity sold, for the chosen period.
- **Cash book** — every payment method's movement for the period (for end-of-day reconciliation, exactly as planned in the original spec).

### 4.11 AI Assistant (`/assistant`)
A chat screen where you type — or tap the microphone and speak — a plain request, such as *"add 20 Osaka 200Ah tubular batteries at 45,000 each"* or *"what does Bilal Furniture owe us?"*.

**How it actually works, step by step (this is the safety design from the project plan, and it's built exactly as planned):**
1. You type or speak a request.
2. The assistant turns it into a **proposal card** — a plain-language summary of exactly what it's about to do (add stock, create a bill, add a customer, log a charging slip, etc.) — and shows it back to you. **Nothing is saved yet.**
3. You get three choices on the card: **Confirm** (save it for real), **Edit** (send you to the matching form with the details pre-filled, e.g. `/sales/new`, so you can adjust before saving), or **Cancel** (discard it, nothing changes).
4. Only when you tap **Confirm** does the app actually write the change — using the *exact same* save function as the matching manual form. The AI itself never touches the database directly.
5. Read-only questions (*"what's my stock of Osaka 200Ah?"*, *"does Ali Khan owe anything?"*) get answered directly, with a small **"Looked up: stock / customers / scrap"** note showing where the answer came from — no confirmation needed, since nothing is being changed.

### 4.12 Login & Security (`/login`)
- Sign-in is **email + password**, set up for each staff member by the shop owner (no self-signup) — matching the planned Owner/Staff/Accountant roles model.
- Signing out is available from the **More** screen.

---

## 5. Sharing & Printing — Where It's Wired

Every document type in the app (invoice, purchase bill, payment receipt, charging slip, scrap sale, warranty claim) has its own **print-ready page** under `/print/...`, and the same **Print / Download PDF / Share PDF / WhatsApp** action row shown in section 4.2 for invoices:

| Document | Print route |
|---|---|
| Sales invoice | `/print/<id>` |
| Purchase bill | `/print/purchase/<id>` |
| Payment receipt | `/print/payment/<id>` |
| Charging slip | `/print/charging/<id>` |
| Warranty claim | `/print/claim/<id>` |
| Scrap sale | `/print/scrap/<id>` |

On a phone, **Share** opens the native share sheet (so it can go to WhatsApp, email, or anywhere else the phone offers); on desktop it downloads the PDF instead.

---

## 6. Works Offline, Syncs Automatically

The app keeps a copy of your data on the device itself. If the internet drops:
- You can keep creating bills, adding stock, and saving customers as normal — every change is queued on the device.
- A small status badge shows **Offline / Syncing / Synced / Error** at all times, so you always know the state.
- The moment the connection comes back, everything queued is sent to the server automatically, oldest change first — nothing needs to be re-entered.

---

## 7. One Action, Many Places Updated (Why It's "One System")

This is the part that makes it a real business system rather than a set of separate forms — one action updates every screen that needs to know about it:

- **Saving a sales bill** → decreases Inventory stock, adds to today's Sales/Reports totals, updates the customer's balance (if udhaar), and (if a battery was traded in) creates a Scrap entry — all from one save.
- **Saving a purchase bill** → increases Inventory stock, updates the supplier's balance owed, and appears in Purchases and (once paid) Payments.
- **Making a payment** → reduces a supplier's balance owed, and shows in that supplier's profile and the Payments list.
- **Confirming an AI Assistant proposal** → runs through the exact same save logic as the matching manual screen, so it updates everything that screen would have.

---

*This document reflects the app exactly as built in the current codebase (AK Solar / AK Power shop management system). If new screens or buttons are added later, this map should be updated alongside them.*

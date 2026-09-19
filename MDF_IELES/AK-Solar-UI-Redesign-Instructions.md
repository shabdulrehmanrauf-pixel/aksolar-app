# AK Solar App — UI Redesign Instructions (Mobile + Desktop)

**Based on:** the owner's reference mockup (an AI-generated phone screen called "Hisaab") and the current app (Phase 0 and Phase 1 are live).
**Read with:** `AK-Solar-Handoff-Status.md` (what exists), `AK-Solar-Build-Instructions.md` (phase order), `AK-Solar-App-Plan.md` (scope, FBR).

Same working rule as before: **one step = one focused session**. Test, commit, deploy, then continue. Each step below has a ready-to-use prompt.

---

## 1. What the owner wants

An app that feels like the mockup:

- A **Home screen** with three or four money numbers at the top, a red "items running low" strip, and a big **type-or-speak box** where you can say "Ali Khan ko 2 battery AGS 100Ah 15,500 wali aur 1 charger 800 ka, bill bana do" and get a bill to confirm.
- A row of **quick-action tiles** (New bill, Stock, Customers, Udhaar khata, Reports, Add item).
- **Bottom navigation on phones.** A **proper desktop version** for the counter computer.

## 2. Recommendation in one paragraph

Take the mockup's **structure**, keep our **look** and keep **forms as the source of truth**. The assistant box is a shortcut on top of the normal screens (as already decided in the Plan, section 6), never a replacement: staff must always be able to make a bill by tapping, and the AI only ever **proposes**; a person confirms. Build the new shell and Home now (cheap, because only Inventory exists), fill the money numbers as invoices arrive, and switch on the AI in Phase 10.

| Take from the mockup | Change or skip |
|---|---|
| Home with number cards, low-stock strip, quick tiles | Its pale-blue "generic app" colours. Keep the AK Solar palette (dark slate, solar yellow, battery gauge) |
| Bottom nav on phone (Home, Inventory, Sales, Customers, More) | Showing tabs for screens that don't exist yet |
| Type-or-speak box with bill confirmation card | Chat feed as the whole Home. Use a command box plus one confirmation card |
| Roman Urdu shop words (Udhaar, Khata) | Full Urdu right-to-left UI (later, only if wanted) |
| "Confirm bill / Edit" step | Anything that lets the AI write to the database directly |

## 3. Do not copy these mistakes from the mockup

The image was made by an image generator and contains errors. Build from the requirements below, not from the picture.

1. **Wrong line items.** The typed sentence says 2 batteries at 15,500 and 1 charger at 800, but the bill card lists "Suzuki Cultus" twice. It should read: AGS 100Ah battery x 2 = 31,000; Charger x 1 = 800; **Total 31,800**. (The 31,800 total in the picture happens to be right; the rows are not.)
2. **A vehicle name was used as a product.** "Vehicle" is a customer or bill detail, not an item.
3. This is exactly why the assistant must **match every item against the real inventory** and **calculate totals in code**, never trust the AI's arithmetic or invented names.
4. **"Cash in Hand" is not a number we can calculate yet.** It needs opening balance, expenses and payments received (a cash book). Until that exists, show **"Cash received today"** (from payments).
5. **Everyone sees the money cards.** Sales, cash and udhaar totals must be **Owner/Accountant only** once roles exist (Phase 8). Counter staff see New bill and low stock.

## 4. Design system (keep what is built)

Do not restyle from scratch. Reuse the tokens in `app/globals.css`:

| Token | Hex | Use |
|---|---|---|
| `casing` | `#1c2b33` | Sidebar, top bar, login art |
| `plate` | `#eef0ec` | Page background |
| `sun` | `#f5b400` | Main action button (one per screen) |
| `terminal` | `#c23b2e` | Low stock, danger, delete |
| `cell` | `#2e7d4f` | Healthy stock, success |
| `lead` / `line` | `#5a686e` / `#d3d8d2` | Secondary text / borders |

- Fonts: Barlow (text), Barlow Condensed (headings and big numbers).
- Keep the **battery gauge** motif (`StockGauge.tsx`) for stock levels; it is the app's signature.
- Money numbers use Barlow Condensed, tabular numerals, `Rs 48,500` format (`formatRs()`).
- Buttons on phone: at least 44px tall. Inputs: 16px text (stops iPhone zoom).
- Keep visible keyboard focus, and respect reduced motion (already in `globals.css`).
- Quick-action tiles: **one calm style** (white tile, dark icon, label under it). Do not give every tile a different bright colour like the mockup; colour is reserved for meaning (red = problem, yellow = main action, green = OK).
- The mockup's brand name "Hisaab" is only a placeholder. Keep **AK Solar** unless the owner decides otherwise.

## 5. Navigation

Breakpoint: below `lg` (1024px) = phone/tablet layout; `lg` and above = desktop layout.

**Phone / tablet**

```
+------------------------------+
| AK Solar              [user] |   top bar (logo, user menu)
+------------------------------+
|                              |
|        screen content        |
|                              |
+------------------------------+
| Home  Stock  Sales  Cust. More|   bottom bar, 5 items max
+------------------------------+
```

Bottom tabs: **Home, Inventory, Sales, Customers, More**. "More" opens a list: Udhaar khata, Reports, Import/Export, Settings, Sign out.
**Only show tabs for screens that exist.** Today that means Home, Inventory, More. Add Sales after Phase 3 and Customers after Phase 2.

**Desktop**

```
+----------+-----------------------------------------------+
| AK Solar |  [ Type or speak, or press Ctrl+K ]     [user] |
|          +-----------------------------------------------+
| Home     |                                               |
| New bill |                 screen content                |
| Inventory|            (wider tables, side panels)        |
| Customers|                                               |
| Udhaar   |                                               |
| Reports  |                                               |
+----------+-----------------------------------------------+
```

- Sidebar is `casing` dark, labels with icons, active item marked with the `sun` bar (same idea as today's header underline).
- The command box lives in the top bar on desktop; on phone it sits at the bottom of Home, above the tab bar.
- Add new sections by editing the `LINKS` array in `components/NavLinks.tsx` (extend it to hold an icon and a phone/desktop flag). Layout stays in one shared `AppShell`.

## 6. Home screen

Route: `/` (today `/` redirects to `/inventory`; change it to Home, and change the login redirect to `/`).

**Phone**

```
+------------------------------+
| Sales today | Cash | Udhaar  |   money cards (scroll sideways if 4)
+------------------------------+
| ! 5 items running low     >  |   red strip, taps to Low stock list
+------------------------------+
| [New bill] [Stock] [Cust.]   |
| [Udhaar]  [Reports] [Add item]|   quick tiles
+------------------------------+
| Recent bills (last 5)        |
+------------------------------+
| [ Type or speak...     (mic)]|   command box
+------------------------------+
```

**Desktop**

```
+----------------------------------------------------------+
| Sales today | Cash received | Udhaar to collect | Low stock |
+-------------------------------+--------------------------+
| Running low (top 5, gauges)   | Assistant / bill check   |
| Recent bills                  | (empty until Phase 10:   |
|                               |  shows quick actions)    |
+-------------------------------+--------------------------+
```

### Where each number comes from

| Card | Source | Available |
|---|---|---|
| Low stock (count and list) | `inventory` where `quantity <= reorder_level` | **Now** |
| Stock value at cost | sum of `cost_price x quantity` | **Now** |
| Sales today | `invoices` for today | After Phase 3 |
| Cash received today | payments received today | After Phase 3 (needs payments, see below) |
| Udhaar to collect | invoice totals minus amounts paid | After Phase 3 |
| Cash in hand | needs a cash book (opening balance, expenses) | Later, only if the owner wants it |

**Never show fake or placeholder money numbers.** Until invoices exist, Home shows only the real ones (low stock, stock value) and the quick tiles.

> **Data-model note for Phase 3:** the Build Instructions give `invoices` a `payment_status` but no amount paid. To get real udhaar balances and "cash received", add either `amount_paid` on `invoices` or (better) a `payments` table (`invoice_id`, `amount`, `method`, `paid_at`, `received_by`). Decide before building Phase 3.

### Quick tiles

New bill, Stock, Customers, Udhaar khata, Reports, Add item. Show only tiles whose screen exists. "Add item" opens the existing Add item panel.

## 7. New bill screen (the most important screen)

This is the screen counter staff use all day. Build it in Phase 3 as a touch-friendly, keyboard-friendly bill builder. The assistant later just fills it in.

**Phone:** one column. Customer picker (or "Walk-in"), item search, item rows (name, qty stepper, rate, amount), total bar pinned at the bottom with **Save bill**.

**Desktop:**

```
+---------------------------------+-----------------------+
| Customer: [ Ali Khan       v ]  |  Bill total           |
| Vehicle / note (optional): [   ]|  Subtotal   31,800    |
+---------------------------------+  Tax        (Phase 9) |
| Search item...  [ AGS 100Ah  ]  |  Paid now   [ 0     ] |
+---------------------------------+  Due (udhaar) 31,800  |
| Item          Qty  Rate  Amount |                       |
| AGS 100Ah      2  15,500 31,000 |  [ Save bill ]        |
| Charger        1     800    800 |  [ Save and print ]   |
+---------------------------------+-----------------------+
```

Rules:

- Price defaults from `sale_price` and can be changed only by roles allowed to (Phase 8).
- Warn (do not block) when quantity is above stock; the database refuses negative stock anyway.
- Amounts and totals are computed **in code** from quantity and rate.
- Show cash, part payment or full udhaar clearly. Udhaar creates a balance on the customer.
- Optional "Vehicle / note" field: suggested because the mockup shows a vehicle (useful for car-battery repeat sales and warranty). **Ask the owner** before adding it.
- Keyboard on desktop: Enter adds the selected item, Ctrl+S saves.

## 8. The command box and assistant

Build in **two stages** so the app is useful early and the AI is safe later.

### Stage 1 (early, no AI): command box as search

A box at the top (desktop) or bottom of Home (phone), also opened with **Ctrl+K**. It finds inventory items, customers and (later) bills by typing, and jumps to them. It looks exactly like the future assistant box, so nothing changes visually when AI arrives.

### Stage 2 (Phase 10): AI assistant, "Propose, Confirm, Execute"

Follows Plan section 6. Detailed requirements:

1. Input: typed text, and voice (see below). Languages: **English, Roman Urdu, Urdu script, and mixes**.
2. The AI turns the sentence into a **structured proposal** (for example `create_bill` with customer, items, quantities, rates, payment). It returns data, not prose.
3. The app **validates the proposal against real data**:
   - Each item is matched to an inventory row. Ambiguous ("AGS 100Ah" matches two models) means ask the user to pick. No match means say so and offer to add the item. **Never invent items, brands or IDs.**
   - The customer is matched to an existing customer; otherwise ask "New customer Ali Khan?".
   - A rate the user said ("15,500 wali") overrides the default price and is marked "price changed" on the card.
   - Quantity above stock shows a warning.
   - **Totals are calculated by the app, not the AI.**
4. The app shows a **confirmation card** (as in section 6 and the desktop picture): customer, each item with qty and amount, total, buttons **Confirm bill / Edit**. Edit opens the normal New bill screen prefilled.
5. Only after Confirm does the app call the **same tested create-bill function** the manual screen uses. The AI never writes to the database.
6. Read-only questions ("Ali Khan ka kitna udhaar hai?", "Osaka 200Ah kitni bachi hain?") can answer without a confirm step, using data the user is allowed to see.
7. Every proposal is logged (`ai_actions`: who asked, text, proposed JSON, confirmed or cancelled, result). Respect roles: counter staff cannot ask for reports or price changes.
8. The Claude API key stays **server-side only** (a route handler), never in the browser, and is stored as a Vercel environment variable without the `NEXT_PUBLIC_` prefix. Check the current model names in Anthropic's docs when building.

### Voice

- Use the browser's speech recognition first (works well in Chrome and Edge on Android and desktop; **iPhone Safari support is limited, so verify**). Set the language to Urdu (`ur-PK`) or English (`en-PK` / `en-IN`) with a small language switch by the mic button.
- Speech engines return Urdu script or English words, **not Roman Urdu**. So the AI step must accept Urdu script and mixed text.
- **Test with real staff voices in the shop, with fan and street noise, before promising this feature.** If browser recognition is not accurate enough, move to a server-side speech-to-text service as a later upgrade.
- Always show the recognised text before acting on it.

## 9. Steps and prompts (one session each)

### Step UI-A: App shell and Home (do now, after Phase 1 is confirmed working)

**Deliverable:** responsive shell (bottom nav on phone, sidebar on desktop), Home screen with **real** cards (low stock, stock value), low-stock strip, quick tiles, and a placeholder-free layout. `/` opens Home.

> "In the aksolar-app project, redesign the app shell. Below 1024px show a top bar and a bottom tab bar (Home, Inventory, More); at 1024px and above show a dark left sidebar with icons and labels. Keep the existing AK Solar colours, fonts and battery-gauge style from app/globals.css. Add a Home page at `/` with: a red strip 'N items running low' linking to the inventory low-stock filter, cards for 'Stock value at cost' and 'Low stock', and quick-action tiles for Stock and Add item (only for screens that exist). Do not show any sales, cash or udhaar numbers yet and do not build a chat box. Update the login redirect to `/`. Make NavLinks data-driven so new sections can be added in one place."

### Step UI-B: Command box, Stage 1 (optional, small)

> "Add a command/search box to the app shell, opened with Ctrl+K on desktop and shown at the bottom of Home on phone. For now it searches inventory items by brand/model/type and jumps to that item. Design it so a microphone button and AI replies can be added later without changing its layout."

### Step UI-C: New bill screen (part of Phase 3)

Build it as specified in section 7, with the Phase 3 invoice tables (and the `payments` note in section 6).

### Step UI-D: Fill the Home cards (with Phases 3 and 5)

> "On the Home page add cards for Sales today, Cash received today and Udhaar to collect using the invoices and payments tables. Show these three cards only to the Owner and Accountant roles. Add a 'Recent bills' list."

### Step UI-E: Assistant and voice (Phase 10)

Use the requirements in section 8, Stage 2.

> "Add the AI assistant to the command box in aksolar-app using the Claude API from a server route. It must return a structured create_bill proposal, which the app validates against real inventory and customers (never invented), computes totals in code, and shows as a Confirm bill / Edit card. Only after Confirm call our existing create-bill function. Log every proposal in an ai_actions table. Accept English, Roman Urdu and Urdu script. Add a microphone button using browser speech recognition with a language switch, and always show the recognised text before acting."

## 10. Words used in the UI

Plain English screens with the shop's own words where staff already use them:

| Word | Meaning |
|---|---|
| Udhaar | Credit sale; money a customer still owes |
| Khata | A customer's account or ledger |
| Bill | Sale invoice (printed and FBR copies are titled "Sale Invoice") |
| Cash received | Payments taken today, cash or transfer |

Write UI text in short, plain sentences, sentence case, verb-first buttons ("Save bill", "Add item"). Errors say what happened and what to do next.

## 11. Acceptance checklist for each screen

- Works at 390px wide (phone) and 1280px wide (desktop), with no sideways scrolling except deliberate lists.
- Buttons are easy to tap; keyboard focus is visible; text passes contrast.
- No numbers that are not real; no tabs that lead nowhere.
- Empty states say what to do next ("Add your first item").
- Money numbers use `formatRs()` and tabular numerals.
- Roles: nothing financial is visible to counter staff (once Phase 8 exists).
- Build passes (`next build`), the change is committed and deployed.

## 12. Questions for the owner

1. Should **Owner only** see sales, cash and udhaar totals, or also the Accountant?
2. What does "Cash in hand" mean in your shop? (Do you want a daily cash book with expenses?)
3. Do you want an optional **Vehicle / note** field on customers and bills?
4. Keep the name **AK Solar**, or use a different app name?
5. Is the UI fine in English with Udhaar / Khata words, or do staff want a full Urdu option later?
6. Will staff mostly use **phones** or the **counter computer**? (This decides what to polish first.)

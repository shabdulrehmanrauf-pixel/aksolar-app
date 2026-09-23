# AK Solar App — Offline-First Instructions for Developer

**Purpose of this document:** Add full offline support so the owner/staff can use the app (create invoices, manage inventory, view customers) even when internet is down. Changes are saved on the device and automatically sync to Supabase when the connection returns.

**Important:**  
- Do this **after** Phase 7 (PWA) is complete and working.  
- This is one focused session. Do not mix with other features.  
- Keep the existing online flow working. Offline is an addition, not a replacement.

Companion documents:  
- `AK-Solar-Build-Instructions.md` (main phases)  
- `AK-Solar-App-Plan.md` (full feature list)

---

## Goal

When the device has **no internet**:
- User can open the app
- User can view existing inventory, customers, and invoices (from local cache)
- User can create new invoices, add/edit inventory items, and add customers
- Everything is saved on the device immediately

When internet returns:
- Pending changes are automatically sent to Supabase
- Any newer data from Supabase is pulled down
- User sees a small “Synced” or “Syncing…” indicator

With only 1–2 devices this is simple. We use **last-write-wins** for conflicts (acceptable for a small shop).

---

## Tech Choices (Keep It Simple)

| Piece | Choice | Why |
|-------|--------|-----|
| Local storage | Dexie.js (IndexedDB wrapper) | Easy, reliable, works in browsers + PWA |
| Sync queue | Simple table of pending actions | Easy to understand and debug |
| Online detection | `navigator.onLine` + Supabase connectivity check | Built-in + reliable |
| Conflict rule | Last write wins (timestamp) | Enough for 1–2 users |

Do **not** introduce complex CRDTs or multi-master sync. Keep it practical.

---

## Step-by-Step Build Order

### 1. Install dependencies

```bash
npm install dexie
```

(Optional but recommended later: `uuid` if you need client-side IDs)

### 2. Create local database (Dexie)

Create a file: `lib/offline-db.ts`

- Define tables that mirror the main Supabase tables you already have:
  - `inventory`
  - `customers`
  - `invoices`
  - `invoice_items`
  - `pending_sync` (special queue table)

`pending_sync` table fields:
- id (auto)
- table_name (inventory / customers / invoices / invoice_items)
- record_id
- action (create / update / delete)
- payload (JSON of the full record)
- created_at
- synced (boolean, default false)

### 3. Offline-aware data layer

Create a thin wrapper around your existing Supabase calls.

Example pattern (do not copy blindly — adapt to your current code):

```ts
// When reading
async function getInventory() {
  if (navigator.onLine) {
    const data = await supabase.from('inventory').select('*');
    // also save to Dexie for offline use
    await offlineDb.inventory.bulkPut(data);
    return data;
  } else {
    return await offlineDb.inventory.toArray();
  }
}

// When writing (create / update / delete)
async function saveInvoice(invoice) {
  // Always save to local first
  await offlineDb.invoices.put(invoice);

  if (navigator.onLine) {
    // try to send to Supabase immediately
    const { error } = await supabase.from('invoices').upsert(invoice);
    if (error) {
      // queue for later
      await offlineDb.pending_sync.add({ ... });
    }
  } else {
    // queue for later
    await offlineDb.pending_sync.add({ ... });
  }
}
```

Apply the same pattern to:
- Inventory add / edit / delete
- Customer add / edit
- Invoice create

### 4. Sync engine

Create `lib/sync.ts`

Responsibilities:
1. Listen for `online` event
2. When online → process all rows in `pending_sync` where `synced = false`
3. Send each action to the correct Supabase table
4. Mark as synced (or delete the row) when successful
5. Pull latest data from Supabase and update local Dexie tables
6. Show a small toast or status badge: “Syncing…” → “All changes synced”

Run the sync:
- Automatically when the browser fires `online`
- Also on app start (if online)
- Optional: manual “Sync Now” button in the UI

### 5. UI indicators (required)

Add a small status component in the header or footer:

- Green dot + “Online” when connected
- Orange/Yellow + “Offline – changes saved locally” when offline
- Blue + “Syncing…” while uploading pending changes
- Green check + “All synced” after successful sync

This is very important so the owner knows the app is working even without internet.

### 6. Initial data load

On first login (or when the app is online):
- Fetch all inventory, customers, and recent invoices from Supabase
- Store them in Dexie
- This becomes the offline cache

After that, the app always prefers local data and only refreshes when online.

### 7. Edge cases to handle

- User creates an invoice offline → later online → invoice is created in Supabase and stock is decremented.
- User edits the same inventory item on two devices while offline → last write wins (use `updated_at` timestamp).
- App is killed while offline → pending changes must still be there when it reopens (Dexie handles this).
- Very large data sets are not a problem for a shop — keep it simple.

---

## Claude / Developer Prompt (Ready to Copy)

Use this exact prompt in a **new focused conversation**:

> We are adding offline-first support to the existing aksolar-app (Next.js + Supabase + PWA already working).
>
> Requirements:
> 1. Install Dexie.js and create a local IndexedDB that mirrors inventory, customers, invoices, and invoice_items.
> 2. Add a `pending_sync` queue table.
> 3. Make all read operations fall back to local data when offline.
> 4. Make all write operations (create/update/delete) save to local storage first, then try Supabase if online. If offline or if the request fails, queue the change.
> 5. Create a sync engine that runs automatically when the device comes online and also on app start. It pushes pending changes and pulls latest data from Supabase.
> 6. Add a clear online/offline/syncing status indicator in the UI.
> 7. Use last-write-wins based on `updated_at` for any conflicts.
>
> Do not change the existing online business logic. Just wrap it so the app works offline and syncs later. Keep the code simple and readable.

---

## Deliverable Checklist

After this phase the developer must confirm:

- [ ] App opens and shows data when Wi-Fi / mobile data is turned off
- [ ] Can create a new invoice while offline
- [ ] Can add/edit inventory while offline
- [ ] Status indicator correctly shows Offline / Syncing / Synced
- [ ] When internet returns, pending invoices and stock changes appear in Supabase
- [ ] No data is lost if the app is closed while offline
- [ ] Existing online flow still works normally

---

## When to Do This Phase

| Situation | Recommendation |
|-----------|----------------|
| Shop has mostly stable internet | Optional – can skip or do later |
| Frequent load-shedding or weak internet | Do this phase soon after Phase 7 |
| Only 1 device and always online | Not needed |

---

## Notes for the Owner

- Offline mode is **local to that device**. If you use two phones, each phone keeps its own offline changes until they both come online and sync.
- Always let the app finish syncing (green check) before turning the phone off for a long time if you made important changes offline.
- The first time you open the app after installing this feature, stay online for 1–2 minutes so it can download the full stock and customer list.

---

**Golden rule:** One focused session only. Test thoroughly with airplane mode before moving to any other phase.

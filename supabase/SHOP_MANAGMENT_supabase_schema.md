# SHOP_MANAGMENT: Supabase Project Documentation

> Generated on 2026-10-01 using **read-only** inspection only. No SQL was executed and no table, row, or setting was changed.

---

## 1. Project Overview

| Property | Value |
|---|---|
| Project name | `SHOP_MANAGMENT` |
| Project ID / ref | `wnwrqdtjnjovaqzielxf` |
| Organization ID | `zfljjspqjcgkvmfmxpbz` |
| Region | `ap-south-1` (Mumbai) |
| Status | `ACTIVE_HEALTHY` |
| API URL | `https://wnwrqdtjnjovaqzielxf.supabase.co` |
| DB host | `db.wnwrqdtjnjovaqzielxf.supabase.co` |
| Postgres version | 17.6.1.166 (engine 17, release channel `ga`) |
| PostgREST version | 14.5 |
| Created at | 2026-09-19 10:24 UTC |
| Dev branches | None |
| Edge Functions | None deployed |
| Tracked migrations | None (schema was not created through tracked migrations) |

### What the app is
A shop management / POS / accounting system for **"Al Karam Battery and Solar"** (Pakistan). It covers:

- Inventory of batteries, solar panels and accessories
- Sales invoicing with **FBR (Federal Board of Revenue) e-invoicing** integration (sandbox and production)
- Customers (udhaar / credit), payments, debit notes
- Purchases from suppliers (called "distributors"), supplier payments and a supplier ledger
- Battery **charging jobs** (slips) and warranty **claims** (sent to distributors)
- **Scrap battery** intake and sale (by kg)
- Expenses, a cash book and financial reports
- Role-based access (owner, counter staff, accountant), a full audit log, and an AI-assistant action log

---

## 2. Summary of Objects

| Object type | Count |
|---|---|
| Tables (`public`) | 27 |
| Views (`public`) | 9 |
| Functions / RPCs (`public`) | 55 |
| Enums | 0 |
| Composite types | 0 |
| Edge Functions | 0 |
| Installed extensions | 5 (`plpgsql`, `pgcrypto`, `uuid-ossp`, `pg_stat_statements`, `supabase_vault`) |

All 26 tables have **Row Level Security (RLS) enabled**.

### Table list with row counts (at time of inspection)

| # | Table | Rows | Purpose |
|---|---|---|---|
| 1 | `inventory` | 81 | Products (batteries, panels, accessories) |
| 2 | `customers` | 6 | Customer master |
| 3 | `business_profile` | 1 | Singleton: business and FBR settings |
| 4 | `invoices` | 39 | Sale invoices and debit notes |
| 5 | `invoice_items` | 40 | Invoice line items |
| 6 | `payments` | 39 | Payments received against invoices |
| 7 | `distributors` | 7 | Suppliers / distributors |
| 8 | `charging_price_list` | 0 | Price list for charging service |
| 9 | `charging_jobs` | 9 | Battery charging slips |
| 10 | `battery_claims` | 2 | Warranty claims |
| 11 | `scrap_battery_sales` | 0 | Scrap sales (by weight) |
| 12 | `scrap_battery_inventory` | 24 | Scrap battery intake stock |
| 13 | `ai_actions` | 0 | AI assistant proposal / execution log |
| 14 | `purchase_invoices` | 10 | Supplier purchase bills |
| 15 | `purchase_items` | 14 | Purchase line items |
| 16 | `supplier_payments` | 2 | Payments made to suppliers |
| 17 | `stock_movements` | 15 | Inventory ledger |
| 18 | `expense_categories` | 11 | Expense category master |
| 19 | `expenses` | 1 | Expense records |
| 20 | `cash_settings` | 1 | Singleton: cash opening balance |
| 21 | `user_roles` | 2 | App roles per auth user |
| 22 | `audit_log` | 272 | Audit trail |
| 23 | `fbr_invoices` | 1 | FBR submission state per invoice |
| 24 | `fbr_invoice_items` | 1 | FBR-formatted line items |
| 25 | `fbr_submissions` | 1 | FBR request / response log |
| 26 | `fbr_reference` | 7,904 | FBR reference data (HS codes, UoM, etc.) |
| 27 | `fbr_heartbeat` | 1 | Singleton: FBR sender heartbeat |

---

## 3. Entity Relationship Overview

```
auth.users
   ├── user_roles (user_id)
   └── created_by / received_by / user_id  (on almost every table)

customers ─┬─< invoices ─┬─< invoice_items >── inventory
           │             ├─< payments
           │             ├── fbr_invoices (1:1) ─< (original_invoice_id → invoices)
           │             ├─< fbr_invoice_items (1:1 with invoice_items)
           │             ├─< fbr_submissions
           │             ├─< battery_claims (original_invoice_id)
           │             └─< scrap_battery_inventory
           ├─< charging_jobs
           ├─< battery_claims
           └─< scrap_battery_inventory

distributors ─┬─< purchase_invoices ─┬─< purchase_items >── inventory
              │                      └─< supplier_payments
              ├─< supplier_payments
              └─< battery_claims

inventory ─┬─< stock_movements
           ├─< invoice_items
           └─< purchase_items

scrap_battery_sales ─< scrap_battery_inventory (sold_in_sale_id)

expense_categories ─< expenses
```

---

## 4. Tables (Detailed)

Legend: **PK** primary key, **FK** foreign key, **UQ** unique, **NN** not null, **N** nullable.
All timestamps are `timestamptz`. `auth.uid()` defaults record the logged-in user.

---

### 4.1 `inventory`  (81 rows, RLS on)
Products sold by the shop.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `category` | text | NN |  | CHECK in (`battery`, `panel`, `accessory`) |
| `brand` | text | NN |  |  |
| `model` | text | NN |  |  |
| `type` | text | N |  |  |
| `voltage` | numeric | N |  | CHECK `> 0` or null |
| `plates` | integer | N |  | CHECK `> 0` or null |
| `ah_rating` | numeric | N |  | CHECK `> 0` or null |
| `wattage` | integer | N |  | CHECK `> 0` or null |
| `warranty_months` | integer | N |  | CHECK `> 0` or null |
| `cost_price` | numeric | NN | `0` | CHECK `>= 0` |
| `sale_price` | numeric | NN | `0` | CHECK `>= 0` |
| `quantity` | integer | NN | `0` | CHECK `>= 0` |
| `reorder_level` | integer | NN | `0` | CHECK `>= 0` |
| `hs_code` | text | N |  | CHECK matches `^[0-9]{4}\.[0-9]{4}$` |
| `uom` | text | NN | `'Numbers, pieces, units'` | Unit of measure (FBR style) |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |
| `sale_type` | text | NN | `'Goods at standard rate (default)'` | FBR sale type |
| `fbr_rate_desc` | text | N |  | FBR rate description |
| `is_taxable` | boolean | NN | `true` |  |
| `retail_price` | numeric | N |  | CHECK `>= 0` or null (used for 3rd-schedule tax) |
| `sro_schedule_no` | text | N |  |  |
| `sro_item_serial_no` | text | N |  |  |

**Referenced by:** `stock_movements.inventory_id`, `invoice_items.inventory_id`, `purchase_items.inventory_id`.

---

### 4.2 `customers`  (6 rows, RLS on)

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `name` | text | NN |  | CHECK trimmed length 1 to 120 |
| `phone` | text | N |  | CHECK `^\+?[0-9]{10,15}$` or null |
| `address` | text | N |  |  |
| `registration_type` | text | NN | `'Unregistered'` | CHECK in (`Registered`, `Unregistered`) |
| `cnic_or_ntn` | text | N |  | CHECK `^([0-9]{7}\|[0-9]{13})$` (NTN 7 digits / CNIC 13 digits) |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |
| `province` | text | N |  |  |

**Referenced by:** `invoices.customer_id`, `charging_jobs.customer_id`, `battery_claims.customer_id`, `scrap_battery_inventory.customer_id`.

---

### 4.3 `business_profile`  (1 row, singleton, RLS on)
Single-row table (`id` is a boolean that must be `true`).

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | boolean | NN | `true` | **PK**, CHECK `id` (forces a single row) |
| `business_name` | text | NN | `'Al Karam Battery and Solar'` |  |
| `ntn` | text | N |  | CHECK 7 or 13 digits |
| `address` | text | N |  |  |
| `province` | text | N |  |  |
| `phone` | text | N |  |  |
| `updated_at` | timestamptz | NN | `now()` |  |
| `fbr_enabled` | boolean | NN | `false` | Turns FBR integration on or off |
| `fbr_environment` | text | NN | `'sandbox'` | CHECK in (`sandbox`, `production`) |
| `prices_include_tax` | boolean | NN | `false` | Comment: *false = GST is added on top of the selling price (owner decision). Third Schedule items ignore this.* |

---

### 4.4 `invoices`  (39 rows, RLS on)

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `invoice_number` | text | NN | `'AK-' \|\| lpad(nextval('invoice_number_seq'), 6, '0')` | **UQ** (e.g. `AK-000001`) |
| `invoice_type` | text | NN | `'Sale Invoice'` | CHECK in (`Sale Invoice`, `Debit Note`) |
| `invoice_date` | date | NN |  |  |
| `customer_id` | uuid | N |  | FK → `customers.id` (null for walk-in) |
| `buyer_name` | text | NN |  | Snapshot of buyer name |
| `buyer_registration_type` | text | NN | `'Unregistered'` | CHECK in (`Registered`, `Unregistered`) |
| `buyer_cnic_or_ntn` | text | N |  | CHECK 7 or 13 digits |
| `buyer_address` | text | N |  |  |
| `buyer_phone` | text | N |  |  |
| `note` | text | N |  |  |
| `total_value` | numeric | NN |  | CHECK `>= 0` |
| `status` | text | NN | `'Valid'` | CHECK in (`Valid`, `Cancelled`, `Edited`) |
| `payment_status` | text | NN |  | CHECK in (`Paid`, `Partial`, `Credit`) |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |
| `cancelled_at` | timestamptz | N |  |  |
| `cancel_reason` | text | N |  |  |

**Referenced by:** `invoice_items`, `payments`, `battery_claims.original_invoice_id`, `scrap_battery_inventory.invoice_id`, `fbr_invoices` (`invoice_id`, `original_invoice_id`), `fbr_invoice_items`, `fbr_submissions`.

---

### 4.5 `invoice_items`  (40 rows, RLS on)

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `invoice_id` | uuid | NN |  | FK → `invoices.id` |
| `inventory_id` | uuid | NN |  | FK → `inventory.id` |
| `description` | text | NN |  |  |
| `hs_code` | text | N |  |  |
| `uom` | text | NN |  |  |
| `sale_type` | text | NN | `'Goods at standard rate (default)'` |  |
| `cost_price` | numeric | NN | `0` | Snapshot of cost (for profit) |
| `quantity` | integer | NN |  | CHECK `> 0` |
| `rate` | numeric | NN |  | CHECK `>= 0` |
| `value_excl_tax` | numeric | NN |  | CHECK `>= 0` |
| `sales_tax_rate` | numeric | NN | `0` | CHECK `>= 0` |
| `sales_tax` | numeric | NN | `0` | CHECK `>= 0` |
| `total` | numeric | NN |  | CHECK `>= 0` |
| `created_at` | timestamptz | NN | `now()` |  |

**Referenced by:** `fbr_invoice_items.invoice_item_id` (1:1).

---

### 4.6 `payments`  (39 rows, RLS on)
Payments received from customers.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `invoice_id` | uuid | NN |  | FK → `invoices.id` |
| `amount` | numeric | NN |  | CHECK `> 0` |
| `method` | text | NN | `'cash'` | CHECK in (`cash`, `bank`, `other`) |
| `paid_at` | timestamptz | NN | `now()` |  |
| `received_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `note` | text | N |  |  |

---

### 4.7 `distributors`  (7 rows, RLS on)
Suppliers / distributors (used for purchases and warranty claims).

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `name` | text | NN |  | **UQ**, CHECK length 1 to 120 |
| `phone` | text | N |  |  |
| `address` | text | N |  |  |
| `note` | text | N |  |  |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |
| `ntn_or_cnic` | text | N |  | CHECK 7 or 13 digits |
| `opening_balance` | numeric | NN | `0` | What the shop owed at start |
| `opening_balance_date` | date | N |  |  |
| `is_active` | boolean | NN | `true` |  |

**Referenced by:** `battery_claims.distributor_id`, `purchase_invoices.supplier_id`, `supplier_payments.supplier_id`.

---

### 4.8 `charging_price_list`  (0 rows, RLS on)

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `label` | text | NN |  | **UQ**, CHECK length 1 to 80 |
| `price` | numeric | NN | `0` | CHECK `>= 0` |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |

---

### 4.9 `charging_jobs`  (9 rows, RLS on)
Customer batteries brought in for charging.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `slip_number` | text | NN | `'CHG-' \|\| lpad(nextval('charging_slip_seq'), 6, '0')` | **UQ** |
| `customer_id` | uuid | N |  | FK → `customers.id` |
| `customer_name` | text | NN |  |  |
| `customer_phone` | text | N |  |  |
| `battery_brand` | text | NN |  |  |
| `battery_model` | text | NN |  |  |
| `battery_number` | text | N |  |  |
| `price` | numeric | NN | `0` | CHECK `>= 0` |
| `note` | text | N |  |  |
| `received_date` | date | NN |  |  |
| `due_date` | date | NN |  |  |
| `status` | text | NN | `'in_shop'` | CHECK in (`in_shop`, `collected`, `unclaimed`) |
| `collected_at` | timestamptz | N |  |  |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |
| `outcome` | text | N |  | CHECK in (`charged`, `faulty`). Comment: set when the battery is handed back |
| `handover_amount` | numeric | N |  | Comment: amount actually collected at pickup (may differ from price) |
| `handover_note` | text | N |  | Comment: optional note taken at hand-over |

---

### 4.10 `battery_claims`  (2 rows, RLS on)
Warranty claims handled with distributors.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `claim_number` | text | NN | `'CLM-' \|\| lpad(nextval('claim_slip_seq'), 6, '0')` | **UQ** |
| `customer_id` | uuid | N |  | FK → `customers.id` |
| `customer_name` | text | NN |  |  |
| `customer_phone` | text | N |  |  |
| `battery_brand` | text | NN |  |  |
| `battery_model` | text | NN |  |  |
| `battery_number` | text | N |  |  |
| `original_invoice_id` | uuid | N |  | FK → `invoices.id` |
| `distributor_id` | uuid | N |  | FK → `distributors.id` |
| `claim_amount` | numeric | N |  | CHECK `>= 0` or null |
| `extra_charges` | numeric | N |  | CHECK `>= 0` or null |
| `note` | text | N |  |  |
| `status` | text | NN | `'received'` | CHECK in (`received`, `sent_to_distributor`, `approved`, `rejected`, `given_to_customer`, `settled`) |
| `received_date` | date | NN |  |  |
| `sent_to_distributor_at` | timestamptz | N |  |  |
| `approved_at` | timestamptz | N |  |  |
| `rejected_at` | timestamptz | N |  |  |
| `given_to_customer_at` | timestamptz | N |  |  |
| `settled_at` | timestamptz | N |  |  |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |

**Claim status flow:** `received → sent_to_distributor → approved / rejected → given_to_customer → settled`

---

### 4.11 `scrap_battery_sales`  (0 rows, RLS on)
Sale of scrap batteries by weight.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `sale_number` | text | NN | `'SS-' \|\| lpad(nextval('scrap_sale_number_seq'), 6, '0')` | **UQ** |
| `buyer_name` | text | NN |  |  |
| `buyer_phone` | text | N |  |  |
| `total_weight_kg` | numeric | NN |  | CHECK `> 0` |
| `rate_per_kg` | numeric | NN |  | CHECK `>= 0` |
| `total_amount` | numeric | NN |  | CHECK `>= 0` |
| `sale_date` | date | NN |  |  |
| `note` | text | N |  |  |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |

---

### 4.12 `scrap_battery_inventory`  (24 rows, RLS on)
Old batteries taken from customers (exchange) and held as scrap stock.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `intake_number` | text | NN | `'SB-' \|\| lpad(nextval('scrap_intake_number_seq'), 6, '0')` | **UQ** |
| `invoice_id` | uuid | N |  | FK → `invoices.id` |
| `customer_id` | uuid | N |  | FK → `customers.id` |
| `customer_name` | text | N |  |  |
| `brand` | text | NN |  |  |
| `model` | text | NN |  |  |
| `battery_type` | text | N |  |  |
| `battery_number` | text | N |  |  |
| `quantity` | integer | NN | `1` | CHECK `> 0` |
| `estimated_weight_kg` | numeric | N |  | CHECK `> 0` or null |
| `note` | text | N |  |  |
| `status` | text | NN | `'in_stock'` | CHECK in (`in_stock`, `sold`) |
| `received_date` | date | NN |  |  |
| `sold_in_sale_id` | uuid | N |  | FK → `scrap_battery_sales.id` |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |

---

### 4.13 `ai_actions`  (0 rows, RLS on)
Log of actions proposed and executed by the AI assistant.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `user_id` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `kind` | text | NN |  | CHECK in (`create_bill`, `add_item`, `add_customer`, `add_scrap`, `sell_scrap`, `create_charging`, `create_claim`) |
| `status` | text | NN | `'proposed'` | CHECK in (`proposed`, `executing`, `confirmed`, `cancelled`, `edited`, `failed`) |
| `user_message` | text | N |  | Original user request |
| `proposal` | jsonb | NN |  | What the AI proposed |
| `sent_payload` | jsonb | N |  | What was actually executed |
| `result` | jsonb | N |  |  |
| `error` | text | N |  |  |
| `created_at` | timestamptz | NN | `now()` |  |
| `resolved_at` | timestamptz | N |  |  |

---

### 4.14 `purchase_invoices`  (10 rows, RLS on)
Purchase bills from suppliers.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `client_id` | uuid | N |  | **UQ** (idempotency key from client / offline sync) |
| `purchase_number` | text | NN | `'PB-' \|\| lpad(nextval('purchase_number_seq'), 6, '0')` | **UQ** |
| `supplier_id` | uuid | NN |  | FK → `distributors.id` |
| `supplier_invoice_number` | text | N |  |  |
| `invoice_date` | date | NN |  |  |
| `subtotal` | numeric | NN |  | CHECK `>= 0` |
| `discount` | numeric | NN | `0` | CHECK `>= 0` |
| `freight` | numeric | NN | `0` | CHECK `>= 0` |
| `total_value` | numeric | NN |  | CHECK `>= 0` |
| `note` | text | N |  |  |
| `status` | text | NN | `'Valid'` | CHECK in (`Valid`, `Cancelled`) |
| `cancelled_at` | timestamptz | N |  |  |
| `cancel_reason` | text | N |  |  |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |

---

### 4.15 `purchase_items`  (14 rows, RLS on)

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `purchase_id` | uuid | NN |  | FK → `purchase_invoices.id` |
| `inventory_id` | uuid | NN |  | FK → `inventory.id` |
| `description` | text | NN |  |  |
| `quantity` | integer | NN |  | CHECK `> 0` |
| `unit_cost` | numeric | NN |  | CHECK `>= 0` |
| `line_total` | numeric | NN |  | CHECK `>= 0` |
| `created_at` | timestamptz | NN | `now()` |  |

---

### 4.16 `supplier_payments`  (2 rows, RLS on)

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `client_id` | uuid | N |  | **UQ** (idempotency key) |
| `payment_number` | text | NN | `'SP-' \|\| lpad(nextval('supplier_payment_number_seq'), 6, '0')` | **UQ** |
| `supplier_id` | uuid | NN |  | FK → `distributors.id` |
| `purchase_id` | uuid | N |  | FK → `purchase_invoices.id` (null = on-account payment) |
| `amount` | numeric | NN |  | CHECK `> 0` |
| `method` | text | NN | `'cash'` | CHECK in (`cash`, `cheque`, `online`, `easypaisa`, `jazzcash`) |
| `paid_at` | date | NN |  |  |
| `reference` | text | N |  |  |
| `cheque_number` | text | N |  |  |
| `cheque_date` | date | N |  |  |
| `bank_name` | text | N |  |  |
| `cheque_status` | text | N |  | CHECK null or in (`issued`, `cleared`, `bounced`) |
| `note` | text | N |  |  |
| `status` | text | NN | `'Valid'` | CHECK in (`Valid`, `Cancelled`) |
| `cancel_reason` | text | N |  |  |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |

---

### 4.17 `stock_movements`  (15 rows, RLS on)
Ledger of every stock change.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `inventory_id` | uuid | NN |  | FK → `inventory.id` |
| `change` | integer | NN |  | CHECK `<> 0` (positive = in, negative = out) |
| `reason` | text | NN |  | CHECK in (`opening`, `purchase`, `purchase_cancel`, `adjustment`, `sale`) |
| `ref_table` | text | N |  | Source table name |
| `ref_id` | uuid | N |  | Source record id |
| `note` | text | N |  |  |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |

---

### 4.18 `expense_categories`  (11 rows, RLS on)

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `name` | text | NN |  | **UQ** |
| `sort_order` | integer | NN | `0` |  |
| `excluded_from_profit` | boolean | NN | `false` | e.g. owner drawings are not a business expense |
| `is_active` | boolean | NN | `true` |  |
| `created_at` | timestamptz | NN | `now()` |  |

---

### 4.19 `expenses`  (1 row, RLS on)

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `client_id` | uuid | N |  | **UQ** (idempotency key) |
| `expense_number` | text | NN | `'EX-' \|\| lpad(nextval('expense_number_seq'), 6, '0')` | **UQ** |
| `category_id` | uuid | NN |  | FK → `expense_categories.id` |
| `amount` | numeric | NN |  | CHECK `> 0` |
| `expense_date` | date | NN |  |  |
| `method` | text | NN | `'cash'` | CHECK in (`cash`, `cheque`, `online`, `easypaisa`, `jazzcash`) |
| `paid_to` | text | N |  |  |
| `reference` | text | N |  |  |
| `cheque_number` | text | N |  |  |
| `cheque_date` | date | N |  |  |
| `bank_name` | text | N |  |  |
| `note` | text | N |  |  |
| `status` | text | NN | `'Valid'` | CHECK in (`Valid`, `Cancelled`) |
| `cancel_reason` | text | N |  |  |
| `created_by` | uuid | N | `auth.uid()` | FK → `auth.users.id` |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |

---

### 4.20 `cash_settings`  (1 row, singleton, RLS on)

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | boolean | NN | `true` | **PK**, CHECK `id` (single row) |
| `opening_balance` | numeric | NN | `0` | CHECK `>= 0` |
| `opening_date` | date | NN | `CURRENT_DATE` |  |
| `updated_at` | timestamptz | NN | `now()` |  |

---

### 4.21 `user_roles`  (2 rows, RLS on)

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `user_id` | uuid | NN |  | **PK**, FK → `auth.users.id` |
| `role` | text | NN |  | CHECK in (`owner`, `counter_staff`, `accountant`) |
| `full_name` | text | NN | `''` |  |
| `is_active` | boolean | NN | `true` |  |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |

---

### 4.22 `audit_log`  (272 rows, RLS on)
Who changed what and when.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `created_at` | timestamptz | NN | `now()` |  |
| `actor_id` | uuid | N |  | No FK (kept even if user is deleted) |
| `actor_name` | text | NN | `'Unknown'` |  |
| `actor_email` | text | N |  |  |
| `actor_role` | text | N |  |  |
| `action` | text | NN |  | CHECK in (`create`, `update`, `delete`) |
| `table_name` | text | NN |  |  |
| `record_id` | text | N |  |  |
| `summary` | text | NN |  | Human-readable description |
| `changed_fields` | text[] | N |  |  |
| `old_data` | jsonb | N |  |  |
| `new_data` | jsonb | N |  |  |
| `is_detail` | boolean | NN | `false` |  |
| `is_side_effect` | boolean | NN | `false` |  |
| `txid` | bigint | NN | `txid_current()` | Groups rows from one transaction |

---

### 4.23 `fbr_invoices`  (1 row, RLS on)
FBR submission state, one row per invoice.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `invoice_id` | uuid | NN |  | **PK**, FK → `invoices.id` (1:1) |
| `environment` | text | NN | `'sandbox'` | CHECK in (`sandbox`, `production`) |
| `buyer_province` | text | N |  |  |
| `buyer_address` | text | N |  |  |
| `invoice_ref_no` | text | N |  | For debit notes (FBR reference) |
| `scenario_id` | text | N |  | FBR sandbox scenario |
| `fbr_status` | text | NN | `'pending'` | CHECK in (`pending`, `sending`, `sent`, `failed`, `unknown`) |
| `fbr_invoice_number` | text | N |  | **UQ** (number returned by FBR) |
| `submitted_at` | timestamptz | N |  |  |
| `error_code` | text | N |  |  |
| `error_message` | text | N |  |  |
| `attempts` | integer | NN | `0` |  |
| `next_retry_at` | timestamptz | N |  |  |
| `created_offline` | boolean | NN | `false` |  |
| `created_at` | timestamptz | NN | `now()` |  |
| `updated_at` | timestamptz | NN | `now()` |  |
| `original_invoice_id` | uuid | N |  | FK → `invoices.id` (for debit notes) |
| `debit_note_reason` | text | N |  |  |

---

### 4.24 `fbr_invoice_items`  (1 row, RLS on)
FBR-formatted line items (one per `invoice_items` row).

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `invoice_item_id` | uuid | NN |  | **PK**, FK → `invoice_items.id` (1:1) |
| `invoice_id` | uuid | NN |  | FK → `invoices.id` |
| `hs_code` | text | N |  |  |
| `product_description` | text | N |  |  |
| `fbr_rate_desc` | text | N |  |  |
| `uom` | text | N |  |  |
| `quantity` | numeric | N |  |  |
| `total_values` | numeric | N |  |  |
| `value_sales_excl_st` | numeric | N |  |  |
| `fixed_notified_value` | numeric | N |  | Retail price (3rd schedule) |
| `sales_tax_applicable` | numeric | N |  |  |
| `sales_tax_withheld` | numeric | NN | `0` |  |
| `extra_tax` | numeric | NN | `0` |  |
| `further_tax` | numeric | NN | `0` |  |
| `fed_payable` | numeric | NN | `0` |  |
| `discount` | numeric | NN | `0` |  |
| `sro_schedule_no` | text | N |  |  |
| `sro_item_serial_no` | text | N |  |  |
| `sale_type` | text | N |  |  |

---

### 4.25 `fbr_submissions`  (1 row, RLS on)
Every request/response sent to FBR.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `invoice_id` | uuid | NN |  | FK → `invoices.id` |
| `environment` | text | N |  |  |
| `attempted_at` | timestamptz | NN | `now()` |  |
| `http_status` | integer | N |  |  |
| `fbr_status_code` | text | N |  |  |
| `error_code` | text | N |  |  |
| `error_message` | text | N |  |  |
| `request_json` | jsonb | N |  |  |
| `response_json` | jsonb | N |  |  |

---

### 4.26 `fbr_reference`  (7,904 rows, RLS on)
Cached FBR lookup data.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | uuid | NN | `gen_random_uuid()` | **PK** |
| `kind` | text | NN |  | CHECK in (`hs_code`, `uom`, `province`, `rate`, `sale_type`, `sro`, `hs_uom`) |
| `code` | text | NN | `''` |  |
| `label` | text | N |  |  |
| `payload` | jsonb | N |  |  |
| `fetched_at` | timestamptz | NN | `now()` |  |

---

### 4.27 `fbr_heartbeat`  (1 row, singleton, RLS on)
Shows whether the FBR sender service (local agent) is alive.

| Column | Type | Null | Default | Constraints / Notes |
|---|---|---|---|---|
| `id` | boolean | NN | `true` | **PK**, CHECK `id` (single row) |
| `last_seen` | timestamptz | N |  |  |
| `environment` | text | N |  |  |
| `sender_version` | text | N |  |  |
| `note` | text | N |  |  |

---

## 5. Foreign Keys (complete list)

| Constraint | From | To |
|---|---|---|
| `inventory_created_by_fkey` | `inventory.created_by` | `auth.users.id` |
| `customers_created_by_fkey` | `customers.created_by` | `auth.users.id` |
| `invoices_created_by_fkey` | `invoices.created_by` | `auth.users.id` |
| `invoices_customer_id_fkey` | `invoices.customer_id` | `customers.id` |
| `invoice_items_invoice_id_fkey` | `invoice_items.invoice_id` | `invoices.id` |
| `invoice_items_inventory_id_fkey` | `invoice_items.inventory_id` | `inventory.id` |
| `payments_invoice_id_fkey` | `payments.invoice_id` | `invoices.id` |
| `payments_received_by_fkey` | `payments.received_by` | `auth.users.id` |
| `distributors_created_by_fkey` | `distributors.created_by` | `auth.users.id` |
| `charging_price_list_created_by_fkey` | `charging_price_list.created_by` | `auth.users.id` |
| `charging_jobs_customer_id_fkey` | `charging_jobs.customer_id` | `customers.id` |
| `charging_jobs_created_by_fkey` | `charging_jobs.created_by` | `auth.users.id` |
| `battery_claims_customer_id_fkey` | `battery_claims.customer_id` | `customers.id` |
| `battery_claims_original_invoice_id_fkey` | `battery_claims.original_invoice_id` | `invoices.id` |
| `battery_claims_distributor_id_fkey` | `battery_claims.distributor_id` | `distributors.id` |
| `battery_claims_created_by_fkey` | `battery_claims.created_by` | `auth.users.id` |
| `scrap_battery_sales_created_by_fkey` | `scrap_battery_sales.created_by` | `auth.users.id` |
| `scrap_battery_inventory_invoice_id_fkey` | `scrap_battery_inventory.invoice_id` | `invoices.id` |
| `scrap_battery_inventory_customer_id_fkey` | `scrap_battery_inventory.customer_id` | `customers.id` |
| `scrap_battery_inventory_sold_in_sale_id_fkey` | `scrap_battery_inventory.sold_in_sale_id` | `scrap_battery_sales.id` |
| `scrap_battery_inventory_created_by_fkey` | `scrap_battery_inventory.created_by` | `auth.users.id` |
| `ai_actions_user_id_fkey` | `ai_actions.user_id` | `auth.users.id` |
| `purchase_invoices_supplier_id_fkey` | `purchase_invoices.supplier_id` | `distributors.id` |
| `purchase_invoices_created_by_fkey` | `purchase_invoices.created_by` | `auth.users.id` |
| `purchase_items_purchase_id_fkey` | `purchase_items.purchase_id` | `purchase_invoices.id` |
| `purchase_items_inventory_id_fkey` | `purchase_items.inventory_id` | `inventory.id` |
| `supplier_payments_supplier_id_fkey` | `supplier_payments.supplier_id` | `distributors.id` |
| `supplier_payments_purchase_id_fkey` | `supplier_payments.purchase_id` | `purchase_invoices.id` |
| `supplier_payments_created_by_fkey` | `supplier_payments.created_by` | `auth.users.id` |
| `stock_movements_inventory_id_fkey` | `stock_movements.inventory_id` | `inventory.id` |
| `stock_movements_created_by_fkey` | `stock_movements.created_by` | `auth.users.id` |
| `expenses_category_id_fkey` | `expenses.category_id` | `expense_categories.id` |
| `expenses_created_by_fkey` | `expenses.created_by` | `auth.users.id` |
| `user_roles_user_id_fkey` | `user_roles.user_id` | `auth.users.id` |
| `fbr_invoices_invoice_id_fkey` | `fbr_invoices.invoice_id` | `invoices.id` |
| `fbr_invoices_original_invoice_id_fkey` | `fbr_invoices.original_invoice_id` | `invoices.id` |
| `fbr_invoice_items_invoice_item_id_fkey` | `fbr_invoice_items.invoice_item_id` | `invoice_items.id` |
| `fbr_invoice_items_invoice_id_fkey` | `fbr_invoice_items.invoice_id` | `invoices.id` |
| `fbr_submissions_invoice_id_fkey` | `fbr_submissions.invoice_id` | `invoices.id` |

---

## 6. Sequences (inferred from column defaults)

| Sequence | Used by | Format |
|---|---|---|
| `invoice_number_seq` | `invoices.invoice_number` | `AK-000001` |
| `charging_slip_seq` | `charging_jobs.slip_number` | `CHG-000001` |
| `claim_slip_seq` | `battery_claims.claim_number` | `CLM-000001` |
| `scrap_sale_number_seq` | `scrap_battery_sales.sale_number` | `SS-000001` |
| `scrap_intake_number_seq` | `scrap_battery_inventory.intake_number` | `SB-000001` |
| `purchase_number_seq` | `purchase_invoices.purchase_number` | `PB-000001` |
| `supplier_payment_number_seq` | `supplier_payments.payment_number` | `SP-000001` |
| `expense_number_seq` | `expenses.expense_number` | `EX-000001` |

---

## 7. Views (9)

| View | Columns | Purpose |
|---|---|---|
| `invoice_balances` | all `invoices` buyer and header fields, `paid_total`, `due_total` | Invoice with amount paid and outstanding |
| `purchase_balances` | purchase fields, `paid_total`, `due_total`, `payment_tag` | Purchase bill with amount paid and due |
| `payment_details` | supplier payment fields, `purchase_number`, `supplier_name` | Supplier payments joined with names |
| `expense_details` | expense fields, `category_name`, `excluded_from_profit` | Expenses joined with category |
| `supplier_balances` | supplier fields, `total_bought`, `total_paid`, `balance`, `last_purchase_date`, `last_payment_date` | Running payable per supplier |
| `supplier_ledger` | `supplier_id`, `event_date`, `event_created_at`, `entry_type`, `entry_label`, `ref_id`, `reference`, `amount`, `running_balance` | Supplier statement |
| `battery_claims_by_distributor` | `distributor_id`, `distributor_name`, `status`, `count` | Claim counts per distributor and status |
| `battery_stock_summary` | `kind`, `status`, `count` | Battery stock summary |
| `scrap_stock_summary` | `batches_in_stock`, `batches_sold`, `batteries_in_stock`, `batteries_sold`, `estimated_weight_in_stock_kg` | Scrap stock totals |

---

## 8. Functions / RPCs (`public` schema)

All business logic is done through Postgres functions called with `supabase.rpc(...)`. Most are `SECURITY DEFINER`.

### 8.1 Sales and billing
| Function | Arguments | Returns |
|---|---|---|
| `create_invoice` | `p_customer_id, p_walkin_name, p_note, p_invoice_date, p_items jsonb, p_paid, p_method, [p_walkin_phone, p_walkin_address, p_walkin_registration_type, p_walkin_cnic_or_ntn]` | uuid |
| `create_fbr_bill` | same as `create_invoice` plus `p_buyer_province, p_buyer_address, p_created_offline` | uuid |
| `create_unreported_bill` | same as `create_invoice` plus `p_reason` | uuid |
| `create_fbr_debit_note` | `p_original_invoice_id, p_items jsonb, p_reason, [p_invoice_date]` | uuid |
| `add_udhaar_entry` | `p_customer_id, p_invoice_number, p_invoice_date, p_amount, [p_note]` | uuid |
| `record_payment` | `p_invoice_id, p_amount, p_method` | void |
| `cancel_invoice` | `p_invoice_id, p_reason, [p_restock]` | void |
| `delete_invoice` | `p_invoice_id, [p_restock]` | void |
| `delete_sandbox_fbr_bill` | `p_invoice_id, [p_restock]` | void |
| `delete_customer_and_bills` | `p_customer_id, [p_restock]` | integer |

### 8.2 Purchasing and suppliers
| Function | Arguments | Returns |
|---|---|---|
| `create_purchase` | `p_client_id, p_supplier_id, p_new_supplier_name/phone/address, p_supplier_invoice_number, p_invoice_date, p_note, p_lines jsonb, p_discount, p_freight, p_paid_now, p_method, p_reference, p_cheque_number, p_cheque_date, p_bank_name` | uuid |
| `cancel_purchase` | `p_purchase_id, p_reason` | void |
| `record_supplier_payment` | `p_client_id, p_supplier_id, p_purchase_id, p_amount, p_method, p_paid_at, p_reference, p_cheque_number, p_cheque_date, p_bank_name` | uuid |
| `cancel_supplier_payment` | `p_payment_id, p_reason` | void |
| `save_supplier` | `p_id, p_name, p_phone, p_address, p_note, p_ntn_or_cnic, p_opening_balance, p_opening_balance_date` | uuid |
| `set_supplier_active` | `p_id, p_is_active` | void |
| `supplier_summary` | none | json |

### 8.3 Expenses and cash
| Function | Arguments | Returns |
|---|---|---|
| `create_expense` | `p_client_id, p_category_id, p_amount, p_expense_date, p_method, p_paid_to, p_reference, p_cheque_number, p_cheque_date, p_bank_name, p_note` | uuid |
| `update_expense` | `p_expense_id` + same fields | void |
| `cancel_expense` | `p_expense_id, p_reason` | void |
| `save_cash_opening_balance` | `p_opening_balance, p_opening_date` | void |
| `cash_book_summary` | `p_from, p_to` | json |
| `money_summary` | `p_day` | json |

### 8.4 Reports
| Function | Arguments | Returns |
|---|---|---|
| `financial_summary` | `p_from, p_to` | json |
| `report_summary` | `p_from, p_to, [p_bucket]` | json |
| `_core_financial_summary` | `p_from, p_to` | json (internal) |
| `_core_report_summary` | `p_from, p_to, [p_bucket]` | json (internal) |
| `_core_cash_book_summary` | `p_from, p_to` | json (internal) |
| `_core_supplier_summary` | none | json (internal) |

### 8.5 Charging, claims, scrap
| Function | Arguments | Returns |
|---|---|---|
| `create_charging_job` | `p_customer_id, p_walkin_name, p_walkin_phone, p_battery_brand, p_battery_model, p_battery_number, p_price, p_note, p_received_date` | uuid |
| `update_charging_job_status` | `p_id, p_status` | void |
| `record_charging_handover` | `p_id, p_outcome, [p_amount], [p_note]` | void |
| `delete_charging_job` | `p_id` | void |
| `create_battery_claim` | `p_customer_id, p_walkin_name, p_walkin_phone, p_battery_brand, p_battery_model, p_battery_number, p_original_invoice_id, p_claim_amount, p_extra_charges, p_note, p_received_date, [p_distributor_id], [p_new_distributor_name]` | uuid |
| `update_battery_claim_status` | `p_id, p_status, p_distributor_id, p_note, [p_new_distributor_name]` | void |
| `delete_battery_claim` | `p_id` | void |
| `get_or_create_distributor` | `p_distributor_id, p_new_distributor_name` | uuid |
| `record_scrap_intake` | `p_invoice_id, p_customer_id, p_customer_name, p_brand, p_model, p_battery_type, p_battery_number, p_quantity, p_estimated_weight_kg, p_note, p_received_date` | uuid |
| `sell_scrap` | `p_intake_ids uuid[], p_buyer_name, p_buyer_phone, p_total_weight_kg, p_rate_per_kg, p_sale_date, p_note` | uuid |

### 8.6 FBR
| Function | Arguments | Returns |
|---|---|---|
| `import_fbr_reference` | `p_kind, p_items jsonb, [p_replace]` | integer (rows imported) |
| `_fbr_line_figures` | `p_item, p_qty, p_price, p_incl, p_sale_type, p_rate_desc, p_retail, p_sro, p_sro_serial` | record (internal tax math) |

### 8.7 AI assistant
| Function | Arguments | Returns |
|---|---|---|
| `ai_log_proposal` | `p_kind, p_message, p_proposal jsonb` | uuid |
| `ai_claim_action` | `p_id` | `ai_actions` row |
| `ai_finish_action` | `p_id, p_status, p_sent, p_result, p_error` | void |
| `ai_resolve_action` | `p_id, p_status` | void |

### 8.8 Users, roles, audit helpers
| Function | Arguments | Returns |
|---|---|---|
| `current_app_role` | none | text |
| `is_owner` | none | boolean |
| `role_in` | `p_roles text[]` | boolean |
| `my_role_info` | none | json |
| `team_list` | none | json |
| `set_user_role` | `p_user_id, p_role, p_full_name, p_is_active` | void |
| `user_display_names` | `p_ids uuid[]` | json |
| `audit_describe` | `p_table, p_action, p_changed, p_old, p_new` | text |
| `audit_rs` | `p_n` | text |
| `audit_val` | `p_key, p_val` | text |

---

## 9. Roles and Access Model

| App role | Intended use |
|---|---|
| `owner` | Full access (settings, team, reports, deletes) |
| `counter_staff` | Billing and day-to-day shop work |
| `accountant` | Financial, supplier and expense work |

Role helpers: `current_app_role()`, `is_owner()`, `role_in(text[])`, `my_role_info()`. Roles are stored in `user_roles` (currently 2 users).

---

## 10. Extensions

| Extension | Schema | Version |
|---|---|---|
| `plpgsql` | pg_catalog | 1.0 |
| `pgcrypto` | extensions | 1.3 |
| `uuid-ossp` | extensions | 1.1 |
| `pg_stat_statements` | extensions | 1.11 |
| `supabase_vault` | vault | 0.3.1 |

All other extensions (PostGIS, pgvector, pg_cron, pg_net, etc.) are available but **not installed**.

---

## 11. Security Advisor Findings (read-only report)

| Level | Finding | Detail |
|---|---|---|
| WARN | Anonymous users can run a SECURITY DEFINER function | `public.record_charging_handover(p_id, p_outcome, p_amount, p_note)` is executable by the `anon` role through `/rest/v1/rpc/record_charging_handover`. |
| WARN | Signed-in users can run 46 SECURITY DEFINER functions | Nearly all business RPCs in section 8 are callable by any `authenticated` user. Role checks inside each function are what restrict access. |
| WARN | Leaked password protection is disabled | Supabase Auth is not checking passwords against HaveIBeenPwned. |

Remediation links: [anon definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable), [authenticated definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable), [password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).

---

## 12. Not Captured (needs SQL, so skipped on purpose)

These items cannot be read with the non-SQL tools, so they are **not** in this document:

- RLS policy definitions (only the fact that RLS is **enabled** on every table is known)
- Trigger definitions (for example `updated_at` triggers and audit triggers feeding `audit_log`)
- Index definitions (beyond those implied by PK and UNIQUE constraints)
- Function bodies (only signatures and return types)
- Sequence current values
- Storage buckets, `auth` schema contents, and cron jobs

If you want any of these, say so and I will run read-only `SELECT` queries on the catalog tables (`pg_policies`, `pg_trigger`, `pg_indexes`, `pg_proc`). Nothing will be modified.

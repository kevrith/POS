# 🧩 MASTERPLAN.md — Enterprise Edition v5.0
## Universal Offline-First POS System — Kenya
> Version 5.0 | Complete Final Blueprint | 2026
> Status: Comprehensive — All Gaps Resolved — Ready for Development

---

## 1. 📋 APP OVERVIEW & OBJECTIVES

### What Is This?
A universal, offline-first, enterprise-grade, KRA eTIMS-compliant POS system for Kenya. Runs as Web PWA, installable mobile app, and Windows .exe (Tauri, client-server). Covers every major Kenyan business vertical in a single platform: retail, hospitality (restaurant/hotel/bar), pharmacy, supermarket, hardware, electronics, agrovet, and service businesses.

### Competitive Position (v5.0)
The only POS system in Kenya that combines:
- True offline-first (30-day capability) — no competitor matches this
- M-Pesa STK Push + QR Code — no competitor has QR
- KRA eTIMS OSCU + VSCU (VAT + TOT) — full compliance
- Restaurant module (Order→KOT→Bill→Receipt, configurable printer routing)
- Hospitality + Retail in ONE system — no switching products
- Tamper-evident audit log (SHA-256 hash chain) — only system with this
- Tenant-scoped Integration API — no competitor has a public API
- QuickBooks-style desktop client-server LAN architecture
- Batch/lot + expiry + serial tracking — covers pharmacy legal requirements
- Supplier management + POs — full procurement cycle
- HR basics + commission tracking

---

## 2. 🏛️ SYSTEM ARCHITECTURE

### Four Applications
```
┌──────────────────────────────────────────────────────────────┐
│  apps/web      │  apps/desktop   │  apps/api    │ apps/admin │
│  Web + PWA     │  Tauri .exe     │  NestJS      │ Super Admin│
│  All roles     │  Client-Server  │  Backend     │ Your ops   │
│                │  Multi-terminal │  PostgreSQL  │ panel      │
└──────────────────────────────────────────────────────────────┘
```

### Desktop Client-Server (QuickBooks-style)
```
Option A: Single PC → Server + Client simultaneously
Option B: Dedicated Server PC + multiple Client PCs on LAN
Option C: Client only → connects to existing server on LAN

Server PC responsibilities:
- SQLite master DB
- Receipt number authority (atomic counter)
- Z-Report authority
- eTIMS offline queue
- Printer routing manager
- Local backup scheduler
- LAN sync point (clients → server → cloud)
```

### Integration API (Tenant-Scoped)
```
"Premier Hotel" owner generates API key in POS Settings → Integrations
Key is LOCKED to their businessId only — zero access to other tenants
Hotel App uses key to: push menu items, create orders, sync room charges
```

---

## 3. 🎯 TARGET AUDIENCE & USER ROLES

### Business Types
| Business | Key Features Used |
|----------|------------------|
| Retail shops & dukas | Credit, TOT, price levels, layaway, offline |
| Chemists & pharmacies | Expiry, batch/lot, serial, variants, service items |
| Supermarkets | Scale, multi-terminal, barcode, bundles, eTIMS VAT |
| Hotels & restaurants | Restaurant module, KOT, printer routing, room charge |
| Hardware stores | Layaway, price levels, supplier POs, bundles |
| Electronics shops | IMEI/serial, layaway, proforma, bundles |
| Agrovets | Expiry, batch, recipe/BOM (feed mixing), scale |
| Fast food / cafés | Fast food mode (KOT + Receipt together), M-Pesa QR |

### User Roles
| Role | Access |
|------|--------|
| **Owner/Admin** | Full: stores, reports, settings, eTIMS, API keys, HR, suppliers |
| **Manager** | Store-level: reports, inventory, users, cash drawer, X/Z-reports, voids |
| **Accountant** | Financial reports only: P&L, VAT, TOT, expenses, supplier ledger — NO POS, NO settings |
| **Cashier** | POS: sales, payments, own shift, price level selection |
| **Waiter** | Hospitality POS: take orders, assign tables, print bills — no payment processing |
| **Kitchen Staff** | Kitchen Display System (KDS): view/update order status — no financial data |

---

## 4. 💰 BUSINESS MODEL

### SaaS Tiers (Paystack)
| Tier | Stores | Key Features |
|------|--------|-------------|
| **Starter** | 1 | POS, Cash, M-Pesa, Reports, Thermal Print, Barcode Scan, eTIMS Lite |
| **Growth** | 1–3 | + Variants, Credit, Barcode Gen, Import/Export, Multi-terminal, Price Levels, Layaway, Expiry |
| **Business** | Unlimited | + eTIMS Full OSCU, API, WhatsApp, Scale, Serial, Restaurant Module, Supplier POs, HR, Batch/Lot |

### Free Trial
- 14-day free trial (no card required)
- Limits: 100 sales, watermarked receipts, no eTIMS
- Day 12 + Day 14 warning emails

### One-Time License (.exe)
- Starter features, hardware-bound HMAC key
- Free updates 12 months

### Referral System
- Unique referral code per owner
- Both parties get 1 month free (Paystack coupon)

---

## 5. 🏗️ CORE FEATURES

### 5.1 Authentication & Security
- Google OAuth + TOTP 2FA (Owner/Admin mandatory)
- Cashier PIN (4–6 digits) for quick session + switch
- Waiter PIN for order taking
- Auto-lock after configurable inactivity
- JWT: 15min access (memory) + 30-day refresh (httpOnly cookie)
- Rate limiting: Redis-backed per tenant per endpoint

### 5.2 Business & Store Setup
- Tax type: VAT | TOT | NONE (once, per business)
- Service charge: configurable % (default 10% for hospitality)
- Negative inventory policy: BLOCK | WARN | ALLOW
- Price levels: up to 3 (Retail, Wholesale, VIP)
- POS mode: RETAIL | HOSPITALITY | FAST_FOOD
- Dark mode toggle (per device)
- Multi-currency display (USD/EUR/GBP, KES functional always)
- Setup wizard (onboarding)

---

### 5.3 🛒 RETAIL POS

**Item Addition**: tap grid, search, USB scanner, camera scan, scale (WEIGHTED items), quick keyboard (`3×500`)

**Sale Types**
| Type | Description |
|------|-------------|
| Normal | Standard checkout |
| Credit | Customer pays later |
| Layaway | Deposit + reserve item + installments |
| Proforma | Quote → convert to sale |
| Service | Labour/consultation, no stock |
| Integration | Created via hotel app / API |

**Sale States**: `DRAFT → PENDING → PAID | CREDIT | PARTIAL | RESERVED | PROFORMA | CANCELLED`

**Void Transactions**
Two distinct void scenarios — both require **Manager PIN + Reason**:

*Pre-payment*: simply remove items from cart (normal cart editing, no authorization needed)

*Post-payment void (customer still at counter):*
- **Full receipt void**: entire sale cancelled, all payments reversed, all inventory restocked, eTIMS void sent to KRA, receipt stamped VOIDED
- **Line-item void**: specific items removed, receipt amended with new total, crossed-out lines shown, change returned to customer

*Amended receipt format:*
```
AMENDED RECEIPT
Original:  #NRB01-2025-0000045
Amendment: #NRB01-2025-0000045-A1
  Bread x2             KES 100
  ~~Milk x1  KES 54~~  [VOIDED]
  Sugar 1kg            KES  90
  ─────────────────────────────
  Original total:      KES 244
  Voided amount:       KES  54
  New total:           KES 190
  Change to customer:  KES  54
  Voided by: Manager John
  Reason: Customer changed mind
  KRA Amendment Ref: [control no.]
```

Both types create immutable audit log entries. eTIMS amendment/void submission to KRA.

**Split Payments**: any method combination per sale, each leg tracked independently

**Hold/Park Sales**: up to 10 per session

**Keyboard Shortcuts**: `/` search, `F1` cash, `F2` M-Pesa STK, `F3` M-Pesa QR, `F4` split, `F5` hold, `F6` held, `F7` proforma, `F8` layaway

---

### 5.4 🍽️ HOSPITALITY POS (Restaurant / Hotel / Bar)

#### POS Modes
| Mode | Description | Who |
|------|-------------|-----|
| **Table Service** | Order → KOT → Bill → Receipt flow | Restaurant, hotel restaurant, bar |
| **Fast Food / Counter** | Pay first → KOT + Receipt print together | Fast food, café, coffee shop |
| **Bar Tab** | Open tab → add drinks → settle at end | Bar, lounge, club |

#### Table Management
```
TABLES VIEW:
┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐
│  T1  │ │  T2  │ │  T3  │ │  T4  │ │  T5  │
│  🟢  │ │  🔴  │ │  🟡  │ │  🔵  │ │  🔴  │
│ Free │ │ Mary │ │ Bill │ │ Resv │ │ John │
│      │ │4 itm │ │ KES  │ │18:00 │ │2 itm │
│      │ │      │ │3,960 │ │      │ │      │
└──────┘ └──────┘ └──────┘ └──────┘ └──────┘

🟢 Available  🔴 Occupied  🟡 Bill Requested  🔵 Reserved
```

- Tap table → view order → [Add Items] [Print Bill] [Take Payment] [Transfer Table] [Merge Tables]
- Configurable table layout per store (floor plan)
- Merge tables (combine bills for groups)
- Transfer order between tables or waiters
- Table reservation with time + customer name

#### The Three Print Events (Order → Bill → Receipt)

**Print #1 — Kitchen Order Ticket (KOT)**
Prints immediately on order submission. No prices shown. Routes to correct printer station.
```
━━━━━━━━━━━━━━━━━━━━━━
  KITCHEN ORDER TICKET
  Table: 7   Order: #089
  Waiter: Mary  14:32
━━━━━━━━━━━━━━━━━━━━━━
  1x Club Sandwich
     [NO ONIONS]
  2x Chips Large
  ── DRINKS → BAR ──
  1x Tusker (BARIDI SANA)
  2x Dawa Cocktail
━━━━━━━━━━━━━━━━━━━━━━
```
- Prints to assigned printer(s) based on item category routing
- Special instructions / modifiers printed clearly
- Additions to existing order: prints NEW KOT for additions only (not full reprint)

**Print #2 — Bill / Check**
Prints when customer requests. NOT a receipt. No eTIMS yet.
```
━━━━━━━━━━━━━━━━━━━━━━━━━
  PREMIER CAFÉ — BILL
  Table: 7     15:10
━━━━━━━━━━━━━━━━━━━━━━━━━
  Club Sandwich x1    850
  Chips Large   x2    400
  Tusker        x1    350
  Dawa Cocktail x2    800
  ─────────────────────
  Subtotal:         2,400
  Service (10%):      240
  ─────────────────────
  TOTAL:            2,640
  ** NOT A RECEIPT **
━━━━━━━━━━━━━━━━━━━━━━━━━
```
- Customer reviews, can request amendments
- Amend → reprint bill (not a new receipt number)

**Print #3 — Official Receipt**
Only prints AFTER payment confirmed. eTIMS submits here.
```
  Receipt: NRB01-2025-0000892
  VAT/TOT breakdown shown
  KRA QR Code + Control Number
  Payment method + reference
```

#### Printer Routing Configuration
Owner sets up once in Settings → Printers:

```
SETUP A: 1 Printer (most common in Kenya)
  All jobs → one printer (KOT, Bill, Receipt, Z-Report)
  Small café, hotel bar, fast food joint

SETUP B: 2 Printers (mid-size restaurant)
  Printer 1 (Kitchen): KOT only
  Printer 2 (Counter): Bill + Receipt + Reports

SETUP C: 3+ Printers (full hotel/restaurant)
  Printer 1 (Kitchen):  Food KOT
  Printer 2 (Bar):      Drinks KOT
  Printer 3 (Counter):  Bill + Receipt
  Printer 4 (Pastry):   Desserts KOT (optional)
```

Each item CATEGORY is assigned to a printer. Routing engine automatically sends each print job to the correct printer(s). Falls back to default/primary printer if no assignment found.

#### Fast Food Mode (Pay First)
```
Customer orders at counter → Cashier enters → Customer pays
→ Receipt prints (official, KRA) + KOT prints simultaneously
→ Customer takes receipt, waits for order
→ One transaction, both documents, same printer or split
→ Toggle: "Print KOT and Receipt together" in settings
```

#### Special Instructions / Modifiers
- Per order item: freetext note OR preset modifiers
- Presets configurable: "No onions", "Extra spicy", "Cold", "Well done", "Vegan", etc.
- Printed clearly on KOT under item name
- Modifiers can have price additions (e.g. "Extra cheese +KES 50")

#### Room Charge (Hotel Integration)
```
Customer selects: [Charge to Room]
→ Enter / search room number
→ System verifies room is checked in (via hotel app integration)
→ Order charged to room account
→ KOT prints ✅
→ Receipt: "CHARGED TO ROOM 204"
→ POS ↔ Hotel App sync room charges in real time
→ Settlement at checkout via hotel app
```

#### Kitchen Display System (KDS) — Optional
- Kitchen staff see incoming orders on screen (no paper)
- Order cards with item list + special instructions
- Status: NEW → IN PROGRESS → READY
- Sound alert on new order
- Timer shows how long order has been waiting
- Works as second browser window on kitchen tablet/screen

---

### 5.5 📦 INVENTORY MANAGEMENT

**Item Types**
| Type | Behavior |
|------|----------|
| PRODUCT | Physical item, track stock |
| SERVICE | No stock tracking (labour, consultation) |
| WEIGHTED | Priced per KG/G, scale integration |
| BUNDLE/KIT | Contains multiple items, sells as one |
| RECIPE/BOM | Contains ingredients, deducts on sale |

**Expiry Date Management**
- Expiry date set per item batch (or per item for simple tracking)
- Alert levels: configurable days before expiry (e.g. 30 days, 7 days, expired)
- Expired items: shown in red, cannot be sold (configurable block vs warn)
- Expiry report: all items expiring within X days
- FEFO (First Expired First Out) selling suggestion
- Critical for: pharmacies, agrovets, supermarkets (fresh/dairy), restaurants
- Expiry on import: column in CSV import for expiry date

**Batch / Lot Tracking**
- Each stock receipt assigned a batch/lot number
- Batch fields: lot number, manufacturing date, expiry date, supplier, quantity received
- Sales deduct from specific batch (FEFO or FIFO)
- Batch recall: find all sales of a specific batch (critical for pharmacy recalls)
- Report: batch history — where did each lot go?
- Legal requirement for medicine sales in Kenya

**Bundle / Kit Management**
- Create bundle: name + component items + quantities
- Bundle price (fixed) or calculated from components
- On sale: all component items deducted from inventory automatically
- Bundle can include services (e.g. "Installation Bundle" = product + labour)
- Bundle examples: Back-to-school kit, Starter pack, Combo meal, Hardware kit
- Bundle profitability report

**Recipe / BOM Management (Bill of Materials)**
- Create recipe: dish/product name + ingredients + quantities per unit
- On sale: ingredient quantities auto-deducted from inventory
- Recipe costing: system calculates cost price from ingredient costs
- Recipe variance report: theoretical vs actual usage (waste tracking)
- Applicable to: restaurants (dishes), bakeries (bread batches), agrovets (feed mixing), juice bars
- Recipe can nest (ingredient is itself a recipe)

**Movement-Based Inventory (Sacred Rule)**
```
Stock = SUM(InventoryMovements.quantity) WHERE item_id = X
Types: INITIAL | SALE | RETURN | VOID | ADJUSTMENT | IMPORT |
       INTEGRATION_SALE | LAYAWAY_RESERVE | LAYAWAY_RELEASE |
       LAYAWAY_CANCEL | BUNDLE_SALE | RECIPE_DEDUCTION |
       BATCH_RECEIPT | EXPIRY_WRITE_OFF | TRANSFER
NEVER update stock directly. Always append a movement.
```

---

### 5.6 🏭 SUPPLIER MANAGEMENT

**Supplier Profiles**
- Name, contact, address, payment terms (e.g. Net 30)
- Items supplied (link suppliers to items)
- Supplier category (local, importer, manufacturer)
- Bank account details for payment
- Credit limit (what you owe them before they stop supply)

**Purchase Orders (POs)**
- Create PO: select supplier, add items + quantities + agreed prices
- PO states: DRAFT → SENT → PARTIALLY_RECEIVED → RECEIVED → CANCELLED
- Print/email PO to supplier
- Expected delivery date tracking
- PO number: auto-sequential `PO-{YEAR}-{SEQ}`

**Goods Received Note (GRN)**
- Receive stock against a PO (full or partial)
- Compare received vs ordered (flag shortages/surpluses)
- On GRN confirmation: inventory movements created (BATCH_RECEIPT if batch tracked)
- Discrepancy report (ordered vs delivered)
- GRN triggers: inventory increase + supplier ledger debit

**Supplier Ledger**
- Running balance: what you owe each supplier
- Payment recording against supplier
- Outstanding balance alerts (approaching credit limit)
- Supplier statement: all POs, GRNs, payments in date range
- Ageing report: how long invoices have been outstanding

**Supplier Performance**
- Average delivery time (days between PO sent and GRN)
- Shortage rate (% of PO lines not fully delivered)
- Price variance (agreed PO price vs actual invoice)

---

### 5.7 💼 EXPENSE MANAGEMENT

**Expense Categories**
Owner configures categories: Rent, Utilities, Salaries, Supplies, Transport, Marketing, Loan Repayment, Maintenance, Other

**Expense Recording**
- Record expense: amount, category, description, date, paid by (cash/bank/M-Pesa)
- Receipt photo attachment (camera capture or file upload)
- Petty cash expenses (during cash drawer session, affects reconciliation)
- Non-petty expenses (above cash drawer, recorded separately)

**Expense Approval Workflow**
- Configurable approval threshold (e.g. expenses > KES 5,000 need manager approval)
- Cashier submits expense → Manager/Owner approves or rejects
- Rejected expense: returned with reason
- Audit trail for all approvals

**Recurring Expenses**
- Set up recurring: rent (monthly KES 45,000), loan (monthly KES 12,000)
- Auto-reminder when recurring expense is due
- One-click record from reminder
- Does NOT auto-deduct — always requires human confirmation

**Budget Management**
- Set monthly budget per category
- Alert when spending reaches 80% of budget
- Alert when budget exceeded
- Budget vs actual report by category

**Expense Reports**
- By category, by period, by payment method
- Expense vs revenue analysis (profitability)
- Top expense categories chart
- All expenses exportable as CSV/PDF

---

### 5.8 👥 HR & STAFF MANAGEMENT

**Employee Profiles**
- Personal: name, phone, email, ID number, emergency contact
- Role assignment (per store)
- Start date, employment type (permanent/contract/casual)
- Commission rate (% of sales they generate)
- Sales target (monthly, configurable)

**Time & Attendance**
- Clock in: cashier/waiter enters PIN at start of shift
- Clock out: at end of shift
- System records: clock in time, clock out time, duration
- Late arrival flag (configurable expected start time per role)
- Attendance report: per employee per period
- Works offline (local record, syncs when online)

**Commission Calculations**
- Auto-calculated from sales attributed to that staff member
- Commission basis: configurable (on subtotal, or on profit margin)
- Commission report: per staff member per period
- Export for payroll processing (CSV)
- Commission NOT auto-paid — report only, for owner's reference

**Shift Management**
- Create shift schedule: who works when (simple week view)
- Assign staff to shifts per store
- Shift report: sales per shift, per cashier
- Overlap alert (same staff scheduled on two shifts)

**Leave Management**
- Leave types: Annual, Sick, Unpaid
- Leave request: employee records leave taken
- Leave balance tracking (annual days used/remaining)
- Leave report by employee
- Simple system — not full HR software, just tracking

**Performance Dashboard (Owner)**
- Sales per cashier/waiter (today, this week, this month)
- Sales vs target progress bar per employee
- Attendance streak
- Top performer highlight

---

### 5.9 💳 PAYMENTS
| Method | Offline? | Notes |
|--------|---------|-------|
| Cash | ✅ | Always |
| M-Pesa STK Push | ❌ | Per business Daraja creds |
| M-Pesa QR Code | ❌ | Dynamic QR per transaction |
| Customer Credit | ✅ | Syncs on reconnect |
| Store Credit | ✅ | From returns |
| Layaway Deposit | ✅ | Partial + reserve |
| Room Charge | ✅ | Hotel integration |
| Card (Paystack) | ❌ | Phase 2 |
| Airtel Money | ❌ | Phase 2 |

---

### 5.10 🏛️ KRA eTIMS — MANDATORY ALL BUSINESSES
- OSCU: web/PWA real-time
- VSCU: desktop offline batch
- Tax engine: VAT (16%) + TOT (3%) + service charge (not taxed) + zero-rated + exempt
- Receipt numbers: `{STORE_CODE}-{YEAR}-{7_DIGITS}` atomic server-side
- Void/amendment submissions to KRA
- HIGH PRIORITY sync queue offline
- "PENDING KRA SUBMISSION" watermark on offline receipts

---

### 5.11 📊 REPORTS & ANALYTICS

**Financial Reports (Owner + Accountant)**
- Sales: daily/weekly/monthly/custom range
- Payment method breakdown
- VAT report (for KRA VAT return)
- TOT report (for KRA TOT return)
- Profit & Loss (revenue minus COGS minus expenses)
- Expense report (by category, by period)
- Supplier ledger + ageing
- Credit book (customer outstanding)
- Layaway book (open layaways)

**Inventory Reports**
- Stock valuation (cost × qty)
- Historical stock (any past date)
- Expiry report (items expiring within X days)
- Batch/lot history
- Recipe variance (theoretical vs actual)
- Bundle performance
- Low stock alerts

**HR Reports**
- Attendance by employee
- Commission by employee
- Sales performance vs target
- Shift summary

**Operations Reports**
- X-Report (mid-day snapshot)
- Z-Report (end of day, formal close)
- Cash drawer reconciliation
- eTIMS submission status
- Proforma pipeline
- Serial number registry
- API usage (integration)

**Scheduled Reports (auto-email via Resend.com)**
- Daily sales summary (configurable time, e.g. 11 PM)
- Weekly summary (Monday morning)
- Monthly report (1st of month)
- Low stock digest (daily if items below threshold)
- Credit overdue digest (weekly)
- Expiry alert digest (daily if items expiring within 30 days)

---

### 5.12 🖨️ THERMAL PRINTING & RECEIPTS

**Receipt Types**
| Type | Trigger | eTIMS? | Auth |
|------|---------|--------|------|
| Kitchen Order Ticket (KOT) | Order submitted | ❌ | None |
| Bill / Check | Customer requests | ❌ | None |
| Official Receipt | Payment confirmed | ✅ | None |
| Amended Receipt | Post-payment void | ✅ amendment | Manager PIN |
| Voided Receipt | Full void | ✅ void | Manager PIN |
| Proforma | Quote created | ❌ | None |
| Layaway Receipt | Deposit/payment | ✅ | None |
| Return Receipt | Return processed | ✅ | None |
| X-Report | Manager requests | — | Manager PIN |
| Z-Report | Day close | — | Manager PIN |
| Barcode Labels | Batch print | — | None |

**WhatsApp Receipts** (Africa's Talking): official receipt sent to customer's WhatsApp after payment. Non-blocking — queued, retried, failure doesn't affect sale.

**Connections**: USB (WebUSB), Bluetooth (Web Bluetooth), Network LAN (Tauri desktop)

**Printer Routing** (hospitality):
- Each item category assigned to a printer
- 1-printer: all jobs to one printer (most Kenyan setups)
- Multi-printer: food → kitchen, drinks → bar, bill/receipt → counter
- Fast food mode: KOT + Receipt print together on payment

---

### 5.13 📋 CUSTOMER-FACING POLE DISPLAY
- Second browser window on second monitor
- Local WebSocket (works fully offline)
- Shows: items added, running total, payment confirmation, idle message + logo

---

### 5.14 🔔 NOTIFICATIONS
- In-app notification center (always on)
- Email via Resend.com (configurable per owner)
- Triggers: low stock, expiry alert, eTIMS failed, sync error, credit overdue, cash discrepancy, batch recall, trial expiry, subscription failed, commission milestone, leave request

---

### 5.15 🔄 SYNC ENGINE
- Offline-first: 30-day offline capability
- Local: IndexedDB (PWA) / SQLite (Tauri)
- Idempotency keys (UUID) on every offline-creatable record
- HIGH PRIORITY queue: eTIMS submissions, void submissions
- Conflict resolution: Sales (never overwrite), Inventory (append-only), Customers (last write wins)
- Online detection: navigator.onLine + health endpoint ping
- Multi-terminal (desktop): clients → Server PC → cloud

---

### 5.16 🔐 SECURITY
- Google OAuth + TOTP 2FA (Owner/Admin mandatory)
- Cashier PIN + Waiter PIN
- JWT + device registration
- Rate limiting (Redis): auth 10/min, M-Pesa 5/min, general 100/min, API keys 1000/hr
- AES-256: M-Pesa + eTIMS credentials
- SQLCipher: desktop SQLite
- Supabase RLS: DB-level tenant isolation
- IP whitelisting on integration API keys
- Tamper-evident audit log (SHA-256 hash chain)
- In-app POS security guide for business owners

---

### 5.17 💾 DESKTOP BACKUP
- Auto backup: Server PC SQLite → USB/local folder (daily)
- Manual backup: on-demand from settings
- AES-256 encrypted backup files
- Rotation: 7 daily + 4 weekly
- Restore wizard: select file → verify integrity → restore
- Alert if backup hasn't run in 48 hours

---

### 5.18 🔄 DESKTOP AUTO-UPDATE
- GitHub Releases update server
- Cryptographic signature verification
- Forced update: compliance/security fixes — blocks app
- Optional update: features — user can defer
- Changelog dialog before install
- Rollback on failed install

---

### 5.19 🔌 INTEGRATION API (Tenant-Scoped)
- Per-business API keys (scoped to businessId + storeIds + permissions)
- IP whitelisting per key
- Hotel app integration: push menu, create orders, sync room charges
- Webhooks: sale.completed, inventory.low_stock, inventory.updated
- Versioned: v1 + v2 when released, deprecation warnings
- Rate limit: 1,000 req/hour per key

---

### 5.20 🏢 SUPER ADMIN DASHBOARD
- All tenants: plan, trial status, last active
- Revenue: MRR, ARR, churn, upgrades
- Subscription actions: upgrade/suspend/reactivate
- License key management
- System health: queue depth, eTIMS failure rate
- Support context: read-only view of any business
- Forced update trigger

---

## 6. 🗄️ CONCEPTUAL DATA MODEL

```
Business
  ├── taxType: VAT|TOT|NONE
  ├── serviceChargeRate
  ├── negativePolicyDefault: BLOCK|WARN|ALLOW
  ├── posMode: RETAIL|HOSPITALITY|FAST_FOOD
  ├── eTIMS credentials (encrypted)
  ├── API keys[], Printers[], Stores[], Users[]
  └── Subscription + trial status

Store
  ├── storeCode, receiptSequence (atomic)
  ├── proformaSequence, zReportSequence
  ├── Terminals[], PrinterConfig[]
  ├── Tables[] (hospitality only)
  └── Items[], Sales[], Orders[], Customers[]

Item
  ├── type: PRODUCT|SERVICE|WEIGHTED|BUNDLE|RECIPE
  ├── priceLevels: { retail, wholesale, vip } (cents)
  ├── vatApplicable, totApplicable
  ├── trackStock, trackSerials, trackBatches
  ├── trackExpiry, defaultExpiryDays
  ├── negativeStockPolicy (inherit or override)
  ├── Variants[], BundleComponents[], RecipeIngredients[]
  └── Batches[] (batch/lot tracked items)

Batch (for batch/lot tracking)
  ├── lotNumber, manufacturingDate, expiryDate
  ├── supplier, quantityReceived
  ├── quantityRemaining (computed from movements)
  └── status: ACTIVE|EXPIRED|RECALLED

Order (Hospitality — separate from Sale)
  ├── tableId / roomNumber (optional)
  ├── waiterId
  ├── status: OPEN|BILL_REQUESTED|PAID|VOIDED
  ├── mode: TABLE_SERVICE|FAST_FOOD|BAR_TAB
  ├── OrderItems[] (with modifiers/special instructions)
  ├── OrderAdditions[] (each addition round)
  ├── KOTs[] (tickets printed)
  └── Sale (created on payment)

Sale
  ├── offlineId (UUID — idempotency key)
  ├── receiptNumber (official, store-scoped)
  ├── amendmentNumber (e.g. -A1 for amended)
  ├── type: NORMAL|CREDIT|LAYAWAY|PROFORMA|SERVICE|INTEGRATION
  ├── status: DRAFT|PENDING|PAID|CANCELLED|CREDIT|PARTIAL|RESERVED|VOIDED|AMENDED
  ├── priceLevel: RETAIL|WHOLESALE|VIP
  ├── serviceChargeCents, vatCents, totCents
  ├── SaleItems[], Payments[]
  ├── eTIMSSubmission
  ├── VoidRecord (if voided/amended)
  └── SerialRecords[]

VoidRecord
  ├── type: FULL_VOID|LINE_ITEM_VOID
  ├── authorizedBy (manager userId)
  ├── reason
  ├── voidedItems[] (for line-item void)
  ├── refundAmountCents
  └── etimsVoidRef

PurchaseOrder
  ├── poNumber (auto-sequential)
  ├── supplierId
  ├── status: DRAFT|SENT|PARTIAL|RECEIVED|CANCELLED
  ├── expectedDeliveryDate
  ├── POItems[] (item, qty ordered, agreed price)
  └── GRNs[]

GoodsReceivedNote
  ├── belongs to PurchaseOrder
  ├── GRNItems[] (item, qty received, batch info)
  └── discrepancies[]

Supplier
  ├── name, contact, address, paymentTerms
  ├── creditLimitCents, outstandingBalanceCents
  ├── SupplierLedger[]
  └── PurchaseOrders[]

Expense
  ├── amount, category, description, date
  ├── paidBy: CASH|BANK|MPESA
  ├── receiptPhotoUrl
  ├── isRecurring, recurringInterval
  ├── approvalStatus: PENDING|APPROVED|REJECTED
  ├── approvedBy (manager userId)
  └── cashDrawerSessionId (if petty cash)

Employee (extends User)
  ├── personalDetails (ID, emergency contact)
  ├── employmentType: PERMANENT|CONTRACT|CASUAL
  ├── commissionRate (%)
  ├── salesTargetCents (monthly)
  ├── startDate
  ├── Attendance[], Leaves[], Commissions[]
  └── Shifts[]

AttendanceRecord
  ├── employeeId, storeId
  ├── clockIn, clockOut
  ├── isLate
  └── offlineId (tracked offline)

Printer
  ├── name, connectionType: USB|BLUETOOTH|NETWORK
  ├── connectionDetails (USB port / BT address / IP:port)
  ├── isDefault
  └── handles[]: KOT_FOOD|KOT_DRINKS|KOT_DESSERTS|BILL|RECEIPT|REPORTS|LABELS

Table (Hospitality)
  ├── number, capacity, floor/section
  ├── status: AVAILABLE|OCCUPIED|BILL_REQUESTED|RESERVED
  └── currentOrderId

Recipe
  ├── itemId (the dish/product)
  ├── portionSize
  └── RecipeIngredients[] (ingredientItemId + quantity)

AuditLog (IMMUTABLE + hash chain)
  ├── previousHash, hash (SHA-256 chain)
  ├── actor, actorType, action
  ├── entity, entityId, before, after
  └── source: POS|INTEGRATION|SUPERADMIN|SYSTEM
```

---

## 7. 🎨 UI DESIGN PRINCIPLES

### Retail POS Screen
```
┌────────────────────────────────────────────────────────────┐
│ 🔴OFFLINE [/ Search or 3×500] [⚖️Scale] Store 🔔2 👤PIN  │
├────────────────────────┬───────────────────────────────────┤
│ [All][Food][Med][Drink]│ 🛒 CART     [💲 WHOLESALE ▼]     │
│ Price: Retail ▼        │ ──────────────────────────────── │
│ ┌──────┐ ┌──────┐     │ Bread x2           KES 100       │
│ │⚖️ Img│ │ Img  │     │ Milk x1(-10%)      KES  54       │
│ │/kg100│ │  60  │     │ Maize 2.3kg        KES 207       │
│ └──────┘ └──────┘     │ ──────────────────────────────── │
│ ┌──────┐ ┌──────┐     │ Sub:   KES 361  Svc: KES 36     │
│ │ Img  │ │ Img  │     │ VAT:    KES 57  TOTAL: KES 454   │
│ │  80  │ │  45  │     │ [💵CASH][📱MPESA][📷QR]          │
│ └──────┘ └──────┘     │ [✂️SPLIT][📒CREDIT][⏳LAYAWAY]   │
│                        │ [📄PROFORMA][⏸HOLD][🧾2]        │
└────────────────────────┴───────────────────────────────────┘
```

### Hospitality POS Screen
```
┌────────────────────────────────────────────────────────────┐
│  PREMIER CAFÉ   Tables   Orders   Reports   🔔  👤 Waiter │
├────────────────────────────────────────────────────────────┤
│ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐            │
│ │  T1  │ │  T2  │ │  T3  │ │  T4  │ │  T5  │            │
│ │  🟢  │ │  🔴  │ │  🟡  │ │  🔵  │ │  🔴  │            │
│ │ Free │ │ Mary │ │ Bill │ │ Resv │ │ John │            │
│ │      │ │4 itm │ │3,960 │ │18:00 │ │2 itm │            │
│ └──────┘ └──────┘ └──────┘ └──────┘ └──────┘            │
│                                                            │
│ [+ New Order]  [Table Layout]  [Reservations]             │
└────────────────────────────────────────────────────────────┘
```

### Design Principles
- Minimum 48×48px touch targets (64px checkout, 72px PIN pad)
- Offline badge (red) always visible
- eTIMS status badge always visible
- Expiry warning badges on inventory items
- Dark mode toggle (sun/moon in header)
- No modals on POS — slide-in bottom sheets only
- Separate UI modes: RETAIL vs HOSPITALITY (auto-switch per business setting)

---

## 8. 🛠️ TECHNICAL STACK

### Frontend
| | Technology |
|-|-----------|
| Framework | React 18 + TypeScript (strict) |
| Build | Vite 5 |
| Styling | Tailwind CSS |
| State | Zustand + TanStack React Query |
| Local DB (PWA) | Dexie.js (IndexedDB) |
| Local DB (Desktop) | SQLite + SQLCipher |
| Desktop | Tauri v2 |
| PWA | vite-plugin-pwa |
| Forms | React Hook Form + Zod |
| Icons | Lucide React |
| Routing | React Router v6 |
| Thermal Print | WebUSB + Web Bluetooth |
| Scale | Web Serial API + Web Bluetooth |
| Barcode Scan | ZXing |
| Barcode Generate | bwip-js |
| QR Code | qrcode.js |
| Pole Display | Local WebSocket |
| Error Tracking | Sentry |

### Backend
| | Technology |
|-|-----------|
| Framework | NestJS 10 + TypeScript |
| ORM | Prisma 5 |
| Database | PostgreSQL (Supabase + RLS) |
| Auth | JWT + Google OAuth + TOTP (speakeasy) |
| Queue | BullMQ + Redis |
| Rate Limiting | @nestjs/throttler + Redis |
| Encryption | AES-256 |
| WebSockets | @nestjs/websockets |
| Email | Resend Node SDK |
| WhatsApp | Africa's Talking SDK |
| Errors / APM | Sentry |

### Cloud
| Service | Provider |
|---------|----------|
| PostgreSQL | Supabase |
| API | Railway |
| PWA CDN | Vercel |
| Redis | Railway |
| Errors/APM | Sentry |
| Email | Resend.com |
| WhatsApp | Africa's Talking |
| Billing | Paystack |
| Updates | GitHub Releases |
| eTIMS | KRA (etims.kra.go.ke) |
| M-Pesa | Safaricom Daraja |
| Exchange Rate | exchangerate-api.com |

---

## 9. 🚀 DEVELOPMENT PHASES (52 Weeks)

### Phase 0: Foundation (Weeks 1–3)
- [ ] Monorepo (Turborepo: web, desktop, api, admin, packages)
- [ ] Supabase: schema + RLS + tamper-evident audit log
- [ ] Auth: Google OAuth + TOTP + Cashier PIN + Waiter PIN
- [ ] Rate limiting + Sentry + Resend.com emails
- [ ] API versioning middleware + CI/CD
- [ ] Free trial logic (14-day, Paystack coupon)

### Phase 1: Core Retail POS (Weeks 4–7)
- [ ] Item CRUD: PRODUCT, SERVICE, WEIGHTED types + variants
- [ ] Price levels (Retail/Wholesale/VIP)
- [ ] Barcode generation + scanning
- [ ] POS screen: grid, cart, checkout, price level selector
- [ ] Cash payment + change calculator
- [ ] Quick keyboard entry (`3×500`)
- [ ] Hold/park sale + keyboard shortcuts
- [ ] Negative inventory policy (Block/Warn/Allow)
- [ ] Dark mode toggle
- [ ] Digital receipt

### Phase 2: Payments + Advanced Sales (Weeks 8–11)
- [ ] M-Pesa STK Push (Daraja)
- [ ] M-Pesa QR code payments
- [ ] BullMQ payment callbacks
- [ ] Split payment logic
- [ ] Credit sales + customer profiles
- [ ] Layaway / deposit sales (reserve, installments, release)
- [ ] Proforma invoice / quotation (own numbering, convert to sale)
- [ ] Service charge (configurable %, line item)
- [ ] **Void transactions**: full void + line-item void (manager PIN, amended receipt, eTIMS void)

### Phase 3: Inventory, Scale, Serial, Expiry, Batch (Weeks 12–16)
- [ ] Movement-based inventory engine
- [ ] **Expiry date management** (per batch, FEFO, expiry report, block expired)
- [ ] **Batch/lot tracking** (lot number, manufacturing date, batch recall)
- [ ] **Bundle/kit management** (component items, auto-deduct on sale)
- [ ] **Recipe/BOM management** (ingredient deduction, recipe costing, variance)
- [ ] Weighing scale integration (USB Serial + Bluetooth)
- [ ] Serial/IMEI tracking (per item, per sale, return validation)
- [ ] CSV/Excel import with column mapping wizard (including expiry + batch columns)
- [ ] Inventory export + full data export
- [ ] Barcode label printing (thermal + A4 sheet)
- [ ] Returns & refunds (full + partial + serial validation)

### Phase 4: Cash Drawer + Supplier + Expense + HR (Weeks 17–22)
- [ ] Cash drawer: open, track, close, reconcile
- [ ] **Full expense management** (categories, approval workflow, receipt photo, recurring, budgets)
- [ ] **Supplier management**: profiles, contact, payment terms, credit limit
- [ ] **Purchase Orders (POs)**: create, send, track, sequential numbering
- [ ] **Goods Received Note (GRN)**: receive against PO, discrepancy, inventory movements
- [ ] **Supplier ledger**: running balance, payments, ageing report
- [ ] **Employee profiles**: personal details, commission rate, sales target
- [ ] **Time & attendance**: clock in/out via PIN, attendance report
- [ ] **Commission calculations**: auto from sales, report for payroll
- [ ] **Shift management**: schedule, assign, shift report
- [ ] **Leave management**: annual/sick/unpaid, balance tracking
- [ ] **Accountant role**: financial reports only, no POS, no settings

### Phase 5: eTIMS, Tax & Fiscal Reports (Weeks 23–25)
- [ ] Tax engine: VAT + TOT + service charge + zero-rated + exempt
- [ ] eTIMS OSCU integration
- [ ] Receipt number system (store-scoped atomic)
- [ ] Proforma + Z-report number systems
- [ ] Thermal receipt: KRA QR + service charge + serial numbers
- [ ] Void/amendment eTIMS submissions to KRA
- [ ] Offline eTIMS HIGH priority queue
- [ ] X-Report (snapshot) + Z-Report (day close, counter reset)
- [ ] VAT report + TOT report (PDF for KRA filing)

### Phase 6: Hospitality Module (Weeks 26–30)
- [ ] Business POS mode: RETAIL | HOSPITALITY | FAST_FOOD
- [ ] **Table management**: floor plan, statuses, tap to view
- [ ] **Order entity** (separate from Sale): OPEN → BILL_REQUESTED → PAID
- [ ] **KOT printing**: submit order → auto-print to correct printer(s)
- [ ] **Printer routing configuration**: 1-printer all-in-one → full multi-printer split
- [ ] **Fast food mode**: KOT + Receipt print together on payment
- [ ] **Bill/Check printing**: "NOT A RECEIPT" clearly marked
- [ ] **Special instructions / modifiers**: freetext + presets on order items
- [ ] **Add items to open order** (new KOT for additions only)
- [ ] **Room charge**: charge to room, hotel app sync
- [ ] **Table operations**: merge, transfer, reservation
- [ ] **Waiter role**: order taking only, no payment processing
- [ ] **Kitchen Display System (KDS)**: tablet view, status updates, sound alerts
- [ ] **Kitchen Staff role**: KDS access only

### Phase 7: Printing, WhatsApp & Pole Display (Weeks 31–32)
- [ ] WebUSB + Bluetooth + Network thermal printer support
- [ ] ESC/POS receipt template engine (all receipt types)
- [ ] WhatsApp receipts (Africa's Talking)
- [ ] Customer-facing pole display (WebSocket)
- [ ] Print preview + reprint
- [ ] Thermal label printer for barcodes

### Phase 8: Sync Engine (Weeks 33–35)
- [ ] Sync queue (HIGH/NORMAL priority)
- [ ] Idempotency enforcement
- [ ] Conflict resolution per entity
- [ ] Online detection (ping check)
- [ ] Sync status UI
- [ ] 30-day offline gap simulation testing

### Phase 9: Reports, Export & Scheduled Emails (Weeks 36–38)
- [ ] All owner/manager/cashier/accountant reports
- [ ] Expiry report, batch history, recipe variance
- [ ] Supplier ledger + ageing report
- [ ] HR: attendance, commission, performance dashboard
- [ ] X/Z-report archive
- [ ] Scheduled automated reports (daily/weekly/monthly via Resend.com)
- [ ] KRA-formatted export + tamper-evident audit log export
- [ ] Full data export ZIP
- [ ] In-app notification center (all triggers including expiry + batch recall)

### Phase 10: Multi-Store, Multi-Terminal & Multi-Currency (Weeks 39–42)
- [ ] Multi-store management + switching
- [ ] Desktop: Tauri TCP server for LAN
- [ ] Multi-terminal LAN sync
- [ ] Server PC as receipt/Z-report authority
- [ ] Cross-store owner dashboard
- [ ] Multi-currency display (USD/EUR/GBP, manual/auto exchange rate)
- [ ] Manager role scoped to stores

### Phase 11: Desktop, License, Update, Backup (Weeks 43–46)
- [ ] Tauri .exe full build + SQLCipher
- [ ] VSCU eTIMS offline batch
- [ ] Client-server setup wizard (server/client/both)
- [ ] Manual + auto backup to USB/local folder (AES-256)
- [ ] Restore wizard
- [ ] Auto-update (GitHub Releases, signed, forced/optional, changelog)
- [ ] License key (HMAC + hardware binding)
- [ ] Desktop security hardening

### Phase 12: Integration API, SaaS Billing, Super Admin (Weeks 47–50)
- [ ] Public REST Integration API (versioned)
- [ ] API key management (scopes + IP whitelisting)
- [ ] Webhook system
- [ ] Hotel app integration
- [ ] Paystack subscription billing + free trial
- [ ] Referral system
- [ ] Bank transfer for B2B
- [ ] Super Admin dashboard

### Phase 13: Polish & Launch (Weeks 51–52)
- [ ] Setup wizard (onboarding)
- [ ] Kenya Data Protection Act deletion flow
- [ ] APM dashboards + performance testing (1,000 tenants)
- [ ] End-to-end testing (all scenarios + 30-day offline)
- [ ] PWA optimization (Lighthouse >90)
- [ ] API documentation + user guide
- [ ] Marketing page (14-day trial CTA)
- [ ] Beta testing with real businesses
- [ ] Launch 🚀

---

## 10. ⚠️ KEY CHALLENGES & SOLUTIONS

| Challenge | Risk | Solution |
|-----------|------|---------|
| Order vs Sale entity (hospitality) | HIGH | Order created on first item, Sale created only on payment |
| KOT print routing (1 printer vs many) | HIGH | Per-category printer config, fallback to default printer |
| Batch/expiry + movement-based inventory | HIGH | Movements reference batchId, FEFO deduction logic |
| Recipe deduction precision | MEDIUM | Ingredient quantities in grams (no floats for money but OK for weight) |
| Void after eTIMS submitted | HIGH | KRA amendment API call + new control number on amended receipt |
| Multi-printer offline | MEDIUM | Queue print jobs locally, retry on reconnect |
| Commission calculation for split sales | MEDIUM | Commission attributed to cashier who processed the sale |
| GRN partial delivery reconciliation | MEDIUM | PO stays PARTIAL until all lines received or manually closed |
| Expiry block vs warn (pharmacy) | HIGH | Configurable per business — pharmacies set BLOCK |
| Table reservation conflict | MEDIUM | Time-based reservation slots, overlap check on booking |

---

## 11. ❌ NOT IN MVP (Phase 2+)

Airtel Money, card payments (Paystack POS), native Android/iOS, macOS, stock transfers between stores, loyalty programs/promotions, e-commerce sync, payroll (full — commission reports only in MVP), advanced AI analytics, customer mobile app (self-service ordering), franchise management, full warranty claim flow (serial tracking is MVP), data breach response plan, IoT/sensors, voice commands, biometric authentication, CCTV integration.

---

## 12. 🔮 FUTURE EXPANSION

**Features**: Airtel Money, Paystack card POS, native Android/iOS, loyalty programs, promotions engine, stock transfers, e-commerce sync (Shopify/WooCommerce), full payroll, AI demand forecasting, customer self-service app, franchise management, multi-language (Swahili), SMS receipts

**Geographic**: Uganda (MTN/Airtel Money), Tanzania, Rwanda

**Integrations**: QuickBooks, Sage, bank reconciliation, Shopify, WooCommerce

---

## 13. 📁 PROJECT STRUCTURE

```
pos-system/
├── apps/
│   ├── web/
│   │   └── src/
│   │       ├── pages/
│   │       │   ├── pos/           # Retail POS screen
│   │       │   ├── hospitality/   # Table view, order management, KDS
│   │       │   ├── inventory/     # Items + batches + expiry + serials + recipes + bundles
│   │       │   ├── suppliers/     # Suppliers + POs + GRNs + ledger
│   │       │   ├── customers/     # Customer + credit + layaway
│   │       │   ├── proforma/      # Proforma management
│   │       │   ├── expenses/      # Expense management + budgets
│   │       │   ├── hr/            # Employees + attendance + commissions
│   │       │   ├── reports/       # All reports (owner + accountant + manager)
│   │       │   ├── settings/      # Business + eTIMS + printers + scale + API keys
│   │       │   ├── cash/          # Cash drawer + X/Z-report
│   │       │   └── notifications/
│   │       ├── components/, hooks/, stores/
│   │       ├── services/, sync/, utils/
│   │
│   ├── desktop/
│   │   └── src-tauri/           # Rust + TCP server + SQLCipher + backup + printer mgr
│   │
│   ├── api/
│   │   └── src/
│   │       ├── auth/            # JWT + Google OAuth + TOTP + PIN
│   │       ├── business/        # Business + store + subscription + trial
│   │       ├── items/           # Items + variants + barcodes + serials + bundles
│   │       ├── batches/         # Batch/lot tracking + expiry management
│   │       ├── recipes/         # Recipe/BOM + ingredient deduction
│   │       ├── sales/           # Sales + layaway + proforma + voids + receipts
│   │       ├── orders/          # Hospitality orders + KOT + table management
│   │       ├── tables/          # Table management + reservations
│   │       ├── payments/        # M-Pesa STK + QR + split + room charge
│   │       ├── inventory/       # Movements + scale + import/export
│   │       ├── suppliers/       # Suppliers + POs + GRNs + ledger
│   │       ├── customers/       # Customer + credit + price levels
│   │       ├── expenses/        # Expenses + approval + recurring + budgets
│   │       ├── hr/              # Employees + attendance + commissions + shifts
│   │       ├── cash-drawer/     # Sessions + X/Z-reports + expenses
│   │       ├── printers/        # Printer config + routing engine
│   │       ├── etims/           # KRA eTIMS OSCU + VSCU + voids
│   │       ├── tax/             # VAT + TOT + service charge engine
│   │       ├── reports/         # All reports + scheduled + export
│   │       ├── notifications/   # In-app + email + WhatsApp
│   │       ├── whatsapp/        # Africa's Talking receipts
│   │       ├── integration/     # Public API + webhooks + IP whitelist
│   │       ├── referrals/       # Referral codes
│   │       ├── sync/
│   │       ├── license/
│   │       ├── updates/
│   │       └── audit/           # Tamper-evident hash chain
│   │
│   └── admin/                   # Super Admin Dashboard
│
├── packages/
│   ├── shared/                  # Types + enums + utils
│   ├── sync-engine/
│   └── ui/
│
├── prisma/schema.prisma
├── claude.md                    # AI development guide
├── masterplan.md                # THIS FILE
├── turbo.json
└── package.json
```

---

*Version 5.0 — Complete Final Enterprise Edition*
*All gaps from original plan resolved:*
*Void transactions (full + line-item + amended receipt + eTIMS void)*
*Expiry date management (FEFO, block expired, expiry report)*
*Supplier management + POs + GRNs + supplier ledger*
*Restaurant module (Order→KOT→Bill→Receipt, configurable printer routing 1→many)*
*Full expense management (categories, approval, receipt photo, recurring, budgets)*
*Batch/lot tracking (lot numbers, recall, FEFO, pharmacy legal compliance)*
*Recipe/BOM management (ingredient deduction, costing, variance)*
*Bundle/kit management (component auto-deduct)*
*HR basics (time & attendance, commissions, shifts, leave)*
*Accountant role (financial reports only)*
*Plus: Fast food mode, KDS, waiter/kitchen staff roles, room charge, table management*
*Status: Complete Blueprint | Undisputed #1 POS in Kenya When Built*

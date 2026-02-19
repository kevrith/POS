# 🤖 CLAUDE.md — AI Development Guide v5.0
## Universal Offline-First POS System — Kenya
> READ THIS ENTIRE FILE before writing any code.
> Single source of truth for all Claude Code sessions.
> Start every session: "Read claude.md and let's continue Phase X"

---

## 🧠 PROJECT CONTEXT

Enterprise-grade, offline-first, KRA eTIMS-compliant POS for Kenya. Covers every major Kenyan business vertical in ONE platform: retail, hospitality (restaurant/hotel/bar/café), pharmacy, supermarket, hardware, electronics, agrovet, service businesses.

**Developer**: Solo full-stack (CTO-level). Expert in React, TypeScript, NestJS, Python.

**Always prioritize**:
- TypeScript strict mode — zero `any`, zero `@ts-ignore`
- Offline-first — every feature must work without internet
- Multi-tenant isolation — user A never sees user B's data
- Production-quality — future team can understand and extend

---

## 🏗️ MONOREPO STRUCTURE

```
pos-system/
├── apps/
│   ├── web/                    # React 18 + Vite PWA
│   ├── desktop/                # Tauri v2 (.exe, client-server)
│   ├── api/                    # NestJS backend
│   └── admin/                  # Super Admin Dashboard
├── packages/
│   ├── shared/                 # ALL TypeScript types + enums + utils
│   ├── sync-engine/            # Offline sync (shared web + desktop)
│   └── ui/                     # Shared React component library
├── prisma/schema.prisma        # DB schema — single source of truth
├── claude.md                   # THIS FILE
├── masterplan.md               # Full app blueprint
├── turbo.json
└── package.json
```

**Never create files outside this structure.**

---

## 🛠️ TECHNOLOGY STACK

### Frontend
| Layer | Technology |
|-------|-----------|
| Framework | React 18 + TypeScript (strict) |
| Build | Vite 5 |
| Styling | Tailwind CSS |
| State | Zustand + TanStack React Query |
| Local DB (PWA) | Dexie.js (IndexedDB) |
| Local DB (Desktop) | SQLite + SQLCipher (Tauri plugin) |
| Desktop | Tauri v2 |
| PWA | vite-plugin-pwa |
| Forms | React Hook Form + Zod |
| Icons | Lucide React |
| Routing | React Router v6 |
| Thermal Print | WebUSB + Web Bluetooth |
| Scale | Web Serial API (USB) + Web Bluetooth |
| Barcode Scan | ZXing |
| Barcode Generate | bwip-js |
| QR Code | qrcode.js |
| Pole Display | Local WebSocket |
| Errors | Sentry |

### Backend
| Layer | Technology |
|-------|-----------|
| Framework | NestJS 10 + TypeScript |
| ORM | Prisma 5 |
| Database | PostgreSQL (Supabase + RLS) |
| Auth | JWT + Google OAuth + TOTP (speakeasy) |
| Queue | BullMQ + Redis |
| Rate Limiting | @nestjs/throttler + Redis |
| Encryption | AES-256 (node:crypto) |
| WebSockets | @nestjs/websockets |
| Email | Resend Node SDK |
| WhatsApp | Africa's Talking SDK |
| Errors | Sentry |

### Cloud & Services
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
| Desktop Updates | GitHub Releases (signed) |
| eTIMS | KRA (etims.kra.go.ke) |
| M-Pesa | Safaricom Daraja |
| Exchange Rate | exchangerate-api.com |

---

## 📐 CODING STANDARDS

### TypeScript — Non-Negotiable
```typescript
// ✅ strict: true in all tsconfig files
// ✅ No `any` — use `unknown` and narrow
// ✅ No @ts-ignore
// ✅ Explicit return types on all functions
// ✅ All enums/interfaces in packages/shared

// packages/shared/enums/index.ts
export enum SaleStatus {
  DRAFT = 'DRAFT',
  PENDING_PAYMENT = 'PENDING_PAYMENT',
  PAID = 'PAID',
  CANCELLED = 'CANCELLED',
  CREDIT = 'CREDIT',
  PARTIAL_PAYMENT = 'PARTIAL_PAYMENT',
  RESERVED = 'RESERVED',
  PROFORMA = 'PROFORMA',
  VOIDED = 'VOIDED',
  AMENDED = 'AMENDED',
}

export enum SaleType {
  NORMAL = 'NORMAL',
  CREDIT = 'CREDIT',
  LAYAWAY = 'LAYAWAY',
  PROFORMA = 'PROFORMA',
  SERVICE = 'SERVICE',
  INTEGRATION = 'INTEGRATION',
}

export enum ItemType {
  PRODUCT = 'PRODUCT',
  SERVICE = 'SERVICE',
  WEIGHTED = 'WEIGHTED',
  BUNDLE = 'BUNDLE',
  RECIPE = 'RECIPE',   // Has BOM — deducts ingredients on sale
}

export enum InventoryMovementType {
  INITIAL = 'INITIAL',
  SALE = 'SALE',
  RETURN = 'RETURN',
  VOID = 'VOID',
  ADJUSTMENT = 'ADJUSTMENT',
  IMPORT = 'IMPORT',
  INTEGRATION_SALE = 'INTEGRATION_SALE',
  LAYAWAY_RESERVE = 'LAYAWAY_RESERVE',
  LAYAWAY_RELEASE = 'LAYAWAY_RELEASE',
  LAYAWAY_CANCEL = 'LAYAWAY_CANCEL',
  BUNDLE_SALE = 'BUNDLE_SALE',
  RECIPE_DEDUCTION = 'RECIPE_DEDUCTION',
  BATCH_RECEIPT = 'BATCH_RECEIPT',
  EXPIRY_WRITE_OFF = 'EXPIRY_WRITE_OFF',
  GRN_RECEIPT = 'GRN_RECEIPT',
  TRANSFER = 'TRANSFER',
}

export enum OrderStatus {
  OPEN = 'OPEN',
  BILL_REQUESTED = 'BILL_REQUESTED',
  PAID = 'PAID',
  VOIDED = 'VOIDED',
}

export enum POSMode {
  RETAIL = 'RETAIL',
  HOSPITALITY = 'HOSPITALITY',
  FAST_FOOD = 'FAST_FOOD',
}

export enum TableStatus {
  AVAILABLE = 'AVAILABLE',
  OCCUPIED = 'OCCUPIED',
  BILL_REQUESTED = 'BILL_REQUESTED',
  RESERVED = 'RESERVED',
}

export enum POStatus {
  DRAFT = 'DRAFT',
  SENT = 'SENT',
  PARTIALLY_RECEIVED = 'PARTIALLY_RECEIVED',
  RECEIVED = 'RECEIVED',
  CANCELLED = 'CANCELLED',
}

export enum VoidType {
  FULL_VOID = 'FULL_VOID',
  LINE_ITEM_VOID = 'LINE_ITEM_VOID',
}

export enum PrintJobType {
  KOT_FOOD = 'KOT_FOOD',
  KOT_DRINKS = 'KOT_DRINKS',
  KOT_DESSERTS = 'KOT_DESSERTS',
  BILL = 'BILL',
  RECEIPT = 'RECEIPT',
  AMENDED_RECEIPT = 'AMENDED_RECEIPT',
  PROFORMA = 'PROFORMA',
  LABEL = 'LABEL',
  X_REPORT = 'X_REPORT',
  Z_REPORT = 'Z_REPORT',
}

export enum UserRole {
  OWNER = 'OWNER',
  MANAGER = 'MANAGER',
  ACCOUNTANT = 'ACCOUNTANT',  // Financial reports only
  CASHIER = 'CASHIER',
  WAITER = 'WAITER',          // Hospitality: order taking only
  KITCHEN = 'KITCHEN',        // KDS view only
}

export enum ExpenseApprovalStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}

export enum LeaveType {
  ANNUAL = 'ANNUAL',
  SICK = 'SICK',
  UNPAID = 'UNPAID',
}
```

### Money — ABSOLUTE RULE
```typescript
// ✅ ALWAYS integers (cents). KES 150.00 = 15000
// ❌ NEVER floats for money

export function formatKES(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function decimalToCents(amount: number): number {
  return Math.round(amount * 100);
}

// Weight pricing: weight in grams × price per KG
export function calculateWeightedPrice(
  weightGrams: number,
  pricePerKgCents: number
): number {
  const rawCents = Math.round((weightGrams / 1000) * pricePerKgCents);
  return Math.round(rawCents / 50) * 50; // Round to nearest KES 0.50
}

// Recipe ingredient quantities: grams/ml are OK as floats
// (not money — weight measurements)
export function calculateRecipeCost(
  ingredients: RecipeIngredient[],
  itemCosts: Map<string, number> // itemId → costPerGramCents
): number {
  return ingredients.reduce((total, ing) => {
    const costPerGram = itemCosts.get(ing.ingredientItemId) ?? 0;
    return total + Math.round(costPerGram * ing.quantityGrams);
  }, 0);
}
```

### Tax Calculations
```typescript
export function calculateVAT(subtotalCents: number): number {
  return Math.round(subtotalCents * 0.16);
}

export function calculateTOT(grossSaleCents: number): number {
  return Math.round(grossSaleCents * 0.03);
}

export function calculateServiceCharge(
  subtotalCents: number,
  rate: number // e.g. 10 for 10%
): number {
  // Service charge is NOT included in VAT/TOT base (per KRA)
  return Math.round(subtotalCents * (rate / 100));
}

// Order: subtotal → VAT/TOT → service charge → total
// NEVER apply VAT or TOT to service charge amount
```

---

## 🔐 AUTHENTICATION & ROLES

### Role Access Matrix
```typescript
// packages/shared/permissions/index.ts
export const ROLE_PERMISSIONS = {
  [UserRole.OWNER]: ['*'],  // Everything
  [UserRole.MANAGER]: [
    'pos.*', 'inventory.*', 'reports.*', 'cash-drawer.*',
    'customers.*', 'expenses.read', 'expenses.create',
    'voids.*', 'hr.read', 'suppliers.read'
  ],
  [UserRole.ACCOUNTANT]: [
    'reports.financial.*',  // P&L, VAT, TOT, expenses, supplier ledger
    'reports.sales.read',
    'expenses.read',
    'suppliers.ledger.read',
    // NO: pos, inventory write, settings, api-keys
  ],
  [UserRole.CASHIER]: [
    'pos.*', 'customers.read', 'customers.create',
    'cash-drawer.own.*', 'reports.own.*'
  ],
  [UserRole.WAITER]: [
    'hospitality.orders.*',   // Create/edit orders, print bills
    'hospitality.tables.read',
    // NO: payment processing, reports, settings
  ],
  [UserRole.KITCHEN]: [
    'hospitality.kds.read',   // View orders
    'hospitality.kds.update', // Mark as in-progress / ready
    // NO: financial data, inventory, reports
  ],
} as const;
```

### Auth Strategy
```
Owner/Admin: Google OAuth → TOTP 2FA (mandatory)
Cashier/Waiter: Email/password OR PIN (4–6 digits)
Kitchen: PIN only (quick access at kitchen screen)
Accountant: Email/password (no TOTP required, no POS access)

Access Token:  JWT, 15min, in-memory only
Refresh Token: JWT, 30 days, httpOnly cookie
Offline Token: 7-day cache, IndexedDB/SQLite
```

---

## 🛒 VOID TRANSACTIONS

### Critical Distinction
```
PRE-PAYMENT (cart stage):
  → Just remove item from cart — no "void"
  → Normal cart editing, no authorization, no audit trail
  → Sale status = DRAFT, no receipt issued yet

POST-PAYMENT VOID (receipt already issued):
  → Requires Manager PIN + Reason
  → Two subtypes: FULL_VOID or LINE_ITEM_VOID
  → Immutable audit log entry
  → eTIMS void/amendment to KRA
  → Inventory movements reversed
```

### Void Implementation
```typescript
async function voidSale(
  saleId: string,
  voidType: VoidType,
  voidedItemIds: string[], // empty array for FULL_VOID
  reason: string,
  managerId: string,
): Promise<VoidResult> {
  return prisma.$transaction(async (tx) => {
    const sale = await tx.sale.findUniqueOrThrow({
      where: { id: saleId },
      include: { items: true, payments: true }
    });

    if (sale.status !== SaleStatus.PAID) {
      throw new BadRequestException('Can only void a paid sale');
    }

    const itemsToVoid = voidType === VoidType.FULL_VOID
      ? sale.items
      : sale.items.filter(i => voidedItemIds.includes(i.id));

    // 1. Reverse inventory movements for voided items
    for (const item of itemsToVoid) {
      await tx.inventoryMovement.create({
        data: {
          offlineId: uuidv4(),
          itemId: item.itemId,
          type: InventoryMovementType.VOID,
          quantity: item.quantity, // positive = restock
          saleId: sale.id,
          source: 'POS',
        }
      });
    }

    // 2. Create void record
    const voidRecord = await tx.voidRecord.create({
      data: {
        saleId: sale.id,
        type: voidType,
        authorizedBy: managerId,
        reason,
        voidedItemIds: itemsToVoid.map(i => i.id),
        refundAmountCents: itemsToVoid.reduce(
          (sum, i) => sum + i.totalCents, 0
        ),
      }
    });

    // 3. Update sale status
    if (voidType === VoidType.FULL_VOID) {
      await tx.sale.update({
        where: { id: saleId },
        data: { status: SaleStatus.VOIDED }
      });
    } else {
      // LINE_ITEM_VOID: recalculate totals
      const newTotal = sale.items
        .filter(i => !voidedItemIds.includes(i.id))
        .reduce((sum, i) => sum + i.totalCents, 0);

      await tx.sale.update({
        where: { id: saleId },
        data: {
          status: SaleStatus.AMENDED,
          amendmentNumber: `${sale.receiptNumber}-A1`,
          totalCents: newTotal,
        }
      });
    }

    // 4. Tamper-evident audit log
    await createAuditEntry({
      businessId: sale.businessId,
      actor: managerId,
      actorType: 'USER',
      action: voidType === VoidType.FULL_VOID
        ? 'SALE_VOIDED' : 'SALE_LINE_ITEM_VOIDED',
      entity: 'Sale',
      entityId: saleId,
      before: { status: sale.status },
      after: {
        status: voidType === VoidType.FULL_VOID
          ? SaleStatus.VOIDED : SaleStatus.AMENDED,
        reason, voidedItemIds
      },
    });

    // 5. Queue eTIMS void/amendment submission (HIGH priority)
    await etimsQueue.add('void-submission', {
      saleId, voidType, voidRecordId: voidRecord.id
    }, { priority: 1 });

    return { voidRecord, printAmendedReceipt: voidType === VoidType.LINE_ITEM_VOID };
  });
}
```

### Amended Receipt Format
```
Receipt: NRB01-2025-0000045
Amendment: NRB01-2025-0000045-A1
──────────────────────────────────
  Bread x2              KES 100
  ~~Milk x1   KES 54~~  [VOIDED]
  Sugar 1kg              KES  90
──────────────────────────────────
  Original total:       KES 244
  Voided amount:         KES  54
  New total:            KES 190
  Change to customer:    KES  54
──────────────────────────────────
  Voided by: Manager John
  Reason: Customer changed mind
  KRA Amendment Ref: [control no.]
```

---

## 🍽️ HOSPITALITY MODULE

### Order vs Sale — Critical Distinction
```typescript
// HOSPITALITY: Order and Sale are SEPARATE entities
// Order = from first item added to payment confirmation
// Sale = created ONLY when payment is confirmed

// RETAIL: Order doesn't exist. Sale is created immediately.

// FAST FOOD: Order created + Sale created simultaneously on payment
//            KOT and Receipt print at the same time
```

### Order Flow
```typescript
// 1. Waiter creates order (assigns table)
async function createOrder(
  tableId: string,
  waiterId: string,
  storeId: string
): Promise<Order> {
  await updateTableStatus(tableId, TableStatus.OCCUPIED);
  return prisma.order.create({
    data: {
      offlineId: uuidv4(),
      tableId,
      waiterId,
      storeId,
      status: OrderStatus.OPEN,
      mode: POSMode.HOSPITALITY,
    }
  });
}

// 2. Add items to order → triggers KOT print
async function addItemsToOrder(
  orderId: string,
  items: OrderItemInput[]
): Promise<void> {
  // Save items to DB
  await saveOrderItems(orderId, items);

  // Route and print KOT (food items → kitchen, drinks → bar)
  await printKOT(orderId, items, 'ADDITION'); // ADDITION = only new items
}

// 3. Print bill (no eTIMS, no receipt number)
async function printBill(orderId: string): Promise<void> {
  await updateOrderStatus(orderId, OrderStatus.BILL_REQUESTED);
  await updateTableStatus(order.tableId, TableStatus.BILL_REQUESTED);
  // Bill prints with "NOT A RECEIPT" watermark
  await printDocument(orderId, PrintJobType.BILL);
}

// 4. Payment confirmed → creates Sale → eTIMS fires
async function confirmOrderPayment(
  orderId: string,
  payments: PaymentInput[]
): Promise<Sale> {
  return prisma.$transaction(async (tx) => {
    const order = await tx.order.findUniqueOrThrow({
      where: { id: orderId },
      include: { items: true }
    });

    // Create Sale from Order
    const sale = await tx.sale.create({
      data: {
        offlineId: uuidv4(),
        orderId: order.id,
        type: SaleType.NORMAL,
        status: SaleStatus.PAID,
        // ... totals from order
      }
    });

    // Deduct inventory
    await deductInventoryForSale(sale, tx);

    // Update order + table status
    await tx.order.update({
      where: { id: orderId },
      data: { status: OrderStatus.PAID, saleId: sale.id }
    });
    await updateTableStatus(order.tableId, TableStatus.AVAILABLE);

    // Queue eTIMS
    await etimsQueue.add('sale-submission', { saleId: sale.id }, { priority: 1 });

    return sale;
  });
}
```

### Printer Routing Engine
```typescript
// Owner configures once: each PrintJobType → Printer(s)
// Falls back to default/primary printer if no assignment

async function routePrintJob(
  jobType: PrintJobType,
  storeId: string,
  data: PrintData
): Promise<void> {
  const config = await getPrinterConfig(storeId);

  // Find printers assigned to handle this job type
  const targetPrinters = config.printers.filter(p =>
    p.handles.includes(jobType)
  );

  // Fallback to default printer
  const printers = targetPrinters.length > 0
    ? targetPrinters
    : [config.printers.find(p => p.isDefault)].filter(Boolean);

  // Print to all target printers simultaneously
  await Promise.all(
    printers.map(printer => sendToPrinter(printer, jobType, data))
  );
}

// KOT routing: items split by category, each category goes to assigned printer
async function printKOT(
  orderId: string,
  items: OrderItem[],
  kotType: 'NEW_ORDER' | 'ADDITION'
): Promise<void> {
  const config = await getPrinterConfig(storeId);

  // Group items by their printer category
  const groups = groupItemsByPrinterCategory(items, config);

  for (const [printerCategory, groupItems] of Object.entries(groups)) {
    const jobType = printerCategory as PrintJobType; // KOT_FOOD | KOT_DRINKS | KOT_DESSERTS
    await routePrintJob(jobType, storeId, {
      orderId, items: groupItems, kotType,
      isAddition: kotType === 'ADDITION'
    });
  }
}

// Fast food mode: KOT + Receipt print together on payment
async function fastFoodCheckout(
  items: CartItem[],
  payment: PaymentInput,
  storeId: string
): Promise<Sale> {
  const sale = await createAndPaySale(items, payment);
  // Print both simultaneously
  await Promise.all([
    routePrintJob(PrintJobType.KOT_FOOD, storeId, { items }),
    routePrintJob(PrintJobType.KOT_DRINKS, storeId, { items }),
    routePrintJob(PrintJobType.RECEIPT, storeId, { sale }),
  ]);
  return sale;
}
```

---

## 📦 EXPIRY DATE MANAGEMENT

```typescript
// Expiry stored per Batch (or per Item for simple tracking)
// FEFO = First Expired, First Out — sell oldest expiry first

async function getAvailableStockFEFO(
  itemId: string
): Promise<BatchStock[]> {
  const batches = await prisma.batch.findMany({
    where: {
      itemId,
      status: BatchStatus.ACTIVE,
      quantityRemaining: { gt: 0 }
    },
    orderBy: { expiryDate: 'asc' } // FEFO: earliest expiry first
  });

  return batches.map(b => ({
    batchId: b.id,
    lotNumber: b.lotNumber,
    expiryDate: b.expiryDate,
    quantityRemaining: b.quantityRemaining,
    isExpiringSoon: isExpiringSoon(b.expiryDate, 30),
    isExpired: isExpired(b.expiryDate),
  }));
}

function isExpired(expiryDate: Date | null): boolean {
  if (!expiryDate) return false;
  return new Date() > expiryDate;
}

function isExpiringSoon(expiryDate: Date | null, daysThreshold: number): boolean {
  if (!expiryDate) return false;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + daysThreshold);
  return expiryDate <= threshold;
}

// Check expiry before sale (per business policy: BLOCK or WARN)
async function checkExpiryBeforeSale(
  itemId: string,
  batchId: string | null,
  business: Business
): Promise<ExpiryCheckResult> {
  const batch = batchId
    ? await prisma.batch.findUnique({ where: { id: batchId } })
    : await getEarliestExpiryBatch(itemId);

  if (!batch?.expiryDate) return { allowed: true };

  if (isExpired(batch.expiryDate)) {
    if (business.expiredItemPolicy === 'BLOCK') {
      return {
        allowed: false,
        reason: `Item expired on ${formatDate(batch.expiryDate)}`
      };
    }
    return {
      allowed: true,
      warning: `⚠️ EXPIRED: ${formatDate(batch.expiryDate)}`
    };
  }

  if (isExpiringSoon(batch.expiryDate, 7)) {
    return {
      allowed: true,
      warning: `⚠️ Expiring soon: ${formatDate(batch.expiryDate)}`
    };
  }

  return { allowed: true };
}
```

---

## 🏭 BATCH / LOT TRACKING

```typescript
// When GRN is confirmed → create Batch + InventoryMovement
async function receiveBatchStock(
  itemId: string,
  batchData: CreateBatchInput,
  storeId: string
): Promise<void> {
  return prisma.$transaction(async (tx) => {
    const batch = await tx.batch.create({
      data: {
        offlineId: uuidv4(),
        itemId,
        storeId,
        lotNumber: batchData.lotNumber,
        manufacturingDate: batchData.manufacturingDate,
        expiryDate: batchData.expiryDate,
        supplierId: batchData.supplierId,
        quantityReceived: batchData.quantity,
        quantityRemaining: batchData.quantity,
        status: BatchStatus.ACTIVE,
      }
    });

    await tx.inventoryMovement.create({
      data: {
        offlineId: uuidv4(),
        itemId,
        storeId,
        type: InventoryMovementType.GRN_RECEIPT,
        quantity: batchData.quantity,
        batchId: batch.id,
        source: 'SUPPLIER',
      }
    });
  });
}

// Batch recall: find all sales containing this batch
async function recallBatch(batchId: string): Promise<BatchRecallResult> {
  const movements = await prisma.inventoryMovement.findMany({
    where: { batchId, type: InventoryMovementType.SALE },
    include: {
      sale: {
        include: { customer: true }
      }
    }
  });

  // Mark batch as recalled
  await prisma.batch.update({
    where: { id: batchId },
    data: { status: BatchStatus.RECALLED }
  });

  return {
    affectedSales: movements.map(m => m.sale),
    affectedCustomers: movements
      .map(m => m.sale?.customer)
      .filter(Boolean),
    totalQuantityRecalled: movements.reduce(
      (sum, m) => sum + Math.abs(m.quantity), 0
    ),
  };
}
```

---

## 🍱 RECIPE / BOM MANAGEMENT

```typescript
// Recipe = item with type: RECIPE
// On sale: deduct each ingredient per recipe

async function deductRecipeIngredients(
  recipeItemId: string,
  quantitySold: number,
  saleId: string,
  tx: PrismaTransaction
): Promise<void> {
  const recipe = await tx.item.findUnique({
    where: { id: recipeItemId },
    include: { recipeIngredients: true }
  });

  if (!recipe || recipe.type !== ItemType.RECIPE) return;

  for (const ingredient of recipe.recipeIngredients) {
    const totalQty = ingredient.quantityGrams * quantitySold;

    await tx.inventoryMovement.create({
      data: {
        offlineId: uuidv4(),
        itemId: ingredient.ingredientItemId,
        type: InventoryMovementType.RECIPE_DEDUCTION,
        quantity: -totalQty, // grams deducted
        saleId,
        recipeItemId,
        source: 'RECIPE',
      }
    });
  }
}

// Recipe costing: calculate cost from ingredients
async function calculateRecipeCostPrice(
  recipeItemId: string
): Promise<number> {
  const recipe = await prisma.item.findUnique({
    where: { id: recipeItemId },
    include: {
      recipeIngredients: {
        include: { ingredientItem: true }
      }
    }
  });

  return recipe!.recipeIngredients.reduce((total, ing) => {
    // Convert item cost from per-unit to per-gram
    const costPerGramCents = ing.ingredientItem.costPriceCents
      / (ing.ingredientItem.unitWeightGrams ?? 1000);
    return total + Math.round(costPerGramCents * ing.quantityGrams);
  }, 0);
}

// Recipe variance = theoretical usage vs actual stock depletion
// Run in reports to identify waste/theft
```

---

## 📦 BUNDLE / KIT MANAGEMENT

```typescript
// Bundle = item with type: BUNDLE
// Has BundleComponents (list of items + quantities)
// On sale: each component deducted from inventory

async function deductBundleComponents(
  bundleItemId: string,
  quantitySold: number,
  saleId: string,
  tx: PrismaTransaction
): Promise<void> {
  const bundle = await tx.item.findUnique({
    where: { id: bundleItemId },
    include: { bundleComponents: true }
  });

  if (!bundle || bundle.type !== ItemType.BUNDLE) return;

  for (const component of bundle.bundleComponents) {
    const totalQty = component.quantity * quantitySold;

    await tx.inventoryMovement.create({
      data: {
        offlineId: uuidv4(),
        itemId: component.componentItemId,
        type: InventoryMovementType.BUNDLE_SALE,
        quantity: -totalQty,
        saleId,
        bundleItemId,
        source: 'POS',
      }
    });
  }
}

// Bundle stock = MIN(component stock / component quantity)
// i.e. bundle can only be sold if ALL components have stock
async function getBundleAvailableStock(
  bundleItemId: string
): Promise<number> {
  const bundle = await prisma.item.findUnique({
    where: { id: bundleItemId },
    include: { bundleComponents: true }
  });

  const componentStocks = await Promise.all(
    bundle!.bundleComponents.map(async (c) => {
      const stock = await getStockLevel(c.componentItemId);
      return Math.floor(stock / c.quantity);
    })
  );

  return Math.min(...componentStocks);
}
```

---

## 🏭 SUPPLIER MANAGEMENT

```typescript
// PO flow: DRAFT → SENT → PARTIALLY_RECEIVED → RECEIVED
// Each GRN creates inventory movements

async function createGRN(
  poId: string,
  receivedItems: GRNItemInput[]
): Promise<GRN> {
  return prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUniqueOrThrow({
      where: { id: poId },
      include: { items: true }
    });

    const grn = await tx.goodsReceivedNote.create({
      data: {
        poId,
        receivedAt: new Date(),
        items: {
          create: receivedItems.map(ri => ({
            poItemId: ri.poItemId,
            quantityReceived: ri.quantityReceived,
            batchLotNumber: ri.batchLotNumber,
            expiryDate: ri.expiryDate,
          }))
        }
      }
    });

    // Create inventory movements + batches for each received item
    for (const ri of receivedItems) {
      const poItem = po.items.find(i => i.id === ri.poItemId)!;

      // Create batch if item tracks batches
      const item = await tx.item.findUnique({
        where: { id: poItem.itemId }
      });

      if (item?.trackBatches) {
        await receiveBatchStock({
          itemId: poItem.itemId,
          lotNumber: ri.batchLotNumber,
          expiryDate: ri.expiryDate,
          quantity: ri.quantityReceived,
          supplierId: po.supplierId,
        }, tx);
      } else {
        await tx.inventoryMovement.create({
          data: {
            offlineId: uuidv4(),
            itemId: poItem.itemId,
            type: InventoryMovementType.GRN_RECEIPT,
            quantity: ri.quantityReceived,
            grnId: grn.id,
            source: 'SUPPLIER',
          }
        });
      }
    }

    // Update supplier ledger
    await tx.supplierLedger.create({
      data: {
        supplierId: po.supplierId,
        type: 'INVOICE',
        amountCents: calculateGRNTotal(receivedItems, po),
        reference: grn.id,
        description: `GRN for PO ${po.poNumber}`,
      }
    });

    // Update PO status
    const allReceived = checkAllPOItemsReceived(po, grn);
    await tx.purchaseOrder.update({
      where: { id: poId },
      data: {
        status: allReceived
          ? POStatus.RECEIVED
          : POStatus.PARTIALLY_RECEIVED
      }
    });

    return grn;
  });
}
```

---

## 💼 EXPENSE MANAGEMENT

```typescript
// Approval workflow: expenses above threshold need manager approval
async function createExpense(
  data: CreateExpenseInput,
  submittedBy: User,
  business: Business
): Promise<Expense> {
  const needsApproval =
    data.amountCents > (business.expenseApprovalThresholdCents ?? 500000);

  const expense = await prisma.expense.create({
    data: {
      ...data,
      businessId: business.id,
      submittedBy: submittedBy.id,
      approvalStatus: needsApproval
        ? ExpenseApprovalStatus.PENDING
        : ExpenseApprovalStatus.APPROVED,
    }
  });

  if (needsApproval) {
    // Notify manager/owner for approval
    await notificationService.send({
      businessId: business.id,
      type: 'EXPENSE_APPROVAL_NEEDED',
      title: 'Expense approval needed',
      body: `${submittedBy.name} submitted KES ${formatKES(data.amountCents)} for ${data.category}`,
      priority: 'MEDIUM',
      actionUrl: `/expenses/${expense.id}`,
      roles: [UserRole.MANAGER, UserRole.OWNER],
    });
  }

  return expense;
}

// Recurring expense reminder (BullMQ cron job)
// Runs daily, checks for recurring expenses due today
// Creates notification — does NOT auto-record expense
```

---

## 👥 HR & STAFF MANAGEMENT

```typescript
// Time & attendance: clock in/out via PIN
// Works offline — syncs when online

async function clockIn(
  employeeId: string,
  storeId: string,
  pin: string
): Promise<AttendanceRecord> {
  await verifyEmployeePin(employeeId, pin);

  const expectedStart = await getExpectedStartTime(employeeId, storeId);
  const now = new Date();
  const isLate = expectedStart
    ? now > expectedStart
    : false;

  return prisma.attendanceRecord.create({
    data: {
      offlineId: uuidv4(),
      employeeId,
      storeId,
      clockIn: now,
      isLate,
      shiftDate: getShiftDate(now),
    }
  });
}

// Commission: auto-calculated from sales, report only (not auto-paid)
async function calculateCommissions(
  employeeId: string,
  startDate: Date,
  endDate: Date
): Promise<CommissionReport> {
  const employee = await prisma.user.findUnique({
    where: { id: employeeId }
  });

  const sales = await prisma.sale.findMany({
    where: {
      cashierId: employeeId,
      status: SaleStatus.PAID,
      createdAt: { gte: startDate, lte: endDate },
    }
  });

  const totalSalesCents = sales.reduce(
    (sum, s) => sum + s.subtotalCents, 0
  );
  const commissionCents = Math.round(
    totalSalesCents * ((employee?.commissionRate ?? 0) / 100)
  );

  return {
    employeeId,
    period: { startDate, endDate },
    totalSalesCents,
    commissionRate: employee?.commissionRate ?? 0,
    commissionCents,
    salesTarget: employee?.salesTargetCents ?? 0,
    targetAchievedPct: employee?.salesTargetCents
      ? Math.round((totalSalesCents / employee.salesTargetCents) * 100)
      : null,
  };
}
```

---

## 🗄️ DATABASE KEY RULES

### Prisma Conventions
```prisma
// ✅ IDs: String @id @default(uuid())
// ✅ Money: Int (cents — never Decimal/Float)
// ✅ Timestamps: createdAt @default(now()), updatedAt @updatedAt
// ✅ Soft deletes: deletedAt DateTime? (never hard delete financials)
// ✅ All tables: businessId for tenant scoping
// ✅ Indexes on: businessId, storeId, offlineId, status, expiryDate

model Item {
  id                  String             @id @default(uuid())
  businessId          String
  storeId             String
  name                String
  type                ItemType           @default(PRODUCT)
  retailPriceCents    Int
  wholesalePriceCents Int?
  vipPriceCents       Int?
  costPriceCents      Int?
  trackStock          Boolean            @default(true)
  trackSerials        Boolean            @default(false)
  trackBatches        Boolean            @default(false)
  trackExpiry         Boolean            @default(false)
  defaultExpiryDays   Int?
  negativeStockPolicy NegativeStockPolicy?
  // WEIGHTED type
  weightUnit          String?            // 'kg' or 'g'
  // BUNDLE type
  bundleComponents    BundleComponent[]
  // RECIPE type
  recipeIngredients   RecipeIngredient[]
  // Relations
  batches             Batch[]
  movements           InventoryMovement[]
  serials             SerialRecord[]
  deletedAt           DateTime?
  @@index([businessId, storeId])
  @@index([type])
}

model Batch {
  id                String      @id @default(uuid())
  offlineId         String      @unique
  itemId            String
  storeId           String
  lotNumber         String
  manufacturingDate DateTime?
  expiryDate        DateTime?
  supplierId        String?
  quantityReceived  Int
  quantityRemaining Int
  status            BatchStatus @default(ACTIVE)
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  item              Item        @relation(fields: [itemId], references: [id])
  movements         InventoryMovement[]

  @@index([itemId, expiryDate])
  @@index([status])
}

model Order {
  id          String      @id @default(uuid())
  offlineId   String      @unique
  businessId  String
  storeId     String
  tableId     String?
  roomNumber  String?
  waiterId    String
  status      OrderStatus @default(OPEN)
  mode        POSMode     @default(HOSPITALITY)
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  items       OrderItem[]
  kots        KOT[]
  sale        Sale?

  @@index([businessId, storeId, status])
}

model PurchaseOrder {
  id                  String    @id @default(uuid())
  poNumber            String    @unique
  businessId          String
  supplierId          String
  status              POStatus  @default(DRAFT)
  expectedDelivery    DateTime?
  notes               String?
  createdAt           DateTime  @default(now())
  updatedAt           DateTime  @updatedAt

  items               POItem[]
  grns                GRN[]
  supplier            Supplier  @relation(fields: [supplierId], references: [id])

  @@index([businessId, supplierId, status])
}

model Employee {
  id               String   @id @default(uuid())
  userId           String   @unique
  businessId       String
  idNumber         String?
  emergencyContact String?
  employmentType   String   @default("PERMANENT")
  commissionRate   Float    @default(0)
  salesTargetCents Int?
  startDate        DateTime?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  user             User     @relation(fields: [userId], references: [id])
  attendance       AttendanceRecord[]
  leaves           Leave[]
}

model Expense {
  id               String                @id @default(uuid())
  offlineId        String                @unique
  businessId       String
  storeId          String
  amountCents      Int
  category         String
  description      String
  paidBy           String                // CASH | BANK | MPESA
  receiptPhotoUrl  String?
  isRecurring      Boolean               @default(false)
  recurringDay     Int?                  // day of month for recurring
  approvalStatus   ExpenseApprovalStatus @default(APPROVED)
  approvedBy       String?
  cashDrawerSessionId String?
  createdAt        DateTime              @default(now())
  updatedAt        DateTime              @updatedAt
  deletedAt        DateTime?

  @@index([businessId, category, createdAt])
}
```

### Receipt & Report Numbers
```typescript
// All atomic, server-side only — NEVER client-generated
// Official receipt:  NRB01-2025-0000001
// Proforma:          NRB01-PRO-2025-00001
// Z-Report:          Z-NRB01-2025-0001
// PO number:         PO-2025-00001
// Amendment:         NRB01-2025-0000045-A1
```

### Inventory Sacred Rules
```typescript
// ❌ NEVER: UPDATE items SET stock_count = X
// ✅ ALWAYS: INSERT InventoryMovement { quantity: X }
// Stock = SELECT SUM(quantity) FROM inventory_movements WHERE item_id = ?

// Bundle sale:  BUNDLE_SALE movement per component
// Recipe sale:  RECIPE_DEDUCTION movement per ingredient
// Void:         VOID movement (positive, restores stock)
// GRN receipt:  GRN_RECEIPT movement (positive, adds stock)
// Expiry write-off: EXPIRY_WRITE_OFF movement (negative)
// All movements: IMMUTABLE — never deleted or updated
```

---

## 🔒 SECURITY

### TenantGuard — Mandatory on Every Endpoint
```typescript
@Injectable()
export class TenantGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const { user, params } = context.switchToHttp().getRequest();
    if (params.businessId) {
      const ok = await this.businessService.isMember(
        params.businessId, user.id
      );
      if (!ok) throw new ForbiddenException('Not a member');
    }
    if (params.storeId && params.businessId) {
      const ok = await this.storeService.belongsToBusiness(
        params.storeId, params.businessId
      );
      if (!ok) throw new ForbiddenException('Store not in business');
    }
    return true;
  }
}
```

### Role Guard
```typescript
@Injectable()
export class RoleGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const requiredPermission = Reflect.getMetadata(
      'required_permission', context.getHandler()
    );
    const { user } = context.switchToHttp().getRequest();
    const permissions = ROLE_PERMISSIONS[user.role];

    // Owner has wildcard
    if (permissions.includes('*')) return true;

    return permissions.some(p =>
      p === requiredPermission ||
      (p.endsWith('.*') && requiredPermission.startsWith(p.slice(0, -2)))
    );
  }
}

// Usage:
@RequirePermission('reports.financial.*')
@Get('reports/pl')
async getProfitLoss() { ... } // Accountant + Manager + Owner can access
```

### Tamper-Evident Audit Log
```typescript
import { createHash } from 'node:crypto';

async function createAuditEntry(entry: NewAuditEntry): Promise<void> {
  const lastEntry = await prisma.auditLog.findFirst({
    where: { businessId: entry.businessId },
    orderBy: { createdAt: 'desc' },
    select: { hash: true },
  });

  const previousHash = lastEntry?.hash ?? '0'.repeat(64);
  const content = JSON.stringify({ ...entry, previousHash });
  const hash = createHash('sha256').update(content).digest('hex');

  await prisma.auditLog.create({
    data: { ...entry, previousHash, hash }
  });
}
// All financial actions (sales, voids, expenses, supplier payments)
// must create an audit entry — immutable, hash-chained
```

### Rate Limiting
```typescript
ThrottlerModule.forRoot([
  { name: 'auth',        ttl: 60000,    limit: 10   },
  { name: 'mpesa',       ttl: 60000,    limit: 5    },
  { name: 'general',     ttl: 60000,    limit: 100  },
  { name: 'integration', ttl: 3600000,  limit: 1000 },
])
```

---

## ✅ FEATURE COMPLETION CHECKLIST

Before marking ANY feature done:

- [ ] TypeScript strict — zero `any`, zero `@ts-ignore`
- [ ] Money as integers (cents) — no floats
- [ ] Works fully offline
- [ ] Multi-tenant isolation (wrong businessId → 403)
- [ ] Loading / error / empty states implemented
- [ ] Mobile responsive (375px, 768px, 1024px)
- [ ] Touch targets min 48×48px
- [ ] Audit log entry for all financial actions (hash-chained)
- [ ] Idempotency key on all offline-creatable records
- [ ] TenantGuard + RoleGuard applied
- [ ] Rate limiting applied
- [ ] No sensitive data in logs or error responses
- [ ] Soft delete only — no hard deletes on financial records
- [ ] RLS policy on any new Supabase table
- [ ] Sentry error capture

**Hospitality-specific**:
- [ ] Order created before Sale (Table Service mode)
- [ ] KOT routes to correct printer(s)
- [ ] Bill prints with "NOT A RECEIPT" watermark
- [ ] eTIMS fires ONLY on Sale (not Order)

**Inventory-specific**:
- [ ] Movements only — never direct stock update
- [ ] Expiry check before sale (block/warn per policy)
- [ ] Batch deduction in FEFO order
- [ ] Bundle deducts all components
- [ ] Recipe deducts all ingredients

---

## 🚫 ABSOLUTE RULES — NEVER VIOLATE

```
❌ Use `any` type
❌ Store money as floats
❌ Store credentials in plain text
❌ Trust businessId/storeId from request body
❌ Update inventory directly (always movements)
❌ Overwrite a paid Sale, Payment, or InventoryMovement
❌ Use localStorage for tokens
❌ Hard delete financial records
❌ Skip RLS on new tables
❌ Process M-Pesa callbacks in controller (always BullMQ)
❌ Put business logic in React components
❌ Generate receipt/PO numbers client-side
❌ Skip eTIMS for any business
❌ Mix VAT and TOT on same business
❌ Apply VAT/TOT to service charge
❌ Use navigator.onLine alone (always ping check)
❌ Fire eTIMS on Order creation (only on Sale/payment)
❌ Allow KITCHEN or WAITER role to access financial data
❌ Allow ACCOUNTANT role to access POS or settings
❌ Allow void without Manager PIN
❌ Sell expired item without checking business expiry policy
❌ Create files outside the project structure
```

---

## 📝 COMMIT CONVENTIONS

```
feat(void): add full receipt void + line-item void with amended receipt
feat(void): add manager PIN authorization for post-payment voids
feat(expiry): add expiry date tracking per batch (FEFO)
feat(expiry): add expiry report + block/warn policy
feat(batch): add batch/lot tracking with recall functionality
feat(bundle): add bundle/kit management with component auto-deduction
feat(recipe): add recipe/BOM management with ingredient deduction
feat(recipe): add recipe costing and variance report
feat(suppliers): add supplier profiles + purchase orders (POs)
feat(suppliers): add GRN with inventory movements + batch receipt
feat(suppliers): add supplier ledger + ageing report
feat(expenses): add full expense management with approval workflow
feat(expenses): add recurring expenses + budget management
feat(hr): add employee profiles + time & attendance (clock in/out)
feat(hr): add commission calculation report
feat(hr): add shift management + leave tracking
feat(roles): add accountant role (financial reports only)
feat(hospitality): add table management + order flow
feat(hospitality): add KOT printing with configurable printer routing
feat(hospitality): add fast food mode (KOT + Receipt together)
feat(hospitality): add kitchen display system (KDS)
feat(hospitality): add waiter + kitchen staff roles
fix(tax): exclude service charge from VAT/TOT base
fix(inventory): use FEFO batch deduction for expiry-tracked items
chore(prisma): add Batch, Order, PurchaseOrder, Employee, Expense models
test(offline): 30-day offline simulation with hospitality + batch scenarios
```

---

## 🔄 CURRENT DEVELOPMENT PHASE

> **Update this section at start of every session**

**Current Phase**: Phase 0 — Foundation
**Next milestone**: Auth + Supabase schema + Sentry + Trial logic

### Phase Progress
- [ ] Phase 0: Foundation
- [ ] Phase 1: Core Retail POS
- [ ] Phase 2: Payments + Advanced Sales + Voids
- [ ] Phase 3: Inventory, Scale, Serial, Expiry, Batch, Bundle, Recipe
- [ ] Phase 4: Cash Drawer + Supplier + Expense + HR
- [ ] Phase 5: eTIMS, Tax & Fiscal Reports
- [ ] Phase 6: Hospitality Module
- [ ] Phase 7: Printing, WhatsApp & Pole Display
- [ ] Phase 8: Sync Engine
- [ ] Phase 9: Reports, Export & Scheduled Emails
- [ ] Phase 10: Multi-Store, Multi-Terminal & Multi-Currency
- [ ] Phase 11: Desktop, License, Update & Backup
- [ ] Phase 12: Integration API, SaaS Billing & Super Admin
- [ ] Phase 13: Polish & Launch

### Start These NOW (Don't Wait)
- [ ] Safaricom Daraja API → developer.safaricom.co.ke (2-3 weeks)
- [ ] KRA eTIMS OSCU → etims.kra.go.ke
- [ ] Africa's Talking (WhatsApp) → africastalking.com
- [ ] Supabase project → supabase.com
- [ ] Sentry org → sentry.io
- [ ] Resend.com account + verify domain
- [ ] Paystack account → paystack.com
- [ ] GitHub repo → for auto-update releases

---

## 📚 KEY DOCUMENTATION

- KRA eTIMS: https://etims.kra.go.ke
- Daraja API: https://developer.safaricom.co.ke/docs
- Africa's Talking WhatsApp: https://developers.africastalking.com/docs/whatsapp
- Paystack: https://paystack.com/docs
- Resend: https://resend.com/docs
- Tauri v2: https://v2.tauri.app/
- Tauri Updater: https://v2.tauri.app/plugin/updater/
- Tauri Serial: https://v2.tauri.app/plugin/serialport/
- Supabase RLS: https://supabase.com/docs/guides/auth/row-level-security
- BullMQ: https://docs.bullmq.io/
- Sentry NestJS: https://docs.sentry.io/platforms/node/guides/nestjs/
- Web Serial API: https://developer.chrome.com/docs/capabilities/serial
- exchangerate-api: https://www.exchangerate-api.com/docs

---

*Version 5.0 — Complete Final Enterprise Edition*
*All 10 missing features added:*
*Void transactions | Expiry management | Supplier+POs+GRN | Restaurant module*
*Full expense management | Batch/lot tracking | Recipe/BOM | Bundle/Kit*
*HR basics | Accountant role*
*Plus: KOT routing | Fast food mode | KDS | Waiter/Kitchen roles | Room charge*
*To resume: "Read claude.md and let's continue Phase X"*

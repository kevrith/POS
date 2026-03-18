// ============================================================
// @pos/shared — Single source of truth for types, enums, utils
// ============================================================

// ─── ENUMS ───────────────────────────────────────────────────

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
  RECIPE = 'RECIPE',
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
  ACCOUNTANT = 'ACCOUNTANT',
  CASHIER = 'CASHIER',
  WAITER = 'WAITER',
  KITCHEN = 'KITCHEN',
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

export enum BatchStatus {
  ACTIVE = 'ACTIVE',
  EXPIRED = 'EXPIRED',
  RECALLED = 'RECALLED',
}

export enum PriceLevel {
  RETAIL = 'RETAIL',
  WHOLESALE = 'WHOLESALE',
  VIP = 'VIP',
}

export enum PaymentMethod {
  CASH = 'CASH',
  MPESA_STK = 'MPESA_STK',
  MPESA_QR = 'MPESA_QR',
  CARD = 'CARD',
  CREDIT = 'CREDIT',
  STORE_CREDIT = 'STORE_CREDIT',
  ROOM_CHARGE = 'ROOM_CHARGE',
  LAYAWAY_DEPOSIT = 'LAYAWAY_DEPOSIT',
  GIFT_CARD = 'GIFT_CARD',
  BANK_TRANSFER = 'BANK_TRANSFER',
}

export enum TaxType {
  VAT = 'VAT',
  TOT = 'TOT',
  NONE = 'NONE',
}

export enum NegativeStockPolicy {
  BLOCK = 'BLOCK',
  WARN = 'WARN',
  ALLOW = 'ALLOW',
}

// ─── PERMISSIONS ─────────────────────────────────────────────

export const ROLE_PERMISSIONS: Record<UserRole, string[]> = {
  [UserRole.OWNER]: ['*'],
  [UserRole.MANAGER]: [
    'pos.*', 'inventory.*', 'reports.*', 'cash-drawer.*',
    'customers.*', 'expenses.read', 'expenses.create',
    'voids.*', 'hr.read', 'suppliers.read',
  ],
  [UserRole.ACCOUNTANT]: [
    'reports.financial.*',
    'reports.sales.read',
    'expenses.read',
    'suppliers.ledger.read',
  ],
  [UserRole.CASHIER]: [
    'pos.*', 'customers.read', 'customers.create',
    'cash-drawer.own.*', 'reports.own.*',
  ],
  [UserRole.WAITER]: [
    'hospitality.orders.*',
    'hospitality.tables.read',
  ],
  [UserRole.KITCHEN]: [
    'hospitality.kds.read',
    'hospitality.kds.update',
  ],
};

// ─── MONEY UTILS ─────────────────────────────────────────────

/** Format cents as KES string. KES 150.00 stored as 15000 cents. */
export function formatKES(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function decimalToCents(amount: number): number {
  return Math.round(amount * 100);
}

export function centsToDec(cents: number): number {
  return cents / 100;
}

/** Weight pricing: weight in grams × price per KG. Rounds to nearest KES 0.50 */
export function calculateWeightedPrice(
  weightGrams: number,
  pricePerKgCents: number,
): number {
  const rawCents = Math.round((weightGrams / 1000) * pricePerKgCents);
  return Math.round(rawCents / 50) * 50;
}

// ─── TAX UTILS ───────────────────────────────────────────────

/** Extract the VAT component from a VAT-inclusive amount (16% rate). */
export function calculateVAT(inclusiveAmountCents: number): number {
  return Math.round(inclusiveAmountCents * 16 / 116);
}

/** Extract the TOT component from a TOT-inclusive amount. Rate defaults to KRA Finance Act 2023 rate of 3%. */
export function calculateTOT(inclusiveAmountCents: number, ratePct = 3): number {
  return Math.round(inclusiveAmountCents * ratePct / (100 + ratePct));
}

export function calculateServiceCharge(
  subtotalCents: number,
  rate: number, // e.g. 10 for 10%
): number {
  return Math.round(subtotalCents * (rate / 100));
}

// ─── DATE UTILS ──────────────────────────────────────────────

export function isExpired(expiryDate: Date | null | undefined): boolean {
  if (!expiryDate) return false;
  return new Date() > new Date(expiryDate);
}

export function isExpiringSoon(
  expiryDate: Date | null | undefined,
  daysThreshold: number,
): boolean {
  if (!expiryDate) return false;
  const threshold = new Date();
  threshold.setDate(threshold.getDate() + daysThreshold);
  return new Date(expiryDate) <= threshold;
}

export function formatDate(date: Date | string): string {
  return new Date(date).toLocaleDateString('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(date: Date | string): string {
  return new Date(date).toLocaleString('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ─── RECEIPT NUMBER UTILS ─────────────────────────────────────
// Generated server-side only. Formats shown here for display purposes.

export function formatReceiptNumber(
  storeCode: string,
  year: number,
  sequence: number,
): string {
  return `${storeCode}-${year}-${String(sequence).padStart(7, '0')}`;
}

export function formatPONumber(year: number, sequence: number): string {
  return `PO-${year}-${String(sequence).padStart(5, '0')}`;
}

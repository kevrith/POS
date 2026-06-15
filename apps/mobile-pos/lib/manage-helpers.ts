/**
 * Pure helpers for the Manage section.
 *
 * Stock levels on the server are a movement-based ledger: current stock is the
 * SUM of signed InventoryMovement.quantity rows (see inventory.service). So to
 * change stock we POST /inventory/adjustment with a SIGNED quantity:
 *   - receive a delivery  -> positive GRN_RECEIPT
 *   - record wastage/loss  -> negative ADJUSTMENT
 *   - set an exact count   -> ADJUSTMENT of (target - current), may be negative
 *
 * No React-Native / Expo imports here on purpose — this file is unit-tested in a
 * plain Node (ts-jest) environment.
 */

export type AdjustMode = 'RECEIVE' | 'REMOVE' | 'SET';

export interface AdjustmentInput {
  itemId: string;
  storeId: string;
  businessId: string;
  mode: AdjustMode;
  /** The number the user typed (always entered as a positive amount). */
  amount: number;
  /** Current stock level — only needed for SET mode. */
  currentStock?: number;
  notes?: string;
}

export interface AdjustmentPayload {
  itemId: string;
  storeId: string;
  businessId: string;
  type: 'GRN_RECEIPT' | 'ADJUSTMENT';
  quantity: number;
  notes?: string;
}

/**
 * Turn a manager's intent into the signed movement the API expects.
 * Returns null when the adjustment would be a no-op (zero delta) so callers can
 * avoid creating empty ledger rows.
 */
export function buildAdjustmentPayload(input: AdjustmentInput): AdjustmentPayload | null {
  const amount = Math.abs(Number(input.amount) || 0);
  let type: AdjustmentPayload['type'] = 'ADJUSTMENT';
  let quantity = 0;

  switch (input.mode) {
    case 'RECEIVE':
      type = 'GRN_RECEIPT';
      quantity = amount;
      break;
    case 'REMOVE':
      type = 'ADJUSTMENT';
      quantity = -amount;
      break;
    case 'SET': {
      const current = Number(input.currentStock) || 0;
      const target = Number(input.amount) || 0; // SET uses the raw value as target
      quantity = target - current;
      type = 'ADJUSTMENT';
      break;
    }
  }

  if (quantity === 0) return null;

  return {
    itemId: input.itemId,
    storeId: input.storeId,
    businessId: input.businessId,
    type,
    quantity,
    notes: input.notes?.trim() || undefined,
  };
}

/** KES (major units) -> integer cents for the API. Returns 0 for bad input. */
export function toCents(value: string | number): number {
  const n = typeof value === 'number' ? value : parseFloat(value);
  if (!isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

/** Integer cents -> editable major-unit string for price inputs. */
export function centsToInput(cents?: number | null): string {
  if (cents == null) return '';
  return (cents / 100).toString();
}

export type StockStatus = 'OUT' | 'LOW' | 'OK';

/** Classify an item's stock for badge colouring in the list. */
export function stockStatus(currentStock: number, reorderLevel?: number | null): StockStatus {
  if (currentStock <= 0) return 'OUT';
  if (reorderLevel != null && reorderLevel > 0 && currentStock <= reorderLevel) return 'LOW';
  return 'OK';
}

/** Days until a date (UTC-safe, floored). Negative = already past. */
export function daysUntil(date: string | Date, now: Date = new Date()): number {
  const d = typeof date === 'string' ? new Date(date) : date;
  const ms = d.getTime() - now.getTime();
  return Math.floor(ms / (1000 * 60 * 60 * 24));
}

export type ExpiryBucket = 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'OK';

/** Bucket a batch by how close its expiry is (matches the web Expiry report). */
export function expiryBucket(expiryDate?: string | Date | null, now: Date = new Date()): ExpiryBucket {
  if (!expiryDate) return 'OK';
  const days = daysUntil(expiryDate, now);
  if (days < 0) return 'EXPIRED';
  if (days <= 7) return 'CRITICAL';
  if (days <= 30) return 'WARNING';
  return 'OK';
}

/** Count variance for a stock-take line: counted - expected (negative = shrink). */
export function countVariance(expected: number, counted: number): number {
  return (Number(counted) || 0) - (Number(expected) || 0);
}

/** 32-char id for idempotent offline-creatable records (matches POS payment). */
export function offlineId(): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

/** Validate a new-item form before POSTing. Returns an error string or null. */
export function validateItemForm(input: { name?: string; priceKes?: string }): string | null {
  if (!input.name || !input.name.trim()) return 'Item name is required.';
  const cents = toCents(input.priceKes ?? '');
  if (cents <= 0) return 'A valid selling price is required.';
  return null;
}

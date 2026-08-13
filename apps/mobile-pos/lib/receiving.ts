/**
 * Pure helpers for purchase orders and goods receiving (GRN).
 *
 * The awkward bit this module hides: `POItem` has NO `item` relation, so a PO
 * comes back with `itemId` only and names must be joined client-side from the
 * items list. Everything that derives "how much of this line is still
 * outstanding" also lives here, because receiving the wrong quantity silently
 * corrupts the stock ledger.
 */

export const PO_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'APPROVED',
  'PARTIALLY_RECEIVED',
  'RECEIVED',
  'CANCELLED',
] as const;

export type PoStatus = (typeof PO_STATUSES)[number];

export const PO_STATUS_LABELS: Record<PoStatus, string> = {
  DRAFT: 'Draft',
  SUBMITTED: 'Awaiting approval',
  APPROVED: 'Approved',
  PARTIALLY_RECEIVED: 'Part received',
  RECEIVED: 'Received',
  CANCELLED: 'Cancelled',
};

export interface PoItem {
  id: string;
  itemId: string;
  quantityOrdered: number;
  agreedPriceCents: number;
}

export interface GrnItem {
  poItemId: string;
  quantityReceived: number;
}

export interface Grn {
  id: string;
  receivedAt: string;
  items: GrnItem[];
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  status: string;
  createdAt: string;
  expectedDelivery?: string | null;
  notes?: string | null;
  supplier?: { name?: string } | null;
  items: PoItem[];
  grns?: Grn[];
}

export function normalizePoStatus(raw?: string | null): PoStatus {
  const upper = (raw ?? '').toUpperCase();
  return (PO_STATUSES as readonly string[]).includes(upper) ? (upper as PoStatus) : 'DRAFT';
}

/**
 * Only an APPROVED (or part-received) PO may be received against — the API
 * rejects anything else, so the button should not be offered either.
 */
export function canReceive(status?: string | null): boolean {
  const st = normalizePoStatus(status);
  return st === 'APPROVED' || st === 'PARTIALLY_RECEIVED';
}

/** Total already booked in across every GRN for one PO line. */
export function receivedQty(poItemId: string, grns: Grn[] | undefined): number {
  return (grns ?? [])
    .flatMap((g) => g.items ?? [])
    .filter((i) => i.poItemId === poItemId)
    .reduce((sum, i) => sum + i.quantityReceived, 0);
}

/**
 * How many units of a line are still owed.
 *
 * Clamped at zero: over-delivery happens (a supplier sends 13 when 12 were
 * ordered), and a negative "outstanding" would pre-fill the receive form with
 * nonsense.
 */
export function outstandingQty(line: PoItem, grns: Grn[] | undefined): number {
  return Math.max(0, line.quantityOrdered - receivedQty(line.id, grns));
}

export interface PoProgress {
  lines: number;
  linesComplete: number;
  unitsOrdered: number;
  unitsReceived: number;
  /** 0–100, rounded. */
  percent: number;
  fullyReceived: boolean;
}

export function poProgress(po: PurchaseOrder): PoProgress {
  const lines = po.items.length;
  let unitsOrdered = 0;
  let unitsReceived = 0;
  let linesComplete = 0;

  for (const line of po.items) {
    const got = receivedQty(line.id, po.grns);
    unitsOrdered += line.quantityOrdered;
    // Cap the credited amount at what was ordered so an over-delivery on one
    // line cannot push the whole PO past 100%.
    unitsReceived += Math.min(got, line.quantityOrdered);
    if (got >= line.quantityOrdered) linesComplete += 1;
  }

  return {
    lines,
    linesComplete,
    unitsOrdered,
    unitsReceived,
    percent: unitsOrdered === 0 ? 0 : Math.round((unitsReceived / unitsOrdered) * 100),
    fullyReceived: lines > 0 && linesComplete === lines,
  };
}

/** PO value from its lines — the model stores no total. */
export function poTotalCents(po: PurchaseOrder): number {
  return po.items.reduce((sum, i) => sum + i.quantityOrdered * i.agreedPriceCents, 0);
}

export interface ReceiveRow {
  poItemId: string;
  quantityReceived: number;
  batchLotNumber?: string;
  expiryDate?: string;
}

/**
 * Build the GRN body, dropping untouched lines.
 *
 * A GRN records what physically arrived, so lines left at zero must not be sent
 * — posting a zero-quantity row would write a meaningless stock movement.
 */
export function buildGrnPayload(rows: ReceiveRow[]): ReceiveRow[] {
  return rows
    .filter((r) => r.quantityReceived > 0)
    .map((r) => ({
      poItemId: r.poItemId,
      quantityReceived: r.quantityReceived,
      ...(r.batchLotNumber?.trim() ? { batchLotNumber: r.batchLotNumber.trim() } : {}),
      ...(r.expiryDate?.trim() ? { expiryDate: r.expiryDate.trim() } : {}),
    }));
}

/** Parse a quantity typed on the receiving form. Returns 0 for anything unusable. */
export function parseQty(input: string): number {
  const n = Number(input.trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

/**
 * `YYYY-MM-DD`, the format the GRN endpoint parses with `new Date(...)`.
 * Anything else is rejected so a typo cannot become an Invalid Date expiry.
 */
export function isValidExpiry(input: string): boolean {
  const trimmed = input.trim();
  if (!trimmed) return true; // optional field
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return false;
  const d = new Date(trimmed);
  return !Number.isNaN(d.getTime());
}

export const DAMAGE_REASONS = [
  'Broken',
  'Expired',
  'Spoiled',
  'Theft',
  'Customer return',
  'Other',
];

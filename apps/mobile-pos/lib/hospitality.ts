/**
 * Pure helpers for the dine-in (hospitality) screens.
 *
 * The phone's job on a restaurant floor is the PRE-cart step the web POS does
 * with a floor-plan grid: pick a table, add items to its open order, fire them
 * to the kitchen, then request the bill. Everything here is the logic behind
 * that, kept free of React so it unit-tests in plain Node.
 */

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'BILL_REQUESTED' | 'RESERVED';

export type KotStatus = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'SERVED';

export interface FloorTable {
  id: string;
  number: string;
  capacity: number;
  floor?: string | null;
  status: string;
  currentOrderId: string | null;
  hasReadyKOT: boolean;
  hasPendingKOT: boolean;
  activeKOTCount: number;
}

export interface OrderLine {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  specialInstructions?: string | null;
  course?: string | null;
  firedAt?: string | null;
}

export interface KitchenTicket {
  id: string;
  createdAt: string;
  table?: { number: string } | null;
  waiter?: { name: string } | null;
  items: OrderLine[];
}

/** Normalise whatever the API sends into a known status. */
export function normalizeTableStatus(raw?: string | null): TableStatus {
  const upper = (raw ?? '').toUpperCase();
  return upper === 'OCCUPIED' || upper === 'BILL_REQUESTED' || upper === 'RESERVED'
    ? (upper as TableStatus)
    : 'AVAILABLE';
}

export const TABLE_STATUS_LABELS: Record<TableStatus, string> = {
  AVAILABLE: 'Free',
  OCCUPIED: 'Seated',
  BILL_REQUESTED: 'Bill asked',
  RESERVED: 'Reserved',
};

/**
 * Whether tapping a table should START a new order or OPEN the existing one.
 *
 * A table can read OCCUPIED while its order was cancelled elsewhere, so the
 * decision follows `currentOrderId` rather than the status label — starting a
 * second order on an occupied table is rejected by the API anyway.
 */
export function tableAction(t: FloorTable): 'open' | 'start' {
  return t.currentOrderId ? 'open' : 'start';
}

/** Sort the floor the way a waiter scans it: needs-attention first, then by number. */
export function sortFloor(tables: FloorTable[]): FloorTable[] {
  const rank = (t: FloorTable) => {
    if (t.hasReadyKOT) return 0;                                     // food waiting to run
    if (normalizeTableStatus(t.status) === 'BILL_REQUESTED') return 1; // guest wants to pay
    if (normalizeTableStatus(t.status) === 'OCCUPIED') return 2;
    return 3;
  };
  return [...tables].sort((a, b) => {
    const d = rank(a) - rank(b);
    if (d !== 0) return d;
    // Table numbers are strings ("1", "12", "A3") — compare numerically when
    // both are numbers so 12 doesn't sort before 2.
    const an = Number(a.number);
    const bn = Number(b.number);
    if (!Number.isNaN(an) && !Number.isNaN(bn)) return an - bn;
    return a.number.localeCompare(b.number);
  });
}

export interface FloorSummary {
  total: number;
  free: number;
  seated: number;
  billRequested: number;
  foodReady: number;
}

export function summariseFloor(tables: FloorTable[]): FloorSummary {
  return tables.reduce<FloorSummary>(
    (acc, t) => {
      acc.total += 1;
      const st = normalizeTableStatus(t.status);
      if (st === 'AVAILABLE') acc.free += 1;
      if (st === 'OCCUPIED') acc.seated += 1;
      if (st === 'BILL_REQUESTED') acc.billRequested += 1;
      if (t.hasReadyKOT) acc.foodReady += 1;
      return acc;
    },
    { total: 0, free: 0, seated: 0, billRequested: 0, foodReady: 0 },
  );
}

/** Bill subtotal for an open order. */
export function orderTotalCents(lines: OrderLine[]): number {
  return lines.reduce((sum, l) => sum + l.totalCents, 0);
}

/**
 * Lines added since the last KOT — i.e. what "Send to kitchen" would fire.
 *
 * `firedAt` is stamped when a line goes to the kitchen, so anything still null
 * has never been sent. Firing an already-fired line would cook it twice.
 */
export function unfiredLines(lines: OrderLine[]): OrderLine[] {
  return lines.filter((l) => !l.firedAt);
}

/** Minutes a ticket has been waiting, for the kitchen's ageing colour. */
export function minutesSince(iso: string, now: Date = new Date()): number {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 60_000));
}

export type TicketAge = 'fresh' | 'warm' | 'late';

/**
 * Kitchen ageing bands. Ten minutes is the usual "should be plated" mark and
 * twenty is where a table starts complaining — the thresholds a KDS colours on.
 */
export function ticketAge(minutes: number): TicketAge {
  if (minutes >= 20) return 'late';
  if (minutes >= 10) return 'warm';
  return 'fresh';
}

/** Build the payload for POST /hospitality/orders/:id/items from a cart. */
export function buildAddItemsPayload(
  picks: Array<{ itemId: string; name: string; quantity: number; unitPriceCents: number; note?: string }>,
): Array<{ itemId: string; name: string; quantity: number; unitPriceCents: number; specialInstructions?: string }> {
  return picks
    .filter((p) => p.quantity > 0)
    .map((p) => ({
      itemId: p.itemId,
      name: p.name,
      quantity: p.quantity,
      unitPriceCents: p.unitPriceCents,
      ...(p.note?.trim() ? { specialInstructions: p.note.trim() } : {}),
    }));
}

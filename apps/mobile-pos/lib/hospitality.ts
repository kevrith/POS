/**
 * Pure helpers for the dine-in (hospitality) screens.
 *
 * The phone's job on a restaurant floor is the PRE-cart step the web POS does
 * with a floor-plan grid: pick a table, add items to its open order, fire them
 * to the kitchen, then request the bill. Everything here is the logic behind
 * that, kept free of React so it unit-tests in plain Node.
 */

export type TableStatus = 'AVAILABLE' | 'OCCUPIED' | 'BILL_REQUESTED' | 'RESERVED';

export type KotStatus = 'PENDING' | 'IN_PROGRESS' | 'READY' | 'SERVED' | 'CANCELLED';

/** The preparation area that makes a ticket's items. Mirrors KOT_STATIONS in @pos/shared. */
export type KotStation = 'KITCHEN' | 'BAR' | 'DESSERT';
export const KOT_STATIONS: readonly KotStation[] = ['KITCHEN', 'BAR', 'DESSERT'];
export const STATION_LABELS: Record<KotStation, string> = { KITCHEN: 'Kitchen', BAR: 'Bar', DESSERT: 'Dessert' };

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
  /** JSON list of modifier names, or of { name, priceCents } objects. */
  modifiers?: string | null;
  course?: string | null;
  seatNumber?: number | null;
  /** Stamped when the line goes onto a kitchen ticket. (`firedAt` is the course-fire marker; not this.) */
  sentToKitchenAt?: string | null;
  firedAt?: string | null;
}

/** One kitchen ticket as the displays receive it (GET /hospitality/kds/orders). */
export interface KdsTicket {
  id: string;
  kotNumber: number;
  type: string;
  station: KotStation;
  status: string;
  createdAt: string;
  assignedChef?: { id: string; name: string } | null;
  order: {
    id: string;
    isVIP?: boolean;
    priority?: number;
    roomNumber?: string | null;
    table?: { number: string } | null;
    waiter?: { name: string } | null;
    items: OrderLine[];
  };
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
 * Lines added since the last KOT — i.e. what "Send to kitchen" would send.
 *
 * `sentToKitchenAt` is stamped by the server when a line goes onto a ticket, so
 * anything still null has never been sent. Sending a sent line would cook it
 * twice. (This used to read `firedAt`, which the ticket never set: the line kept
 * reading "not sent" after it had been, and a second tap made a duplicate.)
 */
export function unsentLines(lines: OrderLine[]): OrderLine[] {
  return lines.filter((l) => !l.sentToKitchenAt);
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

/** Modifiers are stored as a JSON list of names or of { name, priceCents } objects. */
export function modifierNames(raw?: string | null): string[] {
  if (!raw) return [];
  try {
    const list = JSON.parse(raw) as Array<string | { name?: string }>;
    return Array.isArray(list)
      ? list.map((m) => (typeof m === 'string' ? m : m?.name ?? '')).filter(Boolean)
      : [];
  } catch {
    return [];
  }
}

/** Where a ticket is going: the table, the room, or the counter. */
export function ticketLocation(t: Pick<KdsTicket, 'order'>): string {
  if (t.order.table?.number) return `Table ${t.order.table.number}`;
  if (t.order.roomNumber) return `Room ${t.order.roomNumber}`;
  return 'Takeaway';
}

/** Tickets for one station, or all of them. */
export function ticketsForStation(tickets: KdsTicket[], station: KotStation | 'ALL'): KdsTicket[] {
  return station === 'ALL' ? tickets : tickets.filter((t) => t.station === station);
}

export interface TicketAction {
  label: string;
  to: KotStatus;
  tone: 'primary' | 'success' | 'neutral';
}

/**
 * The buttons a ticket offers, in order. Mirrors the server's transition table:
 * a bar has nothing to cook so a drink goes straight to ready; a ready ticket can
 * be recalled; only non-kitchen roles may mark it served (the cook's job ends at
 * the pass).
 */
export function ticketActions(t: Pick<KdsTicket, 'status' | 'station'>, role?: string | null): TicketAction[] {
  switch (t.status) {
    case 'PENDING':
      return t.station === 'BAR'
        ? [{ label: 'Mark ready', to: 'READY', tone: 'success' }]
        : [{ label: 'Start cooking', to: 'IN_PROGRESS', tone: 'primary' }];
    case 'IN_PROGRESS':
      return [{ label: 'Mark ready', to: 'READY', tone: 'success' }];
    case 'READY': {
      const out: TicketAction[] = [{ label: 'Recall', to: 'IN_PROGRESS', tone: 'neutral' }];
      if ((role ?? '').toUpperCase() !== 'KITCHEN') out.push({ label: 'Served', to: 'SERVED', tone: 'success' });
      return out;
    }
    default:
      return [];
  }
}

/**
 * Normalises the four things a manager can be asked to approve into one feed.
 *
 * Expenses, leave, salary advances and purchase orders each come from a
 * different controller with a different row shape, different status vocabulary
 * and a different "who asked" field. The screen should not care: it renders one
 * list, oldest first, and posts back to whichever endpoint the item names.
 *
 * Pure module — the mappers take a `nameOf` resolver rather than reaching for a
 * store, so they unit-test in plain Node.
 */

export type ApprovalKind = 'expense' | 'leave' | 'advance' | 'po';

export interface ApprovalItem {
  kind: ApprovalKind;
  id: string;
  /** Headline — what is being asked for. */
  title: string;
  /** Supporting detail — reason, description, supplier. */
  subtitle: string;
  /** Person who submitted it, already resolved to a display name. */
  who: string;
  /** ISO timestamp the request was raised. */
  whenISO: string;
  /** Money at stake, when the request has an amount. */
  amountCents?: number;
}

/** Resolves a user/employee id to a display name; returns undefined when unknown. */
export type NameResolver = (id: string | null | undefined) => string | undefined;

const UNKNOWN = 'Unknown';

// ── Raw API row shapes (only the fields we actually read) ────────────────────

export interface RawExpense {
  id: string;
  amountCents: number;
  category: string;
  description: string;
  submittedBy: string;
  createdAt: string;
}

export interface RawLeave {
  id: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string | null;
  createdAt: string;
  employee?: { id?: string; user?: { name?: string } | null } | null;
}

export interface RawAdvance {
  id: string;
  amountCents: number;
  reason: string;
  requestedAt: string;
  employee?: { id?: string; user?: { name?: string } | null } | null;
}

export interface RawPurchaseOrder {
  id: string;
  poNumber: string;
  createdAt: string;
  notes?: string | null;
  supplier?: { name?: string } | null;
  items?: Array<{ quantityOrdered: number; agreedPriceCents: number }>;
}

// ── Mappers ─────────────────────────────────────────────────────────────────

export function mapExpense(e: RawExpense, nameOf: NameResolver): ApprovalItem {
  return {
    kind: 'expense',
    id: e.id,
    title: e.category,
    subtitle: e.description,
    who: nameOf(e.submittedBy) ?? UNKNOWN,
    whenISO: e.createdAt,
    amountCents: e.amountCents,
  };
}

/**
 * Leave days are counted INCLUSIVE of both ends — a Friday-to-Friday request is
 * one day off, not zero.
 */
export function leaveDays(startISO: string, endISO: string): number {
  const start = new Date(startISO);
  const end = new Date(endISO);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return 0;
  const ms = end.setHours(0, 0, 0, 0) - start.setHours(0, 0, 0, 0);
  if (ms < 0) return 0;
  return Math.floor(ms / 86_400_000) + 1;
}

export function mapLeave(l: RawLeave): ApprovalItem {
  const days = leaveDays(l.startDate, l.endDate);
  return {
    kind: 'leave',
    id: l.id,
    title: `${l.type} leave · ${days} day${days === 1 ? '' : 's'}`,
    subtitle: l.reason?.trim() || 'No reason given',
    who: l.employee?.user?.name ?? UNKNOWN,
    whenISO: l.createdAt,
  };
}

export function mapAdvance(a: RawAdvance): ApprovalItem {
  return {
    kind: 'advance',
    id: a.id,
    title: 'Salary advance',
    subtitle: a.reason?.trim() || 'No reason given',
    who: a.employee?.user?.name ?? UNKNOWN,
    whenISO: a.requestedAt,
    amountCents: a.amountCents,
  };
}

/** PO total is derived from its lines — the model stores no total column. */
export function poTotalCents(po: RawPurchaseOrder): number {
  return (po.items ?? []).reduce((sum, i) => sum + i.quantityOrdered * i.agreedPriceCents, 0);
}

export function mapPurchaseOrder(po: RawPurchaseOrder): ApprovalItem {
  return {
    kind: 'po',
    id: po.id,
    title: `PO ${po.poNumber}`,
    subtitle: po.supplier?.name || po.notes?.trim() || 'Purchase order',
    who: po.supplier?.name ?? UNKNOWN,
    whenISO: po.createdAt,
    amountCents: poTotalCents(po),
  };
}

// ── Feed assembly ───────────────────────────────────────────────────────────

/**
 * Oldest first: the thing that has been blocking someone longest belongs at the
 * top of a manager's list, which is the opposite of the newest-first ordering
 * every source endpoint returns.
 */
export function sortApprovals(items: ApprovalItem[]): ApprovalItem[] {
  return [...items].sort((a, b) => {
    const at = new Date(a.whenISO).getTime();
    const bt = new Date(b.whenISO).getTime();
    // Unparseable dates sink to the bottom rather than scrambling the order.
    if (Number.isNaN(at)) return 1;
    if (Number.isNaN(bt)) return -1;
    return at - bt;
  });
}

export function countByKind(items: ApprovalItem[]): Record<ApprovalKind, number> {
  const counts: Record<ApprovalKind, number> = { expense: 0, leave: 0, advance: 0, po: 0 };
  for (const i of items) counts[i.kind] += 1;
  return counts;
}

/** Whole days a request has been waiting, for the "3 days waiting" badge. */
export function daysWaiting(whenISO: string, now: Date = new Date()): number {
  const then = new Date(whenISO).getTime();
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((now.getTime() - then) / 86_400_000));
}

/** Endpoints each kind posts its decision to. */
export const APPROVAL_ENDPOINTS: Record<
  ApprovalKind,
  { approve: (id: string) => string; reject: (id: string) => string }
> = {
  expense: {
    approve: (id) => `/expenses/${id}/approve`,
    reject: (id) => `/expenses/${id}/reject`,
  },
  leave: {
    approve: (id) => `/hr/leave/${id}/approve`,
    reject: (id) => `/hr/leave/${id}/reject`,
  },
  advance: {
    approve: (id) => `/hr/salary-advances/${id}/approve`,
    reject: (id) => `/hr/salary-advances/${id}/reject`,
  },
  po: {
    // A purchase order has no approve/reject route — it moves along a status
    // machine, so both decisions are a PATCH to the same status endpoint.
    approve: (id) => `/suppliers/purchase-orders/${id}/status`,
    reject: (id) => `/suppliers/purchase-orders/${id}/status`,
  },
};

/**
 * Decision bodies differ per endpoint: expenses and leave take `approvedBy` for
 * both outcomes, advances switch to `rejectedBy` on a reject, and a PO carries a
 * target status instead of a user id.
 */
export function decisionBody(
  kind: ApprovalKind,
  approve: boolean,
  userId: string,
): Record<string, unknown> {
  switch (kind) {
    case 'expense':
    case 'leave':
      return { approvedBy: userId };
    case 'advance':
      return approve ? { approvedBy: userId } : { rejectedBy: userId };
    case 'po':
      return { status: approve ? 'APPROVED' : 'CANCELLED' };
  }
}

export const KIND_LABELS: Record<ApprovalKind, string> = {
  expense: 'Expense',
  leave: 'Leave',
  advance: 'Advance',
  po: 'Purchase Order',
};

/**
 * Salon / spa screens: the shapes the API returns and the pure rules the screens use (bill totals, the day board, hours).
 * No React here, so it is all tested.
 */

export interface BookedService {
  itemId?: string | null;
  name: string;
  unitPriceCents: number;
  durationMin: number;
  staffId?: string | null;
  position?: number;
}

export interface Appointment {
  id: string;
  customerId?: string | null;
  customerName: string;
  customerPhone?: string | null;
  serviceItemId?: string | null;
  staffId?: string | null;
  scheduledAt: string;
  duration: number;
  status: string;
  notes?: string | null;
  depositCents: number;
  saleId?: string | null;
  createdAt?: string;
  /** Empty for an appointment made before several services were possible. */
  services?: BookedService[];
}

/** Weekly hours: weekday (0 = Sunday) to [from, to] as HH:MM; a weekday left out is a day off. */
export type WorkingHours = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', [string, string]>>;

export interface Stylist {
  userId: string;
  name: string;
  role: string;
  active: boolean;
  workingHours: WorkingHours;
}

const NAIROBI_MS = 3 * 60 * 60_000;
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Minutes since midnight in Nairobi for an instant. */
export function nairobiMinuteOfDay(at: Date | string | number): number {
  const t = new Date(new Date(at).getTime() + NAIROBI_MS);
  return t.getUTCHours() * 60 + t.getUTCMinutes();
}

export const visitMinutes = (services: Array<{ durationMin: number }>): number => services.reduce((s, x) => s + x.durationMin, 0);

export const visitPriceCents = (services: Array<{ unitPriceCents: number }>): number => services.reduce((s, x) => s + x.unitPriceCents, 0);

/** "09:00" for a minute of the day. */
export function clock(minute: number): string {
  const m = ((Math.round(minute) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}

/** "Mon-Fri 09:00-18:00, Sat 10:00-16:00" (days with the same hours grouped when they run on). */
export function hoursLabel(hours: WorkingHours): string {
  const days = (Object.keys(hours) as Array<keyof WorkingHours>).map(Number).sort((a, b) => a - b);
  if (days.length === 0) return 'Any time';
  const groups: Array<{ first: number; last: number; range: string }> = [];
  for (const d of days) {
    const range = hours[String(d) as keyof WorkingHours]!.join('-');
    const last = groups[groups.length - 1];
    if (last && last.range === range && last.last === d - 1) last.last = d;
    else groups.push({ first: d, last: d, range });
  }
  return groups.map((g) => `${g.first === g.last ? DAY_NAMES[g.first] : `${DAY_NAMES[g.first]}-${DAY_NAMES[g.last]}`} ${g.range}`).join(', ');
}

// ── The bill ────────────────────────────────────────────────────────────────

export interface BillLine {
  quantity: number;
  unitPriceCents: number;
}

export interface BillTotals {
  priceCents: number;
  /** The deposit used toward the bill. */
  appliedCents: number;
  /** What is left to pay for the invoice (the tip is separate). */
  dueCents: number;
  /** Deposit larger than the bill, to be paid back. */
  surplusCents: number;
}

export function billTotals(lines: BillLine[], depositCents: number): BillTotals {
  const priceCents = lines.reduce((s, l) => s + Math.round(l.unitPriceCents * l.quantity), 0);
  const appliedCents = Math.min(depositCents, priceCents);
  return { priceCents, appliedCents, dueCents: priceCents - appliedCents, surplusCents: depositCents - appliedCents };
}

// ── The day board: one column per stylist, a block per service ───────────────

export interface BoardBlock {
  key: string;
  appointment: Appointment;
  /** What is being done in this block: a service name, or the customer's booking when no service was stored. */
  label: string;
  startMin: number;
  endMin: number;
}

export interface BoardColumn {
  key: string;
  name: string;
  blocks: BoardBlock[];
}

/** The blocks of one appointment: each stored service in turn (with its own stylist), or one block for an older appointment. */
export function appointmentBlocks(appt: Appointment): Array<{ staffId: string | null; label: string; startMin: number; endMin: number }> {
  const start = nairobiMinuteOfDay(appt.scheduledAt);
  const services = [...(appt.services ?? [])].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  if (services.length === 0) return [{ staffId: appt.staffId ?? null, label: appt.customerName, startMin: start, endMin: start + appt.duration }];
  let cursor = start;
  return services.map((s) => {
    const block = { staffId: s.staffId ?? null, label: s.name, startMin: cursor, endMin: cursor + s.durationMin };
    cursor = block.endMin;
    return block;
  });
}

/** Columns for the board: every active stylist, plus "Unassigned" when a block has nobody. Cancelled and no-show are left off. */
export function boardColumns(appointments: Appointment[], stylists: Stylist[]): BoardColumn[] {
  const columns = new Map<string, BoardColumn>(stylists.filter((s) => s.active).map((s) => [s.userId, { key: s.userId, name: s.name, blocks: [] }]));
  const unassigned: BoardColumn = { key: 'unassigned', name: 'Unassigned', blocks: [] };
  for (const a of appointments) {
    if (a.status === 'CANCELLED' || a.status === 'NO_SHOW') continue;
    appointmentBlocks(a).forEach((b, i) => {
      const column = (b.staffId && columns.get(b.staffId)) || unassigned;
      column.blocks.push({ key: `${a.id}-${i}`, appointment: a, label: b.label, startMin: b.startMin, endMin: b.endMin });
    });
  }
  const out = [...columns.values()];
  if (unassigned.blocks.length > 0) out.push(unassigned);
  for (const c of out) c.blocks.sort((x, y) => x.startMin - y.startMin);
  return out;
}

/** The hours the board shows: 8:00-20:00 by default, widened to take in every block, on whole hours. */
export function boardRange(columns: BoardColumn[]): { fromMin: number; toMin: number } {
  let from = 8 * 60;
  let to = 20 * 60;
  for (const c of columns) for (const b of c.blocks) {
    from = Math.min(from, Math.floor(b.startMin / 60) * 60);
    to = Math.max(to, Math.ceil(b.endMin / 60) * 60);
  }
  return { fromMin: Math.max(0, from), toMin: Math.min(24 * 60, to) };
}

/** Blocks of one column that overlap in time (a double booking that older data can hold), by block key. */
export function overlappingKeys(blocks: BoardBlock[]): Set<string> {
  const keys = new Set<string>();
  const sorted = [...blocks].sort((a, b) => a.startMin - b.startMin);
  for (let i = 0; i < sorted.length; i++) {
    for (let j = i + 1; j < sorted.length && sorted[j].startMin < sorted[i].endMin; j++) {
      keys.add(sorted[i].key);
      keys.add(sorted[j].key);
    }
  }
  return keys;
}

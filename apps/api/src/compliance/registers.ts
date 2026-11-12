import { BadRequestException } from '@nestjs/common';
import { nairobiDay, parseFilterDate } from '../common/dates';

/**
 * The shaping of the registers a pharmacy may be asked to show an inspector, kept free of the database so it can be tested.
 * These are exports of the records KASTRA holds, laid out for reading and filing. They are not official forms.
 */

export const MAX_DAYS = 366;

/** A period of whole Nairobi days; defaults to the last 30 days. A bare date is the start or end of that day. */
export function periodOf(from: unknown, to: unknown, now = new Date()): { from: Date; to: Date; fromDay: string; toDay: string } {
  const end = to === undefined || to === '' ? now : parseFilterDate(String(to), 'end', 'End date');
  const start = from === undefined || from === '' ? new Date(end.getTime() - 29 * 86_400_000) : parseFilterDate(String(from), 'start', 'Start date');
  if (start > end) throw new BadRequestException('The start date is after the end date');
  if (end.getTime() - start.getTime() > MAX_DAYS * 86_400_000) throw new BadRequestException(`Choose a period of at most ${MAX_DAYS} days`);
  return { from: start, to: end, fromDay: nairobiDay(start), toDay: nairobiDay(end) };
}

export interface MedicineLine { name: string; qty?: number; dose?: number; doseUnit?: string; frequency?: string; durationDays?: number }

/** The medicines on a prescription as stored (JSON text), tolerating anything older. */
export function parseMedicines(raw: unknown): MedicineLine[] {
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.filter((x): x is MedicineLine => !!x && typeof x.name === 'string') : [];
  } catch {
    return [];
  }
}

export const medicinesText = (lines: MedicineLine[]): string =>
  lines.map((l) => `${l.name}${l.qty !== undefined ? ` x ${l.qty}` : ''}${l.dose !== undefined ? ` (${l.dose}${l.doseUnit ? ` ${l.doseUnit}` : ''}${l.frequency ? ` ${l.frequency}` : ''})` : ''}`).join('; ');

export interface ControlledEntry { itemName: string; quantityDispensed: number; dispensedAt: Date }
export interface ControlledItem { name: string; scheduleClass: string | null; onHand: number }

/** Per controlled medicine: what the register shows dispensed in the period, how many entries, and what the stock ledger holds now. */
export function controlledSummary(entries: ControlledEntry[], items: ControlledItem[]) {
  const rows = new Map<string, { itemName: string; scheduleClass: string | null; entries: number; dispensed: number; onHand: number | null }>();
  for (const i of items) rows.set(i.name.toLowerCase(), { itemName: i.name, scheduleClass: i.scheduleClass, entries: 0, dispensed: 0, onHand: i.onHand });
  for (const e of entries) {
    const key = e.itemName.toLowerCase();
    // An entry for a medicine no longer on the controlled list is still reported: an inspector asks about it.
    const row = rows.get(key) ?? { itemName: e.itemName, scheduleClass: null, entries: 0, dispensed: 0, onHand: null };
    row.entries += 1;
    row.dispensed = Math.round((row.dispensed + e.quantityDispensed) * 1000) / 1000;
    rows.set(key, row);
  }
  return [...rows.values()].sort((a, b) => a.itemName.localeCompare(b.itemName));
}

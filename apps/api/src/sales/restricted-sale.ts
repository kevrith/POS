import { BadRequestException } from '@nestjs/common';
import type { Prisma } from '@prisma/client';

/** Item.scheduleClass values that put a drug on the controlled-substance register. OTC and blank do not. */
export const CONTROLLED_SCHEDULES = ['II', 'III', 'IV', 'V'] as const;

export interface RestrictedItem { itemId: string; name: string; controlled: boolean; schedule: string | null; unit: string }

/** A sale of a restricted medicine without a prescription, approved by a manager. */
export interface RestrictedApproval {
  reason: string;
  approvedById: string;
  approvedByName: string;
  /** Required when a controlled drug is in the cart: the register must name who it went to. */
  patientName?: string;
  patientIdNumber?: string;
  prescriberName?: string;
}

/**
 * The medicines in a cart that may not go through an ordinary till: those marked "needs a prescription" and every
 * controlled drug. They are dispensed from a prescription (which checks the patient, the dose and the register), or sold
 * here only with a manager's approval and a reason, and then the sale is on record. Nothing else is affected: a business
 * that marks no medicine never sees this.
 */
export function restrictedItems(items: Array<{ id: string; name: string; requiresPrescription?: boolean | null; scheduleClass?: string | null; unitLabel?: string | null }>): RestrictedItem[] {
  const out: RestrictedItem[] = [];
  const seen = new Set<string>();
  for (const i of items) {
    if (seen.has(i.id)) continue;
    const controlled = !!i.scheduleClass && (CONTROLLED_SCHEDULES as readonly string[]).includes(i.scheduleClass);
    if (!i.requiresPrescription && !controlled) continue;
    seen.add(i.id);
    out.push({ itemId: i.id, name: i.name, controlled, schedule: controlled ? i.scheduleClass ?? null : null, unit: i.unitLabel ?? 'units' });
  }
  return out;
}

/** Which of these catalogue items (by id, in this business) are restricted. Ids that are blank or unknown are ignored. */
export async function loadRestricted(db: Pick<Prisma.TransactionClient, 'item'>, businessId: string, itemIds: Array<string | null | undefined>): Promise<RestrictedItem[]> {
  const ids = [...new Set(itemIds.filter((x): x is string => !!x))];
  if (ids.length === 0) return [];
  const items = await db.item.findMany({ where: { businessId, id: { in: ids } }, select: { id: true, name: true, requiresPrescription: true, scheduleClass: true, unitLabel: true } });
  return restrictedItems(items);
}

/**
 * For a path that has no way to ask a manager (a customer ordering online, a tab, a fuel or hotel invoice): refuse outright,
 * and say where the medicine can be dispensed.
 */
export function refuseRestricted(restricted: RestrictedItem[], where: string): void {
  if (restricted.length === 0) return;
  const names = restricted.map((r) => r.name).join(', ');
  throw new BadRequestException({
    message: `${names} ${restricted.length > 1 ? 'need' : 'needs'} a prescription and cannot be sold ${where}. Dispense ${restricted.length > 1 ? 'them' : 'it'} from Prescriptions at the pharmacy.`,
    code: 'RESTRICTED_SALE',
    details: restricted,
  });
}

/** Refuse the cart, or return the approval to record. Throws a coded refusal the till can act on. */
export function assertRestrictedAllowed(restricted: RestrictedItem[], approval?: RestrictedApproval): RestrictedApproval | null {
  if (restricted.length === 0) return null;
  if (!approval) {
    const names = restricted.map((r) => r.name).join(', ');
    throw new BadRequestException({
      message: `${names} ${restricted.length > 1 ? 'need' : 'needs'} a prescription. Dispense ${restricted.length > 1 ? 'them' : 'it'} from Prescriptions, or ask a manager to approve a sale without one.`,
      code: 'RESTRICTED_SALE',
      details: restricted,
    });
  }
  const reason = String(approval.reason ?? '').trim();
  if (reason.length < 5) throw new BadRequestException('Say why this is being sold without a prescription (at least a few words)');
  if (restricted.some((r) => r.controlled)) {
    if (!String(approval.patientName ?? '').trim()) throw new BadRequestException('A controlled drug goes on the register: enter who it is being sold to');
  }
  return { ...approval, reason };
}

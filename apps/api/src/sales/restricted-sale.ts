import { BadRequestException } from '@nestjs/common';

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

import { BadRequestException } from '@nestjs/common';
import { oneOf } from '../common/validate';

/** How a deposit may be paid in, or paid back. */
export const DEPOSIT_METHODS = ['CASH', 'MPESA', 'CARD', 'BANK'] as const;

/**
 * The method a booking's (or appointment's) deposit came in by: the largest, if it was split, so a refund goes back the
 * same way. Null when it is not on record, which is a deposit taken before the register existed.
 */
export async function knownDepositMethod(db: any, bookingId: string, businessId: string, reason: string): Promise<string | null> {
  const rows: Array<{ method: string; amountCents: number }> = await db.cashMovement.findMany({
    where: { bookingId, businessId, reason },
    select: { method: true, amountCents: true },
  });
  const totals = new Map<string, number>();
  for (const r of rows) totals.set(r.method, (totals.get(r.method) ?? 0) + r.amountCents);
  return [...totals.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
}

/** How a deposit is being paid back: the way it came in, else the way the desk says. It must say; cash is not assumed. */
export async function refundMethodFor(db: any, bookingId: string, businessId: string, reason: string, chosen?: string): Promise<string> {
  const known = await knownDepositMethod(db, bookingId, businessId, reason);
  if (known) return known;
  if (chosen === undefined || chosen === null || chosen === '') {
    throw new BadRequestException('This deposit was taken before deposits were recorded, so say how it is being paid back: cash, M-Pesa, card or bank');
  }
  return oneOf(String(chosen).toUpperCase(), 'Refund method', DEPOSIT_METHODS);
}

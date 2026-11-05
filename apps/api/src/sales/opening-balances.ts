import { Logger } from '@nestjs/common';
import type { LedgerService } from '../ledger/ledger.service';
import { buildOpeningLines } from './sale-ledger';

const logger = new Logger('OpeningBalances');

/**
 * What was already owed when a business switched its verticals onto the sales pipeline, so the accounts that the new
 * entries draw down do not start at zero and go negative. Run every time the owner switches on, and safe to repeat:
 * each part books only the DIFFERENCE between what is owed now and what the books already believe.
 *
 *  - Guest deposits held for open bookings. A booking's register rows (the deposit, or an earlier opening) say what
 *    is booked; any more on the booking is added as a row of method OPENING (never cash, so the drawer ignores it).
 *    A top-up taken while the pipeline was off is picked up the next time.
 *  - What fleet customers owe the business. Each account keeps `ledgerOwedCents`, the amount the books believe; the
 *    difference from the real balance is booked, in either direction (a fleet that paid while the pipeline was off).
 *  - Insurance claims raised by hand and still open: their amount is brought into receivables once
 *    (`receivableBooked`), so paying one later clears something real.
 *
 * The other side of every entry is Opening Balance Equity.
 */
export async function postVerticalOpeningBalances(
  prisma: any,
  ledger: Pick<LedgerService, 'autoPost'>,
  businessId: string,
): Promise<{ depositCents: number; fleetCents: number; claimCents: number; appointmentDepositCents: number }> {
  const stamp = Date.now();
  let depositCents = 0;
  let fleetCents = 0;
  let claimCents = 0;
  let appointmentDepositCents = 0;

  const held: Array<{ id: string; storeId: string; depositCents: number }> = await prisma.roomBooking.findMany({
    where: { businessId, status: { in: ['RESERVED', 'CHECKED_IN'] }, depositCents: { gt: 0 } },
    select: { id: true, storeId: true, depositCents: true },
  });
  if (held.length > 0) {
    const rows: Array<{ bookingId: string | null; amountCents: number }> = await prisma.cashMovement.findMany({
      where: { businessId, bookingId: { in: held.map((b) => b.id) }, kind: 'PAY_IN', reason: { in: ['HOTEL_DEPOSIT', 'HOTEL_DEPOSIT_OPENING'] } },
      select: { bookingId: true, amountCents: true },
    });
    const booked = new Map<string, number>();
    for (const r of rows) booked.set(r.bookingId as string, (booked.get(r.bookingId as string) ?? 0) + r.amountCents);
    const fresh = held
      .map((b) => ({ ...b, missing: b.depositCents - (booked.get(b.id) ?? 0) }))
      .filter((b) => b.missing > 0);
    if (fresh.length > 0) {
      await prisma.cashMovement.createMany({
        data: fresh.map((b) => ({ businessId, storeId: b.storeId, kind: 'PAY_IN', method: 'OPENING', amountCents: b.missing, reason: 'HOTEL_DEPOSIT_OPENING', bookingId: b.id })),
      });
      depositCents = fresh.reduce((sum, b) => sum + b.missing, 0);
      await ledger.autoPost({
        businessId,
        description: 'Opening balance: guest deposits already held',
        reference: `OPENING-DEPOSITS-${stamp}`,
        sourceType: 'OPENING_BALANCE',
        lines: buildOpeningLines('GUEST_DEPOSITS', depositCents),
      });
    }
  }

  // Deposits held for appointments still to come, the same way.
  const waiting: Array<{ id: string; storeId: string; depositCents: number }> = await prisma.appointment.findMany({
    where: { businessId, status: { in: ['BOOKED', 'CONFIRMED', 'IN_PROGRESS'] }, depositCents: { gt: 0 } },
    select: { id: true, storeId: true, depositCents: true },
  });
  if (waiting.length > 0) {
    const rows: Array<{ bookingId: string | null; amountCents: number }> = await prisma.cashMovement.findMany({
      where: { businessId, bookingId: { in: waiting.map((a) => a.id) }, kind: 'PAY_IN', reason: { in: ['APPOINTMENT_DEPOSIT', 'APPOINTMENT_DEPOSIT_OPENING'] } },
      select: { bookingId: true, amountCents: true },
    });
    const booked = new Map<string, number>();
    for (const r of rows) booked.set(r.bookingId as string, (booked.get(r.bookingId as string) ?? 0) + r.amountCents);
    const fresh = waiting.map((a) => ({ ...a, missing: a.depositCents - (booked.get(a.id) ?? 0) })).filter((a) => a.missing > 0);
    if (fresh.length > 0) {
      await prisma.cashMovement.createMany({
        data: fresh.map((a) => ({ businessId, storeId: a.storeId, kind: 'PAY_IN', method: 'OPENING', amountCents: a.missing, reason: 'APPOINTMENT_DEPOSIT_OPENING', bookingId: a.id })),
      });
      appointmentDepositCents = fresh.reduce((sum, a) => sum + a.missing, 0);
      await ledger.autoPost({
        businessId,
        description: 'Opening balance: appointment deposits already held',
        reference: `OPENING-APPT-DEPOSITS-${stamp}`,
        sourceType: 'OPENING_BALANCE',
        lines: buildOpeningLines('GUEST_DEPOSITS', appointmentDepositCents),
      });
    }
  }

  const accounts: Array<{ id: string; balanceCents: number; ledgerOwedCents: number }> = await prisma.fleetAccount.findMany({
    where: { businessId },
    select: { id: true, balanceCents: true, ledgerOwedCents: true },
  });
  const drift = accounts.map((a) => ({ id: a.id, owed: Math.max(0, -a.balanceCents), delta: Math.max(0, -a.balanceCents) - a.ledgerOwedCents })).filter((a) => a.delta !== 0);
  if (drift.length > 0) {
    fleetCents = drift.reduce((sum, a) => sum + a.delta, 0);
    for (const a of drift) await prisma.fleetAccount.updateMany({ where: { id: a.id, businessId }, data: { ledgerOwedCents: a.owed } });
    if (fleetCents !== 0) {
      await ledger.autoPost({
        businessId,
        description: 'Opening balance: owed by fleet accounts',
        reference: `OPENING-FLEET-${businessId}-${stamp}`,
        sourceType: 'OPENING_BALANCE',
        lines: buildOpeningLines('RECEIVABLE', fleetCents),
      });
    }
  }

  const claims: Array<{ id: string; billedCents: number }> = await prisma.insuranceClaim.findMany({
    where: { businessId, saleId: null, receivableBooked: false, status: { in: ['SUBMITTED', 'APPROVED'] } },
    select: { id: true, billedCents: true },
  });
  if (claims.length > 0) {
    await prisma.insuranceClaim.updateMany({ where: { id: { in: claims.map((c) => c.id) }, businessId }, data: { receivableBooked: true } });
    claimCents = claims.reduce((sum, c) => sum + c.billedCents, 0);
    if (claimCents > 0) {
      await ledger.autoPost({
        businessId,
        description: 'Opening balance: insurance claims awaiting payment',
        reference: `OPENING-CLAIMS-${stamp}`,
        sourceType: 'OPENING_BALANCE',
        lines: buildOpeningLines('RECEIVABLE', claimCents),
      });
    }
  }

  if (depositCents || fleetCents || claimCents || appointmentDepositCents) {
    logger.log(`Opening balances for ${businessId}: deposits ${depositCents}, appointment deposits ${appointmentDepositCents}, fleet ${fleetCents}, claims ${claimCents}`);
  }
  return { depositCents, fleetCents, claimCents, appointmentDepositCents };
}

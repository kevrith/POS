import { postVerticalOpeningBalances } from './opening-balances';
import { buildOpeningLines, reverseJournalLines } from './sale-ledger';

function setup(over: Record<string, any> = {}) {
  const prisma: any = {
    roomBooking: { findMany: jest.fn().mockResolvedValue([{ id: 'b1', storeId: 's1', depositCents: 300_000 }, { id: 'b2', storeId: 's1', depositCents: 100_000 }]) },
    appointment: { findMany: jest.fn().mockResolvedValue([{ id: 'a1', storeId: 's1', depositCents: 20_000 }]) },
    cashMovement: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({ count: 2 }) },
    fleetAccount: {
      findMany: jest.fn().mockResolvedValue([{ id: 'f1', balanceCents: -50_000, ledgerOwedCents: 0 }, { id: 'f2', balanceCents: -25_000, ledgerOwedCents: 0 }]),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    insuranceClaim: { findMany: jest.fn().mockResolvedValue([{ id: 'c1', billedCents: 33_600 }]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    ...over,
  };
  const ledger: any = { autoPost: jest.fn().mockResolvedValue(undefined) };
  return { prisma, ledger };
}
const sums = (lines: any[]) => [lines.reduce((s, l) => s + l.debitCents, 0), lines.reduce((s, l) => s + l.creditCents, 0)];
const shape = (call: any) => call[0].lines.map((l: any) => [l.accountCode, l.debitCents, l.creditCents]);

describe('postVerticalOpeningBalances', () => {
  it('books deposits held, what fleets owe and claims awaiting payment, each against opening equity', async () => {
    const { prisma, ledger } = setup();
    expect(await postVerticalOpeningBalances(prisma, ledger, 'biz-1')).toEqual({ depositCents: 400_000, fleetCents: 75_000, claimCents: 33_600, appointmentDepositCents: 20_000 });
    expect(ledger.autoPost.mock.calls.map(shape)).toEqual([
      [['3900', 400_000, 0], ['2300', 0, 400_000]],
      [['3900', 20_000, 0], ['2300', 0, 20_000]],
      [['1200', 75_000, 0], ['3900', 0, 75_000]],
      [['1200', 33_600, 0], ['3900', 0, 33_600]],
    ]);
    expect(prisma.cashMovement.createMany.mock.calls[0][0].data[0]).toEqual(expect.objectContaining({ kind: 'PAY_IN', method: 'OPENING', reason: 'HOTEL_DEPOSIT_OPENING', bookingId: 'b1', amountCents: 300_000 }));
    expect(prisma.fleetAccount.updateMany).toHaveBeenCalledWith({ where: { id: 'f1', businessId: 'biz-1' }, data: { ledgerOwedCents: 50_000 } });
    expect(prisma.insuranceClaim.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['c1'] }, businessId: 'biz-1' }, data: { receivableBooked: true } });
  });

  it('on a second switch-on only the difference is booked: a deposit topped up while off, a fleet that moved', async () => {
    const { prisma, ledger } = setup();
    // b1 had 300,000 booked and was topped up to 350,000; b2 is fully booked.
    prisma.roomBooking.findMany.mockResolvedValue([{ id: 'b1', storeId: 's1', depositCents: 350_000 }, { id: 'b2', storeId: 's1', depositCents: 100_000 }]);
    prisma.cashMovement.findMany.mockResolvedValue([{ bookingId: 'b1', amountCents: 300_000 }, { bookingId: 'b2', amountCents: 60_000 }, { bookingId: 'b2', amountCents: 40_000 }]);
    // f1 was booked at 50,000 and now owes 80,000; f2 was booked at 25,000 and has paid up.
    prisma.fleetAccount.findMany.mockResolvedValue([{ id: 'f1', balanceCents: -80_000, ledgerOwedCents: 50_000 }, { id: 'f2', balanceCents: 0, ledgerOwedCents: 25_000 }, { id: 'f3', balanceCents: -10_000, ledgerOwedCents: 10_000 }]);
    prisma.insuranceClaim.findMany.mockResolvedValue([]);
    prisma.appointment.findMany.mockResolvedValue([]);
    expect(await postVerticalOpeningBalances(prisma, ledger, 'biz-1')).toEqual({ depositCents: 50_000, fleetCents: 5_000, claimCents: 0, appointmentDepositCents: 0 });
    expect(prisma.cashMovement.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ bookingId: 'b1', amountCents: 50_000 })]);
    expect(prisma.fleetAccount.updateMany).toHaveBeenCalledTimes(2);
    expect(ledger.autoPost.mock.calls.map(shape)).toEqual([[['3900', 50_000, 0], ['2300', 0, 50_000]], [['1200', 5_000, 0], ['3900', 0, 5_000]]]);
  });

  it('a fleet that only paid down while off is booked the other way', async () => {
    const { prisma, ledger } = setup();
    prisma.roomBooking.findMany.mockResolvedValue([]);
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.insuranceClaim.findMany.mockResolvedValue([]);
    prisma.fleetAccount.findMany.mockResolvedValue([{ id: 'f1', balanceCents: -20_000, ledgerOwedCents: 50_000 }]);
    await postVerticalOpeningBalances(prisma, ledger, 'biz-1');
    expect(shape(ledger.autoPost.mock.calls[0])).toEqual([['1200', 0, 30_000], ['3900', 30_000, 0]]);
  });

  it('posts nothing when everything is already booked', async () => {
    const { prisma, ledger } = setup();
    prisma.roomBooking.findMany.mockResolvedValue([]);
    prisma.appointment.findMany.mockResolvedValue([]);
    prisma.fleetAccount.findMany.mockResolvedValue([{ id: 'f1', balanceCents: -50_000, ledgerOwedCents: 50_000 }, { id: 'f2', balanceCents: 5_000, ledgerOwedCents: 0 }]);
    prisma.insuranceClaim.findMany.mockResolvedValue([]);
    expect(await postVerticalOpeningBalances(prisma, ledger, 'biz-1')).toEqual({ depositCents: 0, fleetCents: 0, claimCents: 0, appointmentDepositCents: 0 });
    expect(ledger.autoPost).not.toHaveBeenCalled();
    expect(buildOpeningLines('GUEST_DEPOSITS', 0)).toEqual([]);
  });

  it('every entry balances, in either direction', () => {
    for (const kind of ['GUEST_DEPOSITS', 'RECEIVABLE'] as const) for (const amount of [123, -123]) {
      const [d, c] = sums(buildOpeningLines(kind, amount));
      expect([d, c]).toEqual([123, 123]);
    }
  });
});

describe('reverseJournalLines', () => {
  const sale = [
    { accountCode: '1000', accountName: 'Cash', debitCents: 11_600, creditCents: 0 },
    { accountCode: '2100', accountName: 'VAT', debitCents: 0, creditCents: 1_600 },
    { accountCode: '4000', accountName: 'Revenue', debitCents: 0, creditCents: 10_000 },
  ];
  it('a full reversal is the mirror image', () => {
    const r = reverseJournalLines(sale);
    expect(r.map((l) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['1000', 0, 11_600], ['2100', 1_600, 0], ['4000', 10_000, 0]]);
  });
  it('a part reversal scales every line and still balances, whatever the rounding', () => {
    for (const f of [0.5, 1 / 3, 0.123456, 0.9999]) {
      const [d, c] = sums(reverseJournalLines(sale, f));
      expect(d).toBe(c);
    }
  });
  it('a nothing fraction reverses nothing', () => {
    expect(reverseJournalLines(sale, 0)).toEqual([]);
  });
});

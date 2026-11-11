import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';

const BIZ = 'biz-1';
const NOW = new Date('2026-11-05T06:00:00.000Z'); // 09:00 Nairobi
const at = (hour: number, min = 0) => new Date(Date.UTC(2026, 10, 6, hour - 3, min)); // Nov 6, Nairobi clock
const appt = (o: Record<string, any> = {}) => ({
  id: 'a1', businessId: BIZ, storeId: 'store-1', customerName: 'Existing', staffId: 'stylist-1', status: 'BOOKED',
  scheduledAt: at(10), duration: 60, notes: null, depositCents: 0, ...o,
});

function setup() {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }) },
    customer: { count: jest.fn().mockResolvedValue(1) },
    item: { count: jest.fn().mockResolvedValue(1), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'item-gen', taxClass: 'B', vatApplicable: true, ...data })) },
    cashMovement: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'mv-1', ...data })), findMany: jest.fn().mockResolvedValue([]) },
    appointment: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(appt()),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'a-new', ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'a1', ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    // Salon additions: the services of a visit, who can be booked, and the staff themselves.
    appointmentService: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({ count: 0 }), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    serviceStaff: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({}) },
    user: {
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => ({ id: where.id, name: `Staff ${where.id}` })),
      findMany: jest.fn().mockImplementation(async ({ where }: any) => (where?.id?.in ?? []).map((id: string) => ({ id, name: `Staff ${id}`, role: 'CASHIER' }))),
    },
    business: { findUnique: jest.fn().mockResolvedValue({ negativePolicyDefault: 'ALLOW' }) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  const directSales: any = {
    isEnabled: jest.fn().mockResolvedValue(false),
    createInTx: jest.fn().mockImplementation(async (_tx: any, input: any) => ({
      sale: { id: 'sale-1', receiptNumber: 'NRB-2026-0000011', totalCents: input.lines.reduce((sum: number, l: any) => sum + l.totalCents, 0), vatCents: 0, totCents: 0, status: 'PAID' },
      isCredit: false,
      payments: input.payments,
    })),
    afterCommit: jest.fn().mockReturnValue({ etims: Promise.resolve({ success: true, controlNumber: 'CU11' }) }),
  };
  const ledger: any = { autoPost: jest.fn().mockResolvedValue(undefined) };
  return { prisma, directSales, ledger, svc: new AppointmentsService(prisma, directSales, ledger) };
}

beforeEach(() => { jest.useFakeTimers().setSystemTime(NOW); });
afterEach(() => { jest.useRealTimers(); });

const NEW = (o: Record<string, any> = {}) => ({ businessId: BIZ, storeId: 'store-1', customerName: 'Ann', scheduledAt: at(10).toISOString(), duration: 60, staffId: 'stylist-1', ...o });

describe('AppointmentsService.create', () => {
  it('books a free slot and defaults to 60 minutes', async () => {
    const { svc, prisma } = setup();
    const a: any = await svc.create(NEW({ duration: undefined }));
    expect(a.duration).toBe(60);
    expect(prisma.appointment.create).toHaveBeenCalled();
  });

  it('refuses a slot the same staff member already holds, however it overlaps', async () => {
    const { svc, prisma } = setup();
    prisma.appointment.findMany.mockResolvedValue([appt({ scheduledAt: at(10), duration: 60 })]);
    await expect(svc.create(NEW({ scheduledAt: at(10).toISOString() }))).rejects.toThrow(ConflictException);
    await expect(svc.create(NEW({ scheduledAt: at(10, 30).toISOString() }))).rejects.toThrow(/already booked at 10:00/);
    await expect(svc.create(NEW({ scheduledAt: at(9, 30).toISOString(), duration: 60 }))).rejects.toThrow(ConflictException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('allows the slot straight after one ends, and straight before the next starts', async () => {
    const { svc, prisma } = setup();
    prisma.appointment.findMany.mockResolvedValue([appt({ scheduledAt: at(10), duration: 60 })]);
    await expect(svc.create(NEW({ scheduledAt: at(11).toISOString() }))).resolves.toBeTruthy();
    // 09:00-10:00 ends as the held one starts, so the query's `lt: end` window excludes it.
    prisma.appointment.findMany.mockResolvedValue([]);
    await expect(svc.create(NEW({ scheduledAt: at(9).toISOString() }))).resolves.toBeTruthy();
  });

  it('looks only at appointments that still hold the staff member, and takes a per-staff lock', async () => {
    const { svc, prisma } = setup();
    await svc.create(NEW());
    expect(prisma.appointment.findMany.mock.calls[0][0].where.status).toEqual({ in: ['BOOKED', 'CONFIRMED', 'IN_PROGRESS'] });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
  });

  it('does not check a slot when no staff member is chosen', async () => {
    const { svc, prisma } = setup();
    await svc.create(NEW({ staffId: undefined }));
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it.each([
    ['a negative duration', { duration: -30 }],
    ['a zero duration', { duration: 0 }],
    ['an absurd duration', { duration: 5000 }],
    ['a fractional duration', { duration: 30.5 }],
    ['an invalid date', { scheduledAt: 'garbage' }],
    ['a time yesterday', { scheduledAt: new Date(NOW.getTime() - 2 * 86400000).toISOString() }],
    ['no customer name', { customerName: ' ' }],
    ['a negative deposit', { depositCents: -1 }],
  ])('rejects %s', async (_l, over) => {
    const { svc, prisma } = setup();
    await expect(svc.create(NEW(over))).rejects.toThrow(BadRequestException);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('refuses a store, customer or service from another business', async () => {
    const { svc, prisma } = setup();
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(svc.create(NEW())).rejects.toThrow(/Store not found/);
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.customer.count.mockResolvedValue(0);
    await expect(svc.create(NEW({ customerId: 'theirs' }))).rejects.toThrow(/Customer not found/);
    prisma.customer.count.mockResolvedValue(1);
    prisma.item.count.mockResolvedValue(0);
    await expect(svc.create(NEW({ serviceItemId: 'theirs' }))).rejects.toThrow(/Service not found/);
  });
});

describe('AppointmentsService.update', () => {
  it('follows the transitions the screen offers', async () => {
    const { svc, prisma } = setup();
    for (const [from, to] of [['BOOKED', 'CONFIRMED'], ['CONFIRMED', 'IN_PROGRESS'], ['IN_PROGRESS', 'COMPLETED'], ['IN_PROGRESS', 'NO_SHOW'], ['BOOKED', 'CANCELLED'], ['BOOKED', 'NO_SHOW'], ['CONFIRMED', 'NO_SHOW']]) {
      prisma.appointment.findFirst.mockResolvedValue(appt({ status: from }));
      await expect(svc.update('a1', BIZ, { status: to })).resolves.toBeTruthy();
    }
  });

  it.each([
    ['BOOKED', 'COMPLETED'], ['COMPLETED', 'BOOKED'], ['CANCELLED', 'CONFIRMED'], ['NO_SHOW', 'COMPLETED'], ['CONFIRMED', 'COMPLETED'],
  ])('refuses %s -> %s', async (from, to) => {
    const { svc, prisma } = setup();
    prisma.appointment.findFirst.mockResolvedValue(appt({ status: from }));
    await expect(svc.update('a1', BIZ, { status: to })).rejects.toThrow(/cannot become/);
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('rejects an unknown status and a rescheduled finished appointment', async () => {
    const { svc, prisma } = setup();
    await expect(svc.update('a1', BIZ, { status: 'DONE' })).rejects.toThrow(BadRequestException);
    prisma.appointment.findFirst.mockResolvedValue(appt({ status: 'COMPLETED' }));
    await expect(svc.update('a1', BIZ, { scheduledAt: at(14).toISOString() })).rejects.toThrow(/cannot be rescheduled/);
  });

  it('checks the slot when an appointment is moved, ignoring itself', async () => {
    const { svc, prisma } = setup();
    prisma.appointment.findMany.mockResolvedValue([appt({ id: 'other', scheduledAt: at(14), duration: 60 })]);
    await expect(svc.update('a1', BIZ, { scheduledAt: at(14, 30).toISOString() })).rejects.toThrow(ConflictException);
    expect(prisma.appointment.findMany.mock.calls[0][0].where.id).toEqual({ not: 'a1' });
    await expect(svc.update('a1', BIZ, { scheduledAt: at(15).toISOString() })).resolves.toBeTruthy();
  });

  it('a note or a status change does not recheck the calendar', async () => {
    const { svc, prisma } = setup();
    await svc.update('a1', BIZ, { notes: 'allergic to dye' });
    await svc.update('a1', BIZ, { status: 'CONFIRMED' });
    expect(prisma.appointment.findMany).not.toHaveBeenCalled();
  });

  it('only writes the fields it is given, and never the business or store', async () => {
    const { svc, prisma } = setup();
    await svc.update('a1', BIZ, { notes: 'x', businessId: 'other', storeId: 'elsewhere' } as any);
    expect(prisma.appointment.update.mock.calls[0][0].data).toEqual({ notes: 'x' });
  });

  it("treats another business's appointment as missing", async () => {
    const { svc, prisma } = setup();
    prisma.appointment.findFirst.mockResolvedValue(null);
    await expect(svc.update('a1', 'biz-2', { notes: 'x' })).rejects.toThrow(NotFoundException);
    await expect(svc.findOne('a1', 'biz-2')).rejects.toThrow(NotFoundException);
    await expect(svc.delete('a1', 'biz-2')).rejects.toThrow(NotFoundException);
  });
});

describe('AppointmentsService.delete and list', () => {
  it('keeps finished and running appointments', async () => {
    const { svc, prisma } = setup();
    for (const status of ['COMPLETED', 'IN_PROGRESS']) {
      prisma.appointment.findFirst.mockResolvedValue(appt({ status }));
      await expect(svc.delete('a1', BIZ)).rejects.toThrow(/cannot be deleted/);
    }
    prisma.appointment.findFirst.mockResolvedValue(appt({ status: 'CANCELLED' }));
    await svc.delete('a1', BIZ);
    expect(prisma.appointment.delete).toHaveBeenCalledWith({ where: { id: 'a1' } });
  });

  it('a day filter is the Nairobi day', async () => {
    const { svc, prisma } = setup();
    await svc.findAll(BIZ, 'store-1', '2026-11-06');
    const range = prisma.appointment.findMany.mock.calls[0][0].where.scheduledAt;
    expect(range.gte.toISOString()).toBe('2026-11-05T21:00:00.000Z');
    expect(range.lte.toISOString()).toBe('2026-11-06T20:59:59.999Z');
    await expect(svc.findAll(BIZ, 'store-1', 'not-a-date')).rejects.toThrow(BadRequestException);
  });
});


describe('appointments on the sales pipeline', () => {
  const MGR = { id: 'm1', name: 'Grace', role: 'MANAGER' };
  const FRONT = { id: 'u1', name: 'Pat', role: 'CASHIER' };
  const service = (o: Record<string, any> = {}) => ({ id: 'svc-1', businessId: BIZ, name: 'Haircut', retailPriceCents: 150_000, taxClass: 'B', vatApplicable: true, ...o });
  function ready(a: Record<string, any> = {}, item: any = service()) {
    const ctx = setup();
    ctx.directSales.isEnabled.mockResolvedValue(true);
    ctx.prisma.appointment.findFirst.mockResolvedValue(appt({ status: 'IN_PROGRESS', serviceItemId: item ? 'svc-1' : null, customerPhone: '0712', scheduledAt: at(10), depositCents: 0, ...a }));
    ctx.prisma.item.findFirst.mockResolvedValue(item);
    return ctx;
  }
  const complete = (ctx: any, dto: Record<string, any> = {}, actor = FRONT) => ctx.svc.update('a1', BIZ, { status: 'COMPLETED', ...dto }, actor);

  describe('a deposit when booking', () => {
    it('is money taken: it needs a method and goes in the register and the books', async () => {
      const ctx = setup();
      ctx.directSales.isEnabled.mockResolvedValue(true);
      await expect(ctx.svc.create(NEW({ depositCents: 50_000 }), FRONT)).rejects.toThrow(/Deposit method/);
      expect(ctx.prisma.appointment.create).not.toHaveBeenCalled();
      await ctx.svc.create(NEW({ depositCents: 50_000, depositMethod: 'mpesa' }), FRONT);
      expect(ctx.prisma.cashMovement.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ kind: 'PAY_IN', method: 'MPESA', amountCents: 50_000, reason: 'APPOINTMENT_DEPOSIT', bookingId: 'a-new', cashierId: 'u1', storeId: 'store-1' }),
      });
      await jest.advanceTimersByTimeAsync(0);
      expect(ctx.ledger.autoPost).toHaveBeenCalledWith(expect.objectContaining({ reference: 'DEP-mv-1', sourceType: 'APPOINTMENT_DEPOSIT' }));
      expect(ctx.ledger.autoPost.mock.calls[0][0].lines.map((l: any) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['1010', 50_000, 0], ['2300', 0, 50_000]]);
    });

    it('is recorded as before for a business off the pipeline, and no deposit means no register row', async () => {
      const off = setup();
      await off.svc.create(NEW({ depositCents: 50_000 }), FRONT);
      expect(off.prisma.cashMovement.create).not.toHaveBeenCalled();
      const on = setup();
      on.directSales.isEnabled.mockResolvedValue(true);
      await on.svc.create(NEW(), FRONT);
      expect(on.prisma.cashMovement.create).not.toHaveBeenCalled();
    });

    it('a further deposit adds to it, only while the appointment is still to come', async () => {
      const ctx = ready({ status: 'CONFIRMED', depositCents: 20_000 });
      await ctx.svc.addDeposit('a1', { amountCents: 30_000, method: 'CASH' }, BIZ, FRONT);
      expect(ctx.prisma.appointment.updateMany).toHaveBeenCalledWith({ where: { id: 'a1', businessId: BIZ, status: { in: ['BOOKED', 'CONFIRMED', 'IN_PROGRESS'] } }, data: { depositCents: { increment: 30_000 } } });
      expect(ctx.prisma.cashMovement.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ kind: 'PAY_IN', method: 'CASH', amountCents: 30_000 }));
      const done = ready({ status: 'COMPLETED' });
      await expect(done.svc.addDeposit('a1', { amountCents: 100, method: 'CASH' }, BIZ, FRONT)).rejects.toThrow(/cannot take a deposit/);
      await expect(ready().svc.addDeposit('a1', { amountCents: -5, method: 'CASH' }, BIZ, FRONT)).rejects.toThrow(/Deposit/);
    });

    it('its amount is not edited by hand once deposits are money taken', async () => {
      const ctx = ready({ status: 'BOOKED', depositCents: 10_000 });
      await expect(ctx.svc.update('a1', BIZ, { depositCents: 99_000 }, FRONT)).rejects.toThrow(/Take a deposit/);
      await expect(ctx.svc.update('a1', BIZ, { notes: 'x', depositCents: 10_000 }, FRONT)).resolves.toBeDefined();
    });
  });

  describe('completing', () => {
    it('is unchanged for a business that has not switched over', async () => {
      const ctx = ready();
      ctx.directSales.isEnabled.mockResolvedValue(false);
      await complete(ctx);
      expect(ctx.directSales.createInTx).not.toHaveBeenCalled();
      expect(ctx.prisma.appointment.update).toHaveBeenCalled();
    });

    it('invoices the service at its catalogue price and returns the receipt', async () => {
      const ctx = ready();
      const r: any = await complete(ctx, { payments: [{ method: 'cash', amountCents: 200_000 }], buyerKraPin: 'p051234567z' });
      const input = ctx.directSales.createInTx.mock.calls[0][1];
      expect(input).toEqual(expect.objectContaining({ source: 'APPOINTMENT', cashierId: 'u1', customerName: 'Existing', customerPhone: '0712', buyerKraPin: 'P051234567Z', storeId: 'store-1' }));
      expect(input.lines).toEqual([expect.objectContaining({ itemId: 'svc-1', name: 'Haircut', quantity: 1, totalCents: 150_000, taxClass: 'B' })]);
      expect(input.payments).toEqual([{ method: 'CASH', amountCents: 200_000 }]);
      expect(ctx.prisma.appointment.updateMany).toHaveBeenCalledWith({ where: { id: 'a1', businessId: BIZ, status: 'IN_PROGRESS' }, data: { status: 'COMPLETED' } });
      expect(ctx.prisma.appointment.updateMany).toHaveBeenCalledWith({ where: { id: 'a1', businessId: BIZ }, data: { saleId: 'sale-1' } });
      expect(r).toEqual(expect.objectContaining({ saleId: 'sale-1', receiptNumber: 'NRB-2026-0000011', changeDueCents: 50_000, etims: expect.objectContaining({ controlNumber: 'CU11' }) }));
    });

    it('the deposit pays for it first, and the customer pays the rest', async () => {
      const ctx = ready({ depositCents: 50_000 });
      await complete(ctx, { payments: [{ method: 'MPESA', amountCents: 100_000 }] });
      expect(ctx.directSales.createInTx.mock.calls[0][1].payments).toEqual([{ method: 'DEPOSIT', amountCents: 50_000 }, { method: 'MPESA', amountCents: 100_000 }]);
    });

    it('a deposit that covers it all needs no payment; one larger than the bill is paid back', async () => {
      const exact = ready({ depositCents: 150_000 });
      await complete(exact);
      expect(exact.directSales.createInTx.mock.calls[0][1].payments).toEqual([{ method: 'DEPOSIT', amountCents: 150_000 }]);
      const more = ready({ depositCents: 200_000 });
      more.prisma.cashMovement.findMany.mockResolvedValue([{ method: 'BANK', amountCents: 200_000 }]);
      const r: any = await complete(more);
      expect(more.directSales.createInTx.mock.calls[0][1].payments).toEqual([{ method: 'DEPOSIT', amountCents: 150_000 }]);
      expect(more.prisma.cashMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'PAY_OUT', method: 'BANK', amountCents: 50_000, reason: 'APPOINTMENT_DEPOSIT_REFUND', bookingId: 'a1' }) });
      expect(r).toEqual(expect.objectContaining({ refundDueCents: 50_000, refundMethod: 'BANK' }));
    });

    it('a short payment is refused before anything is claimed', async () => {
      const ctx = ready({ depositCents: 50_000 });
      await expect(complete(ctx, { payments: [{ method: 'CASH', amountCents: 99_999 }] })).rejects.toThrow(/Take the full payment/);
      expect(ctx.prisma.appointment.updateMany).not.toHaveBeenCalled();
    });

    it('a failed invoice rolls the completion back and announces nothing', async () => {
      const ctx = ready();
      ctx.directSales.createInTx.mockRejectedValue(new BadRequestException('db down'));
      await expect(complete(ctx, { payments: [{ method: 'CASH', amountCents: 150_000 }] })).rejects.toThrow('db down');
      expect(ctx.directSales.afterCommit).not.toHaveBeenCalled();
    });

    it('a lost race (someone else completed it) bills nothing', async () => {
      const ctx = ready();
      ctx.prisma.appointment.updateMany.mockResolvedValue({ count: 0 });
      await expect(complete(ctx, { payments: [{ method: 'CASH', amountCents: 150_000 }] })).rejects.toThrow(/just changed/);
      expect(ctx.directSales.createInTx).not.toHaveBeenCalled();
    });

    it('only a manager changes a listed price; anyone can price a service that has no list price', async () => {
      const ctx = ready();
      await expect(complete(ctx, { amountCents: 100_000, payments: [{ method: 'CASH', amountCents: 100_000 }] })).rejects.toThrow(/manager/);
      await complete(ctx, { amountCents: 100_000, payments: [{ method: 'CASH', amountCents: 100_000 }] }, MGR);
      expect(ctx.directSales.createInTx.mock.calls[0][1].lines[0].totalCents).toBe(100_000);
      const free = ready({}, null);
      await complete(free, { amountCents: 80_000, payments: [{ method: 'CASH', amountCents: 80_000 }] });
      expect(free.directSales.createInTx.mock.calls[0][1].lines[0]).toEqual(expect.objectContaining({ name: 'Appointment service', totalCents: 80_000 }));
      expect(free.prisma.item.create).toHaveBeenCalledWith({ data: expect.objectContaining({ category: 'Appointments', isActive: false, taxClass: 'B' }) });
    });

    it('with no priced service and no price, it cannot be billed', async () => {
      const ctx = ready({}, null);
      await expect(complete(ctx)).rejects.toThrow(/no priced service/);
      const zero = ready({}, service({ retailPriceCents: 0 }));
      await expect(complete(zero)).rejects.toThrow(/no priced service/);
    });

    it.each([
      ['an unknown method', { payments: [{ method: 'barter', amountCents: 1000 }] }, /Payment method/],
      ['a bad buyer PIN', { buyerKraPin: 'nope', payments: [{ method: 'CASH', amountCents: 150_000 }] }, /KRA PIN/],
    ])('rejects %s before claiming anything', async (_l, dto, expected) => {
      const ctx = ready();
      await expect(complete(ctx, dto as any)).rejects.toThrow(expected as any);
      expect(ctx.prisma.appointment.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('cancelling or a no-show with a deposit held', () => {
    const held = (extra: Record<string, any> = {}) => ready({ status: 'CONFIRMED', depositCents: 50_000, ...extra });

    it('pays it back the way it came in', async () => {
      const ctx = held();
      ctx.prisma.cashMovement.findMany.mockResolvedValue([{ method: 'MPESA', amountCents: 50_000 }]);
      const r: any = await ctx.svc.update('a1', BIZ, { status: 'CANCELLED' }, FRONT);
      expect(ctx.prisma.cashMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'PAY_OUT', method: 'MPESA', amountCents: 50_000, reason: 'APPOINTMENT_DEPOSIT_REFUND' }) });
      expect(ctx.prisma.appointment.updateMany).toHaveBeenCalledWith({ where: { id: 'a1', businessId: BIZ, status: 'CONFIRMED' }, data: { status: 'CANCELLED' } });
      expect(r.depositRefundedCents).toBe(50_000);
      await jest.advanceTimersByTimeAsync(0);
      expect(ctx.ledger.autoPost.mock.calls[0][0].lines.map((l: any) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['2300', 50_000, 0], ['1010', 0, 50_000]]);
    });

    it('a deposit with no recorded method needs the desk to say how; cash is not assumed', async () => {
      const ctx = held();
      await expect(ctx.svc.update('a1', BIZ, { status: 'CANCELLED' }, FRONT)).rejects.toThrow(/say how it is being paid back/);
      expect(ctx.prisma.cashMovement.create).not.toHaveBeenCalled();
      await ctx.svc.update('a1', BIZ, { status: 'CANCELLED', refundMethod: 'cash' }, FRONT);
      expect(ctx.prisma.cashMovement.create.mock.calls[0][0].data.method).toBe('CASH');
    });

    it('keeping it is a manager decision, moves no money, and becomes income', async () => {
      await expect(held().svc.update('a1', BIZ, { status: 'NO_SHOW', keepDeposit: true }, FRONT)).rejects.toThrow(/manager/);
      const ctx = held();
      const r: any = await ctx.svc.update('a1', BIZ, { status: 'NO_SHOW', keepDeposit: true }, MGR);
      expect(ctx.prisma.cashMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'FORFEIT', method: 'OPENING', amountCents: 50_000, reason: 'APPOINTMENT_DEPOSIT_FORFEIT' }) });
      expect(r.depositKeptCents).toBe(50_000);
      await jest.advanceTimersByTimeAsync(0);
      expect(ctx.ledger.autoPost.mock.calls[0][0].lines.map((l: any) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['2300', 50_000, 0], ['4300', 0, 50_000]]);
    });

    it('without a deposit it is the plain status change, as before', async () => {
      const ctx = ready({ status: 'CONFIRMED', depositCents: 0 });
      await ctx.svc.update('a1', BIZ, { status: 'CANCELLED' }, FRONT);
      expect(ctx.prisma.cashMovement.create).not.toHaveBeenCalled();
      expect(ctx.prisma.appointment.update).toHaveBeenCalled();
    });
  });
});

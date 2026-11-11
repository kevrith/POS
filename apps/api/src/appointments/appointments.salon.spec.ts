import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AppointmentsService } from './appointments.service';
import { drawStock } from '../batch/batch-allocation';

jest.mock('../batch/batch-allocation', () => ({ drawStock: jest.fn().mockResolvedValue({ slices: [], unbatched: 0 }) }));

const BIZ = 'biz-1';
const NOW = new Date('2026-11-05T06:00:00.000Z'); // 09:00 Nairobi, Thursday
const at = (hour: number, min = 0) => new Date(Date.UTC(2026, 10, 6, hour - 3, min)); // Fri 6 Nov, Nairobi clock
const MGR = { id: 'm1', name: 'Grace', role: 'MANAGER' };
const FRONT = { id: 'u1', name: 'Pat', role: 'CASHIER' };

const catalogue: Record<string, any> = {
  cut: { id: 'cut', businessId: BIZ, name: 'Haircut', retailPriceCents: 100_000, durationMinutes: 45, taxClass: 'B', vatApplicable: true, trackStock: false },
  colour: { id: 'colour', businessId: BIZ, name: 'Colour', retailPriceCents: 300_000, durationMinutes: 90, taxClass: 'B', vatApplicable: true, trackStock: false },
  shampoo: { id: 'shampoo', businessId: BIZ, name: 'Shampoo bottle', retailPriceCents: 80_000, durationMinutes: null, taxClass: 'B', vatApplicable: true, trackStock: true, trackBatches: false },
};

function setup() {
  const prisma: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }) },
    customer: {
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue({ id: 'c1', name: 'Wanjiru', phone: '0712', notes: 'allergic to ammonia', loyaltyPoints: 12 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    item: {
      count: jest.fn().mockResolvedValue(1),
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockImplementation(async ({ where }: any) => (where.id.in as string[]).map((id) => catalogue[id]).filter(Boolean)),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'item-gen', taxClass: 'B', vatApplicable: true, ...data })),
    },
    cashMovement: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'mv-1', ...data })), findMany: jest.fn().mockResolvedValue([]) },
    appointment: {
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      groupBy: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'a-new', ...data })),
      update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'a1', ...data })),
      delete: jest.fn().mockResolvedValue({}),
    },
    appointmentService: { findMany: jest.fn().mockResolvedValue([]), createMany: jest.fn().mockResolvedValue({ count: 0 }), deleteMany: jest.fn().mockResolvedValue({ count: 0 }) },
    serviceStaff: { findFirst: jest.fn().mockResolvedValue(null), findMany: jest.fn().mockResolvedValue([]), upsert: jest.fn().mockResolvedValue({}) },
    user: {
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => ({ id: where.id, name: `Staff ${where.id}` })),
      findMany: jest.fn().mockImplementation(async ({ where }: any) => (where?.id?.in ?? ['s1', 's2']).map((id: string) => ({ id, name: `Staff ${id}`, role: 'CASHIER' }))),
    },
    business: { findUnique: jest.fn().mockResolvedValue({ negativePolicyDefault: 'ALLOW' }) },
    sale: { findMany: jest.fn().mockResolvedValue([]), aggregate: jest.fn().mockResolvedValue({ _sum: { totalCents: 450_000 } }) },
    saleItem: { findMany: jest.fn().mockResolvedValue([]) },
    employee: { findMany: jest.fn().mockResolvedValue([]) },
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  const directSales: any = {
    isEnabled: jest.fn().mockResolvedValue(true),
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

beforeEach(() => { jest.useFakeTimers().setSystemTime(NOW); (drawStock as jest.Mock).mockClear(); });
afterEach(() => { jest.useRealTimers(); });

const NEW = (o: Record<string, any> = {}) => ({
  businessId: BIZ, storeId: 'store-1', customerName: 'Wanjiru', customerId: 'c1', scheduledAt: at(10).toISOString(), ...o,
});
const bookedRow = (o: Record<string, any>) => ({ id: 'r', appointmentId: 'a-old', itemId: null, name: 'Service', unitPriceCents: 0, durationMin: 30, staffId: null, position: 0, ...o });

describe('booking several services', () => {
  it('takes name, price and duration from the catalogue, stacks the duration, and lets the first stylist and service stand for the visit', async () => {
    const { svc, prisma } = setup();
    const a: any = await svc.create(NEW({ services: [{ itemId: 'cut', staffId: 's1' }, { itemId: 'colour', staffId: 's2' }] }));
    expect(a.duration).toBe(45 + 90);
    expect(prisma.appointment.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ serviceItemId: 'cut', staffId: 's1', duration: 135, customerId: 'c1' }));
    expect(prisma.appointmentService.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ appointmentId: 'a-new', itemId: 'cut', name: 'Haircut', unitPriceCents: 100_000, durationMin: 45, staffId: 's1', position: 0 }),
        expect.objectContaining({ itemId: 'colour', name: 'Colour', unitPriceCents: 300_000, durationMin: 90, staffId: 's2', position: 1 }),
      ],
    });
    expect(a.services).toHaveLength(2);
  });

  it('lets the desk give a duration that differs from the service default, and falls back to 30 minutes when there is none', async () => {
    const { svc } = setup();
    const a: any = await svc.create(NEW({ services: [{ itemId: 'cut', durationMin: 60 }, { itemId: 'shampoo' }] }));
    expect(a.duration).toBe(60 + 30);
  });

  it('refuses a service from another business, more than ten services, and a bad duration', async () => {
    const { svc, prisma } = setup();
    await expect(svc.create(NEW({ services: [{ itemId: 'not-ours' }] }))).rejects.toThrow(/Service not found/);
    await expect(svc.create(NEW({ services: Array.from({ length: 11 }, () => ({ itemId: 'cut' })) }))).rejects.toThrow(/at most 10/);
    await expect(svc.create(NEW({ services: [{ itemId: 'cut', durationMin: 2 }] }))).rejects.toThrow(/Duration/);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('keeps the older way working: a single service and staff on the appointment itself, with no stored services', async () => {
    const { svc, prisma } = setup();
    const a: any = await svc.create(NEW({ serviceItemId: 'cut', staffId: 's1', duration: 45 }));
    expect(a.duration).toBe(45);
    expect(prisma.appointmentService.createMany).not.toHaveBeenCalled();
  });
});

describe('who is free, service by service', () => {
  /** A visit at 10:00 where s1 does the cut (10:00-10:45) and s2 the colour (10:45-12:15). */
  const existing = () => ({ id: 'a-old', scheduledAt: at(10), duration: 135, staffId: 's1', status: 'BOOKED', customerName: 'Ann' });
  const rows = () => [
    bookedRow({ id: 'r1', itemId: 'cut', durationMin: 45, staffId: 's1', position: 0 }),
    bookedRow({ id: 'r2', itemId: 'colour', durationMin: 90, staffId: 's2', position: 1 }),
  ];

  it('holds each stylist only for their own part of an existing visit', async () => {
    const { svc, prisma } = setup();
    prisma.appointment.findMany.mockResolvedValue([existing()]);
    prisma.appointmentService.findMany.mockResolvedValue(rows());
    // s2 is free until 10:45
    await expect(svc.create(NEW({ scheduledAt: at(10).toISOString(), services: [{ itemId: 'cut', staffId: 's2' }] }))).resolves.toBeTruthy();
    // but busy from 10:45
    await expect(svc.create(NEW({ scheduledAt: at(11).toISOString(), services: [{ itemId: 'cut', staffId: 's2' }] }))).rejects.toThrow(/already booked at 10:45 for Ann/);
    // s1 is busy only 10:00-10:45
    await expect(svc.create(NEW({ scheduledAt: at(10, 30).toISOString(), services: [{ itemId: 'cut', staffId: 's1' }] }))).rejects.toBeInstanceOf(ConflictException);
    await expect(svc.create(NEW({ scheduledAt: at(10, 45).toISOString(), services: [{ itemId: 'cut', staffId: 's1' }] }))).resolves.toBeTruthy();
  });

  it('checks each service of the NEW visit in its own slot', async () => {
    const { svc, prisma } = setup();
    // s2 is busy 10:45-11:30 with someone else
    prisma.appointment.findMany.mockResolvedValue([{ id: 'x', scheduledAt: at(10, 45), duration: 45, staffId: 's2', status: 'CONFIRMED', customerName: 'Beth' }]);
    // cut with s1 at 10:00-10:45, then colour with s2 at 10:45: s2 clashes
    await expect(svc.create(NEW({ services: [{ itemId: 'cut', staffId: 's1' }, { itemId: 'colour', staffId: 's2' }] }))).rejects.toThrow(/already booked at 10:45 for Beth/);
    expect(prisma.appointment.create).not.toHaveBeenCalled();
  });

  it('reads an older appointment with no stored services as one slot held by its own staff member', async () => {
    const { svc, prisma } = setup();
    prisma.appointment.findMany.mockResolvedValue([{ id: 'old', scheduledAt: at(10), duration: 60, staffId: 's1', status: 'BOOKED', customerName: 'Cy' }]);
    await expect(svc.create(NEW({ services: [{ itemId: 'cut', staffId: 's1' }] }))).rejects.toThrow(/already booked at 10:00 for Cy/);
    await expect(svc.create(NEW({ services: [{ itemId: 'cut', staffId: 's2' }] }))).resolves.toBeTruthy();
  });
});

describe('who takes appointments, and when', () => {
  const withRow = (prisma: any, row: any) => prisma.serviceStaff.findFirst.mockResolvedValue(row);

  it('refuses a staff member who is not in this business', async () => {
    const { svc, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(svc.create(NEW({ services: [{ itemId: 'cut', staffId: 'stranger' }] }))).rejects.toThrow(/staff member was not found/);
  });

  it('is unrestricted for a staff member who has not been set up, as before', async () => {
    const { svc } = setup();
    await expect(svc.create(NEW({ scheduledAt: at(2).toISOString(), services: [{ itemId: 'cut', staffId: 's1' }] }))).resolves.toBeTruthy();
  });

  it('refuses someone who is switched off', async () => {
    const { svc, prisma } = setup();
    withRow(prisma, { active: false, workingHours: '{}' });
    await expect(svc.create(NEW({ services: [{ itemId: 'cut', staffId: 's1' }] }))).rejects.toThrow(/Staff s1 is not taking appointments/);
  });

  it('refuses a time outside their hours or on a day off, and accepts one inside', async () => {
    const { svc, prisma } = setup();
    // Friday 6 Nov: 09:00-17:00 on Fridays only
    withRow(prisma, { active: true, workingHours: JSON.stringify({ '5': ['09:00', '17:00'] }) });
    await expect(svc.create(NEW({ scheduledAt: at(10).toISOString(), services: [{ itemId: 'cut', staffId: 's1' }] }))).resolves.toBeTruthy();
    await expect(svc.create(NEW({ scheduledAt: at(16, 30).toISOString(), services: [{ itemId: 'cut', staffId: 's1' }] }))).rejects.toThrow(/not working at that time/);
    await expect(svc.create(NEW({ scheduledAt: at(8).toISOString(), services: [{ itemId: 'cut', staffId: 's1' }] }))).rejects.toThrow(/not working at that time/);
    withRow(prisma, { active: true, workingHours: JSON.stringify({ '1': ['09:00', '17:00'] }) }); // Mondays only
    await expect(svc.create(NEW({ services: [{ itemId: 'cut', staffId: 's1' }] }))).rejects.toThrow(/not working at that time/);
  });

  it('does not lock the whole team out if a stylist\'s stored hours are damaged', async () => {
    const { svc, prisma } = setup();
    withRow(prisma, { active: true, workingHours: 'not json' });
    await expect(svc.create(NEW({ services: [{ itemId: 'cut', staffId: 's1' }] }))).resolves.toBeTruthy();
  });

  it('applies to each service in a multi-service visit', async () => {
    const { svc, prisma } = setup();
    prisma.serviceStaff.findFirst.mockImplementation(async ({ where }: any) => where.userId === 's2' ? { active: true, workingHours: JSON.stringify({ '5': ['09:00', '11:00'] }) } : null);
    // colour (s2) would run 10:45-12:15, past s2's 11:00 finish
    await expect(svc.create(NEW({ services: [{ itemId: 'cut', staffId: 's1' }, { itemId: 'colour', staffId: 's2' }] }))).rejects.toThrow(/Staff s2 is not working at that time/);
  });
});

describe('changing a booked visit', () => {
  function booked(rows: any[], over: Record<string, any> = {}) {
    const ctx = setup();
    ctx.directSales.isEnabled.mockResolvedValue(false);
    ctx.prisma.appointment.findFirst.mockResolvedValue({ id: 'a1', businessId: BIZ, storeId: 'store-1', customerName: 'Wanjiru', status: 'BOOKED', scheduledAt: at(10), duration: 135, staffId: 's1', depositCents: 0, ...over });
    ctx.prisma.appointmentService.findMany.mockResolvedValue(rows);
    return ctx;
  }
  const two = () => [
    bookedRow({ id: 'r1', appointmentId: 'a1', itemId: 'cut', name: 'Haircut', unitPriceCents: 100_000, durationMin: 45, staffId: 's1', position: 0 }),
    bookedRow({ id: 'r2', appointmentId: 'a1', itemId: 'colour', name: 'Colour', unitPriceCents: 300_000, durationMin: 90, staffId: 's2', position: 1 }),
  ];

  it('moves every service with the visit, rechecking each slot while ignoring itself', async () => {
    const ctx = booked(two());
    await ctx.svc.update('a1', BIZ, { scheduledAt: at(14).toISOString() }, MGR);
    const near = ctx.prisma.appointment.findMany.mock.calls.map((c: any) => c[0].where.id);
    expect(near).toEqual(expect.arrayContaining([{ not: 'a1' }]));
    expect(ctx.prisma.appointmentService.deleteMany).toHaveBeenCalledWith({ where: { appointmentId: 'a1' } });
    expect(ctx.prisma.appointmentService.createMany.mock.calls[0][0].data).toHaveLength(2);
  });

  it('refuses the move if one stylist is busy for their part', async () => {
    const ctx = booked(two());
    // s2 busy 14:45-15:30
    ctx.prisma.appointment.findMany.mockResolvedValue([{ id: 'x', scheduledAt: at(14, 45), duration: 45, staffId: 's2', status: 'BOOKED', customerName: 'Beth' }]);
    await expect(ctx.svc.update('a1', BIZ, { scheduledAt: at(14).toISOString() }, MGR)).rejects.toThrow(/already booked at 14:45 for Beth/);
    expect(ctx.prisma.appointment.update).not.toHaveBeenCalled();
  });

  it('replaces the services of a visit, rechecking them, and keeps the first as the visit\'s own', async () => {
    const ctx = booked(two());
    await ctx.svc.update('a1', BIZ, { services: [{ itemId: 'colour', staffId: 's2' }] }, MGR);
    expect(ctx.prisma.appointment.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ serviceItemId: 'colour', staffId: 's2', duration: 90 }));
    expect(ctx.prisma.appointmentService.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ itemId: 'colour', position: 0 })]);
  });

  it('will not guess which stylist to change on a visit with several services', async () => {
    const ctx = booked(two());
    await expect(ctx.svc.update('a1', BIZ, { staffId: 's3' }, MGR)).rejects.toThrow(/on each service/);
    await expect(ctx.svc.update('a1', BIZ, { duration: 30 }, MGR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('changes the stylist or duration of a single stored service', async () => {
    const ctx = booked([two()[0]], { duration: 45 });
    await ctx.svc.update('a1', BIZ, { staffId: 's3', duration: 60 }, MGR);
    expect(ctx.prisma.appointmentService.createMany.mock.calls[0][0].data).toEqual([expect.objectContaining({ staffId: 's3', durationMin: 60 })]);
    expect(ctx.prisma.appointment.update.mock.calls[0][0].data).toEqual(expect.objectContaining({ staffId: 's3', duration: 60 }));
  });

  it('will not change the services of a finished visit', async () => {
    const ctx = booked(two(), { status: 'COMPLETED' });
    await expect(ctx.svc.update('a1', BIZ, { services: [{ itemId: 'cut' }] }, MGR)).rejects.toThrow(/cannot be rescheduled/);
  });
});

describe('completing a visit: the bill, the stylists, the products, the tip', () => {
  function ready(rows: any[], over: Record<string, any> = {}) {
    const ctx = setup();
    ctx.prisma.appointment.findFirst.mockResolvedValue({
      id: 'a1', businessId: BIZ, storeId: 'store-1', customerId: 'c1', customerName: 'Wanjiru', customerPhone: '0712', status: 'IN_PROGRESS',
      scheduledAt: at(10), duration: 135, staffId: 's1', serviceItemId: 'cut', depositCents: 0, ...over,
    });
    ctx.prisma.appointmentService.findMany.mockResolvedValue(rows);
    return ctx;
  }
  const rows = () => [
    bookedRow({ id: 'r1', appointmentId: 'a1', itemId: 'cut', name: 'Haircut', unitPriceCents: 100_000, durationMin: 45, staffId: 's1', position: 0 }),
    bookedRow({ id: 'r2', appointmentId: 'a1', itemId: 'colour', name: 'Colour', unitPriceCents: 300_000, durationMin: 90, staffId: 's2', position: 1 }),
  ];
  const done = (ctx: any, dto: Record<string, any> = {}, actor = FRONT) =>
    ctx.svc.update('a1', BIZ, { status: 'COMPLETED', payments: [{ method: 'CASH', amountCents: 400_000 }], ...dto }, actor);
  const sentLines = (ctx: any) => ctx.directSales.createInTx.mock.calls[0][1].lines;

  it('bills every service of the visit, each credited to the stylist who did it, and attaches the client', async () => {
    const ctx = ready(rows());
    const out: any = await done(ctx);
    const input = ctx.directSales.createInTx.mock.calls[0][1];
    expect(sentLines(ctx).map((l: any) => [l.itemId, l.name, l.totalCents, l.staffId])).toEqual([
      ['cut', 'Haircut', 100_000, 's1'],
      ['colour', 'Colour', 300_000, 's2'],
    ]);
    expect(input.customerId).toBe('c1');
    expect(out.saleId).toBe('sale-1');
    expect(out.changeDueCents).toBe(0);
  });

  it('bills the booked price even if the catalogue price has moved since, and refuses a different price from a cashier', async () => {
    const ctx = ready([bookedRow({ appointmentId: 'a1', itemId: 'cut', name: 'Haircut', unitPriceCents: 90_000, staffId: 's1' })]);
    await expect(done(ctx, { payments: [{ method: 'CASH', amountCents: 90_000 }] })).resolves.toBeTruthy();
    expect(sentLines(ctx)[0].totalCents).toBe(90_000);
    const edited = ready(rows());
    await expect(done(edited, { lines: [{ itemId: 'cut', unitPriceCents: 50_000, staffId: 's1' }], payments: [{ method: 'CASH', amountCents: 50_000 }] })).rejects.toBeInstanceOf(ForbiddenException);
    expect(edited.directSales.createInTx).not.toHaveBeenCalled();
    const manager = ready(rows());
    await expect(done(manager, { lines: [{ itemId: 'cut', unitPriceCents: 50_000, staffId: 's1' }], payments: [{ method: 'CASH', amountCents: 50_000 }] }, MGR)).resolves.toBeTruthy();
  });

  it('lets the desk edit the bill at the end: another service, a different stylist, and a retail product with its stock taken off', async () => {
    const ctx = ready(rows());
    await done(ctx, {
      lines: [
        { itemId: 'cut', staffId: 's3' },
        { itemId: 'shampoo', quantity: 2 },
      ],
      payments: [{ method: 'CASH', amountCents: 100_000 + 160_000 }],
    });
    expect(sentLines(ctx).map((l: any) => [l.itemId, l.quantity, l.totalCents, l.staffId])).toEqual([
      ['cut', 1, 100_000, 's3'],
      ['shampoo', 2, 160_000, undefined],
    ]);
    expect(drawStock).toHaveBeenCalledTimes(1);
    expect(drawStock).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ itemId: 'shampoo', quantity: 2, saleId: 'sale-1', storeId: 'store-1' }));
  });

  it('refuses a line that is not a catalogue item, a staff member who is not ours, and a short payment', async () => {
    const ctx = ready(rows());
    await expect(done(ctx, { lines: [{ itemId: 'nope' }] })).rejects.toThrow(/catalogue/);
    ctx.prisma.user.findMany.mockResolvedValue([]);
    await expect(done(ctx, { lines: [{ itemId: 'cut', staffId: 'stranger' }], payments: [{ method: 'CASH', amountCents: 100_000 }] })).rejects.toThrow(/staff member on the bill was not found/);
    const short = ready(rows());
    await expect(done(short, { payments: [{ method: 'CASH', amountCents: 399_999 }] })).rejects.toThrow(/balance is KES 4000.00/);
    expect(short.prisma.appointment.updateMany).not.toHaveBeenCalled();
  });

  it('lets the deposit pay first, and the tip is NOT part of what must be paid for the invoice', async () => {
    const ctx = ready(rows(), { depositCents: 150_000 });
    const out: any = await done(ctx, { payments: [{ method: 'CASH', amountCents: 250_000 }], tipCents: 30_000 });
    expect(ctx.directSales.createInTx.mock.calls[0][1].payments).toEqual([{ method: 'DEPOSIT', amountCents: 150_000 }, { method: 'CASH', amountCents: 250_000 }]);
    expect(out.tipCents).toBe(30_000);
  });

  it('records a tip apart from the invoice: its own cash entry and its own ledger entry (Tips Payable), and the invoice carries none of it', async () => {
    const ctx = ready(rows());
    await done(ctx, { tipCents: 50_000, tipMethod: 'mpesa' });
    expect(ctx.prisma.cashMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'PAY_IN', method: 'MPESA', amountCents: 50_000, reason: 'APPOINTMENT_TIP', bookingId: 'a1' }),
    });
    expect(sentLines(ctx).reduce((s: number, l: any) => s + l.totalCents, 0)).toBe(400_000);
    await jest.advanceTimersByTimeAsync(0);
    const posted = ctx.ledger.autoPost.mock.calls.find((c: any) => c[0].sourceType === 'APPOINTMENT_TIP');
    expect(posted[0].lines.map((l: any) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['1010', 50_000, 0], ['2200', 0, 50_000]]);
  });

  it('takes no tip entry when there is no tip, and refuses a nonsense tip', async () => {
    const ctx = ready(rows());
    await done(ctx);
    expect(ctx.prisma.cashMovement.create).not.toHaveBeenCalled();
    await expect(done(ready(rows()), { tipCents: -1 })).rejects.toThrow(/Tip/);
    await expect(done(ready(rows()), { tipCents: 100, tipMethod: 'bitcoin' })).rejects.toThrow(/Tip method/);
  });

  it('still bills an older single-service appointment exactly as before, now crediting its stylist', async () => {
    const ctx = ready([], { serviceItemId: 'cut' });
    ctx.prisma.item.findFirst.mockResolvedValue(catalogue.cut);
    await done(ctx, { payments: [{ method: 'CASH', amountCents: 100_000 }] });
    expect(sentLines(ctx)).toHaveLength(1);
    expect(sentLines(ctx)[0]).toEqual(expect.objectContaining({ itemId: 'cut', totalCents: 100_000, staffId: 's1' }));
  });
});

describe('clients', () => {
  it('shows notes, recent visits with what was done and paid, and how reliable the client is', async () => {
    const { svc, prisma } = setup();
    prisma.appointment.findMany.mockResolvedValue([
      { id: 'a2', scheduledAt: at(10), status: 'COMPLETED', notes: 'wants a trim', saleId: 'sale-9' },
      { id: 'a1', scheduledAt: at(9), status: 'NO_SHOW', notes: null, saleId: null },
    ]);
    prisma.appointmentService.findMany.mockResolvedValue([bookedRow({ appointmentId: 'a2', name: 'Haircut' }), bookedRow({ appointmentId: 'a2', name: 'Colour', position: 1 })]);
    prisma.sale.findMany.mockResolvedValue([{ id: 'sale-9', totalCents: 400_000, receiptNumber: 'NRB-9' }]);
    prisma.appointment.groupBy.mockResolvedValue([
      { status: 'COMPLETED', _count: { _all: 6 } }, { status: 'NO_SHOW', _count: { _all: 2 } },
      { status: 'CANCELLED', _count: { _all: 1 } }, { status: 'BOOKED', _count: { _all: 1 } }, { status: 'CONFIRMED', _count: { _all: 1 } },
    ]);
    const h: any = await svc.clientHistory('c1', BIZ);
    expect(h.customer).toEqual(expect.objectContaining({ notes: 'allergic to ammonia', loyaltyPoints: 12 }));
    expect(h.counts).toEqual({ completed: 6, noShow: 2, cancelled: 1, upcoming: 2 });
    expect(h.spentCents).toBe(450_000);
    expect(h.visits[0]).toEqual(expect.objectContaining({ id: 'a2', services: ['Haircut', 'Colour'], totalCents: 400_000, receiptNumber: 'NRB-9' }));
    expect(h.visits[1]).toEqual(expect.objectContaining({ id: 'a1', services: [], totalCents: null }));
  });

  it('does not read another business\'s client, and saves notes only for its own', async () => {
    const { svc, prisma } = setup();
    prisma.customer.findFirst.mockResolvedValue(null);
    await expect(svc.clientHistory('c-other', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.customer.findFirst.mock.calls[0][0].where).toEqual({ id: 'c-other', businessId: BIZ });
    prisma.customer.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.setClientNotes('c-other', 'x', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    prisma.customer.updateMany.mockResolvedValue({ count: 1 });
    await expect(svc.setClientNotes('c1', '  patch test done  ', BIZ)).resolves.toEqual({ id: 'c1', notes: 'patch test done' });
    await expect(svc.setClientNotes('c1', 'x'.repeat(1001), BIZ)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('the stylists', () => {
  it('lists who is set up with their hours; a manager also sees the rest of the team, anyone else only those taking appointments', async () => {
    const { svc, prisma } = setup();
    prisma.serviceStaff.findMany.mockResolvedValue([
      { userId: 's1', active: true, workingHours: JSON.stringify({ '5': ['09:00', '17:00'] }) },
      { userId: 's2', active: false, workingHours: 'garbage' },
    ]);
    prisma.user.findMany.mockResolvedValue([
      { id: 's1', name: 'Amina', role: 'CASHIER' }, { id: 's2', name: 'Brian', role: 'CASHIER' }, { id: 'u9', name: 'Pat', role: 'MANAGER' },
    ]);
    const manager: any = await svc.listStaff(BIZ, true);
    expect(manager.stylists.map((x: any) => [x.name, x.active])).toEqual([['Amina', true], ['Brian', false]]);
    expect(manager.stylists[0].workingHours).toEqual({ '5': ['09:00', '17:00'] });
    expect(manager.stylists[1].workingHours).toEqual({});
    expect(manager.others.map((x: any) => x.name)).toEqual(['Pat']);
    const everyone: any = await svc.listStaff(BIZ, false);
    expect(everyone.stylists.map((x: any) => x.name)).toEqual(['Amina']);
    expect(everyone.others).toBeUndefined();
  });

  it('sets someone up, checks their hours in words, and refuses a stranger', async () => {
    const { svc, prisma } = setup();
    await svc.saveStaff('s1', { active: true, workingHours: { '1': ['09:00', '18:00'] } }, BIZ);
    expect(prisma.serviceStaff.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { businessId_userId: { businessId: BIZ, userId: 's1' } },
      create: expect.objectContaining({ businessId: BIZ, userId: 's1', active: true, workingHours: JSON.stringify({ '1': ['09:00', '18:00'] }) }),
    }));
    await expect(svc.saveStaff('s1', { workingHours: { '1': ['18:00', '09:00'] } }, BIZ)).rejects.toThrow(/end after/);
    prisma.user.findFirst.mockResolvedValue(null);
    await expect(svc.saveStaff('stranger', { active: true }, BIZ)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('switching someone off changes only that and keeps their hours', async () => {
    const { svc, prisma } = setup();
    await svc.saveStaff('s1', { active: false }, BIZ);
    expect(prisma.serviceStaff.upsert.mock.calls[0][0].update).toEqual({ active: false });
  });
});

describe('what each stylist earned', () => {
  it('adds up their lines (a sale counted once however many lines) and works out commission at their HR rate', async () => {
    const { svc, prisma } = setup();
    prisma.saleItem.findMany.mockResolvedValue([
      { staffId: 's1', saleId: 'x1', totalCents: 100_000 }, { staffId: 's1', saleId: 'x1', totalCents: 50_000 }, { staffId: 's1', saleId: 'x2', totalCents: 50_000 },
      { staffId: 's2', saleId: 'x3', totalCents: 300_000 },
    ]);
    prisma.employee.findMany.mockResolvedValue([
      { userId: 's1', commissionRate: 10, commissionBasis: 'SALES_VALUE' },
      { userId: 's2', commissionRate: 50, commissionBasis: 'TRANSACTION_COUNT' },
    ]);
    const out: any[] = await svc.earnings(BIZ, at(0), at(23));
    expect(out.map((x) => [x.name, x.services, x.revenueCents, x.commissionCents])).toEqual([
      ['Staff s2', 1, 300_000, 5000],
      ['Staff s1', 3, 200_000, 20_000],
    ]);
    // limited to this business and to sales that count
    expect(prisma.saleItem.findMany.mock.calls[0][0].where.sale).toEqual(expect.objectContaining({ businessId: BIZ, status: { in: ['PAID', 'COMPLETED', 'AMENDED'] } }));
  });

  it('shows revenue without commission for someone with no HR record, and nothing when nobody served anything', async () => {
    const { svc, prisma } = setup();
    prisma.saleItem.findMany.mockResolvedValue([{ staffId: 's1', saleId: 'x1', totalCents: 10_000 }]);
    const out: any[] = await svc.earnings(BIZ, at(0), at(23));
    expect(out[0]).toEqual(expect.objectContaining({ revenueCents: 10_000, commissionCents: null, commissionRate: null }));
    prisma.saleItem.findMany.mockResolvedValue([]);
    expect(await svc.earnings(BIZ, at(0), at(23))).toEqual([]);
  });
});

import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CybercafeService } from './cybercafe.service';

const NOW = new Date('2026-11-05T10:00:00.000Z');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60000);

function makeStation(o: Record<string, any> = {}) {
  return { id: 'st-1', businessId: 'biz-1', storeId: 'store-1', number: 1, ratePerHourCents: 6000, status: 'AVAILABLE', isActive: true, ...o };
}
function makeSession(o: Record<string, any> = {}) {
  return {
    id: 'ses-1', businessId: 'biz-1', storeId: 'store-1', stationId: 'st-1', status: 'ACTIVE', startedAt: minutesAgo(60),
    pausedAt: null, pausedMinutes: 0, extendedMinutes: 0, timeLimitMinutes: null, ratePerHourCents: 6000,
    package: null, notes: null, ...o,
  };
}

function setup() {
  const p: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }) },
    cyberStation: { findFirst: jest.fn().mockResolvedValue({ id: 'st-1', number: 3, label: null }), findMany: jest.fn(), create: jest.fn(), update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    cyberSession: { findFirst: jest.fn(), create: jest.fn(), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    cyberPackage: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn() },
    customer: { count: jest.fn().mockResolvedValue(1) },
    cyberRate: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), delete: jest.fn() },
    $transaction: jest.fn(),
  };
  p.$transaction.mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(p) : Promise.all(arg)));
  p.cyberSession.create.mockImplementation(async ({ data }: any) => ({ id: 'ses-new', ...data }));
  const directSales: any = {
    isEnabled: jest.fn().mockResolvedValue(false),
    createInTx: jest.fn().mockImplementation(async (_tx: any, input: any) => ({
      sale: { id: 'sale-1', receiptNumber: 'NRB-2026-0000005', totalCents: input.lines.reduce((sum: number, l: any) => sum + l.totalCents, 0), vatCents: 0, totCents: 0, status: input.onAccount ? 'CREDIT' : 'PAID' },
      isCredit: !!input.onAccount,
      payments: input.payments,
    })),
    afterCommit: jest.fn().mockReturnValue({ etims: Promise.resolve({ success: true, controlNumber: 'CU5' }) }),
  };
  return { prisma: p, directSales, svc: new CybercafeService(p, { emitCyberCallAttendant: jest.fn() } as any, directSales) };
}

beforeEach(() => { jest.useFakeTimers().setSystemTime(NOW); });
afterEach(() => { jest.useRealTimers(); });

describe('CybercafeService.startSession', () => {
  const dto = { businessId: 'biz-1', stationId: 'st-1' };

  it('uses the station rate and the station\'s own store', async () => {
    const { svc, prisma } = setup();
    prisma.cyberStation.findFirst.mockResolvedValue(makeStation());
    const s: any = await svc.startSession(dto, { canSetRate: false });
    expect(s.ratePerHourCents).toBe(6000);
    expect(s.storeId).toBe('store-1');
  });

  it('claims the station with a conditional update', async () => {
    const { svc, prisma } = setup();
    prisma.cyberStation.findFirst.mockResolvedValue(makeStation());
    await svc.startSession(dto, { canSetRate: false });
    expect(prisma.cyberStation.updateMany).toHaveBeenCalledWith({
      where: { id: 'st-1', businessId: 'biz-1', status: 'AVAILABLE', isActive: true },
      data: { status: 'IN_USE' },
    });
  });

  it('loses cleanly when someone else took the station first', async () => {
    const { svc, prisma } = setup();
    prisma.cyberStation.findFirst.mockResolvedValue(makeStation());
    prisma.cyberStation.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.startSession(dto, { canSetRate: false })).rejects.toThrow(/just taken/);
    expect(prisma.cyberSession.create).not.toHaveBeenCalled();
  });

  it('refuses a busy, off or foreign station', async () => {
    const { svc, prisma } = setup();
    prisma.cyberStation.findFirst.mockResolvedValue(makeStation({ status: 'IN_USE' }));
    await expect(svc.startSession(dto, { canSetRate: false })).rejects.toThrow(/IN_USE/);
    prisma.cyberStation.findFirst.mockResolvedValue(makeStation({ isActive: false }));
    await expect(svc.startSession(dto, { canSetRate: false })).rejects.toThrow(/switched off/);
    prisma.cyberStation.findFirst.mockResolvedValue(null);
    await expect(svc.startSession(dto, { canSetRate: false })).rejects.toThrow(NotFoundException);
  });

  it('lets the till send the unchanged station rate, but a different rate needs a manager', async () => {
    const { svc, prisma } = setup();
    prisma.cyberStation.findFirst.mockResolvedValue(makeStation());
    await expect(svc.startSession({ ...dto, ratePerHourCents: 6000 }, { canSetRate: false })).resolves.toBeTruthy();
    await expect(svc.startSession({ ...dto, ratePerHourCents: 0 }, { canSetRate: false })).rejects.toThrow(ForbiddenException);
    const managerSession: any = await svc.startSession({ ...dto, ratePerHourCents: 4500 }, { canSetRate: true });
    expect(managerSession.ratePerHourCents).toBe(4500);
  });

  it('rejects a negative or fractional manager rate', async () => {
    const { svc, prisma } = setup();
    prisma.cyberStation.findFirst.mockResolvedValue(makeStation());
    for (const bad of [-1, 1.5, 'free', 1e12]) {
      await expect(svc.startSession({ ...dto, ratePerHourCents: bad as any }, { canSetRate: true })).rejects.toThrow(BadRequestException);
    }
  });

  it('prices a package session at the package\'s hourly equivalent and sets the time limit', async () => {
    const { svc, prisma } = setup();
    prisma.cyberStation.findFirst.mockResolvedValue(makeStation());
    prisma.cyberPackage.findFirst.mockResolvedValue({ id: 'pk-1', priceCents: 5000, durationMinutes: 30 });
    const s: any = await svc.startSession({ ...dto, packageId: 'pk-1', ratePerHourCents: 1 }, { canSetRate: false });
    expect(s.ratePerHourCents).toBe(10000);
    expect(s.timeLimitMinutes).toBe(30);
  });
});

describe('CybercafeService.endSession billing', () => {
  const end = (svc: CybercafeService, extra: Record<string, any> = {}) => svc.endSession('ses-1', 'biz-1', { paymentMethod: 'CASH', ...extra });
  const totalOf = (prisma: any) => prisma.cyberSession.updateMany.mock.calls[0][0].data.totalCents;

  it('bills hourly sessions by the minute, excluding pauses', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ startedAt: minutesAgo(90), pausedMinutes: 30 }));
    await end(svc);
    expect(totalOf(prisma)).toBe(6000); // 60 billable minutes at 60.00/hr
  });

  it('counts time still paused at the moment of ending as paused', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ status: 'PAUSED', startedAt: minutesAgo(60), pausedAt: minutesAgo(30) }));
    await end(svc);
    expect(totalOf(prisma)).toBe(3000);
  });

  const pkg = { id: 'pk-1', priceCents: 5000, durationMinutes: 60 };

  it('charges a package its price when it ends on time', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ package: pkg, ratePerHourCents: 5000, startedAt: minutesAgo(45) }));
    await end(svc);
    expect(totalOf(prisma)).toBe(5000);
  });

  it('charges the overrun and any extension of a package at its hourly equivalent', async () => {
    const { svc, prisma } = setup();
    // 60 minute package, customer stayed 90 minutes (e.g. after a 30 minute extension): 30 over at 50.00/hr.
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ package: pkg, ratePerHourCents: 5000, startedAt: minutesAgo(90), extendedMinutes: 30, timeLimitMinutes: 90 }));
    await end(svc);
    expect(totalOf(prisma)).toBe(5000 + 2500);
  });

  it('does not charge for sub-minute overrun of a package', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ package: pkg, ratePerHourCents: 5000, startedAt: new Date(NOW.getTime() - 60.9 * 60000) }));
    await end(svc);
    expect(totalOf(prisma)).toBe(5000);
  });

  it('adds print and extras to the total', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession());
    await end(svc, { printPagesCents: 1000, extrasCents: 500 });
    expect(totalOf(prisma)).toBe(6000 + 1500);
  });

  it('rejects negative, fractional and absurd extras before changing anything', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession());
    for (const extra of [{ printPagesCents: -1000000 }, { extrasCents: -1 }, { extrasCents: 2.5 }, { printPagesCents: 1e12 }, { extrasCents: 'lots' }]) {
      await expect(end(svc, extra)).rejects.toThrow(BadRequestException);
    }
    expect(prisma.cyberSession.updateMany).not.toHaveBeenCalled();
  });

  it('requires a known payment method', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession());
    await expect(svc.endSession('ses-1', 'biz-1', {})).rejects.toThrow(/Payment method/);
    await expect(svc.endSession('ses-1', 'biz-1', { paymentMethod: 'BARTER' })).rejects.toThrow(/Payment method/);
  });

  it('cannot end a session twice, or end a foreign one', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ status: 'COMPLETED' }));
    await expect(end(svc)).rejects.toThrow(/already ended/);
    prisma.cyberSession.findFirst.mockResolvedValue(null);
    await expect(end(svc)).rejects.toThrow(NotFoundException);
  });

  it('a lost race on the close does not free the station or double-charge', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession());
    prisma.cyberSession.updateMany.mockResolvedValue({ count: 0 });
    await expect(end(svc)).rejects.toThrow(/already ended/);
    expect(prisma.cyberStation.update).not.toHaveBeenCalled();
  });

  it('frees the station when it ends', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession());
    await end(svc);
    expect(prisma.cyberStation.update).toHaveBeenCalledWith({ where: { id: 'st-1' }, data: { status: 'AVAILABLE' } });
  });
});

describe('CybercafeService.voidSession', () => {
  it('refuses to void a session that has already been paid', async () => {
    const { svc, prisma } = setup();
    for (const status of ['COMPLETED', 'VOIDED']) {
      prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ status }));
      await expect(svc.voidSession('ses-1', 'biz-1')).rejects.toThrow(/running session/);
    }
    expect(prisma.cyberSession.updateMany).not.toHaveBeenCalled();
    expect(prisma.cyberStation.update).not.toHaveBeenCalled();
  });

  it('voids a running session, frees its station and keeps the reason', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ notes: 'walk-in' }));
    await svc.voidSession('ses-1', 'biz-1', 'wrong station');
    const data = prisma.cyberSession.updateMany.mock.calls[0][0].data;
    expect(data.status).toBe('VOIDED');
    expect(data.notes).toBe('walk-in | Voided: wrong station');
    expect(prisma.cyberStation.update).toHaveBeenCalledWith({ where: { id: 'st-1' }, data: { status: 'AVAILABLE' } });
  });
});

describe('CybercafeService pause, resume and extend', () => {
  it('only pauses an active session and only resumes a paused one', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ status: 'PAUSED' }));
    await expect(svc.pauseSession('ses-1', 'biz-1')).rejects.toThrow(/not active/);
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ status: 'ACTIVE' }));
    await expect(svc.resumeSession('ses-1', 'biz-1')).rejects.toThrow(/not paused/);
  });

  it('adds the paused time on resume', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ status: 'PAUSED', pausedAt: minutesAgo(12) }));
    await svc.resumeSession('ses-1', 'biz-1');
    expect(prisma.cyberSession.updateMany.mock.calls[0][0].data.pausedMinutes).toEqual({ increment: 12 });
  });

  it('extends by a whole, bounded number of minutes', async () => {
    const { svc, prisma } = setup();
    prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ timeLimitMinutes: 60 }));
    await svc.extendSession('ses-1', 'biz-1', 30);
    expect(prisma.cyberSession.updateMany.mock.calls[0][0].data).toEqual({ extendedMinutes: { increment: 30 }, timeLimitMinutes: { increment: 30 } });
    for (const bad of [0, -30, 1.5, 721, undefined, NaN]) {
      await expect(svc.extendSession('ses-1', 'biz-1', bad as any)).rejects.toThrow(BadRequestException);
    }
  });
});

describe('CybercafeService stations, packages and rates', () => {
  it('will not change a station that has a customer on it', async () => {
    const { svc, prisma } = setup();
    prisma.cyberStation.findFirst.mockResolvedValue(makeStation({ status: 'IN_USE' }));
    await expect(svc.updateStation('st-1', 'biz-1', { status: 'AVAILABLE' })).rejects.toThrow(/end or void/);
    expect(prisma.cyberStation.update).not.toHaveBeenCalled();
  });

  it('only lets a person set AVAILABLE or OFFLINE by hand', async () => {
    const { svc, prisma } = setup();
    prisma.cyberStation.findFirst.mockResolvedValue(makeStation());
    await expect(svc.updateStation('st-1', 'biz-1', { status: 'IN_USE' })).rejects.toThrow(BadRequestException);
    await svc.updateStation('st-1', 'biz-1', { status: 'OFFLINE', businessId: 'other' } as any);
    expect(prisma.cyberStation.update).toHaveBeenCalledWith({ where: { id: 'st-1' }, data: { status: 'OFFLINE' } });
  });

  it('creates a station only in the caller\'s own store and with a fresh number', async () => {
    const { svc, prisma } = setup();
    prisma.store.findFirst.mockResolvedValue(null);
    await expect(svc.createStation({ businessId: 'biz-1', storeId: 'theirs', number: 1, ratePerHourCents: 6000 })).rejects.toThrow(/Store not found/);
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    prisma.cyberStation.findFirst.mockResolvedValue(makeStation());
    await expect(svc.createStation({ businessId: 'biz-1', storeId: 'store-1', number: 1, ratePerHourCents: 6000 })).rejects.toThrow(/already exists/);
  });

  it('validates packages and rates', async () => {
    const { svc, prisma } = setup();
    await expect(svc.createPackage({ businessId: 'biz-1', name: 'x', durationMinutes: 0, priceCents: 100 })).rejects.toThrow(BadRequestException);
    await expect(svc.createPackage({ businessId: 'biz-1', name: 'x', durationMinutes: 60, priceCents: -5 })).rejects.toThrow(BadRequestException);
    prisma.store.findFirst.mockResolvedValue({ id: 'store-1' });
    await expect(svc.createRate({ businessId: 'biz-1', storeId: 'store-1', service: 'Print', rateCents: -1 })).rejects.toThrow(BadRequestException);
    await expect(svc.createRate({ businessId: 'biz-1', storeId: 'store-1', service: 'Print', rateCents: 1000, category: 'NONSENSE' })).rejects.toThrow(BadRequestException);
  });

  it('treats another business\'s rate and package as missing', async () => {
    const { svc, prisma } = setup();
    prisma.cyberRate.findFirst.mockResolvedValue(null);
    prisma.cyberPackage.findFirst.mockResolvedValue(null);
    await expect(svc.deleteRate('r1', 'biz-1')).rejects.toThrow(NotFoundException);
    await expect(svc.updateRate('r1', 'biz-1', { rateCents: 1 })).rejects.toThrow(NotFoundException);
    await expect(svc.updatePackage('p1', 'biz-1', { priceCents: 1 })).rejects.toThrow(NotFoundException);
    expect(prisma.cyberRate.delete).not.toHaveBeenCalled();
  });
});


describe('CybercafeService.endSession on the sales pipeline', () => {
  const ready = (sessionOver: Record<string, any> = {}) => {
    const ctx = setup();
    ctx.directSales.isEnabled.mockResolvedValue(true);
    ctx.prisma.cyberSession.findFirst.mockResolvedValue(makeSession(sessionOver));
    ctx.prisma.item = { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: `item-${data.name}`, taxClass: 'B', vatApplicable: true, ...data })) };
    return ctx;
  };
  const end = (svc: CybercafeService, extra: Record<string, any> = {}) => svc.endSession('ses-1', 'biz-1', { paymentMethod: 'CASH', ...extra });
  const lines = (ctx: any) => ctx.directSales.createInTx.mock.calls[0][1].lines.map((l: any) => [l.name, l.totalCents]);

  it('is unchanged for a business that has not switched over', async () => {
    const ctx = setup();
    ctx.prisma.cyberSession.findFirst.mockResolvedValue(makeSession());
    const r: any = await end(ctx.svc);
    expect(ctx.directSales.createInTx).not.toHaveBeenCalled();
    expect(r.saleId).toBeUndefined();
  });

  it('invoices the time, the printing and the extras as separate lines, and returns the receipt', async () => {
    const ctx = ready();
    const r: any = await ctx.svc.endSession('ses-1', 'biz-1', { paymentMethod: 'CASH', printPagesCents: 2000, extrasCents: 500, paymentRef: 'MP1' }, { id: 'u-att' });
    expect(ctx.directSales.createInTx.mock.calls[0][1].cashierId).toBe('u-att');
    expect(lines(ctx)).toEqual([['Computer time 1h 0m (PC 3)', 6000], ['Printing and scanning', 2000], ['Other services', 500]]);
    const input = ctx.directSales.createInTx.mock.calls[0][1];
    expect(input).toEqual(expect.objectContaining({ source: 'CYBER', storeId: 'store-1', onAccount: false, payments: [{ method: 'CASH', amountCents: 8500, reference: 'MP1' }] }));
    expect(ctx.prisma.cyberSession.updateMany).toHaveBeenCalledWith({ where: { id: 'ses-1', businessId: 'biz-1' }, data: { saleId: 'sale-1' } });
    expect(r).toEqual(expect.objectContaining({ saleId: 'sale-1', receiptNumber: 'NRB-2026-0000005', etims: expect.objectContaining({ controlNumber: 'CU5' }) }));
  });

  it('a package is its own line, and time beyond it is another', async () => {
    const ctx = ready({ package: { id: 'p1', name: '2 hour pass', priceCents: 10000, durationMinutes: 30 }, packageId: 'p1' });
    await end(ctx.svc);
    // 60 minutes used on a 30-minute package at KES 60/h: 30 minutes over = 30.00
    expect(lines(ctx)).toEqual([['2 hour pass (PC 3)', 10000], ['Extra time 30 min (PC 3)', 3000]]);
  });

  it('the line items are inactive catalogue items made on first use, standard-rated', async () => {
    const ctx = ready();
    await end(ctx.svc);
    expect(ctx.prisma.item.create).toHaveBeenCalledWith({ data: expect.objectContaining({ name: 'Cyber computer time', category: 'Cyber cafe', isActive: false, taxClass: 'B', trackStock: false }) });
  });

  it('credit goes on account to the session\'s registered customer, with no payment', async () => {
    const ctx = ready({ customerId: 'cust-1' });
    await end(ctx.svc, { paymentMethod: 'CREDIT' });
    expect(ctx.directSales.createInTx.mock.calls[0][1]).toEqual(expect.objectContaining({ onAccount: true, customerId: 'cust-1', payments: [] }));
  });

  it('credit needs a registered customer, with or without the pipeline, and refuses nothing else changed', async () => {
    for (const on of [true, false]) {
      const ctx = ready();
      ctx.directSales.isEnabled.mockResolvedValue(on);
      await expect(end(ctx.svc, { paymentMethod: 'CREDIT' })).rejects.toThrow(/registered customer/);
      ctx.prisma.cyberSession.findFirst.mockResolvedValue(makeSession({ customerId: 'ghost' }));
      ctx.prisma.customer.count.mockResolvedValue(0);
      await expect(end(ctx.svc, { paymentMethod: 'CREDIT' })).rejects.toThrow(/Customer not found/);
      expect(ctx.prisma.cyberSession.updateMany).not.toHaveBeenCalled();
    }
  });

  it('a customer named at the till can be billed on account when the session had none', async () => {
    const ctx = ready();
    await end(ctx.svc, { paymentMethod: 'CREDIT', customerId: 'cust-9' });
    expect(ctx.directSales.createInTx.mock.calls[0][1].customerId).toBe('cust-9');
  });

  it('a failed invoice (credit limit, say) leaves the session running', async () => {
    const ctx = ready({ customerId: 'cust-1' });
    ctx.directSales.createInTx.mockRejectedValue(new BadRequestException('Credit limit exceeded'));
    await expect(end(ctx.svc, { paymentMethod: 'CREDIT' })).rejects.toThrow(/Credit limit/);
    expect(ctx.directSales.afterCommit).not.toHaveBeenCalled();
  });

  it('a free session makes no invoice, and a bad buyer PIN is refused first', async () => {
    const free = ready({ ratePerHourCents: 0 });
    await end(free.svc);
    expect(free.directSales.createInTx).not.toHaveBeenCalled();
    const bad = ready();
    await expect(end(bad.svc, { buyerKraPin: 'nope' })).rejects.toThrow(/KRA PIN/);
    expect(bad.prisma.cyberSession.updateMany).not.toHaveBeenCalled();
  });
});

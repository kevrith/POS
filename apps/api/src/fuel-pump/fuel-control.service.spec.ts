import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FuelControlService } from './fuel-control.service';

const TANK = { id: 'tank-1', businessId: 'biz-1', storeId: 'store-1', tankNumber: 1, gradeId: 'grade-1', capacityLitres: 1000, currentLitres: 500, minLevelLitres: 100, avgCostCents: 0, isActive: true, label: null, grade: { name: 'Petrol' } };
const NOZZLE = (o: Record<string, any> = {}) => ({
  id: 'noz-1', businessId: 'biz-1', storeId: 'store-1', pumpId: 'pump-1', nozzleNumber: 1, gradeId: 'grade-1', tankId: 'tank-1',
  totalizerLitres: 1000, lastReadingAt: new Date('2026-11-10T18:00:00Z'), isActive: true, pump: { pumpNumber: 1, label: null }, grade: { name: 'Petrol', pricePerLitreCents: 19500 }, ...o,
});
const SHIFT = (o: Record<string, any> = {}) => ({
  id: 'shift-1', businessId: 'biz-1', storeId: 'store-1', status: 'OPEN', openedAt: new Date('2026-11-11T05:00:00Z'), closedAt: null,
  readings: [{ id: 'r-1', shiftId: 'shift-1', pumpId: 'pump-1', nozzleId: 'noz-1', attendantId: 'att-1', openingLitres: 1000 }],
  attendants: [{ id: 'att-1', name: 'Ann', userId: null, nozzleIds: ['noz-1'], expectedCashCents: null, declaredCashCents: null, cashVarianceCents: null }], ...o,
});

function makePrisma() {
  const p: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }) },
    user: { count: jest.fn().mockResolvedValue(1) },
    fuelTank: { findFirst: jest.fn().mockResolvedValue(TANK), findMany: jest.fn().mockResolvedValue([TANK]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    fuelTankDipping: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'dip-1', ...data })), findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), count: jest.fn().mockResolvedValue(3) },
    fuelDelivery: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'del-1', ...data })), findMany: jest.fn().mockResolvedValue([]) },
    fuelNozzle: { findFirst: jest.fn().mockResolvedValue(NOZZLE()), findMany: jest.fn().mockResolvedValue([NOZZLE()]), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    fuelPumpTest: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'test-1', ...data })), findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]) },
    fuelShift: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'shift-new' }), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn() },
    fuelShiftAttendant: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: `att-${data.name}`, ...data })), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    fuelShiftReading: { create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    fuelSale: { aggregate: jest.fn().mockResolvedValue({ _sum: { litresDispensed: 0 } }), groupBy: jest.fn().mockResolvedValue([]), findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([{ currentLitres: 500, avgCostCents: 0, capacityLitres: 1000 }]),
    $executeRaw: jest.fn().mockResolvedValue(1),
    $transaction: jest.fn(),
  };
  p.$transaction.mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(p) : Promise.all(arg)));
  return p;
}
function setup() {
  const prisma = makePrisma();
  return { prisma, svc: new FuelControlService(prisma) };
}

describe('FuelControlService.recordDipping', () => {
  it('keeps what the books said and the difference, then sets the level to what was measured', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ currentLitres: 500 }]);
    const dip: any = await svc.recordDipping({ businessId: 'biz-1', tankId: 'tank-1', litres: 487.5, recordedBy: 'Ann', waterMm: 4 });
    expect(dip).toEqual(expect.objectContaining({ bookLitres: 500, varianceLitres: -12.5, litres: 487.5, waterMm: 4, kind: 'DIP' }));
    expect(prisma.fuelTank.updateMany).toHaveBeenCalledWith({ where: { id: 'tank-1', businessId: 'biz-1' }, data: { currentLitres: 487.5 } });
  });

  it('the first reading of a new tank is its opening level, not a gain', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ currentLitres: 0 }]);
    prisma.fuelTankDipping.count.mockResolvedValue(0);
    const dip: any = await svc.recordDipping({ businessId: 'biz-1', tankId: 'tank-1', litres: 800, recordedBy: 'Ann' });
    expect(dip).toEqual(expect.objectContaining({ kind: 'OPENING', bookLitres: 800, varianceLitres: 0 }));
    expect(prisma.fuelTank.updateMany.mock.calls[0][0].data).toEqual({ currentLitres: 800 });
  });

  it('an empty tank that has been measured before is a real finding, not an opening', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ currentLitres: 0 }]);
    prisma.fuelTankDipping.count.mockResolvedValue(2);
    const dip: any = await svc.recordDipping({ businessId: 'biz-1', tankId: 'tank-1', litres: 300, recordedBy: 'Ann' });
    expect(dip).toEqual(expect.objectContaining({ kind: 'DIP', varianceLitres: 300 }));
  });

  it('locks the tank row while it reads the book level', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ currentLitres: 500 }]);
    await svc.recordDipping({ businessId: 'biz-1', tankId: 'tank-1', litres: 500, recordedBy: 'Ann' });
    expect(prisma.$queryRaw.mock.calls[0][0].join('?')).toMatch(/FOR UPDATE/);
  });

  it('rejects a reading above the tank capacity, below zero or not a number, and treats a stranger\'s tank as missing', async () => {
    const { svc, prisma } = setup();
    for (const litres of [1001, -1, NaN]) {
      await expect(svc.recordDipping({ businessId: 'biz-1', tankId: 'tank-1', litres, recordedBy: 'Ann' })).rejects.toThrow(BadRequestException);
    }
    prisma.fuelTank.findFirst.mockResolvedValue(null);
    await expect(svc.recordDipping({ businessId: 'biz-2', tankId: 'tank-1', litres: 5, recordedBy: 'Ann' })).rejects.toThrow(NotFoundException);
    expect(prisma.fuelTankDipping.create).not.toHaveBeenCalled();
  });
});

describe('FuelControlService.recordDelivery', () => {
  const base = { businessId: 'biz-1', tankId: 'tank-1' };

  it('without dips takes the delivery note as read and adds it to the book level', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ currentLitres: 500, avgCostCents: 0, capacityLitres: 1000 }]);
    const d: any = await svc.recordDelivery({ ...base, litresDelivered: 400 });
    expect(d).toEqual(expect.objectContaining({ litresDelivered: 400, docketLitres: 400, shortLitres: 0, isShort: false }));
    expect(prisma.fuelTank.updateMany.mock.calls[0][0].data).toEqual({ currentLitres: 900 });
    expect(prisma.fuelTankDipping.create).not.toHaveBeenCalled();
  });

  it('refuses a delivery bigger than the room on the books instead of capping it silently', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ currentLitres: 900, avgCostCents: 0, capacityLitres: 1000 }]);
    await expect(svc.recordDelivery({ ...base, litresDelivered: 400 })).rejects.toThrow(/does not fit/);
    for (const litresDelivered of [0, -10, NaN]) {
      await expect(svc.recordDelivery({ ...base, litresDelivered })).rejects.toThrow(BadRequestException);
    }
    expect(prisma.fuelDelivery.create).not.toHaveBeenCalled();
  });

  it('with dips before and after, the tank decides what was received and the shortfall is recorded', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ currentLitres: 210, avgCostCents: 0, capacityLitres: 1000 }]);
    const d: any = await svc.recordDelivery({ ...base, docketLitres: 700, dipBeforeLitres: 200, dipAfterLitres: 890, recordedBy: 'Ann' });
    expect(d).toEqual(expect.objectContaining({ litresDelivered: 690, docketLitres: 700, shortLitres: 10, dipBeforeLitres: 200, dipAfterLitres: 890 }));
    // The reading before the offload corrects the books first: 200 measured against 210 expected.
    expect(prisma.fuelTankDipping.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ kind: 'BEFORE_DELIVERY', litres: 200, bookLitres: 210, varianceLitres: -10 }));
    expect(prisma.fuelTankDipping.create.mock.calls[1][0].data).toEqual(expect.objectContaining({ kind: 'AFTER_DELIVERY', litres: 890, varianceLitres: 0 }));
    expect(prisma.fuelTank.updateMany.mock.calls[0][0].data.currentLitres).toBe(890);
  });

  it('flags a shortfall past half a percent of the note', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ currentLitres: 0, avgCostCents: 0, capacityLitres: 1000 }]);
    const d: any = await svc.recordDelivery({ ...base, docketLitres: 500, dipBeforeLitres: 0, dipAfterLitres: 490 });
    expect(d.isShort).toBe(true);
    expect(d.shortPct).toBe(2);
  });

  it('needs both dips or neither, and the second higher than the first', async () => {
    const { svc } = setup();
    await expect(svc.recordDelivery({ ...base, docketLitres: 100, dipBeforeLitres: 10 })).rejects.toThrow(/both tank readings/);
    await expect(svc.recordDelivery({ ...base, docketLitres: 100, dipBeforeLitres: 300, dipAfterLitres: 300 })).rejects.toThrow(/higher/);
  });

  it('a priced delivery moves the tank\'s average cost by litres and keeps the supplier total', async () => {
    const { svc, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ currentLitres: 400, avgCostCents: 17000, capacityLitres: 1000 }]);
    const d: any = await svc.recordDelivery({ ...base, litresDelivered: 400, unitCostCents: 18000 });
    expect(d.totalCostCents).toBe(7_200_000);
    expect(prisma.fuelTank.updateMany.mock.calls[0][0].data.avgCostCents).toBe(17500);
  });

  it('an unpriced delivery leaves the average cost alone', async () => {
    const { svc, prisma } = setup();
    await svc.recordDelivery({ ...base, litresDelivered: 100 });
    expect(prisma.fuelTank.updateMany.mock.calls[0][0].data).not.toHaveProperty('avgCostCents');
  });
});

describe('FuelControlService.recordPumpTest', () => {
  it('needs an open shift that includes the nozzle, and leaves the tank alone', async () => {
    const { svc, prisma } = setup();
    await expect(svc.recordPumpTest({ businessId: 'biz-1', nozzleId: 'noz-1', litres: 20, recordedBy: 'Ann' })).rejects.toThrow(/No shift is open/);
    prisma.fuelShift.findFirst.mockResolvedValue(SHIFT({ readings: [{ id: 'r', nozzleId: 'other' }] }));
    await expect(svc.recordPumpTest({ businessId: 'biz-1', nozzleId: 'noz-1', litres: 20, recordedBy: 'Ann' })).rejects.toThrow(/not on the open shift/);
    prisma.fuelShift.findFirst.mockResolvedValue(SHIFT());
    const t: any = await svc.recordPumpTest({ businessId: 'biz-1', nozzleId: 'noz-1', litres: 20, reason: 'calibration', recordedBy: 'Ann' });
    expect(t).toEqual(expect.objectContaining({ shiftId: 'shift-1', litres: 20, reason: 'CALIBRATION' }));
    expect(prisma.fuelTank.updateMany).not.toHaveBeenCalled();
  });

  it('refuses silly litres and unknown reasons', async () => {
    const { svc, prisma } = setup();
    prisma.fuelShift.findFirst.mockResolvedValue(SHIFT());
    for (const litres of [0, -5, 201, NaN]) {
      await expect(svc.recordPumpTest({ businessId: 'biz-1', nozzleId: 'noz-1', litres, recordedBy: 'Ann' })).rejects.toThrow(BadRequestException);
    }
    await expect(svc.recordPumpTest({ businessId: 'biz-1', nozzleId: 'noz-1', litres: 10, reason: 'FUN', recordedBy: 'Ann' })).rejects.toThrow(/Reason/);
  });
});

describe('FuelControlService.openShift', () => {
  const OPEN = {
    businessId: 'biz-1', storeId: 'store-1', cashierName: 'Grace',
    attendants: [{ name: 'Ann', nozzleIds: ['noz-1'] }],
    readings: [{ nozzleId: 'noz-1', openingLitres: 1000 }],
  };

  it('opens a shift with attendants answering for nozzles, and sets each meter', async () => {
    const { svc, prisma } = setup();
    prisma.fuelShift.findFirst.mockResolvedValueOnce(null).mockResolvedValue(SHIFT());
    await svc.openShift(OPEN);
    expect(prisma.fuelShiftAttendant.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ name: 'Ann', nozzleIds: ['noz-1'] }));
    expect(prisma.fuelShiftReading.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ nozzleId: 'noz-1', attendantId: 'att-Ann', openingLitres: 1000 }));
    expect(prisma.fuelNozzle.updateMany).toHaveBeenCalledWith({ where: { id: 'noz-1', businessId: 'biz-1' }, data: expect.objectContaining({ totalizerLitres: 1000 }) });
  });

  it('serialises concurrent opens with an advisory lock and refuses a second open shift', async () => {
    const { svc, prisma } = setup();
    prisma.fuelShift.findFirst.mockResolvedValue(SHIFT());
    await expect(svc.openShift(OPEN)).rejects.toThrow(/already open/);
    expect(prisma.$executeRaw.mock.calls[0][0].join('?')).toMatch(/pg_advisory_xact_lock/);
    expect(prisma.fuelShift.create).not.toHaveBeenCalled();
  });

  it('every nozzle needs one attendant and one reading', async () => {
    const { svc } = setup();
    await expect(svc.openShift({ ...OPEN, attendants: [] })).rejects.toThrow(/at least one attendant/);
    await expect(svc.openShift({ ...OPEN, attendants: [{ name: 'Ann', nozzleIds: [] }] })).rejects.toThrow(/at least one nozzle/);
    await expect(svc.openShift({ ...OPEN, attendants: [{ name: 'Ann', nozzleIds: ['noz-1'] }, { name: 'Bob', nozzleIds: ['noz-1'] }] })).rejects.toThrow(/only one attendant/);
    await expect(svc.openShift({ ...OPEN, readings: [] })).rejects.toThrow(/exactly one attendant and one opening reading/);
    await expect(svc.openShift({ ...OPEN, readings: [{ nozzleId: 'noz-1', openingLitres: -3 }] })).rejects.toThrow(BadRequestException);
  });

  it('refuses a nozzle that is not an active nozzle of this store', async () => {
    const { svc, prisma } = setup();
    prisma.fuelNozzle.findMany.mockResolvedValue([]);
    await expect(svc.openShift(OPEN)).rejects.toThrow(/not an active nozzle/);
  });

  it('an opening reading that does not continue from the last close needs a reason, which is kept', async () => {
    const { svc, prisma } = setup();
    const jump = { ...OPEN, readings: [{ nozzleId: 'noz-1', openingLitres: 1250 }] };
    await expect(svc.openShift(jump)).rejects.toThrow(/closed at 1000.*Add a note/);
    prisma.fuelShift.findFirst.mockResolvedValueOnce(null).mockResolvedValue(SHIFT());
    await svc.openShift({ ...OPEN, readings: [{ nozzleId: 'noz-1', openingLitres: 1250, note: 'meter replaced' }] });
    expect(prisma.fuelShiftReading.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ previousClosingLitres: 1000, openingNote: 'meter replaced' }));
  });

  it('a nozzle never read before sets its meter without a fuss', async () => {
    const { svc, prisma } = setup();
    prisma.fuelNozzle.findMany.mockResolvedValue([NOZZLE({ lastReadingAt: null, totalizerLitres: 0 })]);
    prisma.fuelShift.findFirst.mockResolvedValueOnce(null).mockResolvedValue(SHIFT());
    await expect(svc.openShift({ ...OPEN, readings: [{ nozzleId: 'noz-1', openingLitres: 48213 }] })).resolves.toBeDefined();
  });

  it('an attendant must be on the team', async () => {
    const { svc, prisma } = setup();
    prisma.user.count.mockResolvedValue(0);
    await expect(svc.openShift({ ...OPEN, attendants: [{ name: 'Ann', userId: 'stranger', nozzleIds: ['noz-1'] }] })).rejects.toThrow(/not on your team/);
  });
});

describe('FuelControlService.closeShift', () => {
  const ACTOR = { id: 'u-1', name: 'Grace' };
  const CLOSE = { readings: [{ nozzleId: 'noz-1', closingLitres: 1100 }], attendants: [{ attendantId: 'att-1', declaredCashCents: 1_950_000 }] };
  function ready() {
    const ctx = setup();
    ctx.prisma.fuelShift.findFirst.mockResolvedValue(SHIFT());
    ctx.prisma.fuelSale.groupBy
      .mockResolvedValueOnce([{ nozzleId: 'noz-1', _sum: { litresDispensed: 100 } }])
      .mockResolvedValueOnce([{ attendantId: 'att-1', _sum: { totalCents: 1_950_000 } }]);
    return ctx;
  }

  it('stores the reconciliation as it stood at close: meter, sold, tested, unrecorded, and the cash difference', async () => {
    const { svc, prisma } = ready();
    prisma.fuelPumpTest.groupBy.mockResolvedValue([]);
    await svc.closeShift('shift-1', 'biz-1', ACTOR, { ...CLOSE, readings: [{ nozzleId: 'noz-1', closingLitres: 1115 }], attendants: [{ attendantId: 'att-1', declaredCashCents: 1_900_000 }] }).catch(() => undefined);
    expect(prisma.fuelShiftReading.updateMany).toHaveBeenCalledWith({
      where: { id: 'r-1', shiftId: 'shift-1' },
      data: { closingLitres: 1115, meterLitres: 115, soldLitres: 100, testLitres: 0, unrecordedLitres: 15 },
    });
    expect(prisma.fuelShiftAttendant.updateMany).toHaveBeenCalledWith({
      where: { id: 'att-1', shiftId: 'shift-1' },
      data: expect.objectContaining({ expectedCashCents: 1_950_000, declaredCashCents: 1_900_000, cashVarianceCents: -50_000 }),
    });
    expect(prisma.fuelNozzle.updateMany).toHaveBeenCalledWith({ where: { id: 'noz-1', businessId: 'biz-1' }, data: expect.objectContaining({ totalizerLitres: 1115 }) });
  });

  it('claims the close with a conditional update, so a second close or a race changes nothing', async () => {
    const { svc, prisma } = ready();
    prisma.fuelShift.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.closeShift('shift-1', 'biz-1', ACTOR, CLOSE)).rejects.toThrow(/already closed/);
    expect(prisma.fuelShift.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'shift-1', businessId: 'biz-1', status: 'OPEN' } }));
    expect(prisma.fuelShiftReading.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to close a shift that is not open or not yours', async () => {
    const { svc, prisma } = ready();
    prisma.fuelShift.findFirst.mockResolvedValue(SHIFT({ status: 'CLOSED' }));
    await expect(svc.closeShift('shift-1', 'biz-1', ACTOR, CLOSE)).rejects.toThrow(/already closed/);
    prisma.fuelShift.findFirst.mockResolvedValue(null);
    await expect(svc.closeShift('shift-1', 'biz-2', ACTOR, CLOSE)).rejects.toThrow(NotFoundException);
  });

  it('every nozzle must be read and every attendant must hand in a figure', async () => {
    const { svc, prisma } = ready();
    await expect(svc.closeShift('shift-1', 'biz-1', ACTOR, { ...CLOSE, readings: [] })).rejects.toThrow(/Read every nozzle/);
    await expect(svc.closeShift('shift-1', 'biz-1', ACTOR, { ...CLOSE, attendants: [] })).rejects.toThrow(/cash handed in by Ann/);
    expect(prisma.fuelShift.updateMany).not.toHaveBeenCalled();
  });

  it('rejects a reading below the opening, a nozzle from another shift, a duplicate and a bad cash figure', async () => {
    const { svc } = ready();
    await expect(svc.closeShift('shift-1', 'biz-1', ACTOR, { ...CLOSE, readings: [{ nozzleId: 'noz-1', closingLitres: 900 }] })).rejects.toThrow(BadRequestException);
    await expect(svc.closeShift('shift-1', 'biz-1', ACTOR, { ...CLOSE, readings: [{ nozzleId: 'noz-9', closingLitres: 1200 }] })).rejects.toThrow(/not on this shift/);
    await expect(svc.closeShift('shift-1', 'biz-1', ACTOR, { ...CLOSE, readings: [{ nozzleId: 'noz-1', closingLitres: 1200 }, { nozzleId: 'noz-1', closingLitres: 1300 }] })).rejects.toThrow(/only one closing/);
    await expect(svc.closeShift('shift-1', 'biz-1', ACTOR, { ...CLOSE, attendants: [{ attendantId: 'att-1', declaredCashCents: -5 }] })).rejects.toThrow(BadRequestException);
    await expect(svc.closeShift('shift-1', 'biz-1', ACTOR, { ...CLOSE, attendants: [{ attendantId: 'att-x', declaredCashCents: 5 }] })).rejects.toThrow(/not on this shift/);
  });

  it('closes a shift from before nozzles had meters the old way, by pump', async () => {
    const { svc, prisma } = setup();
    prisma.fuelShift.findFirst.mockResolvedValue(SHIFT({ readings: [{ id: 'r-0', pumpId: 'pump-1', nozzleId: null, openingLitres: 100 }], attendants: [] }));
    await svc.closeShift('shift-1', 'biz-1', ACTOR, { readings: [{ pumpId: 'pump-1', closingLitres: 250 }] }).catch(() => undefined);
    expect(prisma.fuelShiftReading.updateMany).toHaveBeenCalledWith({ where: { shiftId: 'shift-1', pumpId: 'pump-1' }, data: { closingLitres: 250 } });
  });
});

describe('FuelControlService.getVarianceReport', () => {
  it('reports the fuel gained or lost as the sum of what dips found, against what was sold from that tank', async () => {
    const { svc, prisma } = setup();
    prisma.fuelSale.aggregate.mockResolvedValueOnce({ _sum: { litresDispensed: 4000 } }).mockResolvedValueOnce({ _sum: { litresDispensed: 0 } });
    prisma.fuelTankDipping.findMany.mockResolvedValue([{ varianceLitres: -20 }, { varianceLitres: -10 }, { varianceLitres: 0 }, { varianceLitres: null }]);
    prisma.fuelDelivery.findMany.mockResolvedValue([{ litresDelivered: 3000, shortLitres: 15 }]);
    prisma.fuelTankDipping.findFirst.mockResolvedValue({ recordedAt: new Date(Date.now() - 2 * 3600_000), litres: 480, waterMm: 2 });
    const [row] = await svc.getVarianceReport('biz-1', 'store-1');
    expect(row).toEqual(expect.objectContaining({
      soldLitres: 4000, deliveredLitres: 3000, shortDeliveryLitres: 15, varianceLitres: -30, variancePct: -0.75, status: 'ALERT', dipCount: 4, dipOverdue: false, hoursSinceDip: 2,
    }));
  });

  it('counts a sale from before nozzles only where the grade has one tank, and flags a tank nobody has dipped', async () => {
    const { svc, prisma } = setup();
    prisma.fuelSale.aggregate.mockResolvedValueOnce({ _sum: { litresDispensed: 100 } }).mockResolvedValueOnce({ _sum: { litresDispensed: 50 } });
    const [one] = await svc.getVarianceReport('biz-1', 'store-1');
    expect(one.soldLitres).toBe(150);
    expect(one.dipOverdue).toBe(true);

    const two = setup();
    two.prisma.fuelTank.findMany.mockResolvedValue([TANK, { ...TANK, id: 'tank-2', tankNumber: 2 }]);
    two.prisma.fuelSale.aggregate.mockResolvedValue({ _sum: { litresDispensed: 100 } });
    await two.svc.getVarianceReport('biz-1', 'store-1');
    // Two tanks of one grade: only the per-tank sales are counted, so the legacy query is never made.
    expect(two.prisma.fuelSale.aggregate).toHaveBeenCalledTimes(2);
  });

  it('flags a tank below its minimum level', async () => {
    const { svc, prisma } = setup();
    prisma.fuelTank.findMany.mockResolvedValue([{ ...TANK, currentLitres: 50 }]);
    const [row] = await svc.getVarianceReport('biz-1', 'store-1');
    expect(row.belowMinimum).toBe(true);
  });
});

describe('FuelControlService.getShiftSummary', () => {
  it('shows where each meter should read, per attendant, while the shift is open', async () => {
    const { svc, prisma } = setup();
    prisma.fuelShift.findFirst.mockResolvedValue(SHIFT());
    prisma.fuelSale.findMany.mockResolvedValue([
      { id: 's1', status: 'COMPLETED', nozzleId: 'noz-1', attendantId: 'att-1', litresDispensed: 10, totalCents: 195_000, paymentMethod: 'CASH', pumpId: 'pump-1', pump: { pumpNumber: 1, label: null } },
      { id: 's2', status: 'COMPLETED', nozzleId: 'noz-1', attendantId: 'att-1', litresDispensed: 20, totalCents: 390_000, paymentMethod: 'MPESA', pumpId: 'pump-1', pump: { pumpNumber: 1, label: null } },
      { id: 's3', status: 'VOIDED', nozzleId: 'noz-1', attendantId: 'att-1', litresDispensed: 5, totalCents: 97_500, paymentMethod: 'CASH', pumpId: 'pump-1', pump: { pumpNumber: 1, label: null } },
    ]);
    prisma.fuelPumpTest.findMany.mockResolvedValue([{ nozzleId: 'noz-1', litres: 20 }]);
    const r = await svc.getShiftSummary('shift-1', 'biz-1');
    expect(r.byNozzle[0]).toEqual(expect.objectContaining({ soldLitres: 30, testLitres: 20, voidedLitres: 5, expectedClosingLitres: 1050, closingLitres: null }));
    expect(r.byAttendant[0]).toEqual(expect.objectContaining({ litres: 30, revenueCents: 585_000, expectedCashCents: 195_000, declaredCashCents: null }));
    expect(r.byAttendant[0].byMethod).toEqual(expect.objectContaining({ CASH: 195_000, MPESA: 390_000 }));
    expect(r).toEqual(expect.objectContaining({ totalLitres: 30, voidedCount: 1, voidedLitres: 5 }));
  });

  it('treats another business\'s shift as missing', async () => {
    const { svc } = setup();
    await expect(svc.getShiftSummary('s', 'biz-1')).rejects.toThrow(NotFoundException);
  });
});

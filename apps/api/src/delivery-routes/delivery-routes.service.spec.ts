import { DeliveryRoutesService } from './delivery-routes.service';

function makePrisma() {
  return {
    deliveryRun: { findMany: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), create: jest.fn(), update: jest.fn() },
    deliveryRunOrder: { findFirst: jest.fn(), create: jest.fn(), delete: jest.fn(), update: jest.fn() },
    routeExpense: { create: jest.fn(), aggregate: jest.fn() },
    salesRoute: { findFirst: jest.fn(), findMany: jest.fn() },
    fieldOrder: { findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn(), findMany: jest.fn() },
    deliveryOrder: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
    store: { findFirst: jest.fn() },
  };
}

function makeService(overrides: Record<string, any> = {}, feeCents = 0) {
  const prisma: any = { ...makePrisma(), ...overrides };
  const delivery: any = { calcDeliveryFee: jest.fn().mockResolvedValue({ feeCents }) };
  return { svc: new DeliveryRoutesService(prisma, delivery), prisma, delivery };
}

describe('DeliveryRoutesService', () => {
  describe('getRuns', () => {
    it('flattens route/driver/order totals for the runs board', async () => {
      const { svc, prisma } = makeService();
      prisma.deliveryRun.findMany.mockResolvedValue([
        {
          id: 'run-1',
          businessId: 'biz-1',
          routeId: 'route-1',
          status: 'PLANNED',
          route: { id: 'route-1', name: 'Nairobi East', color: '#fff' },
          driver: { id: 'u-1', name: 'Otieno' },
          orders: [{ fieldOrder: { totalCents: 5000 } }, { fieldOrder: { totalCents: 2500 } }],
          expenses: [{ amountCents: 1000 }],
        },
      ]);

      const [run] = await svc.getRuns('biz-1', {});

      expect(run.routeName).toBe('Nairobi East');
      expect(run.driverName).toBe('Otieno');
      expect(run.orderCount).toBe(2);
      expect(run.totalCents).toBe(7500);
      expect(run.expenseTotalCents).toBe(1000);
      // Nested relation stays for callers that read run.route
      expect(run.route.name).toBe('Nairobi East');
    });

    it('filters on a startDate/endDate range inclusively', async () => {
      const { svc, prisma } = makeService();
      prisma.deliveryRun.findMany.mockResolvedValue([]);

      await svc.getRuns('biz-1', { startDate: '2026-07-31', endDate: '2026-08-13' });

      const where = prisma.deliveryRun.findMany.mock.calls[0][0].where;
      expect(where.date.gte).toEqual(new Date(2026, 6, 31, 0, 0, 0, 0));
      expect(where.date.lt).toEqual(new Date(2026, 7, 14, 0, 0, 0, 0));
    });
  });

  describe('getRun', () => {
    it('flattens stop customer/order details', async () => {
      const { svc, prisma } = makeService();
      prisma.deliveryRun.findFirst.mockResolvedValue({
        id: 'run-1',
        route: { id: 'route-1', name: 'Nairobi East' },
        driver: { id: 'u-1', name: 'Otieno' },
        orders: [
          {
            id: 'ro-1',
            status: 'PENDING',
            fieldOrder: { orderNumber: 'FO-001', totalCents: 4200, customer: { name: 'Mama Mboga' } },
          },
        ],
        expenses: [{ amountCents: 800 }],
      });

      const run = await svc.getRun('run-1', 'biz-1');

      expect(run.routeName).toBe('Nairobi East');
      expect(run.driverName).toBe('Otieno');
      expect(run.orders[0]).toMatchObject({
        orderNumber: 'FO-001',
        customerName: 'Mama Mboga',
        totalCents: 4200,
      });
      expect(run.totalCents).toBe(4200);
      expect(run.expenseTotalCents).toBe(800);
    });
  });

  describe('addExpense', () => {
    it('records the expense against the run and the logged-in user', async () => {
      const { svc, prisma } = makeService();
      prisma.deliveryRun.findFirst.mockResolvedValue({ id: 'run-1', businessId: 'biz-1' });
      prisma.routeExpense.create.mockResolvedValue({ id: 'exp-1' });

      await svc.addExpense('run-1', 'biz-1', {
        category: 'FUEL',
        amountCents: 250000,
        description: null as any,
        recordedBy: 'u-1',
      });

      expect(prisma.routeExpense.create).toHaveBeenCalledWith({
        data: {
          businessId: 'biz-1',
          deliveryRunId: 'run-1',
          category: 'FUEL',
          amountCents: 250000,
          description: null,
          recordedBy: 'u-1',
        },
      });
    });

    it('rejects a missing recordedBy instead of failing at the database', async () => {
      const { svc, prisma } = makeService();
      prisma.deliveryRun.findFirst.mockResolvedValue({ id: 'run-1', businessId: 'biz-1' });

      await expect(
        svc.addExpense('run-1', 'biz-1', { category: 'FUEL', amountCents: 100, recordedBy: '' }),
      ).rejects.toThrow('recordedBy is required');
      expect(prisma.routeExpense.create).not.toHaveBeenCalled();
    });

    it('rejects a zero or negative amount', async () => {
      const { svc, prisma } = makeService();
      prisma.deliveryRun.findFirst.mockResolvedValue({ id: 'run-1', businessId: 'biz-1' });

      await expect(
        svc.addExpense('run-1', 'biz-1', { category: 'FUEL', amountCents: 0, recordedBy: 'u-1' }),
      ).rejects.toThrow('greater than zero');
    });

    it('refuses a run from another business', async () => {
      const { svc, prisma } = makeService();
      prisma.deliveryRun.findFirst.mockResolvedValue(null);

      await expect(
        svc.addExpense('run-1', 'biz-2', { category: 'FUEL', amountCents: 100, recordedBy: 'u-1' }),
      ).rejects.toThrow('Delivery run not found');
    });
  });

  describe('createRun', () => {
    it('rejects a route that does not belong to the business', async () => {
      const { svc, prisma } = makeService();
      prisma.salesRoute.findFirst.mockResolvedValue(null);

      await expect(
        svc.createRun('biz-1', { routeId: 'route-x', date: '2026-08-13', orderIds: [] }),
      ).rejects.toThrow('valid route');
      expect(prisma.deliveryRun.create).not.toHaveBeenCalled();
    });

    it('creates a run with no orders without touching field orders', async () => {
      const { svc, prisma } = makeService();
      prisma.salesRoute.findFirst.mockResolvedValue({ id: 'route-1' });
      prisma.deliveryRun.create.mockResolvedValue({ id: 'run-1', orders: [] });
      prisma.deliveryRun.findUnique.mockResolvedValue(null);

      await svc.createRun('biz-1', { routeId: 'route-1', date: '2026-08-13', orderIds: [] });

      expect(prisma.fieldOrder.updateMany).not.toHaveBeenCalled();
      expect(prisma.deliveryRun.create.mock.calls[0][0].data.routeId).toBe('route-1');
    });
  });

  describe('captureProof', () => {
    it('will not touch a run order from another business', async () => {
      const { svc, prisma } = makeService();
      prisma.deliveryRunOrder.findFirst.mockResolvedValue(null);

      await expect(
        svc.captureProof('ro-1', 'biz-2', { receivedByName: 'Jane' }),
      ).rejects.toThrow('Delivery run order not found');
    });
  });
});

describe('DeliveryRoutesService — projected delivery pricing', () => {
  function runWithStop(customer: any) {
    const prisma: any = {
      deliveryRun: {
        findUnique: jest.fn().mockResolvedValue({
          id: 'run-1',
          driverUserId: 'drv-1',
          date: new Date(),
          orders: [{
            fieldOrder: {
              id: 'fo-1', businessId: 'biz-1', storeId: 'store-1',
              orderNumber: 'FO-0001', customerId: 'c-1', customer,
              subtotalCents: 1000, vatCents: 160, totalCents: 1160,
              paymentStatus: 'UNPAID', notes: null, items: [],
            },
          }],
        }),
      },
      deliveryOrder: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn(), update: jest.fn() },
      store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }) },
    };
    return prisma;
  }

  it('prices the delivery by zone when the customer has coordinates', async () => {
    const prisma = runWithStop({ name: 'Kev', phone: '2547', gpsLat: -1.29, gpsLng: 36.82, addresses: [] });
    const delivery: any = { calcDeliveryFee: jest.fn().mockResolvedValue({ feeCents: 25000 }) };
    const svc = new DeliveryRoutesService(prisma as any, delivery);

    await (svc as any).syncDeliveryOrders('run-1');

    expect(delivery.calcDeliveryFee).toHaveBeenCalledWith('biz-1', -1.29, 36.82);
    expect(prisma.deliveryOrder.create.mock.calls[0][0].data.deliveryFeeCents).toBe(25000);
  });

  it('charges nothing when the customer has no location to price against', async () => {
    const prisma = runWithStop({ name: 'Kev', phone: '2547', gpsLat: null, gpsLng: null, addresses: [] });
    const delivery: any = { calcDeliveryFee: jest.fn() };
    const svc = new DeliveryRoutesService(prisma as any, delivery);

    await (svc as any).syncDeliveryOrders('run-1');

    expect(delivery.calcDeliveryFee).not.toHaveBeenCalled();
    expect(prisma.deliveryOrder.create.mock.calls[0][0].data.deliveryFeeCents).toBe(0);
  });
});

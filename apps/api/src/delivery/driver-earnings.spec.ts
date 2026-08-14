import { DeliveryService } from './delivery.service';

function makeService(driver: any, deliveries: any[]) {
  const prisma: any = {
    user: { findFirst: jest.fn().mockResolvedValue(driver) },
    deliveryOrder: { findMany: jest.fn().mockResolvedValue(deliveries) },
  };
  const svc = new DeliveryService(
    prisma,
    { createEntry: jest.fn() } as any,
    { sendSMS: jest.fn() } as any,
    { sendToUser: jest.fn() } as any,
  );
  return { svc, prisma };
}

const today = new Date();
const delivery = (feeCents: number, daysAgo = 0) => ({
  id: `d-${feeCents}-${daysAgo}`,
  orderNumber: 'DEL-ABC12345',
  customerName: 'Kev',
  deliveryAddress: 'Westlands',
  deliveryFeeCents: feeCents,
  deliveredAt: new Date(today.getTime() - daysAgo * 86400000),
  createdAt: new Date(today.getTime() - daysAgo * 86400000),
});

describe('DeliveryService — driver earnings', () => {
  it('pays a flat rate per delivery, not the customer fee', async () => {
    const { svc } = makeService(
      { id: 'u1', name: 'George', deliveryRateCents: 15000, deliveryCommissionPercent: null },
      [delivery(50000), delivery(0)],
    );

    const res = await svc.getDriverEarnings('u1', 'biz-1');

    // Two deliveries at KES 150 each — the 500 and 0 fees are irrelevant.
    expect(res.totalCents).toBe(30000);
    expect(res.deliveries.every((d) => d.earnedCents === 15000)).toBe(true);
  });

  it('still pays for a delivery that carried no fee at all', async () => {
    const { svc } = makeService(
      { id: 'u1', name: 'George', deliveryRateCents: 15000, deliveryCommissionPercent: null },
      [delivery(0)],
    );
    const res = await svc.getDriverEarnings('u1', 'biz-1');
    expect(res.totalCents).toBe(15000); // was 0 under the old fee-summing logic
  });

  it('adds a commission on top when a percentage is set', async () => {
    const { svc } = makeService(
      { id: 'u1', name: 'George', deliveryRateCents: 10000, deliveryCommissionPercent: 10 },
      [delivery(50000)],
    );
    const res = await svc.getDriverEarnings('u1', 'biz-1');
    expect(res.totalCents).toBe(15000); // 100 flat + 10% of 500
  });

  it('reports when no rate is configured instead of a bare zero', async () => {
    const { svc } = makeService(
      { id: 'u1', name: 'George', deliveryRateCents: null, deliveryCommissionPercent: null },
      [delivery(50000)],
    );
    const res = await svc.getDriverEarnings('u1', 'biz-1');
    expect(res.rateConfigured).toBe(false);
    expect(res.totalCents).toBe(0);
    expect(res.deliveryCount).toBe(1); // the work is still recorded
  });

  it('splits today from the week', async () => {
    const { svc } = makeService(
      { id: 'u1', name: 'George', deliveryRateCents: 10000, deliveryCommissionPercent: null },
      [delivery(0, 0), delivery(0, 3), delivery(0, 30)],
    );
    const res = await svc.getDriverEarnings('u1', 'biz-1');
    expect(res.todayCents).toBe(10000);
    expect(res.weekCents).toBe(20000);
    expect(res.totalCents).toBe(30000);
  });

  it('refuses a driver from another business', async () => {
    const { svc } = makeService(null, []);
    await expect(svc.getDriverEarnings('u1', 'biz-2')).rejects.toThrow('Driver not found');
  });
});

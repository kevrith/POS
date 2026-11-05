import { BusinessService } from './business.service';
import { NotFoundException } from '@nestjs/common';

/**
 * The settings body used to be handed to Prisma verbatim.
 *
 * The setup wizard loads settings, holds the response in form state and posts it
 * back, so `businessId` — which is not a column on Business — travelled with it
 * and Prisma rejected the entire update with an "Unknown argument" error dumped
 * on screen. This API has no ValidationPipe, so nothing upstream strips unknown
 * keys; the service has to.
 */
function make(existing: Record<string, unknown> | null = { id: 'biz-1', name: 'Old' }) {
  const prisma: any = {
    business: {
      findUnique: jest.fn().mockResolvedValue(existing),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'biz-1', ...data })),
    },
  };
  return { service: new BusinessService(prisma, {} as any, { autoPost: jest.fn() } as any), prisma };
}

describe('BusinessService.updateSettings', () => {
  it('drops keys that are not settings columns', async () => {
    const { service, prisma } = make();
    await service.updateSettings('biz-1', {
      name: 'business one',
      posMode: 'RETAIL',
      taxType: 'VAT',
      businessId: 'biz-1',   // the exact key that broke the wizard
      id: 'biz-1',
    } as any);

    const data = prisma.business.update.mock.calls[0][0].data;
    expect(data).toEqual({ name: 'business one', posMode: 'RETAIL', taxType: 'VAT' });
    expect(data).not.toHaveProperty('businessId');
    expect(data).not.toHaveProperty('id');
  });

  it('stores only known optional modules, as a JSON list', async () => {
    const { service, prisma } = make();
    await service.updateSettings('biz-1', { enabledModules: ['RESTAURANT', 'NOT_A_MODULE'] } as any);
    expect(prisma.business.update.mock.calls[0][0].data).toEqual({ enabledModules: '["RESTAURANT"]' });
  });

  it('refuses to let a customer set their own plan', async () => {
    const { service, prisma } = make();
    await service.updateSettings('biz-1', {
      name: 'ok',
      subscriptionTier: 'ENTERPRISE',
      planName: 'Enterprise',
      isComped: true,
    } as any);

    const data = prisma.business.update.mock.calls[0][0].data;
    expect(data).toEqual({ name: 'ok' });
  });

  it('keeps every legitimate settings field', async () => {
    const { service, prisma } = make();
    const dto = {
      name: 'Shop', taxType: 'TOT' as const, totRate: 3, serviceChargeRate: 10,
      serviceChargeDefault: true, negativePolicyDefault: 'BLOCK' as const,
      posMode: 'HOSPITALITY', expiryAlertDays: 30, receiptHeader: 'Hi',
      enableCashDrawer: false,
    };
    await service.updateSettings('biz-1', dto);
    expect(prisma.business.update.mock.calls[0][0].data).toEqual(dto);
  });

  it('skips the write entirely when nothing valid was sent', async () => {
    const { service, prisma } = make();
    await service.updateSettings('biz-1', { businessId: 'x' } as any);
    expect(prisma.business.update).not.toHaveBeenCalled();
  });

  it('still 404s for a business that does not exist', async () => {
    const { service } = make(null);
    await expect(service.updateSettings('nope', { name: 'x' })).rejects.toThrow(NotFoundException);
  });
});

describe('BusinessService.updateSettings: the sales-pipeline switch', () => {
  const { ForbiddenException } = require('@nestjs/common');

  it('the owner turning it on stamps the cutover moment', async () => {
    const { service, prisma } = make({ id: 'biz-1', verticalSalesFrom: null });
    const before = Date.now();
    await service.updateSettings('biz-1', { verticalSalesEnabled: true }, 'OWNER');
    const data = prisma.business.update.mock.calls[0][0].data;
    expect(data.verticalSalesFrom).toBeInstanceOf(Date);
    expect(data.verticalSalesFrom.getTime()).toBeGreaterThanOrEqual(before);
    expect('verticalSalesEnabled' in data).toBe(false);
  });

  it('turning it off clears the date', async () => {
    const { service, prisma } = make({ id: 'biz-1', verticalSalesFrom: new Date('2026-01-01') });
    await service.updateSettings('biz-1', { verticalSalesEnabled: false }, 'ADMIN');
    expect(prisma.business.update.mock.calls[0][0].data).toEqual({ verticalSalesFrom: null });
  });

  it('asking for the state it is already in changes nothing, and keeps the original date', async () => {
    const original = new Date('2026-01-01');
    const { service, prisma } = make({ id: 'biz-1', verticalSalesFrom: original });
    const r = await service.updateSettings('biz-1', { verticalSalesEnabled: true }, 'OWNER');
    expect(prisma.business.update).not.toHaveBeenCalled();
    expect((r as any).verticalSalesFrom).toBe(original);
    const off = make({ id: 'biz-1', verticalSalesFrom: null });
    await off.service.updateSettings('biz-1', { verticalSalesEnabled: false }, 'OWNER');
    expect(off.prisma.business.update).not.toHaveBeenCalled();
  });

  it('nobody below the owner can change it, and no role at all cannot either', async () => {
    for (const role of ['MANAGER', 'CASHIER', 'ACCOUNTANT', 'WAITER', undefined]) {
      const { service, prisma } = make({ id: 'biz-1', verticalSalesFrom: null });
      await expect(service.updateSettings('biz-1', { verticalSalesEnabled: true }, role as any)).rejects.toThrow(ForbiddenException);
      expect(prisma.business.update).not.toHaveBeenCalled();
    }
  });

  it('a manager can still change ordinary settings, with the switch absent', async () => {
    const { service, prisma } = make();
    await service.updateSettings('biz-1', { name: 'Renamed' }, 'MANAGER');
    expect(prisma.business.update.mock.calls[0][0].data).toEqual({ name: 'Renamed' });
  });

  it('a client cannot write the cutover date directly', async () => {
    const { service, prisma } = make();
    await service.updateSettings('biz-1', { name: 'x', verticalSalesFrom: '2020-01-01' } as any, 'OWNER');
    expect('verticalSalesFrom' in prisma.business.update.mock.calls[0][0].data).toBe(false);
  });
});

describe('BusinessService.updateSettings: hotel levies', () => {
  it('stores a valid list as JSON, rounding the rate to two decimals', async () => {
    const { service, prisma } = make({ id: 'biz-1' });
    await service.updateSettings('biz-1', { hotelLevies: [{ name: ' Tourism levy ', ratePct: 2.005, base: 'ROOM' }] }, 'MANAGER');
    const stored = JSON.parse(prisma.business.update.mock.calls[0][0].data.hotelLevies);
    expect(stored).toEqual([{ name: 'Tourism levy', ratePct: 2.01, base: 'ROOM' }]);
  });

  it('an empty list switches levies off', async () => {
    const { service, prisma } = make({ id: 'biz-1' });
    await service.updateSettings('biz-1', { hotelLevies: [] }, 'OWNER');
    expect(prisma.business.update.mock.calls[0][0].data.hotelLevies).toBe('[]');
  });

  it('refuses a rate that is zero, negative or absurd, a bad base, an unnamed levy, and too many', async () => {
    const bad: unknown[] = [
      [{ name: 'x', ratePct: 0, base: 'ROOM' }],
      [{ name: 'x', ratePct: -1, base: 'ROOM' }],
      [{ name: 'x', ratePct: 90, base: 'ROOM' }],
      [{ name: 'x', ratePct: 2, base: 'SOME' }],
      [{ name: '', ratePct: 2, base: 'ROOM' }],
      'not json',
      { name: 'x' },
      Array.from({ length: 6 }, () => ({ name: 'x', ratePct: 1, base: 'ALL' })),
    ];
    for (const hotelLevies of bad) {
      const { service, prisma } = make({ id: 'biz-1' });
      await expect(service.updateSettings('biz-1', { hotelLevies }, 'OWNER')).rejects.toThrow();
      expect(prisma.business.update).not.toHaveBeenCalled();
    }
  });
});

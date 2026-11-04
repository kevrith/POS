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
  return { service: new BusinessService(prisma, {} as any), prisma };
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

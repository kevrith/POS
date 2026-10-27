import { BadRequestException, NotFoundException } from '@nestjs/common';
import { PortalService } from './portal.service';

// /portal/pay-order and /portal/order/:id/confirm-payment are public, so these
// pin down what the server refuses to take on the client's word.
function build(order: Record<string, unknown> | null, mpesaStatus = 'paid') {
  const prisma = {
    deliveryOrder: {
      findUnique: jest.fn().mockResolvedValue(order),
      update: jest.fn().mockResolvedValue({}),
    },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const mpesa = {
    initiateSTKPush: jest.fn().mockResolvedValue({ checkoutRequestId: 'ws_CO_real', merchantRequestId: 'm1' }),
    querySTKStatus: jest.fn().mockResolvedValue({ status: mpesaStatus, resultDesc: 'ok' }),
  };
  const svc = new PortalService(prisma as never, {} as never, mpesa as never, {} as never);
  return { svc, prisma, mpesa };
}

describe('PortalService.payOrder', () => {
  it('charges the order total, not the amount the client sent', async () => {
    const { svc, mpesa, prisma } = build({ id: 'o1', totalCents: 500000, paymentStatus: 'UNPAID' });
    await svc.payOrder({ phone: '0712345678', amountCents: 100, reference: 'ORD-1' });
    expect(mpesa.initiateSTKPush).toHaveBeenCalledWith(expect.objectContaining({ amountCents: 500000 }));
    expect(prisma.deliveryOrder.update).toHaveBeenCalledWith({
      where: { id: 'o1' },
      data: { paymentRef: 'ws_CO_real' },
    });
  });

  it('refuses an unknown order reference', async () => {
    const { svc, mpesa } = build(null);
    await expect(svc.payOrder({ phone: '0712345678', amountCents: 100, reference: 'nope' })).rejects.toBeInstanceOf(NotFoundException);
    expect(mpesa.initiateSTKPush).not.toHaveBeenCalled();
  });

  it('refuses to charge an order that is already paid', async () => {
    const { svc, mpesa } = build({ id: 'o1', totalCents: 1000, paymentStatus: 'PAID' });
    await expect(svc.payOrder({ phone: '0712345678', amountCents: 1000, reference: 'ORD-1' })).rejects.toBeInstanceOf(BadRequestException);
    expect(mpesa.initiateSTKPush).not.toHaveBeenCalled();
  });

  it('rejects a missing reference as a 400', async () => {
    const { svc } = build(null);
    await expect(svc.payOrder({ phone: '0712345678', amountCents: 1, reference: undefined as never })).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('PortalService.confirmPayment', () => {
  const order = { id: 'o1', businessId: 'b1', storeId: 's1', status: 'PENDING', paymentStatus: 'UNPAID', paymentRef: 'ws_CO_real', items: [], saleId: null };

  it('rejects a receipt from a different checkout without even asking M-Pesa', async () => {
    const { svc, mpesa, prisma } = build(order);
    await expect(svc.confirmPayment('o1', 'ws_CO_someone_elses')).rejects.toBeInstanceOf(BadRequestException);
    expect(mpesa.querySTKStatus).not.toHaveBeenCalled();
    expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
  });

  it('rejects confirmation for an order that never started a checkout', async () => {
    const { svc } = build({ ...order, paymentRef: null });
    await expect(svc.confirmPayment('o1', 'ws_CO_real')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('marks the order paid when its own checkout succeeded', async () => {
    const { svc, prisma } = build(order);
    await svc.confirmPayment('o1', 'ws_CO_real');
    expect(prisma.deliveryOrder.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ paymentStatus: 'PAID', paymentRef: 'ws_CO_real' }) }),
    );
  });

  it('does not mark the order paid while M-Pesa still says pending', async () => {
    const { svc, prisma } = build(order, 'pending');
    const res = await svc.confirmPayment('o1', 'ws_CO_real');
    expect(res).toMatchObject({ paid: false });
    expect(prisma.deliveryOrder.update).not.toHaveBeenCalled();
  });
});

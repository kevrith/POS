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

describe('PortalService.placeOrder', () => {
  function buildOrder(catalog: Array<Record<string, unknown>>, customer: Record<string, unknown> | null = { id: 'c1' }) {
    const prisma = {
      store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }) },
      customer: { findFirst: jest.fn().mockResolvedValue(customer) },
      item: { findMany: jest.fn().mockResolvedValue(catalog) },
      deliveryOrder: {
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'o1', orderNumber: data.orderNumber })),
      },
    };
    const notifications = { sendSMS: jest.fn().mockResolvedValue({ success: true }) };
    const svc = new PortalService(prisma as never, notifications as never, {} as never, {} as never);
    return { svc, prisma };
  }
  const base = { businessId: 'b1', customerName: 'A', phone: '0712345678', address: 'x', orderType: 'DELIVERY' as const };

  it('prices the order from the catalog, not from the client', async () => {
    const { svc, prisma } = buildOrder([{ id: 'i1', name: 'Americano', retailPriceCents: 25000 }]);
    const res = await svc.placeOrder({ ...base, items: [{ itemId: 'i1', name: 'Americano', quantity: 2, priceCents: 1 }] });
    expect(res.totalCents).toBe(50000);
    const data = prisma.deliveryOrder.create.mock.calls[0][0].data;
    expect(data.items.create[0]).toMatchObject({ unitPriceCents: 25000, totalCents: 50000 });
  });

  it('refuses a line for an item that is not in this business catalog', async () => {
    const { svc, prisma } = buildOrder([]);
    await expect(svc.placeOrder({ ...base, items: [{ itemId: 'other-biz-item', name: 'x', quantity: 1, priceCents: 1 }] }))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.deliveryOrder.create).not.toHaveBeenCalled();
  });

  it('refuses a line with no item id', async () => {
    const { svc } = buildOrder([]);
    await expect(svc.placeOrder({ ...base, items: [{ name: 'x', quantity: 1, priceCents: 1 }] }))
      .rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses zero and negative quantities, which would lower the total', async () => {
    const { svc } = buildOrder([{ id: 'i1', name: 'Americano', retailPriceCents: 25000 }]);
    for (const quantity of [0, -3, Number.NaN]) {
      await expect(svc.placeOrder({ ...base, items: [{ itemId: 'i1', name: 'Americano', quantity, priceCents: 25000 }] }))
        .rejects.toBeInstanceOf(BadRequestException);
    }
  });

  it('finds the account whichever shape of the phone number the customer typed', async () => {
    const { svc, prisma } = buildOrder([{ id: 'i1', name: 'Americano', retailPriceCents: 25000 }]);
    await svc.placeOrder({ ...base, phone: '0712345678', items: [{ itemId: 'i1', name: 'Americano', quantity: 1, priceCents: 25000 }] });
    const where = prisma.customer.findFirst.mock.calls[0][0].where;
    expect(where.phone.in).toEqual(expect.arrayContaining(['254712345678', '0712345678', '+254712345678']));
  });
});

describe('prescription-only and controlled medicines on the public storefront', () => {
  const AMOX = { id: 'i-rx', name: 'Amoxicillin 500mg', category: 'Medicine', type: 'PRODUCT', retailPriceCents: 4000, barcode: null, requiresPrescription: true, scheduleClass: null };
  const MORPH = { id: 'i-c', name: 'Morphine 10mg/ml', category: 'Medicine', type: 'PRODUCT', retailPriceCents: 9000, barcode: null, requiresPrescription: false, scheduleClass: 'II' };
  const PARA = { id: 'i-ok', name: 'Paracetamol 500mg', category: 'Medicine', type: 'PRODUCT', retailPriceCents: 500, barcode: null, requiresPrescription: false, scheduleClass: 'OTC' };

  function build(catalog: Array<Record<string, unknown>>) {
    const prisma = {
      business: { findUnique: jest.fn().mockResolvedValue({ name: 'Pharmacy', taxType: 'VAT', posMode: 'CLINIC' }) },
      store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }) },
      customer: { findFirst: jest.fn().mockResolvedValue(null) },
      item: { findMany: jest.fn().mockResolvedValue(catalog) },
      deliveryOrder: { count: jest.fn().mockResolvedValue(0), create: jest.fn().mockImplementation(async ({ data }) => ({ id: 'o1', orderNumber: data.orderNumber })) },
    };
    return { svc: new PortalService(prisma as never, { sendSMS: jest.fn().mockResolvedValue({}) } as never, {} as never, {} as never), prisma };
  }
  const base = { businessId: 'b1', customerName: 'A', phone: '0712345678', address: 'x', orderType: 'DELIVERY' as const };

  it('the public menu leaves them out, and does not leak the flags', async () => {
    const { svc } = build([AMOX, MORPH, PARA]);
    const menu: any = await svc.getMenu('b1');
    const names = menu.categories.flatMap((c: any) => c.items.map((i: any) => i.name));
    expect(names).toEqual(['Paracetamol 500mg']);
    expect(JSON.stringify(menu)).not.toContain('requiresPrescription');
    expect(JSON.stringify(menu)).not.toContain('scheduleClass');
  });

  it('an order that includes one is refused whole, and nothing is saved or charged', async () => {
    const { svc, prisma } = build([AMOX, PARA]);
    await expect(svc.placeOrder({ ...base, items: [{ itemId: 'i-ok', name: 'x', quantity: 1, priceCents: 1 }, { itemId: 'i-rx', name: 'x', quantity: 1, priceCents: 1 }] })).rejects.toMatchObject({ response: { code: 'RESTRICTED_SALE' } });
    expect(prisma.deliveryOrder.create).not.toHaveBeenCalled();
  });

  it('an order of ordinary medicines still goes through', async () => {
    const { svc } = build([PARA]);
    await expect(svc.placeOrder({ ...base, items: [{ itemId: 'i-ok', name: 'x', quantity: 2, priceCents: 1 }] })).resolves.toMatchObject({ totalCents: 1000 });
  });
});

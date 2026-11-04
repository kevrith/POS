import { BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';
import { SaleType } from '@pos/shared';

// ─── Mock factories ─────────────────────────────────────────────────────────

function makeStore(overrides: Record<string, any> = {}) {
  return {
    id: 'store-001',
    businessId: 'biz-001',
    storeCode: 'NRB01',
    receiptSequence: 0,
    business: {
      id: 'biz-001',
      taxType: 'VAT',
      serviceChargeRate: 10,
      negativePolicyDefault: 'ALLOW',
    },
    ...overrides,
  };
}

function makeItem(overrides: Record<string, any> = {}) {
  return {
    id: 'item-001',
    name: 'Cappuccino',
    retailPriceCents: 50000, // KES 500
    wholesalePriceCents: 40000,
    vipPriceCents: 45000,
    trackStock: true,
    ...overrides,
  };
}

function makePrisma() {
  return {
    store: { findUnique: jest.fn(), update: jest.fn() },
    item: { findMany: jest.fn() },
    sale: { create: jest.fn(), findMany: jest.fn(), findUnique: jest.fn(), update: jest.fn(), count: jest.fn() },
    inventoryMovement: { create: jest.fn() },
    order: { update: jest.fn() },
    table: { update: jest.fn() },
    customer: { update: jest.fn() },
    $transaction: jest.fn(),
  };
}

function makeDeps(prismaOverrides: Partial<ReturnType<typeof makePrisma>> = {}) {
  const prisma = { ...makePrisma(), ...prismaOverrides };

  const inventory = { getStockLevel: jest.fn().mockResolvedValue(100) };
  const audit = { log: jest.fn().mockResolvedValue(undefined), createEntry: jest.fn().mockResolvedValue(undefined) };
  const auth = {};
  const webhooks = { dispatch: jest.fn().mockResolvedValue(undefined) };
  const etims = { submitSale: jest.fn().mockResolvedValue(undefined) };
  const notifications = { createNotification: jest.fn().mockResolvedValue(undefined) };
  const push = { sendToBusinessRoles: jest.fn().mockResolvedValue(undefined), sendToUser: jest.fn().mockResolvedValue(undefined) };
  const events = { emitToStore: jest.fn(), emitSaleCreated: jest.fn() };
  const loyalty = { earnPoints: jest.fn().mockResolvedValue({ points: 0, balance: 0 }) };
  const subscriptionLimits = { checkMonthlyTransactionLimit: jest.fn().mockResolvedValue({ allowed: true }) };

  return { prisma, inventory, audit, auth, webhooks, etims, notifications, push, events, loyalty, subscriptionLimits };
}

function makeService(overrides: Partial<ReturnType<typeof makeDeps>> = {}) {
  const deps = { ...makeDeps(), ...overrides };
  return new (SalesService as any)(
    deps.prisma,
    deps.inventory,
    deps.audit,
    deps.auth,
    deps.webhooks,
    deps.etims,
    deps.notifications,
    deps.push,
    deps.events,
    deps.loyalty,
    deps.subscriptionLimits,
  ) as SalesService & { _deps: typeof deps };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

const BASE_DTO = {
  storeId: 'store-001',
  cashierId: 'user-001',
  type: SaleType.NORMAL,
  priceLevel: 'RETAIL' as const,
  items: [{ itemId: 'item-001', quantity: 2 }],
  payments: [{ method: 'CASH', amountCents: 110000 }],
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('SalesService.createSale', () => {
  it('throws BadRequestException for invalid store', async () => {
    const deps = makeDeps();
    deps.prisma.store.findUnique.mockResolvedValue(null);
    const svc = makeService(deps as any);

    await expect((svc as any).createSale('biz-001', BASE_DTO)).rejects.toThrow(BadRequestException);
    await expect((svc as any).createSale('biz-001', BASE_DTO)).rejects.toThrow('Invalid store');
  });

  it('throws BadRequestException when store belongs to a different business', async () => {
    const deps = makeDeps();
    deps.prisma.store.findUnique.mockResolvedValue(makeStore({ businessId: 'OTHER_BIZ' }));
    const svc = makeService(deps as any);

    await expect((svc as any).createSale('biz-001', BASE_DTO)).rejects.toThrow(BadRequestException);
  });

  it('throws BadRequestException when stock < quantity and BLOCK policy is set', async () => {
    const deps = makeDeps();
    deps.prisma.store.findUnique.mockResolvedValue(
      makeStore({ business: { taxType: 'VAT', serviceChargeRate: 0, negativePolicyDefault: 'BLOCK' } }),
    );
    deps.prisma.item.findMany.mockResolvedValue([makeItem()]);
    deps.inventory.getStockLevel.mockResolvedValue(1); // only 1 in stock, need 2

    const svc = makeService(deps as any);

    await expect((svc as any).createSale('biz-001', BASE_DTO)).rejects.toThrow('Insufficient stock');
  });

  it('allows oversell when negative policy is ALLOW', async () => {
    const deps = makeDeps();
    const store = makeStore({ business: { taxType: 'VAT', serviceChargeRate: 0, negativePolicyDefault: 'ALLOW' } });
    deps.prisma.store.findUnique.mockResolvedValue(store);
    deps.prisma.item.findMany.mockResolvedValue([makeItem()]);
    deps.inventory.getStockLevel.mockResolvedValue(0); // zero stock
    const svc = makeService(deps as any);

    // $transaction mock — returns a minimal sale
    deps.prisma.$transaction.mockImplementation(async (fn: any) => {
      deps.prisma.store.update.mockResolvedValue({ ...store, receiptSequence: 1, storeCode: 'NRB01' });
      deps.prisma.sale.create.mockResolvedValue({
        id: 'sale-001', receiptNumber: 'NRB01-2026-0000001', totalCents: 100000, items: [], payments: [],
      });
      deps.prisma.inventoryMovement.create.mockResolvedValue({});
      return fn(deps.prisma);
    });

    // Should NOT throw — completes normally
    await expect((svc as any).createSale('biz-001', { ...BASE_DTO, serviceChargeCents: 0 })).resolves.toBeDefined();
  });

  it('calculates subtotal correctly from item price × quantity', async () => {
    const deps = makeDeps();
    const store = makeStore({ business: { taxType: 'VAT', serviceChargeRate: 0, negativePolicyDefault: 'ALLOW' } });
    deps.prisma.store.findUnique.mockResolvedValue(store);
    // Item: KES 500 (50000 cents), qty 3 → subtotal = 150,000 cents
    deps.prisma.item.findMany.mockResolvedValue([makeItem({ retailPriceCents: 50000 })]);
    deps.inventory.getStockLevel.mockResolvedValue(100);
    const svc = makeService(deps as any);

    let capturedSaleData: any;
    deps.prisma.$transaction.mockImplementation(async (fn: any) => {
      deps.prisma.store.update.mockResolvedValue({ ...store, receiptSequence: 1 });
      deps.prisma.sale.create.mockImplementation(async ({ data }: any) => {
        capturedSaleData = data;
        return { id: 'sale-001', receiptNumber: 'NRB01-2026-0000001', totalCents: data.totalCents, items: [], payments: [] };
      });
      deps.prisma.inventoryMovement.create.mockResolvedValue({});
      return fn(deps.prisma);
    });

    await (svc as any).createSale('biz-001', {
      ...BASE_DTO,
      items: [{ itemId: 'item-001', quantity: 3 }],
      payments: [{ method: 'CASH', amountCents: 150000 }],
      serviceChargeCents: 0,
    });

    expect(capturedSaleData.subtotalCents).toBe(150000);
    expect(capturedSaleData.totalCents).toBe(150000); // no service charge, no discount
  });

  it('includes service charge in totalCents when provided', async () => {
    const deps = makeDeps();
    const store = makeStore({ business: { taxType: 'VAT', serviceChargeRate: 0, negativePolicyDefault: 'ALLOW' } });
    deps.prisma.store.findUnique.mockResolvedValue(store);
    deps.prisma.item.findMany.mockResolvedValue([makeItem({ retailPriceCents: 100000 })]);
    deps.inventory.getStockLevel.mockResolvedValue(10);
    const svc = makeService(deps as any);

    let capturedSaleData: any;
    deps.prisma.$transaction.mockImplementation(async (fn: any) => {
      deps.prisma.store.update.mockResolvedValue({ ...store, receiptSequence: 1 });
      deps.prisma.sale.create.mockImplementation(async ({ data }: any) => {
        capturedSaleData = data;
        return { id: 'sale-001', receiptNumber: 'NRB01-2026-0000001', totalCents: data.totalCents, items: [], payments: [] };
      });
      deps.prisma.inventoryMovement.create.mockResolvedValue({});
      return fn(deps.prisma);
    });

    await (svc as any).createSale('biz-001', {
      ...BASE_DTO,
      items: [{ itemId: 'item-001', quantity: 1 }],
      serviceChargeCents: 10000, // KES 100 service charge
      payments: [{ method: 'CASH', amountCents: 110000 }],
    });

    // subtotal = 100,000, serviceCharge = 10,000 → total = 110,000
    expect(capturedSaleData.serviceChargeCents).toBe(10000);
    expect(capturedSaleData.totalCents).toBe(110000);
  });

  it('includes tip in totalCents', async () => {
    const deps = makeDeps();
    const store = makeStore({ business: { taxType: 'VAT', serviceChargeRate: 0, negativePolicyDefault: 'ALLOW' } });
    deps.prisma.store.findUnique.mockResolvedValue(store);
    deps.prisma.item.findMany.mockResolvedValue([makeItem({ retailPriceCents: 100000 })]);
    deps.inventory.getStockLevel.mockResolvedValue(10);
    const svc = makeService(deps as any);

    let capturedSaleData: any;
    deps.prisma.$transaction.mockImplementation(async (fn: any) => {
      deps.prisma.store.update.mockResolvedValue({ ...store, receiptSequence: 1 });
      deps.prisma.sale.create.mockImplementation(async ({ data }: any) => {
        capturedSaleData = data;
        return { id: 'sale-001', receiptNumber: 'NRB01-2026-0000001', totalCents: data.totalCents, items: [], payments: [] };
      });
      deps.prisma.inventoryMovement.create.mockResolvedValue({});
      return fn(deps.prisma);
    });

    await (svc as any).createSale('biz-001', {
      ...BASE_DTO,
      items: [{ itemId: 'item-001', quantity: 1 }],
      serviceChargeCents: 0,
      tipCents: 5000, // KES 50 tip
      payments: [{ method: 'CASH', amountCents: 105000 }],
    });

    expect(capturedSaleData.tipCents).toBe(5000);
    expect(capturedSaleData.totalCents).toBe(105000); // 100,000 + 0 + 5,000
  });

  it('extracts VAT from inclusive price (does NOT add VAT on top)', async () => {
    const deps = makeDeps();
    const store = makeStore({ business: { taxType: 'VAT', serviceChargeRate: 0, negativePolicyDefault: 'ALLOW' } });
    deps.prisma.store.findUnique.mockResolvedValue(store);
    deps.prisma.item.findMany.mockResolvedValue([makeItem({ retailPriceCents: 116000 })]);
    deps.inventory.getStockLevel.mockResolvedValue(10);
    const svc = makeService(deps as any);

    let capturedSaleData: any;
    deps.prisma.$transaction.mockImplementation(async (fn: any) => {
      deps.prisma.store.update.mockResolvedValue({ ...store, receiptSequence: 1 });
      deps.prisma.sale.create.mockImplementation(async ({ data }: any) => {
        capturedSaleData = data;
        return { id: 'sale-001', receiptNumber: 'NRB01-2026-0000001', totalCents: data.totalCents, items: [], payments: [] };
      });
      deps.prisma.inventoryMovement.create.mockResolvedValue({});
      return fn(deps.prisma);
    });

    await (svc as any).createSale('biz-001', {
      ...BASE_DTO,
      items: [{ itemId: 'item-001', quantity: 1 }],
      serviceChargeCents: 0,
      payments: [{ method: 'CASH', amountCents: 116000 }],
    });

    // KES 1,160 (VAT-inclusive) → VAT = 1,160 × 16/116 = 160 KES = 16,000 cents
    expect(capturedSaleData.vatCents).toBe(16000);
    // totalCents should NOT include VAT on top — VAT is already IN the price
    expect(capturedSaleData.totalCents).toBe(116000);
  });

  it('applies discount to taxBase before calculating total', async () => {
    const deps = makeDeps();
    const store = makeStore({ business: { taxType: 'VAT', serviceChargeRate: 0, negativePolicyDefault: 'ALLOW' } });
    deps.prisma.store.findUnique.mockResolvedValue(store);
    deps.prisma.item.findMany.mockResolvedValue([makeItem({ retailPriceCents: 100000 })]);
    deps.inventory.getStockLevel.mockResolvedValue(10);
    const svc = makeService(deps as any);

    let capturedSaleData: any;
    deps.prisma.$transaction.mockImplementation(async (fn: any) => {
      deps.prisma.store.update.mockResolvedValue({ ...store, receiptSequence: 1 });
      deps.prisma.sale.create.mockImplementation(async ({ data }: any) => {
        capturedSaleData = data;
        return { id: 'sale-001', receiptNumber: 'NRB01-2026-0000001', totalCents: data.totalCents, items: [], payments: [] };
      });
      deps.prisma.inventoryMovement.create.mockResolvedValue({});
      return fn(deps.prisma);
    });

    await (svc as any).createSale('biz-001', {
      ...BASE_DTO,
      items: [{ itemId: 'item-001', quantity: 1 }],
      serviceChargeCents: 0,
      discountCents: 20000, // KES 200 discount
      payments: [{ method: 'CASH', amountCents: 80000 }],
    });

    // subtotal = 100,000 - discount 20,000 = taxBase 80,000 → total = 80,000
    expect(capturedSaleData.discountCents).toBe(20000);
    expect(capturedSaleData.totalCents).toBe(80000);
  });

  it('uses wholesale price when priceLevel is WHOLESALE', async () => {
    const deps = makeDeps();
    const store = makeStore({ business: { taxType: 'VAT', serviceChargeRate: 0, negativePolicyDefault: 'ALLOW' } });
    deps.prisma.store.findUnique.mockResolvedValue(store);
    deps.prisma.item.findMany.mockResolvedValue([makeItem({ retailPriceCents: 50000, wholesalePriceCents: 40000 })]);
    deps.inventory.getStockLevel.mockResolvedValue(10);
    const svc = makeService(deps as any);

    let capturedSaleData: any;
    deps.prisma.$transaction.mockImplementation(async (fn: any) => {
      deps.prisma.store.update.mockResolvedValue({ ...store, receiptSequence: 1 });
      deps.prisma.sale.create.mockImplementation(async ({ data }: any) => {
        capturedSaleData = data;
        return { id: 'sale-001', receiptNumber: 'NRB01-2026-0000001', totalCents: data.totalCents, items: [], payments: [] };
      });
      deps.prisma.inventoryMovement.create.mockResolvedValue({});
      return fn(deps.prisma);
    });

    await (svc as any).createSale('biz-001', {
      ...BASE_DTO,
      priceLevel: 'WHOLESALE',
      items: [{ itemId: 'item-001', quantity: 2 }],
      serviceChargeCents: 0,
      payments: [{ method: 'CASH', amountCents: 80000 }],
    });

    // 2 × KES 400 (wholesale) = KES 800 = 80,000 cents
    expect(capturedSaleData.subtotalCents).toBe(80000);
  });
});

describe('SalesService.createSale input guards', () => {
  function ready(storeOverrides: Record<string, any> = {}) {
    const deps = makeDeps();
    deps.prisma.store.findUnique.mockResolvedValue(
      makeStore({ business: { taxType: 'VAT', serviceChargeRate: 0, negativePolicyDefault: 'ALLOW' }, ...storeOverrides }),
    );
    deps.prisma.item.findMany.mockResolvedValue([makeItem()]);
    return { deps, svc: makeService(deps as any) as any };
  }

  it('looks items up within the caller\'s business only', async () => {
    const { deps, svc } = ready();
    deps.prisma.$transaction.mockRejectedValue(new Error('stop here'));
    await svc.createSale('biz-001', { ...BASE_DTO, serviceChargeCents: 0 }).catch(() => undefined);
    expect(deps.prisma.item.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ businessId: 'biz-001' }));
  });

  it.each([[0], [-1], [Number.NaN]])('refuses a quantity of %p, which could only lower the total', async (quantity) => {
    const { svc } = ready();
    await expect(svc.createSale('biz-001', { ...BASE_DTO, items: [{ itemId: 'item-001', quantity }], serviceChargeCents: 0 }))
      .rejects.toThrow('greater than zero');
  });

  it('still sells a fractional quantity, as weighed goods need', async () => {
    const { deps, svc } = ready();
    deps.prisma.$transaction.mockRejectedValue(new Error('reached the transaction'));
    await expect(svc.createSale('biz-001', { ...BASE_DTO, items: [{ itemId: 'item-001', quantity: 0.35 }], serviceChargeCents: 0 }))
      .rejects.toThrow('reached the transaction');
  });

  it('refuses a negative discount, a discount larger than the sale, and a negative tip', async () => {
    const { svc } = ready();
    await expect(svc.createSale('biz-001', { ...BASE_DTO, serviceChargeCents: 0, discountCents: -500 })).rejects.toThrow('Discount');
    await expect(svc.createSale('biz-001', { ...BASE_DTO, serviceChargeCents: 0, discountCents: 100_001 })).rejects.toThrow('larger than the sale');
    await expect(svc.createSale('biz-001', { ...BASE_DTO, serviceChargeCents: 0, tipCents: -1 })).rejects.toThrow('Tip');
  });
});

describe('SalesService.createSale paying an order', () => {
  const orderRow = (over: Record<string, any> = {}) => ({
    id: 'order-1', businessId: 'biz-001', storeId: 'store-001', tableId: 'table-1', status: 'BILL_REQUESTED',
    items: [
      // Pilau at KES 350 with a KES 50 extra, two plates: (350 + 50) x 2 = KES 800
      { itemId: 'item-001', name: 'Pilau', quantity: 2, unitPriceCents: 35_000, totalCents: 80_000, modifiers: JSON.stringify([{ name: 'Extra cheese', priceCents: 5_000 }, 'No onion']) },
    ],
    ...over,
  });

  function ready(order: any, payments = [{ method: 'CASH', amountCents: 80_000 }]) {
    const deps = makeDeps();
    const store = makeStore({ business: { taxType: 'VAT', serviceChargeRate: 0, negativePolicyDefault: 'ALLOW' } });
    deps.prisma.store.findUnique.mockResolvedValue(store);
    deps.prisma.item.findMany.mockResolvedValue([makeItem({ trackStock: true })]);
    const prisma: any = deps.prisma;
    prisma.order.findFirst = jest.fn().mockResolvedValue(order);
    prisma.order.updateMany = jest.fn().mockResolvedValue({ count: 1 });
    prisma.table.update = jest.fn().mockResolvedValue({});
    const captured: { sale?: any; movements: any[] } = { movements: [] };
    prisma.$transaction.mockImplementation(async (fn: any) => {
      prisma.store.update.mockResolvedValue({ ...store, receiptSequence: 1 });
      prisma.sale.create.mockImplementation(async ({ data }: any) => {
        captured.sale = data;
        return { id: 'sale-1', receiptNumber: 'R1', totalCents: data.totalCents, items: [], payments: [] };
      });
      prisma.inventoryMovement.create.mockImplementation(async ({ data }: any) => { captured.movements.push(data); return {}; });
      return fn(prisma);
    });
    const svc = makeService(deps as any) as any;
    const dto = { ...BASE_DTO, orderId: 'order-1', items: [{ itemId: 'item-001', quantity: 1 }], payments, serviceChargeCents: 0 };
    return { deps, prisma, svc, dto, captured };
  }

  it('bills what is on the order, modifiers included, not what the cart says', async () => {
    const { svc, dto, captured } = ready(orderRow());
    await svc.createSale('biz-001', dto); // cart said 1 plate at retail (KES 500); the order has 2 at KES 400
    expect(captured.sale.subtotalCents).toBe(80_000);
    expect(captured.sale.totalCents).toBe(80_000);
    const line = captured.sale.items.create[0];
    expect(line).toEqual(expect.objectContaining({ quantity: 2, totalCents: 80_000, unitPriceCents: 40_000 }));
    expect(line.name).toBe('Pilau (Extra cheese, No onion)');
  });

  it('works with an empty cart, since the order is the bill', async () => {
    const { svc, dto, captured } = ready(orderRow());
    await svc.createSale('biz-001', { ...dto, items: [] });
    expect(captured.sale.totalCents).toBe(80_000);
  });

  it('links the sale to the order and deducts stock for the order\'s quantities', async () => {
    const { svc, dto, captured } = ready(orderRow());
    await svc.createSale('biz-001', dto);
    expect(captured.sale.orderId).toBe('order-1');
    expect(captured.movements[0]).toEqual(expect.objectContaining({ itemId: 'item-001', quantity: -2 }));
  });

  it('closes the order inside the transaction, then frees the table', async () => {
    const { svc, dto, prisma } = ready(orderRow());
    await svc.createSale('biz-001', dto);
    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'order-1', businessId: 'biz-001', status: { in: ['OPEN', 'BILL_REQUESTED'] } },
      data: { status: 'PAID' },
    });
    expect(prisma.table.update).toHaveBeenCalledWith({ where: { id: 'table-1' }, data: { status: 'AVAILABLE' } });
  });

  it('loses cleanly when another till paid the order first, writing no sale', async () => {
    const { svc, dto, prisma } = ready(orderRow());
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.createSale('biz-001', dto)).rejects.toThrow('just paid');
    expect(prisma.sale.create).not.toHaveBeenCalled();
    expect(prisma.table.update).not.toHaveBeenCalled();
  });

  it('refuses another business\'s order, a paid order, another store\'s order and an empty one', async () => {
    let t = ready(null);
    await expect(t.svc.createSale('biz-001', t.dto)).rejects.toThrow('Order not found');
    expect(t.prisma.order.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'order-1', businessId: 'biz-001' } }));

    t = ready(orderRow({ status: 'PAID' }));
    await expect(t.svc.createSale('biz-001', t.dto)).rejects.toThrow('already been paid');

    t = ready(orderRow({ storeId: 'store-002' }));
    await expect(t.svc.createSale('biz-001', t.dto)).rejects.toThrow('different store');

    t = ready(orderRow({ items: [] }));
    await expect(t.svc.createSale('biz-001', t.dto)).rejects.toThrow('nothing on it');
    expect(t.prisma.sale.create).not.toHaveBeenCalled();
  });

  it('refuses to charge an amount the payer was not shown', async () => {
    const { svc, dto, prisma } = ready(orderRow());
    await expect(svc.createSale('biz-001', { ...dto, expectedTotalCents: 50_000 })).rejects.toThrow('bill changed');
    expect(prisma.sale.create).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('goes through when the shown total matches', async () => {
    const { svc, dto, captured } = ready(orderRow());
    await svc.createSale('biz-001', { ...dto, expectedTotalCents: 80_000 });
    expect(captured.sale.totalCents).toBe(80_000);
  });

  it('will not accept a payment that does not cover the order', async () => {
    const { svc, dto, prisma } = ready(orderRow(), [{ method: 'CASH', amountCents: 100 }]);
    await expect(svc.createSale('biz-001', dto)).rejects.toThrow('do not cover the total');
    expect(prisma.sale.create).not.toHaveBeenCalled();
    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('accepts a bigger tender (change is given back)', async () => {
    const { svc, dto, captured } = ready(orderRow(), [{ method: 'CASH', amountCents: 100_000 }]);
    await svc.createSale('biz-001', dto);
    expect(captured.sale.totalCents).toBe(80_000);
  });
});

describe('SalesService.createSale payments on ordinary sales', () => {
  function ready(type: SaleType, payments: any[]) {
    const deps = makeDeps();
    const store = makeStore({ business: { taxType: 'VAT', serviceChargeRate: 0, negativePolicyDefault: 'ALLOW' } });
    deps.prisma.store.findUnique.mockResolvedValue(store);
    deps.prisma.item.findMany.mockResolvedValue([makeItem()]);
    deps.prisma.$transaction.mockImplementation(async (fn: any) => {
      deps.prisma.store.update.mockResolvedValue({ ...store, receiptSequence: 1 });
      deps.prisma.sale.create.mockResolvedValue({ id: 's', receiptNumber: 'R', totalCents: 100_000, items: [], payments: [] });
      return fn(deps.prisma);
    });
    return { svc: makeService(deps as any) as any, deps, dto: { ...BASE_DTO, type, payments, serviceChargeCents: 0 } };
  }

  it('refuses a normal sale whose payments fall short, or are malformed', async () => {
    await expect(ready(SaleType.NORMAL, [{ method: 'CASH', amountCents: 1 }]).svc.createSale('biz-001', ready(SaleType.NORMAL, [{ method: 'CASH', amountCents: 1 }]).dto))
      .rejects.toThrow('do not cover');
    const bad = ready(SaleType.NORMAL, [{ method: 'CASH', amountCents: -5 }]);
    await expect(bad.svc.createSale('biz-001', bad.dto)).rejects.toThrow('non-negative');
    const none = ready(SaleType.NORMAL, []);
    await expect(none.svc.createSale('biz-001', none.dto)).rejects.toThrow('do not cover');
  });

  it('lets a credit sale go through without full payment', async () => {
    const credit = ready(SaleType.CREDIT, []);
    await expect(credit.svc.createSale('biz-001', credit.dto)).resolves.toBeDefined();
  });
});

describe('SalesService.createSale idempotency (offlineId)', () => {
  const KEY = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const dto = { storeId: 'store-001', cashierId: 'u1', type: SaleType.NORMAL, priceLevel: 'RETAIL', items: [{ itemId: 'item-001', quantity: 1 }], payments: [{ method: 'CASH', amountCents: 50000 }] } as any;

  function make() {
    const prisma: any = { sale: { findFirst: jest.fn().mockResolvedValue(null) } };
    const service: any = new (SalesService as any)(prisma, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {});
    service.createSaleOnce = jest.fn().mockResolvedValue({ id: 'sale-new', receiptNumber: 'R-1' });
    return { prisma, service };
  }

  it('without a key it just creates the sale', async () => {
    const { service, prisma } = make();
    expect((await service.createSale('biz-001', dto)).id).toBe('sale-new');
    expect(prisma.sale.findFirst).not.toHaveBeenCalled();
  });

  it('a retry with the same key returns the sale already recorded and creates nothing', async () => {
    const { service, prisma } = make();
    prisma.sale.findFirst.mockResolvedValue({ id: 'sale-old', receiptNumber: 'R-0', items: [], payments: [] });
    const res = await service.createSale('biz-001', { ...dto, offlineId: KEY });
    expect(res.id).toBe('sale-old');
    expect(res.replayed).toBe(true);
    expect(service.createSaleOnce).not.toHaveBeenCalled();
    expect(prisma.sale.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { offlineId: KEY, businessId: 'biz-001' } }));
  });

  it('a replay shows the points the sale really earned and the current balance', async () => {
    const { service, prisma } = make();
    prisma.sale.findFirst.mockResolvedValue({ id: 'sale-old', customerId: 'cust-1', type: SaleType.NORMAL, items: [], payments: [] });
    service.loyalty = { pointsAwardedForSale: jest.fn().mockResolvedValue({ points: 25, balance: 340 }) };
    const res = await service.createSale('biz-001', { ...dto, offlineId: KEY });
    expect(service.loyalty.pointsAwardedForSale).toHaveBeenCalledWith('cust-1', 'sale-old');
    expect(res).toEqual(expect.objectContaining({ pointsEarned: 25, loyaltyBalance: 340, replayed: true }));
  });

  it('a replayed credit sale earns no points, and a loyalty failure never fails the replay', async () => {
    const { service, prisma } = make();
    service.loyalty = { pointsAwardedForSale: jest.fn().mockResolvedValue({ points: 9, balance: 9 }) };
    prisma.sale.findFirst.mockResolvedValue({ id: 's', customerId: 'c', type: SaleType.CREDIT, items: [], payments: [] });
    expect((await service.createSale('biz-001', { ...dto, offlineId: KEY })).pointsEarned).toBe(0);
    expect(service.loyalty.pointsAwardedForSale).not.toHaveBeenCalled();

    prisma.sale.findFirst.mockResolvedValue({ id: 's', customerId: 'c', type: SaleType.NORMAL, items: [], payments: [] });
    service.loyalty.pointsAwardedForSale.mockRejectedValue(new Error('db down'));
    expect((await service.createSale('biz-001', { ...dto, offlineId: KEY })).pointsEarned).toBe(0);
  });

  it('records a first-time sale under the client key', async () => {
    const { service } = make();
    await service.createSale('biz-001', { ...dto, offlineId: KEY });
    expect(service.createSaleOnce).toHaveBeenCalledWith('biz-001', expect.objectContaining({ offlineId: KEY }));
  });

  it('two copies racing: the one that loses the unique key gets the winner\'s sale', async () => {
    const { service, prisma } = make();
    prisma.sale.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'sale-winner', items: [], payments: [] });
    service.createSaleOnce.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    expect((await service.createSale('biz-001', { ...dto, offlineId: KEY })).id).toBe('sale-winner');
  });

  it('another business\'s key is never replayed, and an unrelated error still surfaces', async () => {
    const { service, prisma } = make();
    prisma.sale.findFirst.mockResolvedValue(null);
    service.createSaleOnce.mockRejectedValue(Object.assign(new Error('Unique constraint'), { code: 'P2002' }));
    await expect(service.createSale('biz-001', { ...dto, offlineId: KEY })).rejects.toThrow('Unique constraint');
    service.createSaleOnce.mockRejectedValue(new Error('Insufficient stock'));
    await expect(service.createSale('biz-001', { ...dto, offlineId: KEY })).rejects.toThrow('Insufficient stock');
  });

  it('ignores a malformed key instead of trusting it', async () => {
    const { service, prisma } = make();
    await service.createSale('biz-001', { ...dto, offlineId: "x'; drop table" });
    expect(prisma.sale.findFirst).not.toHaveBeenCalled();
    expect(service.createSaleOnce.mock.calls[0][1].offlineId).toBeUndefined();
  });
});

describe('SalesService.resolveCashierId (offline sales uploaded by someone else)', () => {
  function make(found: any) {
    const prisma: any = { user: { findFirst: jest.fn().mockResolvedValue(found) } };
    const service: any = new (SalesService as any)(prisma, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {});
    return { prisma, service };
  }

  it('is the requester unless an owner or manager names a cashier of the same business', async () => {
    const { service, prisma } = make({ id: 'amina' });
    expect(await service.resolveCashierId('biz-1', { id: 'joy', role: 'MANAGER' }, 'amina')).toBe('amina');
    expect(await service.resolveCashierId('biz-1', { id: 'owner', role: 'OWNER' }, 'amina')).toBe('amina');
    expect(prisma.user.findFirst).toHaveBeenCalledWith({ where: { id: 'amina', businessId: 'biz-1' }, select: { id: true } });
  });

  it('a cashier cannot credit a sale to someone else', async () => {
    const { service, prisma } = make({ id: 'amina' });
    expect(await service.resolveCashierId('biz-1', { id: 'brian', role: 'CASHIER' }, 'amina')).toBe('brian');
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });

  it('ignores a person who is not in the business, and a missing or same id', async () => {
    const { service } = make(null);
    expect(await service.resolveCashierId('biz-1', { id: 'joy', role: 'MANAGER' }, 'stranger')).toBe('joy');
    expect(await service.resolveCashierId('biz-1', { id: 'joy', role: 'MANAGER' })).toBe('joy');
    expect(await service.resolveCashierId('biz-1', { id: 'joy', role: 'MANAGER' }, 'joy')).toBe('joy');
  });
});

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
  const events = { emitToStore: jest.fn(), emitSaleCreated: jest.fn() };
  const loyalty = { earnPoints: jest.fn().mockResolvedValue({ points: 0, balance: 0 }) };
  const subscriptionLimits = { checkMonthlyTransactionLimit: jest.fn().mockResolvedValue({ allowed: true }) };

  return { prisma, inventory, audit, auth, webhooks, etims, notifications, events, loyalty, subscriptionLimits };
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

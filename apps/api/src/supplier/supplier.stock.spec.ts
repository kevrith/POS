import { BadRequestException, NotFoundException } from '@nestjs/common';
import { SupplierService } from './supplier.service';

const future = '2028-06-30';

function setup() {
  const p: any = {
    store: { findFirst: jest.fn().mockResolvedValue({ id: 'store-1' }) },
    supplier: { findFirst: jest.fn().mockResolvedValue({ id: 'sup-1' }) },
    purchaseOrder: {
      findFirst: jest.fn().mockResolvedValue({ id: 'po-1', businessId: 'biz-1', supplierId: 'sup-1', status: 'APPROVED', items: [{ id: 'pi-1', itemId: 'amox', quantityOrdered: 100 }, { id: 'pi-2', itemId: 'gloves', quantityOrdered: 10 }] }),
      update: jest.fn().mockResolvedValue({}),
    },
    gRN: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'grn-1', ...data })) },
    item: { findMany: jest.fn().mockResolvedValue([
      { id: 'amox', name: 'Amoxicillin 500mg', trackBatches: true, genericName: 'Amoxicillin', scheduleClass: null, requiresPrescription: true, costPriceCents: 500 },
      { id: 'gloves', name: 'Gloves', trackBatches: false, genericName: null, scheduleClass: null, requiresPrescription: false, costPriceCents: 100 },
    ]) },
    batch: {
      findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'b-new', ...data })),
      update: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 1 }), findMany: jest.fn().mockResolvedValue([]),
    },
    inventoryMovement: { create: jest.fn().mockResolvedValue({}), aggregate: jest.fn().mockResolvedValue({ _sum: { quantity: 50 } }), findMany: jest.fn().mockResolvedValue([]) },
    supplierReturn: { findMany: jest.fn().mockResolvedValue([{ returnNumber: 'RTS-0004' }]), findFirst: jest.fn(), create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'ret-1', ...data })), updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    supplierCreditNote: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'cn-1', ...data })) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $executeRaw: jest.fn().mockResolvedValue(0),
    $transaction: jest.fn(),
  };
  p.$transaction.mockImplementation(async (fn: any) => fn(p));
  return { prisma: p, svc: new SupplierService(p, {} as any) };
}

describe('SupplierService.createGRN', () => {
  const line = { poItemId: 'pi-1', quantityReceived: 60, batchLotNumber: 'AB123', expiryDate: future };

  it('locks the order, makes the lot, and ties the stock to it', async () => {
    const { svc, prisma } = setup();
    await svc.createGRN('biz-1', 'po-1', 'store-1', [line, { poItemId: 'pi-2', quantityReceived: 4 }]);
    expect(prisma.$queryRaw).toHaveBeenCalled();
    expect(prisma.batch.create).toHaveBeenCalledWith({ data: expect.objectContaining({ itemId: 'amox', storeId: 'store-1', lotNumber: 'AB123', supplierId: 'sup-1', quantityReceived: 60, quantityRemaining: 60, status: 'ACTIVE', expiryDate: new Date('2028-06-30T00:00:00Z') }) });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ itemId: 'amox', type: 'GRN_RECEIPT', quantity: 60, batchId: 'b-new', grnId: 'grn-1' }) });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ itemId: 'gloves', quantity: 4, batchId: undefined }) });
    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith({ where: { id: 'po-1' }, data: { status: 'PARTIALLY_RECEIVED' } });
  });

  it('marks the order received once everything has arrived', async () => {
    const { svc, prisma } = setup();
    prisma.gRN.findMany.mockResolvedValueOnce([]).mockResolvedValueOnce([{ items: [{ quantityReceived: 100 }, { quantityReceived: 10 }] }]);
    await svc.createGRN('biz-1', 'po-1', 'store-1', [line, { poItemId: 'pi-2', quantityReceived: 10 }]);
    expect(prisma.purchaseOrder.update).toHaveBeenCalledWith({ where: { id: 'po-1' }, data: { status: 'RECEIVED' } });
  });

  it('tops up a lot that is already on record, and refuses one with a different expiry, or one that was recalled', async () => {
    const a = setup();
    a.prisma.batch.findFirst.mockResolvedValue({ id: 'b-old', status: 'ACTIVE', expiryDate: new Date('2028-06-30T00:00:00Z') });
    await a.svc.createGRN('biz-1', 'po-1', 'store-1', [line]);
    expect(a.prisma.batch.create).not.toHaveBeenCalled();
    expect(a.prisma.batch.update).toHaveBeenCalledWith({ where: { id: 'b-old' }, data: { quantityReceived: { increment: 60 }, quantityRemaining: { increment: 60 } } });
    const b = setup();
    b.prisma.batch.findFirst.mockResolvedValue({ id: 'b-old', status: 'ACTIVE', expiryDate: new Date('2027-01-31T00:00:00Z') });
    await expect(b.svc.createGRN('biz-1', 'po-1', 'store-1', [line])).rejects.toThrow(/different expiry date/);
    const c = setup();
    c.prisma.batch.findFirst.mockResolvedValue({ id: 'b-old', status: 'RECALLED', expiryDate: null });
    await expect(c.svc.createGRN('biz-1', 'po-1', 'store-1', [line])).rejects.toThrow(/recalled and cannot be received again/);
  });

  it('refuses a missing lot, an expired lot and an over-receipt without writing anything', async () => {
    const { svc, prisma } = setup();
    await expect(svc.createGRN('biz-1', 'po-1', 'store-1', [{ poItemId: 'pi-1', quantityReceived: 5 }])).rejects.toThrow(/lot \(batch\) number/);
    await expect(svc.createGRN('biz-1', 'po-1', 'store-1', [{ ...line, expiryDate: '2026-01-01' }])).rejects.toThrow(/already expired/);
    await expect(svc.createGRN('biz-1', 'po-1', 'store-1', [{ poItemId: 'pi-2', quantityReceived: 11 }])).rejects.toThrow(/at most 10/);
    expect(prisma.gRN.create).not.toHaveBeenCalled();
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('refuses an order that is not approved, is not this business\'s, or a store that is not', async () => {
    const a = setup();
    a.prisma.purchaseOrder.findFirst.mockResolvedValue({ id: 'po-1', status: 'DRAFT', items: [] });
    await expect(a.svc.createGRN('biz-1', 'po-1', 'store-1', [line])).rejects.toThrow(/must be Approved/);
    const b = setup();
    b.prisma.purchaseOrder.findFirst.mockResolvedValue(null);
    await expect(b.svc.createGRN('biz-1', 'po-1', 'store-1', [line])).rejects.toThrow(NotFoundException);
    const c = setup();
    c.prisma.store.findFirst.mockResolvedValue(null);
    await expect(c.svc.createGRN('biz-1', 'po-1', 'nope', [line])).rejects.toThrow(/Store not found/);
  });
});

describe('SupplierService.createSupplierReturn', () => {
  const dto = (items: unknown[]) => ({ supplierId: 'sup-1', storeId: 'store-1', reason: 'Expired stock', items: items as never });

  it('takes the units out of the lot named and records the lot on the return', async () => {
    const { svc, prisma } = setup();
    prisma.batch.findFirst.mockResolvedValue({ id: 'b-1', lotNumber: 'AB123', status: 'ACTIVE', quantityRemaining: 30 });
    const r: any = await svc.createSupplierReturn('biz-1', dto([{ itemId: 'amox', quantity: 20, batchId: 'b-1' }]));
    expect(prisma.batch.updateMany).toHaveBeenCalledWith({ where: { id: 'b-1', status: { in: ['ACTIVE', 'RECALLED'] }, quantityRemaining: { gte: 20 } }, data: { quantityRemaining: { decrement: 20 } } });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'SUPPLIER_RETURN', quantity: -20, batchId: 'b-1', itemId: 'amox' }) });
    expect(r.returnNumber).toBe('RTS-0005');
    expect(r.status).toBe('SENT');
    expect(r.storeId).toBe('store-1');
    expect(r.totalCents).toBe(10000);
    expect(r.items.create[0]).toMatchObject({ batchId: 'b-1', lotNumber: 'AB123', unitCostCents: 500, totalCents: 10000 });
  });

  it('refuses more than is on hand, more than the lot holds, a written-off lot and a lot from another store', async () => {
    const a = setup();
    a.prisma.inventoryMovement.aggregate.mockResolvedValue({ _sum: { quantity: 5 } });
    await expect(a.svc.createSupplierReturn('biz-1', dto([{ itemId: 'gloves', quantity: 6 }]))).rejects.toThrow(/only 5 on hand/);
    const b = setup();
    b.prisma.batch.findFirst.mockResolvedValue({ id: 'b-1', lotNumber: 'L', status: 'ACTIVE', quantityRemaining: 3 });
    b.prisma.batch.updateMany.mockResolvedValue({ count: 0 });
    await expect(b.svc.createSupplierReturn('biz-1', dto([{ itemId: 'amox', quantity: 10, batchId: 'b-1' }]))).rejects.toThrow(/has only 3 left/);
    const c = setup();
    c.prisma.batch.findFirst.mockResolvedValue({ id: 'b-1', lotNumber: 'L', status: 'WRITTEN_OFF', quantityRemaining: 10 });
    await expect(c.svc.createSupplierReturn('biz-1', dto([{ itemId: 'amox', quantity: 1, batchId: 'b-1' }]))).rejects.toThrow(/written off/);
    const d = setup();
    d.prisma.batch.findFirst.mockResolvedValue(null);
    await expect(d.svc.createSupplierReturn('biz-1', dto([{ itemId: 'amox', quantity: 1, batchId: 'other' }]))).rejects.toThrow(/not in this store/);
    expect(d.prisma.supplierReturn.create).not.toHaveBeenCalled();
  });

  it('validates the request before touching stock', async () => {
    const { svc, prisma } = setup();
    await expect(svc.createSupplierReturn('biz-1', dto([]))).rejects.toThrow(/at least one item/);
    await expect(svc.createSupplierReturn('biz-1', dto([{ itemId: 'amox', quantity: 0 }]))).rejects.toThrow(/more than zero/);
    await expect(svc.createSupplierReturn('biz-1', dto([{ itemId: 'amox', quantity: 1.2345 }]))).rejects.toThrow(/3 decimal/);
    await expect(svc.createSupplierReturn('biz-1', dto([{ itemId: 'ghost', quantity: 1 }]))).rejects.toThrow(/not in the catalogue/);
    await expect(svc.createSupplierReturn('biz-1', { ...dto([{ itemId: 'gloves', quantity: 1 }]), reason: '' })).rejects.toThrow(/Reason/);
    prisma.supplier.findFirst.mockResolvedValue(null);
    await expect(svc.createSupplierReturn('biz-1', dto([{ itemId: 'gloves', quantity: 1 }]))).rejects.toThrow(/Supplier not found/);
    expect(prisma.inventoryMovement.create).not.toHaveBeenCalled();
  });

  it('stock not tracked by lot leaves as one plain movement', async () => {
    const { svc, prisma } = setup();
    const r: any = await svc.createSupplierReturn('biz-1', dto([{ itemId: 'gloves', quantity: 3, unitCostCents: 120 }]));
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ type: 'SUPPLIER_RETURN', quantity: -3, itemId: 'gloves' }) });
    expect(r.totalCents).toBe(360);
    expect(r.items.create[0].batchId).toBeUndefined();
  });
});

describe('SupplierService.updateReturnStatus', () => {
  const ret = (o: Record<string, unknown> = {}) => ({ id: 'ret-1', returnNumber: 'RTS-0005', supplierId: 'sup-1', totalCents: 30000, status: 'SENT', storeId: 'store-1', items: [{ itemId: 'amox', quantity: 20, batchId: 'b-1' }, { itemId: 'gloves', quantity: 3, batchId: null }], ...o });

  it('cancelling puts the units back into their lot and store', async () => {
    const { svc, prisma } = setup();
    prisma.supplierReturn.findFirst.mockResolvedValueOnce(ret()).mockResolvedValue(ret({ status: 'CANCELLED' }));
    await svc.updateReturnStatus('biz-1', 'ret-1', 'cancelled');
    expect(prisma.supplierReturn.updateMany).toHaveBeenCalledWith({ where: { id: 'ret-1', businessId: 'biz-1', status: { in: ['DRAFT', 'SENT', 'APPROVED'] } }, data: { status: 'CANCELLED' } });
    expect(prisma.batch.updateMany).toHaveBeenCalledWith({ where: { id: 'b-1', status: { notIn: ['WRITTEN_OFF'] } }, data: { quantityRemaining: { increment: 20 } } });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ itemId: 'amox', quantity: 20, batchId: 'b-1', storeId: 'store-1' }) });
    expect(prisma.inventoryMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ itemId: 'gloves', quantity: 3, batchId: undefined }) });
  });

  it('crediting moves no stock; a settled return does not move again; only known statuses are accepted', async () => {
    const a = setup();
    a.prisma.supplierReturn.findFirst.mockResolvedValue(ret());
    await a.svc.updateReturnStatus('biz-1', 'ret-1', 'CREDITED');
    expect(a.prisma.inventoryMovement.create).not.toHaveBeenCalled();
    expect(a.prisma.batch.updateMany).not.toHaveBeenCalled();
    const b = setup();
    b.prisma.supplierReturn.findFirst.mockResolvedValue(ret({ status: 'CANCELLED' }));
    await expect(b.svc.updateReturnStatus('biz-1', 'ret-1', 'CREDITED')).rejects.toThrow(/cannot be changed/);
    const c = setup();
    await expect(c.svc.updateReturnStatus('biz-1', 'ret-1', 'SHIPPED')).rejects.toThrow(/Status/);
    const d = setup();
    d.prisma.supplierReturn.findFirst.mockResolvedValue(null);
    await expect(d.svc.updateReturnStatus('biz-1', 'x', 'CREDITED')).rejects.toThrow(NotFoundException);
  });

  it('loses cleanly to someone else changing it first, and cannot cancel a return with no store recorded', async () => {
    const a = setup();
    a.prisma.supplierReturn.findFirst.mockResolvedValue(ret());
    a.prisma.supplierReturn.updateMany.mockResolvedValue({ count: 0 });
    await expect(a.svc.updateReturnStatus('biz-1', 'ret-1', 'CANCELLED')).rejects.toThrow(BadRequestException);
    expect(a.prisma.inventoryMovement.create).not.toHaveBeenCalled();
    const b = setup();
    b.prisma.supplierReturn.findFirst.mockResolvedValue(ret({ storeId: null }));
    await expect(b.svc.updateReturnStatus('biz-1', 'ret-1', 'CANCELLED')).rejects.toThrow(/before the store was recorded/);
  });
});

describe('crediting a return records the supplier\'s credit note', () => {
  const open = (o: Record<string, unknown> = {}) => ({ id: 'ret-1', returnNumber: 'RTS-0005', supplierId: 'sup-1', totalCents: 30000, status: 'SENT', storeId: 'store-1', items: [], ...o });

  it('makes a credit note for the return total, linked, with a number that carries the business prefix', async () => {
    const { svc, prisma } = setup();
    prisma.supplierReturn.findFirst.mockResolvedValue(open());
    await svc.updateReturnStatus('biz-1', 'ret-1', 'CREDITED');
    expect(prisma.supplierCreditNote.create).toHaveBeenCalledWith({ data: { businessId: 'biz-1', supplierId: 'sup-1', creditNumber: 'CN-BIZ1-RTS-0005', amountCents: 30000, reason: 'Return RTS-0005' } });
    expect(prisma.supplierReturn.updateMany).toHaveBeenCalledWith({ where: { id: 'ret-1', businessId: 'biz-1' }, data: { creditNoteId: 'cn-1' } });
  });

  it('takes the supplier\'s own number and amount, and refuses one already on record', async () => {
    const a = setup();
    a.prisma.supplierReturn.findFirst.mockResolvedValue(open());
    await a.svc.updateReturnStatus('biz-1', 'ret-1', 'CREDITED', { creditNoteNumber: ' SUP-778 ', amountCents: 25000 });
    expect(a.prisma.supplierCreditNote.create).toHaveBeenCalledWith({ data: expect.objectContaining({ creditNumber: 'SUP-778', amountCents: 25000 }) });
    const b = setup();
    b.prisma.supplierReturn.findFirst.mockResolvedValue(open());
    b.prisma.supplierCreditNote.findFirst.mockResolvedValue({ id: 'other' });
    await expect(b.svc.updateReturnStatus('biz-1', 'ret-1', 'CREDITED', { creditNoteNumber: 'SUP-778' })).rejects.toThrow(/already on record/);
  });

  it('a nil credit makes no note, and cancelling never does', async () => {
    const a = setup();
    a.prisma.supplierReturn.findFirst.mockResolvedValue(open());
    await a.svc.updateReturnStatus('biz-1', 'ret-1', 'CREDITED', { amountCents: 0 });
    expect(a.prisma.supplierCreditNote.create).not.toHaveBeenCalled();
    const b = setup();
    b.prisma.supplierReturn.findFirst.mockResolvedValue(open());
    await b.svc.updateReturnStatus('biz-1', 'ret-1', 'CANCELLED');
    expect(b.prisma.supplierCreditNote.create).not.toHaveBeenCalled();
    const c = setup();
    c.prisma.supplierReturn.findFirst.mockResolvedValue(open());
    await expect(c.svc.updateReturnStatus('biz-1', 'ret-1', 'CREDITED', { amountCents: -5 })).rejects.toThrow(/Credit amount/);
  });
});

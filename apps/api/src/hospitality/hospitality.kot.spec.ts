import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HospitalityService } from './hospitality.service';
import { HospitalityAccessGuard } from './hospitality-access.guard';

const BIZ = 'biz-A';

function build() {
  const prisma: any = {
    store: { findUnique: jest.fn().mockResolvedValue({ businessId: BIZ }) },
    order: {
      findUnique: jest.fn().mockResolvedValue({ id: 'o1', businessId: BIZ, storeId: 's1', tableId: 't1', status: 'OPEN' }),
      update: jest.fn().mockResolvedValue({}),
    },
    orderItem: {
      findMany: jest.fn().mockResolvedValue([]),
      findFirst: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      delete: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    kOT: {
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    kotCounter: { upsert: jest.fn() },
    table: { update: jest.fn().mockResolvedValue({}), findUnique: jest.fn().mockResolvedValue({ number: '5' }) },
    notification: { create: jest.fn().mockResolvedValue({}) },
    business: { findUnique: jest.fn().mockResolvedValue({ kitchenMode: 'KDS' }) },
    user: { findMany: jest.fn().mockResolvedValue([]) },
    orderVoid: { create: jest.fn().mockResolvedValue({}), findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  const notifications: any = { sendWhatsApp: jest.fn().mockResolvedValue(undefined) };
  const events: any = { emitKotCreated: jest.fn(), emitKotUpdated: jest.fn(), emitKotVoided: jest.fn() };
  return { prisma, notifications, events, service: new HospitalityService(prisma, notifications, events, { isEnabled: jest.fn().mockResolvedValue(false) } as any, {} as any) };
}

const line = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, quantity: 1, sentToKitchenAt: null, item: { category: null, station: null, prepTimeMinutes: 5 }, ...extra,
});

describe('createKOT', () => {
  it('splits a mixed order into one ticket per station and numbers them from the daily counter', async () => {
    const { prisma, service, events } = build();
    prisma.orderItem.findMany.mockResolvedValue([line('a', 'Chicken stew'), line('b', 'Tusker Lager'), line('c', 'Pilau')]);
    prisma.orderItem.updateMany.mockResolvedValue({ count: 3 });
    let n = 0;
    prisma.kotCounter.upsert.mockImplementation(async () => ({ last: ++n }));
    prisma.kOT.create.mockImplementation(async ({ data }: any) => ({ id: `k${data.kotNumber}`, ...data }));

    const tickets = await service.createKOT('o1', 'NEW_ORDER', ['a', 'b', 'c'], BIZ);

    expect(tickets.map((t: any) => [t.station, t.kotNumber])).toEqual([['KITCHEN', 1], ['BAR', 2]]);
    expect(JSON.parse(tickets[0].itemIds)).toEqual(['a', 'c']);
    expect(JSON.parse(tickets[1].itemIds)).toEqual(['b']);
    expect(prisma.orderItem.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ sentToKitchenAt: null }) }),
    );
    expect(events.emitKotCreated).toHaveBeenCalledWith(BIZ, expect.objectContaining({ orderId: 'o1' }));
  });

  it('uses the station set on the item over the name', async () => {
    const { prisma, service } = build();
    prisma.orderItem.findMany.mockResolvedValue([line('a', 'House special', { item: { category: null, station: 'BAR', prepTimeMinutes: 2 } })]);
    prisma.orderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.kotCounter.upsert.mockResolvedValue({ last: 7 });
    prisma.kOT.create.mockImplementation(async ({ data }: any) => data);
    const [t] = await service.createKOT('o1', 'NEW_ORDER', ['a'], BIZ);
    expect(t.station).toBe('BAR');
    expect(t.estimatedPrepMinutes).toBe(2);
  });

  it('refuses lines that already have a ticket so nothing is cooked twice', async () => {
    const { prisma, service } = build();
    prisma.orderItem.findMany.mockResolvedValue([line('a', 'Pilau', { sentToKitchenAt: new Date() })]);
    await expect(service.createKOT('o1', 'NEW_ORDER', ['a'], BIZ)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.kOT.create).not.toHaveBeenCalled();
  });

  it('stops when another request claims the lines first', async () => {
    const { prisma, service } = build();
    prisma.orderItem.findMany.mockResolvedValue([line('a', 'Pilau'), line('b', 'Chips')]);
    prisma.orderItem.updateMany.mockResolvedValue({ count: 1 }); // the other request took one
    await expect(service.createKOT('o1', 'NEW_ORDER', ['a', 'b'], BIZ)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.kOT.create).not.toHaveBeenCalled();
  });

  it('rejects an order from another business and a closed order', async () => {
    const { prisma, service } = build();
    await expect(service.createKOT('o1', 'NEW_ORDER', ['a'], 'biz-B')).rejects.toBeInstanceOf(NotFoundException);
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', businessId: BIZ, storeId: 's1', tableId: null, status: 'PAID' });
    await expect(service.createKOT('o1', 'NEW_ORDER', ['a'], BIZ)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown ticket type', async () => {
    const { service } = build();
    await expect(service.createKOT('o1', 'WHATEVER', ['a'], BIZ)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('updateKOTStatus', () => {
  const ticket = (status: string) => ({
    id: 'k1', status, orderId: 'o1', station: 'KITCHEN', kotNumber: 4, estimatedPrepMinutes: 10,
    order: { businessId: BIZ, waiter: { name: 'Wanjiru', phone: '0700000000' }, table: { number: '5' } },
  });

  it('rejects a status that does not exist', async () => {
    const { service } = build();
    await expect(service.updateKOTStatus('k1', 'DONE', 'u1', BIZ)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('hides another business\'s ticket', async () => {
    const { prisma, service } = build();
    prisma.kOT.findUnique.mockResolvedValue(ticket('PENDING'));
    await expect(service.updateKOTStatus('k1', 'IN_PROGRESS', 'u1', 'biz-B')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('refuses to move a served ticket backwards', async () => {
    const { prisma, service } = build();
    prisma.kOT.findUnique.mockResolvedValue(ticket('SERVED'));
    await expect(service.updateKOTStatus('k1', 'PENDING', 'u1', BIZ)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.kOT.updateMany).not.toHaveBeenCalled();
  });

  it('does nothing and does not message the waiter when the status is unchanged', async () => {
    const { prisma, notifications, service } = build();
    prisma.kOT.findUnique.mockResolvedValue(ticket('READY'));
    await service.updateKOTStatus('k1', 'READY', 'u1', BIZ);
    expect(prisma.kOT.updateMany).not.toHaveBeenCalled();
    expect(notifications.sendWhatsApp).not.toHaveBeenCalled();
  });

  it('assigns the chef on start and notifies the waiter once on ready', async () => {
    const { prisma, notifications, events, service } = build();
    prisma.kOT.findUnique.mockResolvedValue(ticket('PENDING'));
    await service.updateKOTStatus('k1', 'IN_PROGRESS', 'chef-1', BIZ);
    expect(prisma.kOT.updateMany).toHaveBeenCalledWith({
      where: { id: 'k1', status: 'PENDING' },
      data: expect.objectContaining({ status: 'IN_PROGRESS', assignedChefId: 'chef-1' }),
    });

    prisma.kOT.findUnique.mockResolvedValue(ticket('IN_PROGRESS'));
    await service.updateKOTStatus('k1', 'READY', 'chef-1', BIZ);
    expect(notifications.sendWhatsApp).toHaveBeenCalledTimes(1);
    expect(notifications.sendWhatsApp.mock.calls[0][2]).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    expect(events.emitKotUpdated).toHaveBeenCalledWith(BIZ, expect.objectContaining({ status: 'READY' }));
  });

  it('reports a conflict when another screen changed the ticket first', async () => {
    const { prisma, service } = build();
    prisma.kOT.findUnique.mockResolvedValue(ticket('PENDING'));
    prisma.kOT.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.updateKOTStatus('k1', 'IN_PROGRESS', 'u1', BIZ)).rejects.toBeInstanceOf(ConflictException);
  });

  it('clears the prepared time when a ready ticket is recalled', async () => {
    const { prisma, service } = build();
    prisma.kOT.findUnique.mockResolvedValue(ticket('READY'));
    await service.updateKOTStatus('k1', 'IN_PROGRESS', 'u1', BIZ);
    expect(prisma.kOT.updateMany.mock.calls[0][0].data).toEqual(expect.objectContaining({ preparedAt: null }));
  });
});

describe('cancelling and voiding', () => {
  const waiter = { id: 'w1', name: 'Wanjiru', role: 'WAITER' };
  const manager = { id: 'm1', name: 'Mo', role: 'MANAGER' };
  const sentAt = new Date();
  const orderLine = (id: string, extra: Record<string, unknown> = {}) => ({
    id, itemId: `item-${id}`, name: 'Pilau', quantity: 1, unitPriceCents: 30000, totalCents: 30000, sentToKitchenAt: null, ...extra,
  });

  it('cancelling an empty order cancels its live tickets, frees the table and logs nothing', async () => {
    const { prisma, service } = build();
    await service.cancelOrder('o1', BIZ);
    expect(prisma.kOT.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'o1', status: { in: ['PENDING', 'IN_PROGRESS', 'READY'] } },
      data: { status: 'CANCELLED' },
    });
    expect(prisma.table.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'AVAILABLE' } });
    expect(prisma.orderVoid.create).not.toHaveBeenCalled();
  });

  it('will not cancel a paid order', async () => {
    const { prisma, service } = build();
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', businessId: BIZ, storeId: 's1', tableId: null, status: 'PAID' });
    await expect(service.cancelOrder('o1', BIZ)).rejects.toBeInstanceOf(BadRequestException);
  });

  describe('void a whole order', () => {
    it('refuses a waiter when the kitchen has any line, and changes nothing', async () => {
      const { prisma, service } = build();
      prisma.orderItem.findMany.mockResolvedValue([orderLine('a', { sentToKitchenAt: sentAt }), orderLine('b')]);
      const err: any = await service.voidOrder('o1', { reasonCode: 'GUESTS_LEFT' }, waiter, null, BIZ).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toEqual(expect.objectContaining({ code: 'APPROVAL_REQUIRED' }));
      expect(prisma.order.update).not.toHaveBeenCalled();
      expect(prisma.orderVoid.create).not.toHaveBeenCalled();
    });

    it('with a manager: logs every line, cancels tickets, frees the table and warns the kitchen', async () => {
      const { prisma, service, events } = build();
      prisma.orderItem.findMany.mockResolvedValue([orderLine('a', { sentToKitchenAt: sentAt, quantity: 2, totalCents: 60000 }), orderLine('b')]);
      const out = await service.voidOrder('o1', { reasonCode: 'GUESTS_LEFT' }, waiter, manager.id, BIZ);

      expect(out).toEqual({ success: true, voidedValueCents: 90000 });
      expect(prisma.orderVoid.create).toHaveBeenCalledTimes(2);
      expect(prisma.orderVoid.create.mock.calls[0][0].data).toEqual(expect.objectContaining({
        scope: 'ORDER', itemName: 'Pilau', quantity: 2, unitCents: 30000, valueCents: 60000, reasonCode: 'GUESTS_LEFT',
        wasSent: true, voidedById: 'w1', approvedById: 'm1',
      }));
      expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'CANCELLED' } });
      expect(prisma.table.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'AVAILABLE' } });
      expect(events.emitKotVoided).toHaveBeenCalledWith(BIZ, expect.objectContaining({ wholeOrder: true, lines: [{ name: 'Pilau', quantity: 2 }] }));
    });

    it('lets a waiter void an order the kitchen never got, and still logs it', async () => {
      const { prisma, service, events } = build();
      prisma.orderItem.findMany.mockResolvedValue([orderLine('a')]);
      await service.voidOrder('o1', { reasonCode: 'ENTERED_BY_MISTAKE' }, waiter, null, BIZ);
      expect(prisma.orderVoid.create).toHaveBeenCalledTimes(1);
      expect(prisma.orderVoid.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ wasSent: false, approvedById: null }));
      expect(events.emitKotVoided).not.toHaveBeenCalled();
    });

    it('needs a reason when there is anything on the order, and an explanation for "Other"', async () => {
      const { prisma, service } = build();
      prisma.orderItem.findMany.mockResolvedValue([orderLine('a')]);
      await expect(service.voidOrder('o1', {}, manager, manager.id, BIZ)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.voidOrder('o1', { reasonCode: 'NOT_A_REASON' }, manager, manager.id, BIZ)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.voidOrder('o1', { reasonCode: 'OTHER', note: ' ' }, manager, manager.id, BIZ)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.order.update).not.toHaveBeenCalled();
    });

    it('sends a paid order to the receipt void instead', async () => {
      const { prisma, service } = build();
      prisma.order.findUnique.mockResolvedValue({ id: 'o1', businessId: BIZ, storeId: 's1', tableId: null, status: 'PAID' });
      await expect(service.voidOrder('o1', { reasonCode: 'OTHER', note: 'x y z' }, manager, manager.id, BIZ)).rejects.toThrow(/receipt/);
    });
  });

  describe('void one line', () => {
    it('lets a waiter remove a line the kitchen never got, logs it, and sends no kitchen alert', async () => {
      const { prisma, service, events } = build();
      prisma.orderItem.findFirst.mockResolvedValue(orderLine('a'));
      await service.voidOrderItem('o1', 'a', { reasonCode: 'ENTERED_BY_MISTAKE' }, waiter, null, BIZ);
      expect(prisma.orderItem.delete).toHaveBeenCalledWith({ where: { id: 'a' } });
      expect(prisma.orderVoid.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ scope: 'ITEM', wasSent: false, quantity: 1, valueCents: 30000 }));
      expect(events.emitKotVoided).not.toHaveBeenCalled();
    });

    it('needs a manager to void a line the kitchen already has', async () => {
      const { prisma, service } = build();
      prisma.orderItem.findFirst.mockResolvedValue(orderLine('a', { sentToKitchenAt: sentAt }));
      const err: any = await service.voidOrderItem('o1', 'a', { reasonCode: 'WRONG_ITEM' }, waiter, null, BIZ).catch((e) => e);
      expect(err).toBeInstanceOf(ForbiddenException);
      expect(err.getResponse()).toEqual(expect.objectContaining({ code: 'APPROVAL_REQUIRED' }));
      expect(prisma.orderItem.delete).not.toHaveBeenCalled();
      expect(prisma.orderVoid.create).not.toHaveBeenCalled();
    });

    it('requires a reason from the list, and a few words for "Other"', async () => {
      const { prisma, service } = build();
      prisma.orderItem.findFirst.mockResolvedValue(orderLine('a'));
      await expect(service.voidOrderItem('o1', 'a', {}, manager, manager.id, BIZ)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.voidOrderItem('o1', 'a', { reasonCode: 'typo' }, manager, manager.id, BIZ)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.voidOrderItem('o1', 'a', { reasonCode: 'OTHER', note: 'x' }, manager, manager.id, BIZ)).rejects.toBeInstanceOf(BadRequestException);
    });

    it('voids part of a line: 1 of 10 ugali leaves 9, priced correctly, and the kitchen is told to stop one', async () => {
      const { prisma, service, events } = build();
      prisma.orderItem.findFirst.mockResolvedValue(orderLine('a', { name: 'Ugali', quantity: 10, totalCents: 10 * 5500, sentToKitchenAt: sentAt }));
      prisma.kOT.findMany.mockResolvedValue([{ id: 'k1', status: 'PENDING', itemIds: JSON.stringify(['a']) }]);

      const out: any = await service.voidOrderItem('o1', 'a', { quantity: 1, reasonCode: 'CUSTOMER_CHANGED_MIND' }, waiter, manager.id, BIZ);

      expect(prisma.orderItem.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { quantity: 9, totalCents: 9 * 5500 } });
      expect(prisma.orderItem.delete).not.toHaveBeenCalled();
      expect(prisma.orderVoid.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ quantity: 1, unitCents: 5500, valueCents: 5500, approvedById: 'm1' }));
      // the ticket keeps its line (now 9) and is not cancelled
      expect(prisma.kOT.update).not.toHaveBeenCalled();
      expect(events.emitKotVoided).toHaveBeenCalledWith(BIZ, expect.objectContaining({ lines: [{ name: 'Ugali', quantity: 1 }], kotIds: ['k1'] }));
      expect(out.voided).toEqual(expect.objectContaining({ quantity: 1, valueCents: 5500, wasSent: true }));
    });

    it('keeps modifier prices when it reduces the quantity', async () => {
      const { prisma, service } = build();
      // 3 coffees at 300 + a 50 modifier each = 1050
      prisma.orderItem.findFirst.mockResolvedValue(orderLine('a', { quantity: 3, totalCents: 1050 }));
      await service.voidOrderItem('o1', 'a', { quantity: 1, reasonCode: 'WRONG_ITEM' }, waiter, null, BIZ);
      expect(prisma.orderItem.update).toHaveBeenCalledWith({ where: { id: 'a' }, data: { quantity: 2, totalCents: 700 } });
    });

    it('will not void more than was ordered, or zero', async () => {
      const { prisma, service } = build();
      prisma.orderItem.findFirst.mockResolvedValue(orderLine('a', { quantity: 2, totalCents: 60000 }));
      await expect(service.voidOrderItem('o1', 'a', { quantity: 3, reasonCode: 'WRONG_ITEM' }, manager, manager.id, BIZ)).rejects.toThrow(/Only 2/);
      await expect(service.voidOrderItem('o1', 'a', { quantity: 0, reasonCode: 'WRONG_ITEM' }, manager, manager.id, BIZ)).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.voidOrderItem('o1', 'a', { quantity: 1.5, reasonCode: 'WRONG_ITEM' }, manager, manager.id, BIZ)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.orderItem.update).not.toHaveBeenCalled();
    });

    it('pulls a fully voided line off its ticket, cancels an emptied ticket and warns the kitchen', async () => {
      const { prisma, service, events } = build();
      prisma.orderItem.findFirst.mockResolvedValue(orderLine('a', { quantity: 2, totalCents: 60000, sentToKitchenAt: sentAt }));
      prisma.kOT.findMany.mockResolvedValue([
        { id: 'k1', status: 'PENDING', itemIds: JSON.stringify(['a']) },
        { id: 'k2', status: 'PENDING', itemIds: JSON.stringify(['a', 'b']) },
        { id: 'k3', status: 'PENDING', itemIds: JSON.stringify(['z']) },
      ]);
      await service.voidOrderItem('o1', 'a', { reasonCode: 'WRONG_ITEM' }, manager, manager.id, BIZ);

      expect(prisma.kOT.update).toHaveBeenCalledWith({ where: { id: 'k1' }, data: { itemIds: '[]', status: 'CANCELLED' } });
      expect(prisma.kOT.update).toHaveBeenCalledWith({ where: { id: 'k2' }, data: { itemIds: JSON.stringify(['b']) } });
      expect(prisma.kOT.update).toHaveBeenCalledTimes(2);
      expect(events.emitKotVoided).toHaveBeenCalledWith(BIZ, expect.objectContaining({ table: '5', lines: [{ name: 'Pilau', quantity: 2 }] }));
    });

    it('marks food as made when a cook had started it (display mode)', async () => {
      const { prisma, service } = build();
      prisma.orderItem.findFirst.mockResolvedValue(orderLine('a', { sentToKitchenAt: sentAt }));
      prisma.kOT.findMany.mockResolvedValue([{ id: 'k1', status: 'IN_PROGRESS', itemIds: JSON.stringify(['a']) }]);
      await service.voidOrderItem('o1', 'a', { reasonCode: 'CUSTOMER_COMPLAINT' }, waiter, manager.id, BIZ);
      expect(prisma.orderVoid.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ wasSent: true, wasPrepared: true }));
    });

    it('does not claim food was made just because a print-only ticket is recorded as served', async () => {
      const { prisma, service } = build();
      prisma.business.findUnique.mockResolvedValue({ kitchenMode: 'PRINT_ONLY' });
      prisma.orderItem.findFirst.mockResolvedValue(orderLine('a', { sentToKitchenAt: sentAt }));
      prisma.kOT.findMany.mockResolvedValue([{ id: 'k1', status: 'SERVED', itemIds: JSON.stringify(['a']) }]);
      await service.voidOrderItem('o1', 'a', { reasonCode: 'WRONG_ITEM' }, waiter, manager.id, BIZ);
      expect(prisma.orderVoid.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ wasSent: true, wasPrepared: false }));
    });

    it('refuses to remove a line the kitchen has through the plain remove route', async () => {
      const { prisma, service } = build();
      prisma.orderItem.findMany.mockResolvedValue([orderLine('a', { sentToKitchenAt: sentAt })]);
      await expect(service.removeOrderItems('o1', ['a'], BIZ)).rejects.toThrow(/Void it instead/);
      expect(prisma.orderItem.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('void log', () => {
    it('is scoped to the caller\'s store and business', async () => {
      const { prisma, service } = build();
      await service.getVoidLog('s1', BIZ);
      expect(prisma.orderVoid.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ businessId: BIZ, storeId: 's1' }));
      await expect(service.getVoidLog('s1', 'biz-B')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});

describe('kitchen mode', () => {
  const prep = (prisma: any) => {
    prisma.orderItem.findMany.mockResolvedValue([line('a', 'Pilau')]);
    prisma.orderItem.updateMany.mockResolvedValue({ count: 1 });
    prisma.kotCounter.upsert.mockResolvedValue({ last: 1 });
    prisma.kOT.create.mockImplementation(async ({ data }: any) => ({ id: 'k1', ...data }));
  };

  it('with a kitchen display, a new ticket waits for a cook', async () => {
    const { prisma, service } = build();
    prep(prisma);
    const [t] = await service.createKOT('o1', 'NEW_ORDER', ['a'], BIZ);
    expect(t.status).toBe('PENDING');
  });

  it('without one (print only), the ticket is recorded as handed over so it never waits on a screen', async () => {
    const { prisma, service } = build();
    prep(prisma);
    prisma.business.findUnique.mockResolvedValue({ kitchenMode: 'PRINT_ONLY' });
    const [t] = await service.createKOT('o1', 'NEW_ORDER', ['a'], BIZ);
    expect(t.status).toBe('SERVED');
    expect(t.preparedAt).toBeInstanceOf(Date);
    expect(t.kotNumber).toBe(1);
  });
});

describe('getKDSOrders', () => {
  it('shows each ticket the lines stored on it and applies the station filter', async () => {
    const { prisma, service } = build();
    prisma.kOT.findMany.mockResolvedValue([
      { id: 'k1', itemIds: JSON.stringify(['b', 'a']), order: { id: 'o1' } },
      { id: 'k2', itemIds: 'not json', order: { id: 'o2' } },
    ]);
    prisma.orderItem.findMany.mockResolvedValue([{ id: 'a', name: 'A' }, { id: 'b', name: 'B' }]);

    const out = await service.getKDSOrders('s1', BIZ, 'bar');

    expect(prisma.kOT.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ station: 'BAR' }));
    expect(prisma.kOT.findMany.mock.calls[0][0].where.order).toEqual({ storeId: 's1', status: { notIn: ['PAID', 'CANCELLED'] } });
    expect(out[0].order.items.map((i: any) => i.id)).toEqual(['b', 'a']);
    expect(out[1].order.items).toEqual([]);
  });

  it('refuses a store from another business', async () => {
    const { service } = build();
    await expect(service.getKDSOrders('s1', 'biz-B')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('HospitalityAccessGuard', () => {
  function guardFor(business: { posMode: string; enabledModules: string } | null) {
    const prisma: any = { business: { findUnique: jest.fn().mockResolvedValue(business) } };
    const guard = new HospitalityAccessGuard(prisma);
    const ctx = (path: string) => ({
      switchToHttp: () => ({ getRequest: () => ({ path, user: { businessId: BIZ } }) }),
    }) as any;
    return { guard, ctx, prisma };
  }

  it('lets a restaurant business reach kitchen routes', async () => {
    const { guard, ctx } = guardFor({ posMode: 'FAST_FOOD', enabledModules: '[]' });
    await expect(guard.canActivate(ctx('/api/v1/hospitality/kds/orders'))).resolves.toBe(true);
  });

  it('blocks a supermarket from kitchen tickets', async () => {
    const { guard, ctx } = guardFor({ posMode: 'SUPERMARKET', enabledModules: '[]' });
    await expect(guard.canActivate(ctx('/api/v1/hospitality/orders/o1/kot'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('lets a fuel station with the Restaurant module in', async () => {
    const { guard, ctx } = guardFor({ posMode: 'FUEL_PUMP', enabledModules: '["RESTAURANT"]' });
    await expect(guard.canActivate(ctx('/api/v1/hospitality/tables'))).resolves.toBe(true);
  });

  it('keeps bar tabs, happy hours and the waitlist inside the restaurant too', async () => {
    const { guard, ctx } = guardFor({ posMode: 'SUPERMARKET', enabledModules: '[]' });
    for (const path of ['/api/v1/hospitality/bar-tabs', '/api/v1/hospitality/happy-hours', '/api/v1/hospitality/waitlist', '/api/v1/hospitality/revpash']) {
      await expect(guard.canActivate(ctx(path))).rejects.toBeInstanceOf(ForbiddenException);
    }
  });

  it('keeps rooms, bookings, folios and housekeeping inside the hotel', async () => {
    const paths = [
      '/api/v1/hospitality/hotel-rooms', '/api/v1/hospitality/room-bookings/b1/folio', '/api/v1/hospitality/folio-charges/c1',
      '/api/v1/hospitality/housekeeping', '/api/v1/hospitality/housekeeping-assignments', '/api/v1/hospitality/hotel-dashboard',
    ];
    const retail = guardFor({ posMode: 'RETAIL', enabledModules: '[]' });
    for (const path of paths) await expect(retail.guard.canActivate(retail.ctx(path))).rejects.toBeInstanceOf(ForbiddenException);

    // A fast-food till has a kitchen but no rooms.
    const fast = guardFor({ posMode: 'FAST_FOOD', enabledModules: '[]' });
    await expect(fast.guard.canActivate(fast.ctx('/api/v1/hospitality/hotel-rooms'))).rejects.toBeInstanceOf(ForbiddenException);
    await expect(fast.guard.canActivate(fast.ctx('/api/v1/hospitality/kds/orders'))).resolves.toBe(true);

    const hotel = guardFor({ posMode: 'HOSPITALITY', enabledModules: '[]' });
    for (const path of paths) await expect(hotel.guard.canActivate(hotel.ctx(path))).resolves.toBe(true);
  });

  it('lets a shop with the Hotel module in, without giving it a kitchen', async () => {
    const { guard, ctx } = guardFor({ posMode: 'RETAIL', enabledModules: '["HOTEL"]' });
    await expect(guard.canActivate(ctx('/api/v1/hospitality/room-bookings'))).resolves.toBe(true);
    await expect(guard.canActivate(ctx('/api/v1/hospitality/kds/orders'))).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('does not police the non-restaurant parts of /hospitality', async () => {
    const { guard, ctx, prisma } = guardFor({ posMode: 'RETAIL', enabledModules: '[]' });
    await expect(guard.canActivate(ctx('/api/v1/hospitality/something-else'))).resolves.toBe(true);
    expect(prisma.business.findUnique).not.toHaveBeenCalled();
  });
});

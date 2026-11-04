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
    $transaction: jest.fn((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  const notifications: any = { sendWhatsApp: jest.fn().mockResolvedValue(undefined) };
  const events: any = { emitKotCreated: jest.fn(), emitKotUpdated: jest.fn(), emitKotVoided: jest.fn() };
  return { prisma, notifications, events, service: new HospitalityService(prisma, notifications, events) };
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
  it('cancelling an order cancels its live tickets', async () => {
    const { prisma, service } = build();
    await service.cancelOrder('o1', BIZ);
    expect(prisma.kOT.updateMany).toHaveBeenCalledWith({
      where: { orderId: 'o1', status: { in: ['PENDING', 'IN_PROGRESS', 'READY'] } },
      data: { status: 'CANCELLED' },
    });
    expect(prisma.table.update).toHaveBeenCalledWith({ where: { id: 't1' }, data: { status: 'AVAILABLE' } });
  });

  it('will not cancel a paid order', async () => {
    const { prisma, service } = build();
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', businessId: BIZ, storeId: 's1', tableId: null, status: 'PAID' });
    await expect(service.cancelOrder('o1', BIZ)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lets a waiter remove a line the kitchen never got, with no kitchen alert', async () => {
    const { prisma, service, events } = build();
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'a', name: 'Pilau', quantity: 1, sentToKitchenAt: null });
    await service.voidOrderItem('o1', 'a', 'typo', 'WAITER', 'Wanjiru', BIZ);
    expect(prisma.orderItem.delete).toHaveBeenCalled();
    expect(events.emitKotVoided).not.toHaveBeenCalled();
  });

  it('needs a manager to void a line the kitchen already has', async () => {
    const { prisma, service } = build();
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'a', name: 'Pilau', quantity: 1, sentToKitchenAt: new Date() });
    await expect(service.voidOrderItem('o1', 'a', 'guest left', 'WAITER', 'Wanjiru', BIZ)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.orderItem.delete).not.toHaveBeenCalled();
  });

  it('requires a reason', async () => {
    const { service } = build();
    await expect(service.voidOrderItem('o1', 'a', '  ', 'MANAGER', 'M', BIZ)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('pulls a voided line off its ticket, cancels an emptied ticket and warns the kitchen', async () => {
    const { prisma, service, events } = build();
    prisma.orderItem.findFirst.mockResolvedValue({ id: 'a', name: 'Pilau', quantity: 2, sentToKitchenAt: new Date() });
    prisma.kOT.findMany.mockResolvedValue([
      { id: 'k1', itemIds: JSON.stringify(['a']) },
      { id: 'k2', itemIds: JSON.stringify(['a', 'b']) },
      { id: 'k3', itemIds: JSON.stringify(['z']) },
    ]);
    await service.voidOrderItem('o1', 'a', 'guest left', 'MANAGER', 'Mo', BIZ);

    expect(prisma.kOT.update).toHaveBeenCalledWith({ where: { id: 'k1' }, data: { itemIds: '[]', status: 'CANCELLED' } });
    expect(prisma.kOT.update).toHaveBeenCalledWith({ where: { id: 'k2' }, data: { itemIds: JSON.stringify(['b']) } });
    expect(prisma.kOT.update).toHaveBeenCalledTimes(2);
    expect(events.emitKotVoided).toHaveBeenCalledWith(BIZ, expect.objectContaining({
      table: '5', lines: [{ name: 'Pilau', quantity: 2 }],
    }));
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

import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HospitalityService } from './hospitality.service';
import { HousekeepingService } from '../housekeeping/housekeeping.service';
import { WaitlistService } from '../waitlist/waitlist.service';

const BIZ = 'biz-A';
const OTHER = 'biz-B';

function build() {
  const prisma: any = {
    store: { findUnique: jest.fn().mockResolvedValue({ businessId: BIZ }), update: jest.fn().mockResolvedValue({ storeCode: 'NRB', receiptSequence: 7 }), findFirst: jest.fn() },
    order: {
      findUnique: jest.fn().mockResolvedValue({ id: 'o1', businessId: BIZ, storeId: 's1', tableId: null, status: 'OPEN', mode: 'HOSPITALITY', waiterId: 'u1', items: [] }),
      create: jest.fn().mockResolvedValue({ id: 'new' }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    orderItem: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: `line-${data.itemId}`, ...data })) },
    item: { findMany: jest.fn().mockResolvedValue([{ id: 'i1', name: 'Pilau', retailPriceCents: 35_000 }]) },
    kOT: { count: jest.fn().mockResolvedValue(0), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    table: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}), delete: jest.fn(), count: jest.fn() },
    hotelRoom: { findUnique: jest.fn(), update: jest.fn().mockResolvedValue({}), delete: jest.fn() },
    roomBooking: { findUnique: jest.fn(), findFirst: jest.fn().mockResolvedValue(null) },
    guestFolioCharge: { findUnique: jest.fn(), create: jest.fn().mockResolvedValue({}), delete: jest.fn() },
    happyHour: { findFirst: jest.fn(), delete: jest.fn(), create: jest.fn().mockResolvedValue({}) },
    tableReservation: { findFirst: jest.fn() },
    user: { findFirst: jest.fn().mockResolvedValue({ id: 'u1' }) },
    sale: { create: jest.fn().mockResolvedValue({ id: 'sale1', receiptNumber: 'NRB-000007', totalCents: 70_000 }) },
    $transaction: jest.fn((arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg))),
  };
  const events: any = { emitKotCreated: jest.fn(), emitKotUpdated: jest.fn(), emitKotVoided: jest.fn() };
  const service = new HospitalityService(prisma, { sendWhatsApp: jest.fn() } as any, events);
  return { prisma, service };
}

describe('order line pricing', () => {
  it('takes name and price from the menu and ignores what the client sent', async () => {
    const { prisma, service } = build();
    await service.addOrderItems('o1', [
      { itemId: 'i1', name: 'Free lunch', quantity: 2, unitPriceCents: 1 },
    ], BIZ);
    const data = prisma.orderItem.create.mock.calls[0][0].data;
    expect(data.name).toBe('Pilau');
    expect(data.unitPriceCents).toBe(35_000);
    expect(data.totalCents).toBe(70_000);
  });

  it('looks the menu up within the caller\'s business only', async () => {
    const { prisma, service } = build();
    await service.addOrderItems('o1', [{ itemId: 'i1', quantity: 1 }], BIZ);
    expect(prisma.item.findMany.mock.calls[0][0].where).toEqual(expect.objectContaining({ businessId: BIZ, deletedAt: null, isActive: true }));
  });

  it('refuses an item that is not on this menu', async () => {
    const { prisma, service } = build();
    prisma.item.findMany.mockResolvedValue([]);
    await expect(service.addOrderItems('o1', [{ itemId: 'someone-elses', quantity: 1 }], BIZ)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.orderItem.create).not.toHaveBeenCalled();
  });

  it.each([[0], [-3], [1.5], [1000], ['2; DROP']])('refuses quantity %p', async (q) => {
    const { service } = build();
    await expect(service.addOrderItems('o1', [{ itemId: 'i1', quantity: q as any }], BIZ)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('adds a priced modifier to the line total, per unit', async () => {
    const { prisma, service } = build();
    await service.addOrderItems('o1', [{ itemId: 'i1', quantity: 2, modifiers: [{ name: 'Extra cheese', priceCents: 5_000 }, 'No onion'] }], BIZ);
    const data = prisma.orderItem.create.mock.calls[0][0].data;
    expect(data.totalCents).toBe((35_000 + 5_000) * 2);
    expect(JSON.parse(data.modifiers)).toEqual([{ name: 'Extra cheese', priceCents: 5_000 }, 'No onion']);
  });

  it('refuses a negative or absurd modifier price, which could only be there to cut the bill', async () => {
    const { service } = build();
    await expect(service.addOrderItems('o1', [{ itemId: 'i1', quantity: 1, modifiers: [{ name: 'Discount', priceCents: -30_000 }] }], BIZ)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.addOrderItems('o1', [{ itemId: 'i1', quantity: 1, modifiers: [{ name: 'Gold', priceCents: 99_999_999 }] }], BIZ)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('rejects an unknown course and a closed order', async () => {
    const { prisma, service } = build();
    await expect(service.addOrderItems('o1', [{ itemId: 'i1', quantity: 1, course: 'BRUNCH' }], BIZ)).rejects.toBeInstanceOf(BadRequestException);
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', businessId: BIZ, storeId: 's1', status: 'PAID' });
    await expect(service.addOrderItems('o1', [{ itemId: 'i1', quantity: 1 }], BIZ)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('prices bar-tab lines the same way and sends them through the ticket route', async () => {
    const { prisma, service } = build();
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', businessId: BIZ, storeId: 's1', tableId: null, status: 'OPEN', mode: 'BAR_TAB' });
    const createKOT = jest.spyOn(service, 'createKOT').mockResolvedValue([{ id: 'k1' }] as any);
    const res = await service.addToBarTab('o1', [{ itemId: 'i1', quantity: 1, unitPriceCents: 1 }], BIZ);
    expect(prisma.orderItem.create.mock.calls[0][0].data.unitPriceCents).toBe(35_000);
    expect(createKOT).toHaveBeenCalledWith('o1', 'NEW_ORDER', ['line-i1'], BIZ);
    expect(res).toEqual({ added: 1, tickets: 1 });
  });
});

describe('ids from another business are not found', () => {
  it('tables', async () => {
    const { prisma, service } = build();
    prisma.table.findUnique.mockResolvedValue({ id: 't1', status: 'AVAILABLE', store: { businessId: OTHER } });
    await expect(service.updateTable('t1', { number: '9' }, BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteTable('t1', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.setTableStatus('t1', 'OCCUPIED', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.table.update).not.toHaveBeenCalled();
    expect(prisma.table.delete).not.toHaveBeenCalled();
  });

  it('refuses an unknown table status', async () => {
    const { service } = build();
    await expect(service.setTableStatus('t1', 'EXPLODED', BIZ)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('creating a table in another business\'s store', async () => {
    const { prisma, service } = build();
    prisma.store.findUnique.mockResolvedValue({ businessId: OTHER });
    await expect(service.createTable({ storeId: 's9', number: '1', capacity: 4 }, BIZ)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('merging tables that are not all the caller\'s', async () => {
    const { prisma, service } = build();
    prisma.table.count.mockResolvedValue(1); // two asked for, one is theirs
    await expect(service.mergeTables(['t1', 't2'], 't1', BIZ)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('opening an order on someone else\'s table or booking, or with a stranger as waiter', async () => {
    const { prisma, service } = build();
    prisma.table.findUnique.mockResolvedValue({ id: 't1', status: 'AVAILABLE', store: { businessId: OTHER } });
    await expect(service.createOrder({ offlineId: 'x', businessId: BIZ, storeId: 's1', tableId: 't1', waiterId: 'u1' })).rejects.toBeInstanceOf(NotFoundException);

    prisma.roomBooking.findUnique.mockResolvedValue({ id: 'b1', businessId: OTHER });
    await expect(service.createOrder({ offlineId: 'x', businessId: BIZ, storeId: 's1', waiterId: 'u1', roomBookingId: 'b1' })).rejects.toBeInstanceOf(NotFoundException);

    prisma.user.findFirst.mockResolvedValue(null);
    await expect(service.createOrder({ offlineId: 'x', businessId: BIZ, storeId: 's1', waiterId: 'stranger' })).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.order.create).not.toHaveBeenCalled();
  });

  it('reservations', async () => {
    const { prisma, service } = build();
    prisma.table.findUnique.mockResolvedValue({ id: 't1', status: 'AVAILABLE', store: { businessId: OTHER } });
    await expect(service.createReservation({ tableId: 't1', customerName: 'A', partySize: 2, reservationTime: new Date() }, BIZ)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rooms, bookings and folio charges', async () => {
    const { prisma, service } = build();
    prisma.hotelRoom.findUnique.mockResolvedValue({ id: 'r1', businessId: OTHER, storeId: 's1', status: 'AVAILABLE', pricePerNightCents: 100 });
    prisma.roomBooking.findUnique.mockResolvedValue({ id: 'b1', businessId: OTHER, roomId: 'r1', status: 'CHECKED_IN' });
    prisma.guestFolioCharge.findUnique.mockResolvedValue({ id: 'c1', businessId: OTHER, booking: { status: 'CHECKED_IN' } });

    await expect(service.updateHotelRoom('r1', { notes: 'x' }, BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.deleteHotelRoom('r1', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.updateHousekeepingStatus('r1', 'CLEAN', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.createRoomBooking({ storeId: 's1', roomId: 'r1', guestName: 'G', checkInDate: new Date(), nightCount: 1 }, BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.checkInGuest('b1', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.checkOutGuest('b1', [], BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.cancelRoomBooking('b1', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.getFolio('b1', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.addFolioCharge('b1', { type: 'OTHER', description: 'x', amountCents: 100 }, BIZ, 'me')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.removeFolioCharge('c1', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.hotelRoom.update).not.toHaveBeenCalled();
    expect(prisma.guestFolioCharge.delete).not.toHaveBeenCalled();
  });

  it('happy hours', async () => {
    const { prisma, service } = build();
    prisma.happyHour.findFirst.mockResolvedValue(null);
    await expect(service.deleteHappyHour('h1', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.happyHour.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'h1', businessId: BIZ } }));
    expect(prisma.happyHour.delete).not.toHaveBeenCalled();
  });

  it('bar tabs', async () => {
    const { prisma, service } = build();
    prisma.order.findUnique.mockResolvedValue({ id: 'o1', businessId: OTHER, storeId: 's1', status: 'OPEN', mode: 'BAR_TAB', items: [] });
    await expect(service.addToBarTab('o1', [], BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.settleBarTab('o1', [{ method: 'CASH', amountCents: 1 }], BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.closeBarTab('o1', BIZ, 'OWNER')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('room and folio rules', () => {
  it('updating a room cannot move it to another business or store', async () => {
    const { prisma, service } = build();
    prisma.hotelRoom.findUnique.mockResolvedValue({ id: 'r1', businessId: BIZ });
    await service.updateHotelRoom('r1', { notes: 'fixed', businessId: OTHER, storeId: 'elsewhere' } as any, BIZ);
    const data = prisma.hotelRoom.update.mock.calls[0][0].data;
    expect(data).toEqual({ notes: 'fixed' });
  });

  it('a booking takes its store and price from the room', async () => {
    const { prisma, service } = build();
    prisma.hotelRoom.findUnique.mockResolvedValue({ id: 'r1', businessId: BIZ, storeId: 'real-store', status: 'AVAILABLE', pricePerNightCents: 500_000 });
    prisma.roomBooking.create = jest.fn().mockResolvedValue({ id: 'b1' });
    await service.createRoomBooking({ storeId: 'spoofed', roomId: 'r1', guestName: 'G', checkInDate: new Date(), nightCount: 2 }, BIZ);
    const data = prisma.roomBooking.create.mock.calls[0][0].data;
    expect(data.storeId).toBe('real-store');
    expect(data.totalAmountCents).toBe(1_000_000);
  });

  it('folio charges must be positive, and are posted under the signed-in name', async () => {
    const { prisma, service } = build();
    prisma.roomBooking.findUnique.mockResolvedValue({ id: 'b1', businessId: BIZ, status: 'CHECKED_IN' });
    await expect(service.addFolioCharge('b1', { type: 'OTHER', description: 'refund', amountCents: -5_000 }, BIZ, 'Wanjiru')).rejects.toBeInstanceOf(BadRequestException);
    await service.addFolioCharge('b1', { type: 'OTHER', description: 'Laundry', amountCents: 5_000, quantity: 2 }, BIZ, 'Wanjiru');
    expect(prisma.guestFolioCharge.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ totalCents: 10_000, postedBy: 'Wanjiru', businessId: BIZ }));
  });

  it('a closed booking\'s folio is not edited', async () => {
    const { prisma, service } = build();
    prisma.guestFolioCharge.findUnique.mockResolvedValue({ id: 'c1', businessId: BIZ, booking: { status: 'CHECKED_OUT' } });
    await expect(service.removeFolioCharge('c1', BIZ)).rejects.toBeInstanceOf(BadRequestException);
    prisma.roomBooking.findUnique.mockResolvedValue({ id: 'b1', businessId: BIZ, status: 'CHECKED_OUT' });
    await expect(service.addFolioCharge('b1', { type: 'OTHER', description: 'late', amountCents: 100 }, BIZ, 'me')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('happy hour discount is bounded', async () => {
    const { service } = build();
    await expect(service.createHappyHour({ name: 'x', discountPct: 150, startHour: 17, endHour: 19 }, BIZ)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.createHappyHour({ name: 'x', discountPct: 10, startHour: 25, endHour: 19 }, BIZ)).rejects.toBeInstanceOf(BadRequestException);
  });
});

describe('settling a bar tab', () => {
  const tab = (over: Record<string, unknown> = {}) => ({
    id: 'o1', businessId: BIZ, storeId: 's1', mode: 'BAR_TAB', status: 'OPEN', waiterId: 'u1',
    items: [{ itemId: 'i1', name: 'Beer', quantity: 2, unitPriceCents: 35_000, totalCents: 70_000 }], ...over,
  });

  it('creates one sale when the payments cover the tab', async () => {
    const { prisma, service } = build();
    prisma.order.findUnique.mockResolvedValue(tab());
    const res = await service.settleBarTab('o1', [{ method: 'CASH', amountCents: 70_000 }], BIZ);
    expect(res.receiptNumber).toBe('NRB-000007');
    expect(prisma.order.updateMany).toHaveBeenCalledWith({ where: { id: 'o1', status: { in: ['OPEN', 'BILL_REQUESTED'] } }, data: { status: 'PAID' } });
  });

  it('refuses payments that do not cover the tab, and non-positive amounts', async () => {
    const { prisma, service } = build();
    prisma.order.findUnique.mockResolvedValue(tab());
    await expect(service.settleBarTab('o1', [{ method: 'CASH', amountCents: 100 }], BIZ)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.settleBarTab('o1', [{ method: 'CASH', amountCents: -70_000 }], BIZ)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.sale.create).not.toHaveBeenCalled();
  });

  it('a second settle of the same tab loses cleanly instead of writing another sale', async () => {
    const { prisma, service } = build();
    prisma.order.findUnique.mockResolvedValue(tab());
    prisma.order.updateMany.mockResolvedValue({ count: 0 });
    await expect(service.settleBarTab('o1', [{ method: 'CASH', amountCents: 70_000 }], BIZ)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.sale.create).not.toHaveBeenCalled();
  });

  it('only a manager can write off a tab that has charges', async () => {
    const { prisma, service } = build();
    prisma.order.findUnique.mockResolvedValue(tab());
    await expect(service.closeBarTab('o1', BIZ, 'WAITER')).rejects.toBeInstanceOf(ForbiddenException);
    await service.closeBarTab('o1', BIZ, 'MANAGER');
    expect(prisma.order.update).toHaveBeenCalledWith({ where: { id: 'o1' }, data: { status: 'CLOSED' } });
  });
});

describe('housekeeping assignments and waitlist', () => {
  it('assigning needs a room and an employee of the caller\'s business, and records who assigned', async () => {
    const prisma: any = {
      hotelRoom: { findFirst: jest.fn().mockResolvedValue(null) },
      employee: { findFirst: jest.fn().mockResolvedValue({ id: 'e1' }) },
      housekeepingAssignment: { create: jest.fn().mockResolvedValue({}), findFirst: jest.fn(), update: jest.fn() },
    };
    const svc = new HousekeepingService(prisma);
    await expect(svc.assign({ roomId: 'r9', employeeId: 'e1' }, BIZ, 'u1')).rejects.toBeInstanceOf(NotFoundException);

    prisma.hotelRoom.findFirst.mockResolvedValue({ id: 'r1' });
    await svc.assign({ roomId: 'r1', employeeId: 'e1' }, BIZ, 'u1');
    expect(prisma.housekeepingAssignment.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ businessId: BIZ, assignedBy: 'u1' }));
    expect(prisma.hotelRoom.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'r9', businessId: BIZ } }));
  });

  it('another business\'s assignment cannot be updated', async () => {
    const prisma: any = { housekeepingAssignment: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() } };
    const svc = new HousekeepingService(prisma);
    await expect(svc.updateStatus('a1', 'DONE', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.updateStatus('a1', 'WEIRD', BIZ)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.housekeepingAssignment.update).not.toHaveBeenCalled();
  });

  it('waitlist entries are only reachable by their own business', async () => {
    const prisma: any = {
      waitlist: { findFirst: jest.fn().mockResolvedValue(null), update: jest.fn() },
      table: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = new WaitlistService(prisma);
    await expect(svc.cancel('w1', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.noShow('w1', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.notify('w1', BIZ)).rejects.toBeInstanceOf(NotFoundException);
    await expect(svc.seat('w1', BIZ, 't1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.waitlist.update).not.toHaveBeenCalled();
  });

  it('seating at another business\'s table is refused', async () => {
    const prisma: any = {
      waitlist: { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }), update: jest.fn() },
      table: { findFirst: jest.fn().mockResolvedValue(null) },
    };
    const svc = new WaitlistService(prisma);
    await expect(svc.seat('w1', BIZ, 'foreign-table')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.table.findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'foreign-table', store: { businessId: BIZ } } }));
  });
});

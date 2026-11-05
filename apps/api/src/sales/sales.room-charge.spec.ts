import { BadRequestException } from '@nestjs/common';
import { SalesService } from './sales.service';

const BIZ = 'biz-1';
const SALE = { id: 'sale-1', receiptNumber: 'NRB01-2026-0000007', storeId: 'store-1', totalCents: 25_000 };

function build() {
  const tx: any = {
    roomBooking: { findMany: jest.fn().mockResolvedValue([{ id: 'bk-1', storeId: 'store-1', guestName: 'Ann' }]) },
    guestFolioCharge: {
      create: jest.fn().mockResolvedValue({}),
      findFirst: jest.fn().mockResolvedValue(null),
      deleteMany: jest.fn().mockResolvedValue({ count: 1 }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const svc: any = new (SalesService as any)();
  return { tx, svc };
}

describe('charging a sale to a room', () => {
  it('posts the amount to the folio of the guest in that room, tied to the sale', async () => {
    const { svc, tx } = build();
    await svc.chargeToRoom(tx, BIZ, 'u1', SALE, [{ method: 'CASH', amountCents: 100 }, { method: 'ROOM_CHARGE', amountCents: 25_000, roomNumber: '101' }]);
    expect(tx.roomBooking.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { businessId: BIZ, status: 'CHECKED_IN', room: { number: '101' } } }));
    expect(tx.guestFolioCharge.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ bookingId: 'bk-1', businessId: BIZ, type: 'POS_SALE', amountCents: 25_000, totalCents: 25_000, saleId: 'sale-1', postedBy: 'u1' }),
    });
  });

  it('reads the room from the reference when an older till sent only that', async () => {
    const { svc, tx } = build();
    await svc.chargeToRoom(tx, BIZ, 'u1', SALE, [{ method: 'ROOM_CHARGE', amountCents: 500, reference: 'Room 202A - Ann' }]);
    expect(tx.roomBooking.findMany.mock.calls[0][0].where.room).toEqual({ number: '202A' });
  });

  it('will not charge a room more than the sale came to', async () => {
    const { svc, tx } = build();
    await expect(svc.chargeToRoom(tx, BIZ, 'u1', SALE, [{ method: 'ROOM_CHARGE', amountCents: 25_001, roomNumber: '101' }])).rejects.toThrow(/more than the sale/);
    expect(tx.guestFolioCharge.create).not.toHaveBeenCalled();
  });

  it('does nothing for a sale not charged to a room', async () => {
    const { svc, tx } = build();
    await svc.chargeToRoom(tx, BIZ, 'u1', SALE, [{ method: 'CASH', amountCents: 500 }]);
    expect(tx.roomBooking.findMany).not.toHaveBeenCalled();
    expect(tx.guestFolioCharge.create).not.toHaveBeenCalled();
  });

  it('refuses a room with nobody in it, an unnamed room and two rooms, so the sale does not go through', async () => {
    const { svc, tx } = build();
    tx.roomBooking.findMany.mockResolvedValue([]);
    await expect(svc.chargeToRoom(tx, BIZ, 'u1', SALE, [{ method: 'ROOM_CHARGE', amountCents: 500, roomNumber: '101' }])).rejects.toThrow(/no checked-in guest/);
    await expect(svc.chargeToRoom(tx, BIZ, 'u1', SALE, [{ method: 'ROOM_CHARGE', amountCents: 500 }])).rejects.toThrow(/which room/);
    await expect(svc.chargeToRoom(tx, BIZ, 'u1', SALE, [
      { method: 'ROOM_CHARGE', amountCents: 500, roomNumber: '101' }, { method: 'ROOM_CHARGE', amountCents: 500, roomNumber: '102' },
    ])).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.guestFolioCharge.create).not.toHaveBeenCalled();
  });

  it('picks the stay in the sale\'s own store when two properties share a room number', async () => {
    const { svc, tx } = build();
    tx.roomBooking.findMany.mockResolvedValue([{ id: 'bk-a', storeId: 'store-2', guestName: 'A' }, { id: 'bk-b', storeId: 'store-1', guestName: 'B' }]);
    await svc.chargeToRoom(tx, BIZ, 'u1', SALE, [{ method: 'ROOM_CHARGE', amountCents: 500, roomNumber: '101' }]);
    expect(tx.guestFolioCharge.create.mock.calls[0][0].data.bookingId).toBe('bk-b');
    tx.roomBooking.findMany.mockResolvedValue([{ id: 'bk-a', storeId: 'store-2', guestName: 'A' }, { id: 'bk-c', storeId: 'store-3', guestName: 'C' }]);
    await expect(svc.chargeToRoom(tx, BIZ, 'u1', SALE, [{ method: 'ROOM_CHARGE', amountCents: 500, roomNumber: '101' }])).rejects.toThrow(/More than one guest/);
  });
});

describe('voiding a sale charged to a room', () => {
  const charge = (status: string, total = 25_000) => ({ id: 'ch-1', totalCents: total, booking: { status } });

  it('takes the whole charge off the folio on a full void', async () => {
    const { svc, tx } = build();
    tx.guestFolioCharge.findFirst.mockResolvedValue(charge('CHECKED_IN'));
    await svc.releaseRoomCharge(tx, BIZ, 'sale-1', 25_000, true);
    expect(tx.guestFolioCharge.deleteMany).toHaveBeenCalledWith({ where: { id: 'ch-1', businessId: BIZ } });
  });

  it('reduces it on a line void, and removes it when the line was all of it', async () => {
    const { svc, tx } = build();
    tx.guestFolioCharge.findFirst.mockResolvedValue(charge('CHECKED_IN'));
    await svc.releaseRoomCharge(tx, BIZ, 'sale-1', 10_000, false);
    expect(tx.guestFolioCharge.updateMany).toHaveBeenCalledWith({ where: { id: 'ch-1', businessId: BIZ }, data: { amountCents: 15_000, totalCents: 15_000 } });
    await svc.releaseRoomCharge(tx, BIZ, 'sale-1', 25_000, false);
    expect(tx.guestFolioCharge.deleteMany).toHaveBeenCalledTimes(1);
  });

  it('refuses once the guest has checked out, and ignores a sale never charged to a room', async () => {
    const { svc, tx } = build();
    await svc.releaseRoomCharge(tx, BIZ, 'sale-1', 100, true);
    expect(tx.guestFolioCharge.deleteMany).not.toHaveBeenCalled();
    tx.guestFolioCharge.findFirst.mockResolvedValue(charge('CHECKED_OUT'));
    await expect(svc.releaseRoomCharge(tx, BIZ, 'sale-1', 100, true)).rejects.toThrow(/checked out/);
  });
});

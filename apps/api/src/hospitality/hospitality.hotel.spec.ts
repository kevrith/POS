import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { HospitalityService } from './hospitality.service';

const BIZ = 'biz-1';
const NOW = new Date('2026-11-05T06:00:00.000Z'); // 09:00 in Nairobi
const day = (n: number) => new Date(Date.UTC(2026, 10, 5 + n)); // midnight UTC of Nov 5 + n days (a bare date from a form)
const room = (o: Record<string, any> = {}) => ({ id: 'room-1', businessId: BIZ, storeId: 'store-1', number: '101', status: 'AVAILABLE', pricePerNightCents: 500_000, housekeepingStatus: 'CLEAN', ...o });
const booking = (o: Record<string, any> = {}) => ({
  id: 'bk-1', businessId: BIZ, storeId: 'store-1', roomId: 'room-1', guestName: 'Guest One', status: 'RESERVED',
  checkInDate: day(0), checkOutDate: day(2), nightCount: 2, pricePerNightCents: 500_000, depositCents: 100_000, totalAmountCents: 1_000_000,
  actualCheckIn: null, actualCheckOut: null, folioCharges: [], room: room(), ...o,
});

function build() {
  const prisma: any = {
    hotelRoom: { findUnique: jest.fn().mockResolvedValue(room()), findFirst: jest.fn().mockResolvedValue(room()), findMany: jest.fn().mockResolvedValue([]), update: jest.fn().mockResolvedValue({}) },
    roomBooking: {
      findUnique: jest.fn().mockResolvedValue(booking()),
      findFirst: jest.fn().mockResolvedValue(booking()),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'bk-new', ...data })),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest.fn().mockResolvedValue({}),
    },
    guestFolioCharge: { findMany: jest.fn().mockResolvedValue([]), create: jest.fn().mockResolvedValue({}), updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    business: { findUnique: jest.fn().mockResolvedValue({ taxType: 'VAT', hotelLevies: '[]' }) },
    item: { findMany: jest.fn().mockResolvedValue([]), findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: `item-${data.name}`, ...data })) },
    cashMovement: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'mv-1', ...data })), findMany: jest.fn().mockResolvedValue([]) },
    $queryRaw: jest.fn().mockResolvedValue([]),
    $transaction: jest.fn(),
  };
  prisma.$transaction.mockImplementation(async (arg: any) => (typeof arg === 'function' ? arg(prisma) : Promise.all(arg)));
  const directSales: any = {
    isEnabled: jest.fn().mockResolvedValue(false),
    createInTx: jest.fn().mockImplementation(async (_tx: any, input: any) => ({
      sale: { id: 'sale-1', receiptNumber: 'NRB-2026-0000001', totalCents: input.lines.reduce((s: number, l: any) => s + l.totalCents, 0) - (input.discountCents ?? 0) },
      isCredit: false,
      payments: input.payments,
    })),
    afterCommit: jest.fn().mockReturnValue({ etims: Promise.resolve({ success: true, controlNumber: 'CU1' }) }),
  };
  const ledger: any = { autoPost: jest.fn().mockResolvedValue(undefined) };
  return { prisma, directSales, ledger, svc: new HospitalityService(prisma, { sendWhatsApp: jest.fn() } as any, {} as any, directSales, ledger) };
}

beforeEach(() => { jest.useFakeTimers().setSystemTime(NOW); });
afterEach(() => { jest.useRealTimers(); });

const NEW = (o: Record<string, any> = {}) => ({ storeId: 'store-1', roomId: 'room-1', guestName: 'Ann', checkInDate: day(0), nightCount: 1, ...o });

describe('createRoomBooking', () => {
  it('lets the dates decide the nights, so a wrong nightCount cannot underbill the stay', async () => {
    const { svc, prisma } = build();
    const b: any = await svc.createRoomBooking(NEW({ checkOutDate: day(3), nightCount: 1 }), BIZ);
    expect(b.nightCount).toBe(3);
    expect(b.totalAmountCents).toBe(1_500_000);
    expect(prisma.roomBooking.create.mock.calls[0][0].data.checkOutDate).toEqual(day(3));
  });

  it('works out the departure from the nights when no departure date is given', async () => {
    const { svc } = build();
    const b: any = await svc.createRoomBooking(NEW({ nightCount: 2 }), BIZ);
    expect(b.checkOutDate).toEqual(day(2));
  });

  it.each([
    ['a departure on or before arrival', { checkOutDate: day(0) }, /at least one night/],
    ['a departure before arrival', { checkOutDate: day(-1) }, /at least one night/],
    ['an invalid arrival', { checkInDate: 'not-a-date' as any }, /not a valid date/],
    ['an invalid departure', { checkOutDate: 'nope' as any }, /not a valid date/],
    ['an arrival well in the past', { checkInDate: day(-10) }, /in the past/],
    ['a stay over a year', { checkOutDate: day(400) }, /at most 365/],
    ['a deposit above the cost of the stay', { nightCount: 1, depositCents: 600_000 }, /deposit is more/],
    ['no guest name', { guestName: '  ' }, BadRequestException],
    ['no nights and no departure', { nightCount: undefined }, BadRequestException],
  ])('rejects %s', async (_label, over, expected) => {
    const { svc, prisma } = build();
    await expect(svc.createRoomBooking(NEW(over as any), BIZ)).rejects.toThrow(expected as any);
    expect(prisma.roomBooking.create).not.toHaveBeenCalled();
  });

  it('refuses a room under maintenance', async () => {
    const { svc, prisma } = build();
    prisma.hotelRoom.findUnique.mockResolvedValue(room({ status: 'MAINTENANCE' }));
    await expect(svc.createRoomBooking(NEW(), BIZ)).rejects.toThrow(/maintenance/);
  });

  it("treats another business's room as missing", async () => {
    const { svc, prisma } = build();
    prisma.hotelRoom.findUnique.mockResolvedValue(room({ businessId: 'other' }));
    await expect(svc.createRoomBooking(NEW(), BIZ)).rejects.toThrow(NotFoundException);
  });

  describe('double booking', () => {
    const held = (o: Record<string, any>) => booking({ id: 'bk-held', guestName: 'Held Guest', ...o });

    it('refuses dates that overlap a reservation', async () => {
      const { svc, prisma } = build();
      prisma.roomBooking.findMany.mockResolvedValue([held({ checkInDate: day(10), checkOutDate: day(12), nightCount: 2 })]);
      await expect(svc.createRoomBooking(NEW({ checkInDate: day(11), checkOutDate: day(13) }), BIZ)).rejects.toThrow(ConflictException);
      await expect(svc.createRoomBooking(NEW({ checkInDate: day(9), checkOutDate: day(11) }), BIZ)).rejects.toThrow(/Held Guest/);
      await expect(svc.createRoomBooking(NEW({ checkInDate: day(9), checkOutDate: day(14) }), BIZ)).rejects.toThrow(ConflictException);
      expect(prisma.roomBooking.create).not.toHaveBeenCalled();
    });

    it('allows back-to-back stays: one guest leaves the day the next arrives', async () => {
      const { svc, prisma } = build();
      prisma.roomBooking.findMany.mockResolvedValue([held({ checkInDate: day(10), checkOutDate: day(12), nightCount: 2 })]);
      await expect(svc.createRoomBooking(NEW({ checkInDate: day(12), checkOutDate: day(14) }), BIZ)).resolves.toBeTruthy();
      await expect(svc.createRoomBooking(NEW({ checkInDate: day(8), checkOutDate: day(10) }), BIZ)).resolves.toBeTruthy();
    });

    it('a guest who has stayed past their date still holds the room', async () => {
      const { svc, prisma } = build();
      prisma.roomBooking.findMany.mockResolvedValue([held({ status: 'CHECKED_IN', checkInDate: day(-5), checkOutDate: day(-1), nightCount: 4 })]);
      await expect(svc.createRoomBooking(NEW({ checkInDate: day(0), checkOutDate: day(1) }), BIZ)).rejects.toThrow(ConflictException);
      await expect(svc.createRoomBooking(NEW({ checkInDate: day(3), checkOutDate: day(4) }), BIZ)).resolves.toBeTruthy();
    });

    it('a booking with no departure date is measured by its nights', async () => {
      const { svc, prisma } = build();
      prisma.roomBooking.findMany.mockResolvedValue([held({ checkInDate: day(10), checkOutDate: null, nightCount: 3 })]);
      await expect(svc.createRoomBooking(NEW({ checkInDate: day(12), checkOutDate: day(13) }), BIZ)).rejects.toThrow(ConflictException);
    });

    it('only looks at bookings that still hold the room, and locks the room while it decides', async () => {
      const { svc, prisma } = build();
      await svc.createRoomBooking(NEW(), BIZ);
      expect(prisma.roomBooking.findMany.mock.calls[0][0].where.status).toEqual({ in: ['RESERVED', 'CHECKED_IN'] });
      expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
    });
  });

  describe('room status', () => {
    it('a guest due today takes the room off the board', async () => {
      const { svc, prisma } = build();
      await svc.createRoomBooking(NEW({ checkInDate: day(0) }), BIZ);
      expect(prisma.hotelRoom.update).toHaveBeenCalledWith({ where: { id: 'room-1' }, data: { status: 'RESERVED' } });
    });
    it('a booking for next month leaves the room bookable now', async () => {
      const { svc, prisma } = build();
      await svc.createRoomBooking(NEW({ checkInDate: day(30), nightCount: 2 }), BIZ);
      expect(prisma.hotelRoom.update).not.toHaveBeenCalled();
    });
  });
});

describe('checkInGuest', () => {
  it('claims a reserved booking and marks the room occupied', async () => {
    const { svc, prisma } = build();
    prisma.roomBooking.findFirst.mockResolvedValueOnce(null).mockResolvedValue(booking({ status: 'CHECKED_IN' }));
    await svc.checkInGuest('bk-1', BIZ);
    expect(prisma.roomBooking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'bk-1', businessId: BIZ, status: 'RESERVED' } }));
    expect(prisma.hotelRoom.update).toHaveBeenCalledWith({ where: { id: 'room-1' }, data: { status: 'OCCUPIED' } });
    expect(prisma.$queryRaw).toHaveBeenCalledTimes(1);
  });

  it('will not check in twice, or a cancelled or finished booking', async () => {
    const { svc, prisma } = build();
    prisma.roomBooking.findUnique.mockResolvedValue(booking({ status: 'CHECKED_IN' }));
    await expect(svc.checkInGuest('bk-1', BIZ)).rejects.toThrow(/already checked in/);
    for (const status of ['CANCELLED', 'CHECKED_OUT']) {
      prisma.roomBooking.findUnique.mockResolvedValue(booking({ status }));
      await expect(svc.checkInGuest('bk-1', BIZ)).rejects.toThrow(/cannot be checked in/);
    }
    expect(prisma.roomBooking.updateMany).not.toHaveBeenCalled();
  });

  it('will not check a guest in more than a day before they are due', async () => {
    const { svc, prisma } = build();
    prisma.roomBooking.findUnique.mockResolvedValue(booking({ checkInDate: day(7), checkOutDate: day(9) }));
    await expect(svc.checkInGuest('bk-1', BIZ)).rejects.toThrow(/too early/);
    expect(prisma.roomBooking.updateMany).not.toHaveBeenCalled();
    // The day before, or the day itself, or a late arrival, is fine.
    prisma.roomBooking.findFirst.mockResolvedValue(null);
    for (const offset of [1, 0, -2]) {
      prisma.roomBooking.findUnique.mockResolvedValue(booking({ checkInDate: day(offset), checkOutDate: day(offset + 2) }));
      await expect(svc.checkInGuest('bk-1', BIZ)).resolves.toBeDefined();
    }
  });

  it('will not put a second guest into an occupied room', async () => {
    const { svc, prisma } = build();
    prisma.roomBooking.findFirst.mockResolvedValue(booking({ id: 'bk-other', guestName: 'Sitting Guest', status: 'CHECKED_IN' }));
    await expect(svc.checkInGuest('bk-1', BIZ)).rejects.toThrow(/still occupied by Sitting Guest/);
    expect(prisma.roomBooking.updateMany).not.toHaveBeenCalled();
  });

  it('refuses a room under maintenance and a lost race', async () => {
    const { svc, prisma } = build();
    prisma.hotelRoom.findFirst.mockResolvedValue(room({ status: 'MAINTENANCE' }));
    await expect(svc.checkInGuest('bk-1', BIZ)).rejects.toThrow(/maintenance/);
    prisma.hotelRoom.findFirst.mockResolvedValue(room());
    prisma.roomBooking.findFirst.mockResolvedValue(null);
    prisma.roomBooking.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.checkInGuest('bk-1', BIZ)).rejects.toThrow(/just changed/);
  });
});

describe('checkOutGuest', () => {
  const checkedIn = (o: Record<string, any> = {}) => booking({ status: 'CHECKED_IN', actualCheckIn: day(0), ...o });
  const lines = (prisma: any) => prisma.guestFolioCharge.create.mock.calls.map((c: any[]) => c[0].data);

  function ready(b: any, charges: any[] = []) {
    const ctx = build();
    ctx.prisma.roomBooking.findUnique.mockResolvedValue(b);
    ctx.prisma.roomBooking.findFirst.mockResolvedValue({ ...b, folioCharges: charges });
    // findMany returns the charges as they stand, plus whatever this call has just posted.
    ctx.prisma.guestFolioCharge.findMany.mockImplementation(async () => [...charges]);
    return ctx;
  }

  it('bills the booked nights and takes the payment, which stays on the folio', async () => {
    const { svc, prisma } = ready(checkedIn({ checkOutDate: day(2), depositCents: 100_000 }));
    const r: any = await svc.checkOutGuest('bk-1', [{ method: 'cash', amountCents: 900_000 }], BIZ, { name: 'Ann' });
    const posted = lines(prisma);
    expect(posted[0]).toEqual(expect.objectContaining({ type: 'ROOM_RATE', quantity: 2, totalCents: 1_000_000, postedBy: 'Ann' }));
    expect(posted[1]).toEqual(expect.objectContaining({ type: 'PAYMENT', amountCents: 900_000, totalCents: 0 }));
    expect(r.folioTotal).toBe(1_000_000);
    expect(r.balanceDue).toBe(900_000);
    expect(r.changeDueCents).toBe(0);
    expect(prisma.hotelRoom.update).toHaveBeenCalledWith({ where: { id: 'room-1' }, data: { status: 'AVAILABLE', housekeepingStatus: 'DIRTY' } });
  });

  it('refuses a check-out the payment does not cover, which rolls the claim back', async () => {
    const { svc, prisma } = ready(checkedIn());
    await expect(svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 1 }], BIZ)).rejects.toThrow(/Take the full payment/);
    await expect(svc.checkOutGuest('bk-1', [], BIZ)).rejects.toThrow(/Take the full payment/);
    // The close happens inside the same transaction as the throw; nothing is recorded as a payment line.
    expect(lines(prisma).some((l: any) => l.type === 'PAYMENT')).toBe(false);
  });

  it('needs no payment when the deposit already covers the bill, and reports the refund owed', async () => {
    const { svc } = ready(checkedIn({ checkOutDate: day(1), nightCount: 1, depositCents: 800_000 }));
    const r: any = await svc.checkOutGuest('bk-1', [], BIZ);
    expect(r.balanceDue).toBe(0);
    expect(r.refundDueCents).toBe(300_000);
  });

  it('gives change when more is tendered than is owed', async () => {
    const { svc } = ready(checkedIn({ checkOutDate: day(1), nightCount: 1, depositCents: 0 }));
    const r: any = await svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 600_000 }], BIZ);
    expect(r.changeDueCents).toBe(100_000);
  });

  it('bills a night for every calendar day past the booked departure', async () => {
    // Booked Nov 2 to Nov 3 (one night); it is Nov 5 in Nairobi, two days after the booked departure.
    const { svc, prisma } = ready(checkedIn({ checkInDate: day(-3), checkOutDate: day(-2), nightCount: 1, depositCents: 0 }));
    const r: any = await svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 1_500_000 }], BIZ);
    const rate = lines(prisma).find((l: any) => l.type === 'ROOM_RATE');
    expect(r.lateNights).toBe(2);
    expect(rate.quantity).toBe(3);
    expect(r.folioTotal).toBe(1_500_000);
    expect(rate.description).toMatch(/includes 2 late nights/);
  });

  it('a guest who leaves on the booked departure day pays no late night, even in the evening', async () => {
    const { svc } = ready(checkedIn({ checkInDate: day(-1), checkOutDate: day(0), nightCount: 1, depositCents: 0 }));
    const r: any = await svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 500_000 }], BIZ);
    expect(r.lateNights).toBe(0);
  });

  it('does not bill room nights twice when some are already on the folio', async () => {
    const { svc, prisma } = ready(checkedIn({ checkOutDate: day(2), depositCents: 0 }), [{ type: 'ROOM_RATE', quantity: 2, totalCents: 1_000_000 }]);
    const r: any = await svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 1_000_000 }], BIZ);
    expect(lines(prisma).some((l: any) => l.type === 'ROOM_RATE')).toBe(false);
    expect(r.folioTotal).toBe(1_000_000);
  });

  it('rejects an unknown payment method, a non-positive amount, and a guest who is not checked in', async () => {
    const { svc, prisma } = ready(checkedIn());
    await expect(svc.checkOutGuest('bk-1', [{ method: 'BARTER', amountCents: 5 }], BIZ)).rejects.toThrow(/Payment method/);
    for (const amountCents of [0, -5, 1.5, NaN]) {
      await expect(svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents }], BIZ)).rejects.toThrow(BadRequestException);
    }
    prisma.roomBooking.findUnique.mockResolvedValue(booking({ status: 'RESERVED' }));
    await expect(svc.checkOutGuest('bk-1', [], BIZ)).rejects.toThrow(/not checked in/);
  });

  it('loses cleanly when the guest was checked out a moment ago', async () => {
    const { svc, prisma } = ready(checkedIn());
    prisma.roomBooking.updateMany.mockResolvedValue({ count: 0 });
    await expect(svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 5_000_000 }], BIZ)).rejects.toThrow(/not checked in/);
    expect(lines(prisma)).toHaveLength(0);
  });

  it('quotes the same bill without changing anything', async () => {
    const { svc, prisma } = ready(checkedIn({ checkOutDate: day(2), depositCents: 100_000 }));
    const q: any = await svc.getCheckoutQuote('bk-1', BIZ);
    expect(q).toEqual(expect.objectContaining({ roomNumber: '101', folioTotal: 1_000_000, balanceDue: 900_000, depositCents: 100_000, lateNights: 0 }));
    expect(prisma.guestFolioCharge.create).not.toHaveBeenCalled();
    expect(prisma.roomBooking.updateMany).not.toHaveBeenCalled();
  });
});

describe('cancelRoomBooking', () => {
  it('cancels a reservation and puts the room back on sale when nothing else holds it', async () => {
    const { svc, prisma } = build();
    prisma.hotelRoom.findFirst.mockResolvedValue(room({ status: 'RESERVED' }));
    prisma.roomBooking.findFirst.mockResolvedValue(null);
    const r = await svc.cancelRoomBooking('bk-1', BIZ);
    expect(r).toEqual({ success: true, depositToRefundCents: 100_000, depositForfeitedCents: 0 });
    expect(prisma.hotelRoom.update).toHaveBeenCalledWith({ where: { id: 'room-1' }, data: { status: 'AVAILABLE' } });
  });

  it('does not free a room another guest is in, or one that has another guest due', async () => {
    const { svc, prisma } = build();
    prisma.hotelRoom.findFirst.mockResolvedValue(room({ status: 'OCCUPIED' }));
    await svc.cancelRoomBooking('bk-1', BIZ);
    expect(prisma.hotelRoom.update).not.toHaveBeenCalled();
    prisma.hotelRoom.findFirst.mockResolvedValue(room({ status: 'RESERVED' }));
    prisma.roomBooking.findFirst.mockResolvedValue(booking({ id: 'bk-2' }));
    await svc.cancelRoomBooking('bk-1', BIZ);
    expect(prisma.hotelRoom.update).not.toHaveBeenCalled();
  });

  it('only a reservation can be cancelled: not a guest in the room, a departed guest, or one already cancelled', async () => {
    const { svc, prisma } = build();
    prisma.roomBooking.findUnique.mockResolvedValue(booking({ status: 'CHECKED_IN' }));
    await expect(svc.cancelRoomBooking('bk-1', BIZ)).rejects.toThrow(/use check-out/);
    for (const status of ['CHECKED_OUT', 'CANCELLED']) {
      prisma.roomBooking.findUnique.mockResolvedValue(booking({ status }));
      await expect(svc.cancelRoomBooking('bk-1', BIZ)).rejects.toThrow(/cannot be cancelled/);
    }
    expect(prisma.roomBooking.updateMany).not.toHaveBeenCalled();
  });
});

describe('getHotelRooms', () => {
  const withBookings = (status: string, bookings: any[]) => ({ ...room({ status }), bookings });
  const b = (id: string, status: string, checkInDate: Date) => ({ id, status, guestName: id, checkInDate });

  it('shows RESERVED only for a guest due today, and AVAILABLE for a later arrival', async () => {
    const { svc, prisma } = build();
    prisma.hotelRoom.findMany.mockResolvedValue([
      { ...withBookings('RESERVED', [b('later', 'RESERVED', day(20))]), id: 'r1' },
      { ...withBookings('AVAILABLE', [b('today', 'RESERVED', day(0))]), id: 'r2' },
      { ...withBookings('AVAILABLE', []), id: 'r3' },
    ]);
    const grid = await svc.getHotelRooms(BIZ, 'store-1');
    expect(Object.fromEntries(grid.map((r: any) => [r.id, r.status]))).toEqual({ r1: 'AVAILABLE', r2: 'RESERVED', r3: 'AVAILABLE' });
  });

  it('puts the guest in the room first, then the soonest arrival, so the card acts on the right booking', async () => {
    const { svc, prisma } = build();
    prisma.hotelRoom.findMany.mockResolvedValue([withBookings('OCCUPIED', [b('next-week', 'RESERVED', day(7)), b('in-room', 'CHECKED_IN', day(-1))])]);
    const [r]: any = await svc.getHotelRooms(BIZ, 'store-1');
    expect(r.status).toBe('OCCUPIED');
    expect(r.bookings.map((x: any) => x.id)).toEqual(['in-room', 'next-week']);
  });

  it('filters on the status the desk sees', async () => {
    const { svc, prisma } = build();
    prisma.hotelRoom.findMany.mockResolvedValue([
      { ...withBookings('RESERVED', [b('later', 'RESERVED', day(20))]), id: 'r1' },
      { ...withBookings('OCCUPIED', [b('in-room', 'CHECKED_IN', day(-1))]), id: 'r2' },
    ]);
    expect((await svc.getHotelRooms(BIZ, 'store-1', 'AVAILABLE')).map((r: any) => r.id)).toEqual(['r1']);
  });
});

describe('addFolioCharge discounts', () => {
  const open = () => { const c = build(); c.prisma.roomBooking.findUnique.mockResolvedValue(booking({ status: 'CHECKED_IN' })); return c; };
  const D = { type: 'DISCOUNT', description: 'Goodwill', amountCents: 20_000 };

  it('lets a manager take money off the bill, stored as a negative', async () => {
    const { svc, prisma } = open();
    prisma.guestFolioCharge.findMany.mockResolvedValue([{ totalCents: 100_000 }]);
    await svc.addFolioCharge('bk-1', D, BIZ, 'Grace', 'MANAGER');
    expect(prisma.guestFolioCharge.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ amountCents: -20_000, totalCents: -20_000, postedBy: 'Grace' }));
  });

  it('refuses anyone below manager, and a discount bigger than the bill', async () => {
    const { svc, prisma } = open();
    prisma.guestFolioCharge.findMany.mockResolvedValue([{ totalCents: 100_000 }]);
    await expect(svc.addFolioCharge('bk-1', D, BIZ, 'Peter', 'CASHIER')).rejects.toThrow(ForbiddenException);
    await expect(svc.addFolioCharge('bk-1', { ...D, amountCents: 100_001 }, BIZ, 'Grace', 'MANAGER')).rejects.toThrow(/larger than the folio/);
    expect(prisma.guestFolioCharge.create).not.toHaveBeenCalled();
  });

  it('ordinary charges stay positive and are open to the desk', async () => {
    const { svc, prisma } = open();
    await svc.addFolioCharge('bk-1', { type: 'MINIBAR', description: 'Water', amountCents: 5_000, quantity: 2 }, BIZ, 'Peter', 'CASHIER');
    expect(prisma.guestFolioCharge.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ amountCents: 5_000, totalCents: 10_000 }));
    await expect(svc.addFolioCharge('bk-1', { type: 'MINIBAR', description: 'x', amountCents: -5, quantity: 1 }, BIZ, 'Peter', 'CASHIER')).rejects.toThrow(BadRequestException);
  });
});

describe('hotel levies', () => {
  const checkedIn = (o: Record<string, any> = {}) => booking({ status: 'CHECKED_IN', actualCheckIn: day(0), checkOutDate: day(2), depositCents: 0, ...o });
  function ready(levies: any[], taxType = 'VAT', charges: any[] = []) {
    const ctx = build();
    ctx.prisma.business.findUnique.mockResolvedValue({ taxType, hotelLevies: JSON.stringify(levies) });
    ctx.prisma.roomBooking.findUnique.mockResolvedValue(checkedIn());
    ctx.prisma.roomBooking.findFirst.mockResolvedValue({ ...checkedIn(), folioCharges: charges });
    return ctx;
  }

  it('charges nothing extra when the hotel lists no levies', async () => {
    const { svc } = ready([]);
    const q: any = await svc.getCheckoutQuote('bk-1', BIZ);
    expect(q.levies).toEqual([]);
    expect(q.folioTotal).toBe(1_000_000);
  });

  it('works a room-only levy on the VAT-exclusive room value, as its own line', async () => {
    const { svc, prisma } = ready([{ name: 'Tourism levy', ratePct: 2, base: 'ROOM' }]);
    const q: any = await svc.getCheckoutQuote('bk-1', BIZ);
    // 1,000,000 less its VAT (1,000,000 x 16/116 = 137,931) is 862,069; 2% of that is 17,241.
    expect(q.levyCents).toBe(17_241);
    expect(q.folioTotal).toBe(1_017_241);
    const r: any = await svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 1_017_241 }], BIZ);
    const posted = prisma.guestFolioCharge.create.mock.calls.map((c: any[]) => c[0].data);
    expect(posted.find((l: any) => l.type === 'LEVY')).toEqual(expect.objectContaining({ totalCents: 17_241, description: 'Tourism levy (2%)' }));
    expect(r.levies).toHaveLength(1);
  });

  it('a levy on everything includes the charges and shares a discount first', async () => {
    const charges = [
      { type: 'FOOD_BEVERAGE', quantity: 1, totalCents: 116_000 },
      { type: 'DISCOUNT', quantity: 1, totalCents: -116_000 },
    ];
    const { svc } = ready([{ name: 'Catering levy', ratePct: 10, base: 'ALL' }], 'VAT', charges);
    const q: any = await svc.getCheckoutQuote('bk-1', BIZ);
    // Base lines: food 116,000 + room 1,000,000; discount 116,000 shared by value; net 1,000,000 (all VAT-inclusive).
    // Ex-VAT: 1,000,000 x 100/116 = 862,069; 10% = 86,207.
    expect(q.levyCents).toBe(86_207);
  });

  it('a business that is not VAT registered levies on the full value', async () => {
    const { svc } = ready([{ name: 'Tourism levy', ratePct: 2, base: 'ROOM' }], 'NONE');
    const q: any = await svc.getCheckoutQuote('bk-1', BIZ);
    expect(q.levyCents).toBe(20_000);
  });
});

describe('check-out invoice', () => {
  const checkedIn = (o: Record<string, any> = {}) => booking({ status: 'CHECKED_IN', actualCheckIn: day(0), checkOutDate: day(2), depositCents: 0, guestKraPin: 'A123456789Z', guestPhone: '0711000000', ...o });
  function ready(b: any, charges: any[] = [], enabled = true) {
    const ctx = build();
    ctx.directSales.isEnabled.mockResolvedValue(enabled);
    ctx.prisma.roomBooking.findUnique.mockResolvedValue(b);
    ctx.prisma.roomBooking.findFirst.mockResolvedValue({ ...b, folioCharges: charges });
    return ctx;
  }

  it('does nothing new for a business that has not switched over', async () => {
    const { svc, directSales, prisma } = ready(checkedIn(), [], false);
    const r: any = await svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 1_000_000 }], BIZ);
    expect(directSales.createInTx).not.toHaveBeenCalled();
    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    expect(r.saleId).toBeUndefined();
  });

  it('makes one invoice from the room nights and every charge, carrying the guest and their PIN', async () => {
    const charges = [{ type: 'MINIBAR', description: 'Minibar', amountCents: 20_000, quantity: 2, totalCents: 40_000 }];
    const { svc, directSales, prisma } = ready(checkedIn(), charges);
    const r: any = await svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 1_040_000 }], BIZ, { id: 'u1', name: 'Ann', role: 'CASHIER' });
    expect(directSales.createInTx).toHaveBeenCalledTimes(1);
    const input = directSales.createInTx.mock.calls[0][1];
    expect(input).toEqual(expect.objectContaining({ source: 'HOTEL', cashierId: 'u1', customerName: 'Guest One', buyerKraPin: 'A123456789Z', storeId: 'store-1' }));
    expect(input.lines.map((l: any) => [l.quantity, l.totalCents, l.taxClass])).toEqual(expect.arrayContaining([[2, 1_000_000, 'B'], [2, 40_000, 'B']]));
    expect(input.lines).toHaveLength(2);
    expect(input.payments).toEqual([{ method: 'CASH', amountCents: 1_040_000 }]);
    expect(prisma.roomBooking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { saleId: 'sale-1' } }));
    expect(prisma.guestFolioCharge.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { saleId: 'sale-1' } }));
    expect(r).toEqual(expect.objectContaining({ saleId: 'sale-1', receiptNumber: 'NRB-2026-0000001', etims: expect.objectContaining({ controlNumber: 'CU1' }) }));
  });

  it('a levy is a non-VAT line and a discount is shared across the sale', async () => {
    const charges = [
      { type: 'FOOD_BEVERAGE', description: 'Dinner', amountCents: 100_000, quantity: 1, totalCents: 100_000 },
      { type: 'DISCOUNT', description: 'Goodwill', amountCents: -10_000, quantity: 1, totalCents: -10_000 },
    ];
    const { svc, directSales, prisma } = ready(checkedIn(), charges);
    prisma.business.findUnique.mockResolvedValue({ taxType: 'VAT', hotelLevies: JSON.stringify([{ name: 'Tourism levy', ratePct: 2, base: 'ROOM' }]) });
    await svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 1_200_000 }], BIZ);
    const input = directSales.createInTx.mock.calls[0][1];
    expect(input.discountCents).toBe(10_000);
    const levy = input.lines.find((l: any) => l.name.startsWith('Tourism levy'));
    expect(levy).toEqual(expect.objectContaining({ taxClass: 'D' }));
    expect(input.lines.some((l: any) => l.totalCents < 0)).toBe(false);
  });

  it('pays the bill with the deposit, and the guest tops up the rest', async () => {
    const { svc, directSales } = ready(checkedIn({ depositCents: 400_000 }));
    await svc.checkOutGuest('bk-1', [{ method: 'MPESA', amountCents: 600_000 }], BIZ);
    expect(directSales.createInTx.mock.calls[0][1].payments).toEqual([
      { method: 'DEPOSIT', amountCents: 400_000 },
      { method: 'MPESA', amountCents: 600_000 },
    ]);
  });

  it('a deposit larger than the bill is applied up to the bill and the rest paid back out of the register', async () => {
    const { svc, directSales, prisma, ledger } = ready(checkedIn({ checkOutDate: day(1), nightCount: 1, depositCents: 800_000 }));
    prisma.cashMovement.findMany.mockResolvedValue([{ method: 'MPESA', amountCents: 800_000 }]);
    const r: any = await svc.checkOutGuest('bk-1', [], BIZ, { id: 'u1', name: 'Ann' });
    expect(directSales.createInTx.mock.calls[0][1].payments).toEqual([{ method: 'DEPOSIT', amountCents: 500_000 }]);
    expect(prisma.cashMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'PAY_OUT', method: 'MPESA', amountCents: 300_000, reason: 'HOTEL_DEPOSIT_REFUND', bookingId: 'bk-1', cashierId: 'u1' }),
    });
    expect(r.refundMethod).toBe('MPESA');
    await jest.advanceTimersByTimeAsync(0);
    expect(ledger.autoPost).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'HOTEL_DEPOSIT', reference: 'DEP-mv-1' }));
  });

  it('a failed invoice rolls the whole check-out back', async () => {
    const { svc, directSales } = ready(checkedIn());
    directSales.createInTx.mockRejectedValue(new Error('db down'));
    await expect(svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 1_000_000 }], BIZ)).rejects.toThrow('db down');
    expect(directSales.afterCommit).not.toHaveBeenCalled();
  });

  it('still returns the check-out when KRA is slow, without the QR', async () => {
    jest.useRealTimers();
    const { svc, directSales } = ready(checkedIn());
    directSales.afterCommit.mockReturnValue({ etims: new Promise(() => {}) });
    jest.useFakeTimers().setSystemTime(NOW);
    const pending = svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 1_000_000 }], BIZ);
    await jest.advanceTimersByTimeAsync(6_000);
    const r: any = await pending;
    expect(r.saleId).toBe('sale-1');
    expect(r.etims).toBeNull();
  });
});

describe('deposit register', () => {
  const NEW = (o: Record<string, any> = {}) => ({ storeId: 'store-1', roomId: 'room-1', guestName: 'Ann', checkInDate: day(0), nightCount: 2, depositCents: 200_000, ...o });

  it('writes a pay-in and posts a ledger entry when a deposit is taken on a switched-over business', async () => {
    const { svc, prisma, directSales, ledger } = build();
    directSales.isEnabled.mockResolvedValue(true);
    await svc.createRoomBooking(NEW({ depositMethod: 'mpesa', guestKraPin: 'a123456789z' }), BIZ, { id: 'u1', name: 'Ann' });
    expect(prisma.cashMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'PAY_IN', method: 'MPESA', amountCents: 200_000, reason: 'HOTEL_DEPOSIT', cashierId: 'u1', bookingId: 'bk-new' }),
    });
    expect(prisma.roomBooking.create.mock.calls[0][0].data.guestKraPin).toBe('A123456789Z');
    await jest.advanceTimersByTimeAsync(0);
    expect(ledger.autoPost).toHaveBeenCalledWith(expect.objectContaining({ sourceType: 'HOTEL_DEPOSIT', lines: expect.arrayContaining([expect.objectContaining({ accountCode: '2300', creditCents: 200_000 })]) }));
  });

  it('records nothing in the register for a business that has not switched over, or with no deposit', async () => {
    const { svc, prisma, directSales } = build();
    await svc.createRoomBooking(NEW(), BIZ);
    directSales.isEnabled.mockResolvedValue(true);
    await svc.createRoomBooking(NEW({ depositCents: 0 }), BIZ);
    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
  });

  it('rejects a deposit method that is not a way to pay, and a bad KRA PIN', async () => {
    const { svc } = build();
    await expect(svc.createRoomBooking(NEW({ depositMethod: 'BARTER' }), BIZ)).rejects.toThrow(/Deposit method/);
    await expect(svc.createRoomBooking(NEW({ guestKraPin: 'nope' }), BIZ)).rejects.toThrow(BadRequestException);
  });

  it('takes a further deposit on an open booking, and only on one', async () => {
    const { svc, prisma, directSales } = build();
    directSales.isEnabled.mockResolvedValue(true);
    await svc.addDeposit('bk-1', { amountCents: 50_000, method: 'CASH' }, BIZ, { id: 'u1', name: 'Ann' });
    expect(prisma.roomBooking.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: { depositCents: { increment: 50_000 } } }));
    expect(prisma.cashMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'PAY_IN', method: 'CASH', amountCents: 50_000 }) });
    for (const status of ['CHECKED_OUT', 'CANCELLED']) {
      prisma.roomBooking.findUnique.mockResolvedValue(booking({ status }));
      await expect(svc.addDeposit('bk-1', { amountCents: 1 }, BIZ)).rejects.toThrow(/reserved or checked-in/);
    }
    for (const amountCents of [0, -1, 1.5]) {
      prisma.roomBooking.findUnique.mockResolvedValue(booking());
      await expect(svc.addDeposit('bk-1', { amountCents }, BIZ)).rejects.toThrow(BadRequestException);
    }
  });

  it('cancelling pays the deposit back the way it came in', async () => {
    const { svc, prisma, directSales } = build();
    directSales.isEnabled.mockResolvedValue(true);
    prisma.cashMovement.findMany.mockResolvedValue([{ method: 'CARD', amountCents: 100_000 }]);
    const r = await svc.cancelRoomBooking('bk-1', BIZ, { id: 'u1', name: 'Ann', role: 'CASHIER' });
    expect(prisma.cashMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'PAY_OUT', method: 'CARD', amountCents: 100_000, reason: 'HOTEL_DEPOSIT_REFUND' }) });
    expect(r).toEqual({ success: true, depositToRefundCents: 100_000, depositForfeitedCents: 0 });
  });

  it('keeping the deposit is a manager decision and moves no money', async () => {
    const { svc, prisma, directSales, ledger } = build();
    directSales.isEnabled.mockResolvedValue(true);
    await expect(svc.cancelRoomBooking('bk-1', BIZ, { id: 'u1', name: 'Peter', role: 'CASHIER' }, { forfeit: true })).rejects.toThrow(ForbiddenException);
    expect(prisma.roomBooking.updateMany).not.toHaveBeenCalled();
    const r = await svc.cancelRoomBooking('bk-1', BIZ, { id: 'u2', name: 'Grace', role: 'MANAGER' }, { forfeit: true });
    expect(prisma.cashMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'FORFEIT', amountCents: 100_000, reason: 'HOTEL_DEPOSIT_FORFEIT' }) });
    expect(r).toEqual({ success: true, depositToRefundCents: 0, depositForfeitedCents: 100_000 });
    await jest.advanceTimersByTimeAsync(0);
    expect(ledger.autoPost).toHaveBeenCalledWith(expect.objectContaining({ lines: expect.arrayContaining([expect.objectContaining({ accountCode: '4300', creditCents: 100_000 })]) }));
  });

  it('refuses to hand-post a charge that only check-out may write', async () => {
    const { svc, prisma } = build();
    prisma.roomBooking.findUnique.mockResolvedValue(booking({ status: 'CHECKED_IN' }));
    for (const type of ['ROOM_RATE', 'LEVY', 'PAYMENT', 'whatever']) {
      await expect(svc.addFolioCharge('bk-1', { type, description: 'x', amountCents: 100 }, BIZ, 'Peter', 'MANAGER')).rejects.toThrow(/Charge type/);
    }
  });
});

describe('sales charged to the room', () => {
  const stay = (o: Record<string, any> = {}) => booking({ status: 'CHECKED_IN', actualCheckIn: day(0), checkOutDate: day(2), depositCents: 0, ...o });
  const sold = { type: 'POS_SALE', description: 'Charged to room from sale NRB-1', amountCents: 200_000, quantity: 1, totalCents: 200_000, saleId: 'sale-pos' };
  function ready(b: any, charges: any[], enabled = true) {
    const ctx = build();
    ctx.directSales.isEnabled.mockResolvedValue(enabled);
    ctx.prisma.roomBooking.findUnique.mockResolvedValue(b);
    ctx.prisma.roomBooking.findFirst.mockResolvedValue({ ...b, folioCharges: charges });
    return ctx;
  }
  const journal = (ledger: any, i = 0) => ledger.autoPost.mock.calls.filter((c: any) => c[0].sourceType === 'HOTEL_ROOM_CHARGE')[i]?.[0];

  it('are collected at check-out but not invoiced a second time', async () => {
    const { svc, directSales, prisma } = ready(stay(), [sold]);
    const r: any = await svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 1_200_000 }], BIZ, { id: 'u1', name: 'Ann' });
    const input = directSales.createInTx.mock.calls[0][1];
    expect(input.lines).toHaveLength(1);
    expect(input.lines[0].totalCents).toBe(1_000_000);
    expect(input.payments).toEqual([{ method: 'CASH', amountCents: 1_000_000 }]);
    expect(prisma.guestFolioCharge.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ type: { not: 'POS_SALE' } }) }));
    expect(r.roomChargesCents).toBe(200_000);
  });

  it('the cash for them goes into the drawer and clears the receivable', async () => {
    const { svc, prisma, ledger } = ready(stay(), [sold]);
    await svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 1_200_000 }], BIZ, { id: 'u1', name: 'Ann' });
    expect(prisma.cashMovement.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ kind: 'PAY_IN', method: 'CASH', amountCents: 200_000, reason: 'HOTEL_ROOM_CHARGE_PAID', bookingId: 'bk-1', cashierId: 'u1', reference: 'NRB-2026-0000001' }),
    });
    await jest.advanceTimersByTimeAsync(0);
    expect(journal(ledger)).toEqual(expect.objectContaining({
      reference: 'ROOMSET-bk-1-0',
      lines: [
        { accountCode: '1000', accountName: 'Cash on Hand', debitCents: 200_000, creditCents: 0 },
        { accountCode: '1200', accountName: 'Accounts Receivable', debitCents: 0, creditCents: 200_000 },
      ],
    }));
  });

  it('a deposit pays them before the invoice, as a transfer between liability and receivable', async () => {
    const { svc, directSales, prisma, ledger } = ready(stay({ depositCents: 300_000 }), [sold]);
    await svc.checkOutGuest('bk-1', [{ method: 'CASH', amountCents: 900_000 }], BIZ);
    expect(directSales.createInTx.mock.calls[0][1].payments).toEqual([{ method: 'DEPOSIT', amountCents: 100_000 }, { method: 'CASH', amountCents: 900_000 }]);
    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(0);
    expect(journal(ledger).lines.map((l: any) => [l.accountCode, l.debitCents, l.creditCents])).toEqual([['2300', 200_000, 0], ['1200', 0, 200_000]]);
  });

  it('are still collected, and the receivable cleared, for a business that has not switched over', async () => {
    const { svc, directSales, prisma, ledger } = ready(stay({ depositCents: 100_000 }), [sold], false);
    await svc.checkOutGuest('bk-1', [{ method: 'MPESA', amountCents: 1_100_000 }], BIZ);
    expect(directSales.createInTx).not.toHaveBeenCalled();
    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(0);
    // The deposit is not in the books for such a business, so only the real money settles the receivable.
    expect(journal(ledger).lines[0]).toEqual(expect.objectContaining({ accountCode: '1010', debitCents: 200_000 }));
    expect(journal(ledger, 1)).toBeUndefined();
  });

  it('are not part of what a levy or a stay discount works on', async () => {
    const levies = JSON.stringify([{ name: 'Tourism levy', ratePct: 2, base: 'ALL' }]);
    const without = ready(stay(), []);
    without.prisma.business.findUnique.mockResolvedValue({ taxType: 'VAT', hotelLevies: levies });
    const withSale = ready(stay(), [sold]);
    withSale.prisma.business.findUnique.mockResolvedValue({ taxType: 'VAT', hotelLevies: levies });
    const a: any = await without.svc.getCheckoutQuote('bk-1', BIZ);
    const b: any = await withSale.svc.getCheckoutQuote('bk-1', BIZ);
    expect(b.levyCents).toBe(a.levyCents);
    expect(b.folioTotal).toBe(a.folioTotal + 200_000);
    expect(b.roomChargesCents).toBe(200_000);
  });

  it('a stay discount is capped by the stay, not by sales already invoiced', async () => {
    const { svc, prisma } = ready(stay(), [sold]);
    prisma.guestFolioCharge.findMany.mockResolvedValue([{ totalCents: 100_000 }]);
    await expect(svc.addFolioCharge('bk-1', { type: 'DISCOUNT', description: 'x', amountCents: 150_000 }, BIZ, 'Ann', 'MANAGER')).rejects.toThrow(/larger than the folio/);
    expect(prisma.guestFolioCharge.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { bookingId: 'bk-1', type: { not: 'POS_SALE' } } }));
  });

  it('cannot be deleted from the folio by hand', async () => {
    const { svc, prisma } = ready(stay(), []);
    prisma.guestFolioCharge.findUnique = jest.fn().mockResolvedValue({ id: 'c1', businessId: BIZ, type: 'POS_SALE', booking: { status: 'CHECKED_IN' } });
    prisma.guestFolioCharge.delete = jest.fn();
    await expect(svc.removeFolioCharge('c1', BIZ)).rejects.toThrow(/Void the sale/);
    expect(prisma.guestFolioCharge.delete).not.toHaveBeenCalled();
  });

  it('a room-service order opened for a booking no longer posts a zero line to the folio', async () => {
    const { svc, prisma } = ready(stay(), []);
    prisma.store = { findUnique: jest.fn().mockResolvedValue({ id: 'store-1', businessId: BIZ }) };
    prisma.user = { findFirst: jest.fn().mockResolvedValue({ id: 'w1' }) };
    prisma.order = { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'o1', ...data })) };
    const order: any = await svc.createOrder({ offlineId: 'x', businessId: BIZ, storeId: 'store-1', waiterId: 'w1', roomBookingId: 'bk-1' });
    expect(prisma.guestFolioCharge.create).not.toHaveBeenCalled();
    expect(order.roomNumber).toBe('101');
  });
});


describe('deposits taken before the register existed', () => {
  const stay = (o: Record<string, any> = {}) => booking({ status: 'CHECKED_IN', actualCheckIn: day(0), checkOutDate: day(1), nightCount: 1, depositCents: 800_000, ...o });
  function ready(b: any) {
    const ctx = build();
    ctx.directSales.isEnabled.mockResolvedValue(true);
    ctx.prisma.roomBooking.findUnique.mockResolvedValue(b);
    ctx.prisma.roomBooking.findFirst.mockResolvedValue({ ...b, folioCharges: [] });
    ctx.prisma.cashMovement.findMany.mockResolvedValue([]); // only an OPENING row exists: no HOTEL_DEPOSIT row says how it was paid
    return ctx;
  }

  it('check-out will not guess cash: the desk must say how the change is paid back', async () => {
    const { svc, prisma, directSales } = ready(stay());
    await expect(svc.checkOutGuest('bk-1', [], BIZ, { id: 'u1', name: 'Ann' })).rejects.toThrow(/say how it is being paid back/);
    expect(prisma.cashMovement.create).not.toHaveBeenCalled();
    expect(directSales.afterCommit).not.toHaveBeenCalled();
  });

  it('...and pays it back the way the desk says', async () => {
    const { svc, prisma } = ready(stay());
    const r: any = await svc.checkOutGuest('bk-1', [], BIZ, { id: 'u1', name: 'Ann' }, { refundMethod: 'mpesa' });
    expect(prisma.cashMovement.create).toHaveBeenCalledWith({ data: expect.objectContaining({ kind: 'PAY_OUT', method: 'MPESA', amountCents: 300_000, reason: 'HOTEL_DEPOSIT_REFUND' }) });
    expect(r.refundMethod).toBe('MPESA');
    await expect(ready(stay()).svc.checkOutGuest('bk-1', [], BIZ, { id: 'u1' }, { refundMethod: 'barter' })).rejects.toThrow(/Refund method/);
  });

  it('a recorded way of paying wins over anything the desk sends', async () => {
    const { svc, prisma } = ready(stay());
    prisma.cashMovement.findMany.mockResolvedValue([{ method: 'BANK', amountCents: 800_000 }]);
    await svc.checkOutGuest('bk-1', [], BIZ, { id: 'u1' }, { refundMethod: 'CASH' });
    expect(prisma.cashMovement.create.mock.calls[0][0].data.method).toBe('BANK');
  });

  it('cancelling asks the same, but keeping the deposit does not (no money moves)', async () => {
    const reserved = booking({ status: 'RESERVED', depositCents: 200_000 });
    const a = ready(reserved);
    await expect(a.svc.cancelRoomBooking('bk-1', BIZ, { id: 'u1', name: 'Ann', role: 'CASHIER' })).rejects.toThrow(/say how it is being paid back/);
    const b = ready(reserved);
    const r = await b.svc.cancelRoomBooking('bk-1', BIZ, { id: 'u1', name: 'Ann', role: 'CASHIER' }, { refundMethod: 'CARD' });
    expect(r.depositToRefundCents).toBe(200_000);
    expect(b.prisma.cashMovement.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ kind: 'PAY_OUT', method: 'CARD' }));
    const c = ready(reserved);
    await c.svc.cancelRoomBooking('bk-1', BIZ, { id: 'm1', name: 'Grace', role: 'MANAGER' }, { forfeit: true });
    expect(c.prisma.cashMovement.create.mock.calls[0][0].data).toEqual(expect.objectContaining({ kind: 'FORFEIT', method: 'OPENING' }));
  });

  it('the quote says whether the way the deposit was paid is on record', async () => {
    const unknown = ready(stay());
    expect((await unknown.svc.getCheckoutQuote('bk-1', BIZ) as any).depositMethod).toBeNull();
    const known = ready(stay());
    known.prisma.cashMovement.findMany.mockResolvedValue([{ method: 'MPESA', amountCents: 800_000 }]);
    expect((await known.svc.getCheckoutQuote('bk-1', BIZ) as any).depositMethod).toBe('MPESA');
  });
});

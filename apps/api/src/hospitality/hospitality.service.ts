import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { v4 as uuidv4 } from 'uuid';
import { randomUUID } from 'crypto';

@Injectable()
export class HospitalityService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

  async getTables(storeId: string, status?: string) {
    const tables = await this.prisma.table.findMany({
      where: { storeId, ...(status && { status }) },
      orderBy: { number: 'asc' },
      include: {
        orders: {
          where: { status: { in: ['OPEN', 'BILL_REQUESTED'] } },
          include: {
            kots: {
              where: { status: { in: ['PENDING', 'IN_PROGRESS', 'READY'] } },
              select: { id: true, status: true, type: true },
            },
          },
        },
      },
    });

    return tables.map((t) => {
      const openOrder = t.orders[0] ?? null;
      const kots = t.orders.flatMap((o) => o.kots);
      return {
        ...t,
        orders: undefined,
        currentOrderId: openOrder?.id ?? null,
        hasReadyKOT: kots.some((k) => k.status === 'READY'),
        hasPendingKOT: kots.some((k) => k.status === 'PENDING' || k.status === 'IN_PROGRESS'),
        activeKOTCount: kots.length,
      };
    });
  }

  async createTable(data: { storeId: string; number: string; capacity: number; floor?: string }) {
    return this.prisma.table.create({
      data: {
        storeId: data.storeId,
        number: data.number,
        capacity: data.capacity,
        floor: data.floor,
        status: 'AVAILABLE',
      },
    });
  }

  async updateTable(id: string, data: { number?: string; capacity?: number; floor?: string | null }) {
    return this.prisma.table.update({
      where: { id },
      data: {
        ...(data.number !== undefined && { number: data.number }),
        ...(data.capacity !== undefined && { capacity: data.capacity }),
        ...(data.floor !== undefined && { floor: data.floor || null }),
      },
    });
  }

  async deleteTable(id: string) {
    const table = await this.prisma.table.findUnique({ where: { id } });
    if (!table) throw new NotFoundException('Table not found');
    if (table.status !== 'AVAILABLE') {
      throw new BadRequestException('Cannot delete a table that is currently occupied or reserved');
    }
    return this.prisma.table.delete({ where: { id } });
  }

  async updateTableStatus(tableId: string, status: string) {
    return this.prisma.table.update({
      where: { id: tableId },
      data: { status },
    });
  }

  async createOrder(data: {
    offlineId: string;
    businessId: string;
    storeId: string;
    tableId?: string;
    roomNumber?: string;
    waiterId: string;
  }) {
    const order = await this.prisma.order.create({
      data: { ...data, status: 'OPEN' },
    });

    if (data.tableId) {
      await this.updateTableStatus(data.tableId, 'OCCUPIED');
    }

    return order;
  }

  async addOrderItems(orderId: string, items: Array<{
    itemId: string;
    name: string;
    quantity: number;
    unitPriceCents: number;
    specialInstructions?: string;
    modifiers?: Array<{ name: string; priceCents?: number } | string>;
  }>) {
    return Promise.all(
      items.map(item => {
        // Support both legacy string[] modifiers and new priced modifier objects
        const modifierTotal = Array.isArray(item.modifiers)
          ? item.modifiers.reduce((s: number, m: any) => s + (typeof m === 'object' ? (m.priceCents ?? 0) : 0), 0)
          : 0;
        const totalCents = (item.unitPriceCents + modifierTotal) * item.quantity;
        return this.prisma.orderItem.create({
          data: {
            orderId,
            itemId: item.itemId,
            name: item.name,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalCents,
            specialInstructions: item.specialInstructions,
            modifiers: item.modifiers ? JSON.stringify(item.modifiers) : null,
          },
        });
      })
    );
  }

  async removeOrderItems(orderId: string, itemIds: string[]) {
    await this.prisma.orderItem.deleteMany({
      where: { orderId, id: { in: itemIds } },
    });
  }

  async cancelOrder(orderId: string) {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED' },
    }).catch(() => null);
    if (order?.tableId) {
      await this.prisma.table.update({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE' },
      }).catch(() => null);
    }
    return { success: true };
  }

  async requestBill(orderId: string) {
    const order = await this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'BILL_REQUESTED' },
    });
    // Also update the table status so the floor plan shows Bill Due badge
    if (order.tableId) {
      await this.prisma.table.update({
        where: { id: order.tableId },
        data: { status: 'BILL_REQUESTED' },
      });
    }
    return order;
  }

  async getOrderDetails(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        table: true,
        waiter: true,
        kots: {
          where: { status: { not: 'SERVED' } },
          select: { id: true, status: true, type: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  async getKitchenOrders(storeId: string) {
    return this.prisma.order.findMany({
      where: { storeId, status: 'OPEN' },
      include: { items: true, table: true, waiter: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async mergeTables(tableIds: string[], targetTableId: string) {
    const orders = await this.prisma.order.findMany({
      where: { tableId: { in: tableIds }, status: 'OPEN' },
    });

    if (orders.length === 0) return;

    const targetOrder = orders.find(o => o.tableId === targetTableId) || orders[0];

    for (const order of orders) {
      if (order.id === targetOrder.id) continue;

      await this.prisma.orderItem.updateMany({
        where: { orderId: order.id },
        data: { orderId: targetOrder.id },
      });

      await this.prisma.order.delete({ where: { id: order.id } });
    }

    for (const tableId of tableIds) {
      if (tableId !== targetTableId) {
        await this.updateTableStatus(tableId, 'AVAILABLE');
      }
    }

    return this.getOrderDetails(targetOrder.id);
  }

  async splitBill(orderId: string, splits: Array<{ itemIds: string[] }>) {
    const order = await this.getOrderDetails(orderId);
    const newOrders = [];

    for (const split of splits) {
      const newOrder = await this.prisma.order.create({
        data: {
          offlineId: `${order.offlineId}-${Date.now()}`,
          businessId: order.businessId,
          storeId: order.storeId,
          waiterId: order.waiterId,
          status: 'BILL_REQUESTED',
        },
      });

      await this.prisma.orderItem.updateMany({
        where: { orderId: order.id, id: { in: split.itemIds } },
        data: { orderId: newOrder.id },
      });

      newOrders.push(newOrder);
    }

    const remaining = await this.prisma.orderItem.count({
      where: { orderId: order.id },
    });

    if (remaining === 0) {
      await this.prisma.order.delete({ where: { id: orderId } });
    }

    return newOrders;
  }

  async transferTable(orderId: string, newTableId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
    });

    if (!order) throw new BadRequestException('Order not found');

    if (order.tableId) {
      await this.updateTableStatus(order.tableId, 'AVAILABLE');
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { tableId: newTableId },
    });

    await this.updateTableStatus(newTableId, 'OCCUPIED');

    return this.getOrderDetails(orderId);
  }

  async createReservation(data: {
    tableId: string;
    customerName: string;
    customerPhone?: string;
    partySize: number;
    reservationTime: Date;
    duration?: number;
    notes?: string;
  }) {
    const existing = await this.prisma.tableReservation.findFirst({
      where: {
        tableId: data.tableId,
        status: 'CONFIRMED',
        reservationTime: {
          gte: new Date(data.reservationTime.getTime() - (data.duration || 120) * 60000),
          lte: new Date(data.reservationTime.getTime() + (data.duration || 120) * 60000),
        },
      },
    });

    if (existing) {
      throw new BadRequestException('Table already reserved for this time slot');
    }

    return this.prisma.tableReservation.create({
      data: {
        tableId: data.tableId,
        customerName: data.customerName,
        customerPhone: data.customerPhone,
        partySize: data.partySize,
        reservationTime: data.reservationTime,
        duration: data.duration || 120,
        notes: data.notes,
        status: 'CONFIRMED',
      },
    });
  }

  async getReservations(storeId: string, date?: Date) {
    const startOfDay = date ? new Date(date.setHours(0, 0, 0, 0)) : new Date();
    const endOfDay = new Date(startOfDay);
    endOfDay.setHours(23, 59, 59, 999);

    return this.prisma.tableReservation.findMany({
      where: {
        table: { storeId },
        reservationTime: { gte: startOfDay, lte: endOfDay },
        status: { in: ['CONFIRMED', 'SEATED'] },
      },
      include: { table: true },
      orderBy: { reservationTime: 'asc' },
    });
  }

  async createKOT(orderId: string, type: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { kots: true },
    });

    if (!order) throw new BadRequestException('Order not found');

    const kotNumber = order.kots.length + 1;

    // Calculate estimated prep minutes from order items
    const items = await this.prisma.orderItem.findMany({
      where: { orderId },
      include: { item: { select: { prepTimeMinutes: true } } },
    });
    const estimatedPrepMinutes = items.length > 0
      ? Math.max(...items.map(i => i.item?.prepTimeMinutes ?? 5))
      : 10;

    return this.prisma.kOT.create({
      data: {
        orderId,
        kotNumber,
        type,
        status: 'PENDING',
        printedAt: new Date(),
        estimatedPrepMinutes,
      },
    });
  }

  async updateKOTStatus(kotId: string, status: string, chefId?: string) {
    // Get current KOT for prep time
    const existing = await this.prisma.kOT.findUnique({
      where: { id: kotId },
      select: { estimatedPrepMinutes: true, kotNumber: true },
    });

    const updateData: Record<string, unknown> = {
      status,
      ...(status === 'READY' && { preparedAt: new Date() }),
      ...(status === 'IN_PROGRESS' && chefId && { assignedChefId: chefId }),
      ...(status === 'IN_PROGRESS' && {
        estimatedReadyAt: new Date(Date.now() + (existing?.estimatedPrepMinutes ?? 10) * 60_000),
      }),
    };

    const kot = await (this.prisma.kOT.update as any)({
      where: { id: kotId },
      data: updateData,
      include: {
        order: {
          include: {
            waiter: { select: { id: true, name: true, phone: true } },
            table: { select: { number: true } },
          },
        },
      },
    }) as {
      id: string; kotNumber: number; status: string;
      order: { businessId: string; table: { number: string } | null; waiter: { name: string; phone: string | null } };
    };

    // Send WhatsApp to waiter when order is READY
    if (status === 'READY' && kot.order?.waiter?.phone) {
      const tableLabel = kot.order.table ? `Table ${kot.order.table.number}` : 'your order';
      const message =
        `🍽️ *Order Ready!*\n\nHi ${kot.order.waiter.name}, ${tableLabel} (KOT #${kot.kotNumber}) is ready to be served.\n\n_KASTRA POS Kitchen_`;
      void this.notificationsService.sendWhatsApp(
        kot.order.businessId,
        kot.order.waiter.phone,
        message,
      );
    }

    return kot;
  }

  async setOrderPriority(orderId: string, priority: number, isVIP: boolean) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { priority, isVIP },
    });
  }

  async getKDSOrders(storeId: string) {
    return this.prisma.kOT.findMany({
      where: {
        order: { storeId },
        status: { in: ['PENDING', 'IN_PROGRESS', 'READY'] },
      },
      include: {
        order: {
          include: {
            items: { include: { item: { select: { name: true, prepTimeMinutes: true } } } },
            table: true,
            waiter: { select: { id: true, name: true } },
          },
        },
        assignedChef: { select: { id: true, name: true } },
      },
      orderBy: [
        { order: { isVIP: 'desc' } },
        { order: { priority: 'desc' } },
        { priority: 'desc' },
        { createdAt: 'asc' },
      ],
    });
  }

  // ── Bar Tab Methods ────────────────────────────────────────────────────────

  async createBarTab(businessId: string, storeId: string, tabName: string, waiterId: string) {
    return this.prisma.order.create({
      data: {
        offlineId: randomUUID(),
        businessId,
        storeId,
        mode: 'BAR_TAB',
        status: 'OPEN',
        waiterId,
      },
    });
  }

  async getBarTabs(businessId: string, storeId?: string) {
    return this.prisma.order.findMany({
      where: {
        businessId,
        mode: 'BAR_TAB',
        status: { in: ['OPEN', 'BILL_REQUESTED'] },
        ...(storeId ? { storeId } : {}),
      },
      include: {
        items: { include: { item: { select: { name: true, category: true } } } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async addToBarTab(
    tabId: string,
    items: Array<{
      itemId: string;
      name: string;
      quantity: number;
      unitPriceCents: number;
      modifiers?: Array<{ name: string; priceCents: number }>;
      specialInstructions?: string;
    }>,
  ) {
    const order = await this.prisma.order.findUnique({ where: { id: tabId } });
    if (!order) throw new NotFoundException('Bar tab not found');

    const createdItems = await Promise.all(
      items.map(item => {
        const modifierTotal = (item.modifiers ?? []).reduce((s, m) => s + m.priceCents, 0);
        const totalCents = (item.unitPriceCents + modifierTotal) * item.quantity;
        return this.prisma.orderItem.create({
          data: {
            orderId: tabId,
            itemId: item.itemId,
            name: item.name,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalCents,
            modifiers: item.modifiers ? JSON.stringify(item.modifiers) : null,
            specialInstructions: item.specialInstructions,
          },
        });
      }),
    );

    const kotCount = await this.prisma.kOT.count({ where: { orderId: tabId } });
    await this.prisma.kOT.create({
      data: {
        orderId: tabId,
        kotNumber: kotCount + 1,
        type: 'KOT_DRINKS',
        status: 'PENDING',
      },
    });

    return { added: createdItems.length };
  }

  async settleBarTab(
    tabId: string,
    payments: Array<{ method: string; amountCents: number; reference?: string }>,
  ) {
    const order = await this.prisma.order.findUnique({
      where: { id: tabId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Bar tab not found');

    const totalCents = order.items.reduce((s, i) => s + i.totalCents, 0);

    const store = await this.prisma.store.findUnique({ where: { id: order.storeId } });
    const updatedStore = await this.prisma.store.update({
      where: { id: order.storeId },
      data: { receiptSequence: { increment: 1 } },
    });
    const receiptNumber = `${store.storeCode}-${String(updatedStore.receiptSequence).padStart(6, '0')}`;

    const sale = await this.prisma.$transaction(async tx => {
      const newSale = await tx.sale.create({
        data: {
          offlineId: randomUUID(),
          businessId: order.businessId,
          storeId: order.storeId,
          receiptNumber,
          orderId: tabId,
          cashierId: order.waiterId,
          type: 'NORMAL',
          status: 'PAID',
          subtotalCents: totalCents,
          vatCents: Math.round(totalCents * 16 / 116),
          totCents: 0,
          totalCents,
          items: {
            create: order.items.map(i => ({
              itemId: i.itemId,
              name: i.name,
              quantity: i.quantity,
              unitPriceCents: i.unitPriceCents,
              totalCents: i.totalCents,
            })),
          },
          payments: {
            create: payments.map(p => ({
              offlineId: randomUUID(),
              method: p.method,
              amountCents: p.amountCents,
              reference: p.reference,
            })),
          },
        },
      });

      await tx.order.update({ where: { id: tabId }, data: { status: 'PAID' } });
      return newSale;
    });

    return { id: sale.id, receiptNumber: sale.receiptNumber, totalCents: sale.totalCents };
  }

  async closeBarTab(tabId: string) {
    return this.prisma.order.update({
      where: { id: tabId },
      data: { status: 'CLOSED' },
    });
  }

  // ── Hotel Rooms ────────────────────────────────────────────────────────────

  async getHotelRooms(businessId: string, storeId: string, status?: string) {
    return this.prisma.hotelRoom.findMany({
      where: { businessId, storeId, ...(status && { status }) },
      include: {
        bookings: {
          where: { status: 'CHECKED_IN' },
          select: {
            id: true,
            guestName: true,
            guestPhone: true,
            actualCheckIn: true,
            checkOutDate: true,
            nightCount: true,
            totalAmountCents: true,
            depositCents: true,
          },
          take: 1,
        },
      },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });
  }

  async createHotelRoom(data: {
    businessId: string;
    storeId: string;
    number: string;
    type?: string;
    floor?: string;
    capacity?: number;
    pricePerNightCents?: number;
    amenities?: string[];
    notes?: string;
  }) {
    return this.prisma.hotelRoom.create({
      data: {
        businessId: data.businessId,
        storeId: data.storeId,
        number: data.number,
        type: data.type ?? 'STANDARD',
        floor: data.floor,
        capacity: data.capacity ?? 2,
        pricePerNightCents: data.pricePerNightCents ?? 0,
        amenities: data.amenities ? JSON.stringify(data.amenities) : null,
        notes: data.notes,
      },
    });
  }

  async updateHotelRoom(roomId: string, data: {
    type?: string;
    floor?: string;
    capacity?: number;
    pricePerNightCents?: number;
    status?: string;
    amenities?: string[];
    notes?: string;
  }) {
    return this.prisma.hotelRoom.update({
      where: { id: roomId },
      data: {
        ...data,
        amenities: data.amenities !== undefined ? JSON.stringify(data.amenities) : undefined,
      },
    });
  }

  async deleteHotelRoom(roomId: string) {
    const active = await this.prisma.roomBooking.findFirst({
      where: { roomId, status: { in: ['CHECKED_IN', 'RESERVED'] } },
    });
    if (active) throw new BadRequestException('Cannot delete room with active bookings');
    return this.prisma.hotelRoom.delete({ where: { id: roomId } });
  }

  async getRoomBookings(businessId: string, storeId: string, status?: string) {
    return this.prisma.roomBooking.findMany({
      where: {
        businessId,
        storeId,
        ...(status && { status }),
      },
      include: { room: { select: { number: true, type: true, floor: true } } },
      orderBy: { checkInDate: 'desc' },
    });
  }

  async createRoomBooking(data: {
    businessId: string;
    storeId: string;
    roomId: string;
    guestName: string;
    guestPhone?: string;
    guestIdNumber?: string;
    checkInDate: Date;
    checkOutDate?: Date;
    nightCount: number;
    depositCents?: number;
    notes?: string;
  }) {
    const room = await this.prisma.hotelRoom.findUnique({ where: { id: data.roomId } });
    if (!room) throw new NotFoundException('Room not found');
    if (room.status === 'OCCUPIED' || room.status === 'MAINTENANCE') {
      throw new BadRequestException(`Room is currently ${room.status}`);
    }
    const pricePerNight = room.pricePerNightCents;
    const totalAmountCents = pricePerNight * data.nightCount;

    const [booking] = await this.prisma.$transaction([
      this.prisma.roomBooking.create({
        data: {
          businessId: data.businessId,
          storeId: data.storeId,
          roomId: data.roomId,
          guestName: data.guestName,
          guestPhone: data.guestPhone,
          guestIdNumber: data.guestIdNumber,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          nightCount: data.nightCount,
          pricePerNightCents: pricePerNight,
          totalAmountCents,
          depositCents: data.depositCents ?? 0,
          status: 'RESERVED',
          notes: data.notes,
        },
      }),
      this.prisma.hotelRoom.update({
        where: { id: data.roomId },
        data: { status: 'RESERVED' },
      }),
    ]);
    return booking;
  }

  async checkInGuest(bookingId: string) {
    const booking = await this.prisma.roomBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== 'RESERVED' && booking.status !== 'CHECKED_IN') {
      throw new BadRequestException('Booking cannot be checked in');
    }

    const [updated] = await this.prisma.$transaction([
      this.prisma.roomBooking.update({
        where: { id: bookingId },
        data: { status: 'CHECKED_IN', actualCheckIn: new Date() },
        include: { room: { select: { number: true, type: true } } },
      }),
      this.prisma.hotelRoom.update({
        where: { id: booking.roomId },
        data: { status: 'OCCUPIED' },
      }),
    ]);
    return updated;
  }

  async checkOutGuest(bookingId: string, payments: Array<{ method: string; amountCents: number }>) {
    const booking = await this.prisma.roomBooking.findUnique({
      where: { id: bookingId },
      include: { room: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== 'CHECKED_IN') {
      throw new BadRequestException('Guest is not checked in');
    }
    const checkOut = new Date();
    const [updated] = await this.prisma.$transaction([
      this.prisma.roomBooking.update({
        where: { id: bookingId },
        data: {
          status: 'CHECKED_OUT',
          actualCheckOut: checkOut,
        },
      }),
      this.prisma.hotelRoom.update({
        where: { id: booking.roomId },
        data: { status: 'AVAILABLE' },
      }),
    ]);
    return { ...updated, payments };
  }

  async cancelRoomBooking(bookingId: string) {
    const booking = await this.prisma.roomBooking.findUnique({ where: { id: bookingId } });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status === 'CHECKED_IN') {
      throw new BadRequestException('Cannot cancel a checked-in booking — use check-out instead');
    }
    await this.prisma.$transaction([
      this.prisma.roomBooking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } }),
      this.prisma.hotelRoom.update({ where: { id: booking.roomId }, data: { status: 'AVAILABLE' } }),
    ]);
    return { success: true };
  }
}

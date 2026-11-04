import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../events/events.gateway';
import {
  OPEN_KOT_STATUSES,
  canTransitionKot,
  isKotStatus,
  normalizeStation,
  stationForItem,
  type KotStation,
  type KotStatus,
} from '@pos/shared';
import { v4 as uuidv4 } from 'uuid';
import { randomUUID } from 'crypto';

import { requireArray } from '../common/validate';

const TABLE_STATUSES = ['AVAILABLE', 'OCCUPIED', 'BILL_REQUESTED', 'RESERVED'];
const HOUSEKEEPING_STATUSES = ['CLEAN', 'DIRTY', 'INSPECTED', 'OUT_OF_ORDER'];
const COURSES = ['STARTER', 'MAIN', 'DESSERT'];
const MANAGER_ROLES = ['OWNER', 'MANAGER', 'ADMIN'];
/** A single priced modifier above this (KES 1,000) is a typo or a fiddle, not an extra shot. */
const MAX_MODIFIER_CENTS = 100_000;

function positiveInt(value: unknown, label: string, max = 1_000_000): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) throw new BadRequestException(`${label} must be a whole number from 1 to ${max}`);
  return n;
}

function nonNegativeInt(value: unknown, label: string): number {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0) throw new BadRequestException(`${label} must be zero or a positive whole number`);
  return n;
}

type RawModifier = string | { name?: unknown; priceCents?: unknown };

/**
 * Modifiers carry a name and optionally a price. There is no server-side modifier
 * catalogue to check a price against, so the most the server can do is refuse the
 * ones that can only be an attack: a negative price (it lowers the bill) or an
 * absurd one. Plain-name modifiers pass through as before.
 */
function cleanModifiers(raw: unknown): Array<string | { name: string; priceCents: number }> | null {
  if (raw === undefined || raw === null) return null;
  if (!Array.isArray(raw)) throw new BadRequestException('modifiers must be a list');
  if (raw.length > 20) throw new BadRequestException('Too many modifiers on one line');
  const out: Array<string | { name: string; priceCents: number }> = [];
  for (const m of raw as RawModifier[]) {
    if (typeof m === 'string') {
      const name = m.trim().slice(0, 60);
      if (name) out.push(name);
      continue;
    }
    const name = typeof m?.name === 'string' ? m.name.trim().slice(0, 60) : '';
    if (!name) continue;
    const priceCents = nonNegativeInt(m.priceCents, `Price of "${name}"`);
    if (priceCents > MAX_MODIFIER_CENTS) throw new BadRequestException(`Price of "${name}" is too high`);
    out.push({ name, priceCents });
  }
  return out.length > 0 ? out : null;
}

@Injectable()
export class HospitalityService {
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
    private events: EventsGateway,
  ) {}

  // ── Tenant scoping ─────────────────────────────────────────────────────────
  // Every id that arrives in a URL is checked against the caller's business. The
  // routes used to trust the id alone, so any signed-in user could read or change
  // another business's orders and kitchen tickets by guessing one.

  private async assertStoreAccess(storeId: string, businessId: string) {
    const store = storeId
      ? await this.prisma.store.findUnique({ where: { id: storeId }, select: { businessId: true } })
      : null;
    if (!store || store.businessId !== businessId) throw new NotFoundException('Store not found');
  }

  private async assertOrderAccess(orderId: string, businessId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, businessId: true, storeId: true, tableId: true, status: true },
    });
    if (!order || order.businessId !== businessId) throw new NotFoundException('Order not found');
    return order;
  }

  private async assertTableAccess(tableId: string, businessId: string) {
    const table = tableId
      ? await this.prisma.table.findUnique({ where: { id: tableId }, select: { id: true, status: true, store: { select: { businessId: true } } } })
      : null;
    if (!table || table.store.businessId !== businessId) throw new NotFoundException('Table not found');
    return table;
  }

  private async assertRoomAccess(roomId: string, businessId: string) {
    const room = roomId
      ? await this.prisma.hotelRoom.findUnique({ where: { id: roomId } })
      : null;
    if (!room || room.businessId !== businessId) throw new NotFoundException('Room not found');
    return room;
  }

  private async assertBookingAccess(bookingId: string, businessId: string) {
    const booking = bookingId
      ? await this.prisma.roomBooking.findUnique({ where: { id: bookingId } })
      : null;
    if (!booking || booking.businessId !== businessId) throw new NotFoundException('Booking not found');
    return booking;
  }

  /**
   * Build order lines from the menu, not from what the client says they cost.
   *
   * The client used to send the item's name and unit price and the server stored
   * both, so a hand-built request could put a KES 2,000 dish on the bill at KES 1,
   * or at a negative quantity. Now the item must exist on this business's menu,
   * and its name and price come from there. Quantity must be a sensible whole
   * number. What the client keeps control of is only what it should: how many,
   * which course, the note, and the modifiers (bounded, see cleanModifiers).
   */
  private async priceLines(
    businessId: string,
    items: Array<{
      itemId: string;
      quantity: number;
      specialInstructions?: string;
      modifiers?: unknown;
      course?: string;
      seatNumber?: number;
    }>,
  ) {
    const ids = [...new Set(items.map((i) => i?.itemId).filter((id): id is string => typeof id === 'string'))];
    const menu = ids.length === 0 ? [] : await this.prisma.item.findMany({
      where: { id: { in: ids }, businessId, deletedAt: null, isActive: true },
      select: { id: true, name: true, retailPriceCents: true },
    });
    const byId = new Map(menu.map((m) => [m.id, m]));

    return items.map((raw) => {
      const item = byId.get(raw?.itemId);
      if (!item) throw new BadRequestException('One of the items is not on this business\'s menu');
      const quantity = positiveInt(raw.quantity, `Quantity of ${item.name}`, 999);
      const modifiers = cleanModifiers(raw.modifiers);
      const modifierTotal = (modifiers ?? []).reduce((sum, m) => sum + (typeof m === 'object' ? m.priceCents : 0), 0);
      const course = raw.course ? String(raw.course).toUpperCase() : 'MAIN';
      if (!COURSES.includes(course)) throw new BadRequestException(`Course must be one of ${COURSES.join(', ')}`);
      const seat = raw.seatNumber === undefined ? 0 : Number(raw.seatNumber);
      if (!Number.isInteger(seat) || seat < 0 || seat > 50) throw new BadRequestException('Guest number must be between 0 and 50');
      return {
        itemId: item.id,
        name: item.name,
        quantity,
        unitPriceCents: item.retailPriceCents,
        totalCents: (item.retailPriceCents + modifierTotal) * quantity,
        specialInstructions: typeof raw.specialInstructions === 'string' ? raw.specialInstructions.slice(0, 300) : undefined,
        modifiers: modifiers ? JSON.stringify(modifiers) : null,
        course,
        seatNumber: seat,
      };
    });
  }

  /** A realtime hiccup must never fail the action that caused it. */
  private emit(fn: () => void) {
    try { fn(); } catch { /* socket server not ready or no listeners */ }
  }

  async getTables(storeId: string, businessId: string, status?: string) {
    await this.assertStoreAccess(storeId, businessId);
    const tables = await this.prisma.table.findMany({
      where: { storeId, ...(status && { status }) },
      orderBy: { number: 'asc' },
      include: {
        orders: {
          where: { status: { in: ['OPEN', 'BILL_REQUESTED'] } },
          include: {
            kots: {
              where: { status: { in: [...OPEN_KOT_STATUSES] } },
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

  async createTable(data: { storeId?: string; number: string; capacity: number; floor?: string }, businessId: string) {
    let storeId = data.storeId;
    if (storeId) {
      await this.assertStoreAccess(storeId, businessId);
    } else {
      const store = await this.prisma.store.findFirst({
        where: { businessId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!store) throw new BadRequestException('No store found for this business');
      storeId = store.id;
    }
    const number = String(data.number ?? '').trim();
    if (!number) throw new BadRequestException('A table needs a number or name');
    return this.prisma.table.create({
      data: {
        storeId,
        number,
        capacity: positiveInt(data.capacity ?? 2, 'Seats', 500),
        floor: data.floor,
        status: 'AVAILABLE',
      },
    });
  }

  async updateTable(id: string, data: { number?: string; capacity?: number; floor?: string | null }, businessId: string) {
    await this.assertTableAccess(id, businessId);
    return this.prisma.table.update({
      where: { id },
      data: {
        ...(data.number !== undefined && { number: String(data.number).trim() }),
        ...(data.capacity !== undefined && { capacity: positiveInt(data.capacity, 'Seats', 500) }),
        ...(data.floor !== undefined && { floor: data.floor || null }),
      },
    });
  }

  async deleteTable(id: string, businessId: string) {
    const table = await this.assertTableAccess(id, businessId);
    if (table.status !== 'AVAILABLE') {
      throw new BadRequestException('Cannot delete a table that is currently occupied or reserved');
    }
    return this.prisma.table.delete({ where: { id } });
  }

  /** The status change a client may ask for: scoped to the caller's business and to a known status. */
  async setTableStatus(tableId: string, status: string, businessId: string) {
    if (!TABLE_STATUSES.includes(status)) throw new BadRequestException(`Table status must be one of ${TABLE_STATUSES.join(', ')}`);
    await this.assertTableAccess(tableId, businessId);
    return this.updateTableStatus(tableId, status);
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
    roomBookingId?: string;
  }) {
    const { roomBookingId, ...orderData } = data;
    await this.assertStoreAccess(data.storeId, data.businessId);
    if (data.tableId) await this.assertTableAccess(data.tableId, data.businessId);
    if (roomBookingId) await this.assertBookingAccess(roomBookingId, data.businessId);
    const waiter = await this.prisma.user.findFirst({ where: { id: data.waiterId, businessId: data.businessId }, select: { id: true } });
    if (!waiter) throw new BadRequestException('The waiter is not a member of this business');

    const order = await this.prisma.order.create({
      data: { ...orderData, status: 'OPEN' },
    });

    if (data.tableId) {
      await this.updateTableStatus(data.tableId, 'OCCUPIED');
    }

    // Auto-link to room booking folio if explicitly provided
    if (roomBookingId) {
      await this.linkOrderToFolio(order.id, roomBookingId).catch(() => null);
    }

    return order;
  }

  async linkOrderToFolio(orderId: string, roomBookingId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    // The booking must be the same business's as the order, or a request could post charges to someone else's guest.
    const booking = await this.assertBookingAccess(roomBookingId, order.businessId);
    const totalCents = order.items.reduce((s, i) => s + i.totalCents, 0);
    return this.prisma.guestFolioCharge.create({
      data: {
        bookingId: roomBookingId,
        businessId: booking.businessId,
        description: `Room service order #${orderId.slice(-8).toUpperCase()}`,
        amountCents: totalCents > 0 ? totalCents : 0,
        totalCents: totalCents > 0 ? totalCents : 0,
        quantity: 1,
        type: 'FOOD_BEVERAGE',
        date: new Date(),
      },
    });
  }

  async addOrderItems(orderId: string, items: Array<{
    itemId: string;
    name?: string;
    quantity: number;
    unitPriceCents?: number;
    specialInstructions?: string;
    modifiers?: Array<{ name: string; priceCents?: number } | string>;
    course?: string;
    seatNumber?: number;
  }>, businessId: string) {
    requireArray(items, 'items');
    const order = await this.assertOrderAccess(orderId, businessId);
    if (['PAID', 'CANCELLED'].includes(order.status)) throw new BadRequestException('Cannot modify a completed order');

    // Name and price are read from the menu; any sent by the client are ignored.
    const lines = await this.priceLines(businessId, items);
    return this.prisma.$transaction(lines.map((line) => this.prisma.orderItem.create({ data: { orderId, ...line } })));
  }

  async removeOrderItems(orderId: string, itemIds: string[], businessId: string) {
    requireArray(itemIds, 'itemIds');
    const order = await this.assertOrderAccess(orderId, businessId);
    if (['PAID', 'CANCELLED'].includes(order.status)) throw new BadRequestException('Cannot modify a completed order');

    const lines = await this.prisma.orderItem.findMany({ where: { orderId, id: { in: itemIds } } });
    await this.prisma.orderItem.deleteMany({ where: { orderId, id: { in: itemIds } } });
    await this.pullFromTickets(order, lines);
  }

  async cancelOrder(orderId: string, businessId: string) {
    const order = await this.assertOrderAccess(orderId, businessId);
    if (order.status === 'PAID') throw new BadRequestException('A paid order cannot be cancelled');
    if (order.status === 'CANCELLED') return { success: true };

    // Tickets die with the order. Without this a cancelled table kept showing on
    // the kitchen screen, and the cooks kept making food nobody would pay for.
    await this.prisma.$transaction([
      this.prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } }),
      this.prisma.kOT.updateMany({
        where: { orderId, status: { in: [...OPEN_KOT_STATUSES] } },
        data: { status: 'CANCELLED' },
      }),
    ]);
    if (order.tableId) {
      await this.prisma.table.update({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE' },
      }).catch(() => null);
    }
    this.emit(() => this.events.emitKotUpdated(order.businessId, { orderId, status: 'CANCELLED' }));
    return { success: true };
  }

  async requestBill(orderId: string, businessId: string) {
    await this.assertOrderAccess(orderId, businessId);
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

  async getOrderDetails(orderId: string, businessId?: string) {
    if (businessId) await this.assertOrderAccess(orderId, businessId);
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        table: true,
        waiter: true,
        kots: {
          where: { status: { notIn: ['SERVED', 'CANCELLED'] } },
          select: { id: true, kotNumber: true, status: true, type: true, station: true, createdAt: true },
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  }

  /**
   * Open orders with their live tickets. Kept for older clients; the displays now
   * read /kds/orders, which is one row per ticket and scoped to the lines on it.
   */
  async getKitchenOrders(storeId: string, businessId: string) {
    await this.assertStoreAccess(storeId, businessId);
    return this.prisma.order.findMany({
      where: { storeId, status: 'OPEN' },
      include: {
        items: true,
        table: true,
        waiter: true,
        kots: {
          where: { status: { in: [...OPEN_KOT_STATUSES] } },
          select: { id: true, kotNumber: true, status: true, station: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async mergeTables(tableIds: string[], targetTableId: string, businessId: string) {
    requireArray(tableIds, 'tableIds');
    const wanted = [...new Set([...tableIds, targetTableId])];
    const owned = await this.prisma.table.count({ where: { id: { in: wanted }, store: { businessId } } });
    if (owned !== wanted.length) throw new NotFoundException('Table not found');
    const orders = await this.prisma.order.findMany({
      where: { tableId: { in: tableIds }, status: 'OPEN' },
    });

    if (orders.length === 0) return;

    const targetOrder = orders.find(o => o.tableId === targetTableId) || orders[0];

    for (const order of orders) {
      if (order.id === targetOrder.id) continue;

      // Items and their tickets move together. Deleting an order that still owns
      // tickets is rejected by the database, and the items had already moved by
      // then, so a merge used to fail halfway and leave the bill split in two.
      await this.prisma.$transaction([
        this.prisma.orderItem.updateMany({
          where: { orderId: order.id },
          data: { orderId: targetOrder.id },
        }),
        this.prisma.kOT.updateMany({
          where: { orderId: order.id },
          data: { orderId: targetOrder.id },
        }),
        this.prisma.order.delete({ where: { id: order.id } }),
      ]);
    }

    for (const tableId of tableIds) {
      if (tableId !== targetTableId) {
        await this.updateTableStatus(tableId, 'AVAILABLE');
      }
    }

    return this.getOrderDetails(targetOrder.id);
  }

  async splitBill(orderId: string, splits: Array<{ itemIds: string[] }>, businessId: string) {
    requireArray(splits, 'splits');
    await this.assertOrderAccess(orderId, businessId);
    const order = await this.getOrderDetails(orderId);
    if (!order) throw new NotFoundException('Order not found');
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

    // Only an order with no tickets can be deleted; one that has them stays as
    // an empty shell so the kitchen history is not orphaned.
    if (remaining === 0) {
      const tickets = await this.prisma.kOT.count({ where: { orderId } });
      if (tickets === 0) {
        await this.prisma.order.delete({ where: { id: orderId } });
      } else {
        await this.prisma.order.update({ where: { id: orderId }, data: { status: 'CANCELLED' } });
      }
    }

    return newOrders;
  }

  async transferTable(orderId: string, newTableId: string, businessId: string) {
    const order = await this.assertOrderAccess(orderId, businessId);
    const target = await this.prisma.table.findUnique({ where: { id: newTableId }, select: { store: { select: { businessId: true } } } });
    if (!target || target.store.businessId !== businessId) throw new NotFoundException('Table not found');

    if (order.tableId) {
      await this.updateTableStatus(order.tableId, 'AVAILABLE');
    }

    await this.prisma.order.update({
      where: { id: orderId },
      data: { tableId: newTableId },
    });

    await this.updateTableStatus(newTableId, 'OCCUPIED');
    this.emit(() => this.events.emitKotUpdated(order.businessId, { orderId, moved: true }));
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
    depositCents?: number;
  }, businessId: string) {
    await this.assertTableAccess(data.tableId, businessId);
    if (!(data.reservationTime instanceof Date) || Number.isNaN(data.reservationTime.getTime())) {
      throw new BadRequestException('A valid reservation time is required');
    }
    const partySize = positiveInt(data.partySize, 'Party size', 500);
    const depositCents = nonNegativeInt(data.depositCents, 'Deposit');
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
        partySize,
        reservationTime: data.reservationTime,
        duration: data.duration || 120,
        notes: data.notes,
        status: 'CONFIRMED',
        depositCents,
      },
    });
  }

  async getReservationDepositStatus(reservationId: string, businessId: string) {
    const reservation = await this.prisma.tableReservation.findFirst({
      where: { id: reservationId, table: { store: { businessId } } },
      include: { table: { select: { number: true, capacity: true } } },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');
    return {
      ...reservation,
      hasDeposit: (reservation.depositCents ?? 0) > 0,
      depositFormatted: `KES ${((reservation.depositCents ?? 0) / 100).toFixed(2)}`,
    };
  }

  async getReservations(storeId: string, businessId: string, date?: Date) {
    await this.assertStoreAccess(storeId, businessId);
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

  async fireCourse(orderId: string, course: string, businessId: string) {
    await this.assertOrderAccess(orderId, businessId);
    return this.prisma.orderItem.updateMany({
      where: { orderId, course, firedAt: null },
      data: { firedAt: new Date() },
    });
  }

  /** Service day for ticket numbering. Nairobi is UTC+3 with no daylight saving. */
  private serviceDay(now: Date = new Date()): string {
    return new Date(now.getTime() + 3 * 60 * 60_000).toISOString().slice(0, 10);
  }

  /**
   * Put lines onto kitchen tickets: one ticket per preparation station.
   *
   * Passing `itemIds` sends exactly those lines and refuses any that already have
   * a ticket, so a double tap or a second phone cannot cook the same dish twice.
   * Omitting it re-sends the whole order, which is what "reprint everything"
   * means. Each ticket takes the next number of the store's service day.
   */
  async createKOT(orderId: string, type: string, itemIds: string[] | undefined, businessId: string) {
    const order = await this.assertOrderAccess(orderId, businessId);
    if (['PAID', 'CANCELLED'].includes(order.status)) throw new BadRequestException('This order is already closed');

    const ticketType = type || 'NEW_ORDER';
    if (ticketType !== 'NEW_ORDER' && ticketType !== 'ADDITION') {
      throw new BadRequestException('Ticket type must be NEW_ORDER or ADDITION');
    }

    const explicit = Array.isArray(itemIds) && itemIds.length > 0;
    const lines = await this.prisma.orderItem.findMany({
      where: { orderId, ...(explicit ? { id: { in: itemIds } } : {}) },
      include: { item: { select: { name: true, category: true, station: true, prepTimeMinutes: true } } },
    });
    const toSend = explicit ? lines.filter((l) => !l.sentToKitchenAt) : lines;
    if (toSend.length === 0) {
      throw new BadRequestException(
        lines.length > 0 ? 'Those items were already sent to the kitchen' : 'There is nothing on this order to send',
      );
    }

    const byStation = new Map<KotStation, typeof toSend>();
    for (const line of toSend) {
      const station = stationForItem({ name: line.name, category: line.item?.category, station: line.item?.station });
      byStation.set(station, [...(byStation.get(station) ?? []), line]);
    }

    const now = new Date();
    const day = this.serviceDay(now);
    const tickets = await this.prisma.$transaction(async (tx) => {
      // Claim the lines first. If another request got there between our read and
      // now, the count is short and we stop rather than issue a duplicate ticket.
      const claimed = await tx.orderItem.updateMany({
        where: { orderId, id: { in: toSend.map((l) => l.id) }, sentToKitchenAt: null },
        data: { sentToKitchenAt: now },
      });
      if (explicit && claimed.count !== toSend.length) {
        throw new ConflictException('Those items were already sent to the kitchen');
      }

      const created = [];
      for (const [station, group] of byStation) {
        const counter = await tx.kotCounter.upsert({
          where: { storeId_day: { storeId: order.storeId, day } },
          update: { last: { increment: 1 } },
          create: { storeId: order.storeId, day, last: 1 },
        });
        created.push(await tx.kOT.create({
          data: {
            orderId,
            kotNumber: counter.last,
            type: ticketType,
            station,
            status: 'PENDING',
            itemIds: JSON.stringify(group.map((l) => l.id)),
            printedAt: now,
            estimatedPrepMinutes: Math.max(...group.map((l) => l.item?.prepTimeMinutes ?? 5)),
          },
        }));
      }
      return created;
    });

    this.emit(() => this.events.emitKotCreated(order.businessId, {
      orderId,
      storeId: order.storeId,
      kotIds: tickets.map((t) => t.id),
      stations: tickets.map((t) => t.station),
    }));
    return tickets;
  }

  async updateKOTStatus(kotId: string, status: string, chefId: string | undefined, businessId: string) {
    if (!isKotStatus(status)) throw new BadRequestException(`Unknown ticket status "${status}"`);

    const existing = await this.prisma.kOT.findUnique({
      where: { id: kotId },
      include: { order: { select: { businessId: true } } },
    });
    if (!existing || existing.order.businessId !== businessId) throw new NotFoundException('Ticket not found');

    const from = existing.status as KotStatus;
    // Tapping twice, or two screens racing, must not fire the "ready" message twice.
    if (from === status) return existing;
    if (!canTransitionKot(from, status)) {
      throw new BadRequestException(`A ticket that is ${from.replace('_', ' ').toLowerCase()} cannot become ${status.replace('_', ' ').toLowerCase()}`);
    }

    const data: Record<string, unknown> = { status };
    if (status === 'READY') data.preparedAt = new Date();
    if (status === 'IN_PROGRESS') {
      if (from === 'READY') {
        data.preparedAt = null; // recalled: it is being made again
      } else if (chefId) {
        data.assignedChefId = chefId;
      }
      data.estimatedReadyAt = new Date(Date.now() + (existing.estimatedPrepMinutes ?? 10) * 60_000);
    }

    // Conditional on the status we read, so a concurrent change loses cleanly.
    const moved = await this.prisma.kOT.updateMany({ where: { id: kotId, status: from }, data });
    if (moved.count === 0) throw new ConflictException('This ticket was just changed on another screen. Refresh and try again.');

    const kot = await this.prisma.kOT.findUnique({
      where: { id: kotId },
      include: {
        order: {
          include: {
            waiter: { select: { id: true, name: true, phone: true } },
            table: { select: { number: true } },
          },
        },
      },
    });
    if (!kot) throw new NotFoundException('Ticket not found');

    this.emit(() => this.events.emitKotUpdated(businessId, {
      kotId, orderId: kot.orderId, status, station: kot.station,
    }));

    // Tell the waiter their order is ready
    if (status === 'READY' && kot.order.waiter?.phone) {
      const tableLabel = kot.order.table ? `Table ${kot.order.table.number}` : 'your order';
      const message =
        `*Order ready*\n\nHi ${kot.order.waiter.name}, ${tableLabel} (${kot.station.toLowerCase()} ticket #${kot.kotNumber}) is ready to be served.\n\n_KASTRA POS Kitchen_`;
      void this.notificationsService.sendWhatsApp(
        kot.order.businessId,
        kot.order.waiter.phone,
        message,
      );
    }

    return kot;
  }

  async setOrderPriority(orderId: string, priority: number, isVIP: boolean, businessId: string) {
    await this.assertOrderAccess(orderId, businessId);
    return this.prisma.order.update({
      where: { id: orderId },
      data: { priority, isVIP },
    });
  }

  /**
   * Live tickets for a store's displays, oldest and most urgent first.
   *
   * Lines are fetched by the ids stored on each ticket rather than read off the
   * order, so a ticket still shows exactly what it was made for after the bill is
   * merged or split. Tickets whose order was paid or cancelled drop off.
   */
  async getKDSOrders(storeId: string, businessId: string, station?: string) {
    await this.assertStoreAccess(storeId, businessId);
    const wanted = normalizeStation(station);

    const kots = await this.prisma.kOT.findMany({
      where: {
        order: { storeId, status: { notIn: ['PAID', 'CANCELLED'] } },
        status: { in: [...OPEN_KOT_STATUSES] },
        ...(wanted ? { station: wanted } : {}),
      },
      include: {
        order: {
          include: {
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

    const idsOf = (raw: string | null): string[] => {
      try { const v = JSON.parse(raw ?? '[]'); return Array.isArray(v) ? v : []; } catch { return []; }
    };
    const allIds = [...new Set(kots.flatMap((k) => idsOf(k.itemIds)))];
    const lines = allIds.length === 0 ? [] : await this.prisma.orderItem.findMany({
      where: { id: { in: allIds } },
      include: { item: { select: { name: true, prepTimeMinutes: true, allergens: true } } },
    });
    const lineById = new Map(lines.map((l) => [l.id, l]));

    return kots.map((kot) => {
      const ids = idsOf(kot.itemIds);
      const items = ids.map((id) => lineById.get(id)).filter((l): l is NonNullable<typeof l> => !!l);
      return { ...kot, order: { ...kot.order, items } };
    });
  }

  // ── Bar Tab Methods ────────────────────────────────────────────────────────

  async createBarTab(businessId: string, storeId: string, tabName: string, waiterId: string) {
    await this.assertStoreAccess(storeId, businessId);
    const waiter = await this.prisma.user.findFirst({ where: { id: waiterId, businessId }, select: { id: true } });
    if (!waiter) throw new BadRequestException('The waiter is not a member of this business');
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
      name?: string;
      quantity: number;
      unitPriceCents?: number;
      modifiers?: Array<{ name: string; priceCents: number }>;
      specialInstructions?: string;
    }>,
    businessId: string,
  ) {
    requireArray(items, 'items');
    const order = await this.assertOrderAccess(tabId, businessId);
    if (!['OPEN', 'BILL_REQUESTED'].includes(order.status)) throw new BadRequestException('This tab is closed');

    const lines = await this.priceLines(businessId, items);
    const created = await this.prisma.$transaction(
      lines.map((line) => this.prisma.orderItem.create({ data: { orderId: tabId, ...line } })),
    );

    // Same route to the bar as any other order: one ticket per station, numbered
    // for the day, and the lines marked as sent so they can't be sent twice. The
    // tab used to write its own ticket by hand, with no lines on it.
    const earlier = await this.prisma.kOT.count({ where: { orderId: tabId } });
    const tickets = created.length === 0
      ? []
      : await this.createKOT(tabId, earlier > 0 ? 'ADDITION' : 'NEW_ORDER', created.map((c) => c.id), businessId);

    return { added: created.length, tickets: tickets.length };
  }

  async settleBarTab(
    tabId: string,
    payments: Array<{ method: string; amountCents: number; reference?: string }>,
    businessId: string,
  ) {
    requireArray(payments, 'payments');
    const order = await this.prisma.order.findUnique({ where: { id: tabId }, include: { items: true } });
    if (!order || order.businessId !== businessId) throw new NotFoundException('Bar tab not found');
    if (order.mode !== 'BAR_TAB') throw new BadRequestException('This is not a bar tab');

    const totalCents = order.items.reduce((s, i) => s + i.totalCents, 0);
    if (totalCents <= 0) throw new BadRequestException('There is nothing on this tab to settle');

    const cleanPayments = payments.map((p) => {
      const method = String(p?.method ?? '').trim().slice(0, 30);
      if (!method) throw new BadRequestException('Every payment needs a method');
      return { method, amountCents: positiveInt(p.amountCents, 'Payment amount'), reference: p.reference };
    });
    const paid = cleanPayments.reduce((s, p) => s + p.amountCents, 0);
    if (paid < totalCents) {
      throw new BadRequestException(`Payments (${paid}) do not cover the tab (${totalCents})`);
    }

    const sale = await this.prisma.$transaction(async (tx) => {
      // Claim the tab first. Two settle requests (a double tap, or two tills) used
      // to each write a sale for the same tab; now only one can win.
      const claimed = await tx.order.updateMany({
        where: { id: tabId, status: { in: ['OPEN', 'BILL_REQUESTED'] } },
        data: { status: 'PAID' },
      });
      if (claimed.count !== 1) throw new ConflictException('This tab was already settled');

      const store = await tx.store.update({
        where: { id: order.storeId },
        data: { receiptSequence: { increment: 1 } },
      });
      const receiptNumber = `${store.storeCode}-${String(store.receiptSequence).padStart(6, '0')}`;

      return tx.sale.create({
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
            create: cleanPayments.map(p => ({
              offlineId: randomUUID(),
              method: p.method,
              amountCents: p.amountCents,
              reference: p.reference,
            })),
          },
        },
      });
    });

    await this.prisma.kOT.updateMany({
      where: { orderId: tabId, status: { in: [...OPEN_KOT_STATUSES] } },
      data: { status: 'SERVED' },
    });
    return { id: sale.id, receiptNumber: sale.receiptNumber, totalCents: sale.totalCents };
  }

  async closeBarTab(tabId: string, businessId: string, actorRole: string) {
    const order = await this.prisma.order.findUnique({ where: { id: tabId }, include: { items: { select: { totalCents: true } } } });
    if (!order || order.businessId !== businessId) throw new NotFoundException('Bar tab not found');
    if (!['OPEN', 'BILL_REQUESTED'].includes(order.status)) throw new BadRequestException('This tab is already closed');
    // Closing a tab that has charges on it without taking payment writes them off.
    if (order.items.some((i) => i.totalCents > 0) && !MANAGER_ROLES.includes(actorRole)) {
      throw new ForbiddenException('Only a manager can close a tab that has not been paid');
    }
    return this.prisma.order.update({ where: { id: tabId }, data: { status: 'CLOSED' } });
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
    storeId: string;
    number: string;
    type?: string;
    floor?: string;
    capacity?: number;
    pricePerNightCents?: number;
    amenities?: string[];
    notes?: string;
  }, businessId: string) {
    await this.assertStoreAccess(data.storeId, businessId);
    const number = String(data.number ?? '').trim();
    if (!number) throw new BadRequestException('A room needs a number');
    return this.prisma.hotelRoom.create({
      data: {
        businessId,
        storeId: data.storeId,
        number,
        type: data.type ?? 'STANDARD',
        floor: data.floor,
        capacity: data.capacity === undefined ? 2 : positiveInt(data.capacity, 'Capacity', 100),
        pricePerNightCents: nonNegativeInt(data.pricePerNightCents, 'Price per night'),
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
  }, businessId: string) {
    await this.assertRoomAccess(roomId, businessId);
    // Named fields only. The body used to be spread straight into the update, so a
    // request could also set businessId or storeId and move a room elsewhere.
    return this.prisma.hotelRoom.update({
      where: { id: roomId },
      data: {
        ...(data.type !== undefined && { type: data.type }),
        ...(data.floor !== undefined && { floor: data.floor }),
        ...(data.capacity !== undefined && { capacity: positiveInt(data.capacity, 'Capacity', 100) }),
        ...(data.pricePerNightCents !== undefined && { pricePerNightCents: nonNegativeInt(data.pricePerNightCents, 'Price per night') }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.notes !== undefined && { notes: data.notes }),
        ...(data.amenities !== undefined && { amenities: JSON.stringify(data.amenities) }),
      },
    });
  }

  async deleteHotelRoom(roomId: string, businessId: string) {
    await this.assertRoomAccess(roomId, businessId);
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
  }, businessId: string) {
    // The room decides the store; the client's storeId is not trusted.
    const room = await this.assertRoomAccess(data.roomId, businessId);
    if (room.status === 'OCCUPIED' || room.status === 'MAINTENANCE') {
      throw new BadRequestException(`Room is currently ${room.status}`);
    }
    const nightCount = positiveInt(data.nightCount, 'Nights', 365);
    const depositCents = nonNegativeInt(data.depositCents, 'Deposit');
    const pricePerNight = room.pricePerNightCents;
    const totalAmountCents = pricePerNight * nightCount;

    const [booking] = await this.prisma.$transaction([
      this.prisma.roomBooking.create({
        data: {
          businessId,
          storeId: room.storeId,
          roomId: data.roomId,
          guestName: data.guestName,
          guestPhone: data.guestPhone,
          guestIdNumber: data.guestIdNumber,
          checkInDate: data.checkInDate,
          checkOutDate: data.checkOutDate,
          nightCount,
          pricePerNightCents: pricePerNight,
          totalAmountCents,
          depositCents,
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

  async checkInGuest(bookingId: string, businessId: string) {
    const booking = await this.assertBookingAccess(bookingId, businessId);
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

  async checkOutGuest(bookingId: string, payments: Array<{ method: string; amountCents: number }>, businessId: string) {
    await this.assertBookingAccess(bookingId, businessId);
    const booking = await this.prisma.roomBooking.findUnique({
      where: { id: bookingId },
      include: { room: true, folioCharges: true },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (booking.status !== 'CHECKED_IN') {
      throw new BadRequestException('Guest is not checked in');
    }

    // Auto-add room rate charges for each night if not already posted
    const existingRoomRateNights = booking.folioCharges
      .filter(c => c.type === 'ROOM_RATE')
      .reduce((sum, c) => sum + c.quantity, 0);
    const nightsToAdd = (booking.nightCount || 1) - existingRoomRateNights;
    if (nightsToAdd > 0) {
      await this.prisma.guestFolioCharge.create({
        data: {
          bookingId,
          businessId: booking.businessId,
          type: 'ROOM_RATE',
          description: `Room ${booking.room.number} — ${nightsToAdd} night${nightsToAdd !== 1 ? 's' : ''} × KES ${(booking.pricePerNightCents / 100).toFixed(0)}/night`,
          amountCents: booking.pricePerNightCents,
          quantity: nightsToAdd,
          totalCents: booking.pricePerNightCents * nightsToAdd,
        },
      });
    }

    // Reload folio after auto-adding room rate
    const allCharges = await this.prisma.guestFolioCharge.findMany({ where: { bookingId } });
    const folioTotal = allCharges.reduce((sum, c) => sum + c.totalCents, 0);
    const balanceDue = Math.max(0, folioTotal - (booking.depositCents ?? 0));

    const checkOut = new Date();
    const [updated] = await this.prisma.$transaction([
      this.prisma.roomBooking.update({
        where: { id: bookingId },
        data: { status: 'CHECKED_OUT', actualCheckOut: checkOut, totalAmountCents: folioTotal },
        include: { folioCharges: true, room: { select: { number: true, type: true } } },
      }),
      this.prisma.hotelRoom.update({
        where: { id: booking.roomId },
        data: { status: 'AVAILABLE', housekeepingStatus: 'DIRTY' },
      }),
    ]);
    return { ...updated, folioTotal, balanceDue, payments };
  }

  async cancelRoomBooking(bookingId: string, businessId: string) {
    const booking = await this.assertBookingAccess(bookingId, businessId);
    if (booking.status === 'CHECKED_IN') {
      throw new BadRequestException('Cannot cancel a checked-in booking — use check-out instead');
    }
    await this.prisma.$transaction([
      this.prisma.roomBooking.update({ where: { id: bookingId }, data: { status: 'CANCELLED' } }),
      this.prisma.hotelRoom.update({ where: { id: booking.roomId }, data: { status: 'AVAILABLE' } }),
    ]);
    return { success: true };
  }

  // ── Guest Folio ─────────────────────────────────────────────────────────────

  async getFolio(bookingId: string, businessId: string) {
    await this.assertBookingAccess(bookingId, businessId);
    const booking = await this.prisma.roomBooking.findUnique({
      where: { id: bookingId },
      include: {
        room: { select: { number: true, type: true, floor: true } },
        folioCharges: { orderBy: { date: 'asc' } },
      },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    const folioTotal = booking.folioCharges.reduce((sum, c) => sum + c.totalCents, 0);
    const balanceDue = Math.max(0, folioTotal - (booking.depositCents ?? 0));
    const roomRateTotal = booking.pricePerNightCents * booking.nightCount;
    return { ...booking, folioTotal, balanceDue, roomRateTotal };
  }

  async addFolioCharge(bookingId: string, data: {
    type: string;
    description: string;
    amountCents: number;
    quantity?: number;
  }, businessId: string, postedBy: string) {
    const booking = await this.assertBookingAccess(bookingId, businessId);
    if (['CHECKED_OUT', 'CANCELLED'].includes(booking.status)) throw new BadRequestException('This booking is closed');
    const amountCents = positiveInt(data.amountCents, 'Amount');
    const qty = positiveInt(data.quantity ?? 1, 'Quantity', 999);
    const description = String(data.description ?? '').trim().slice(0, 200);
    if (!description) throw new BadRequestException('A charge needs a description');
    return this.prisma.guestFolioCharge.create({
      data: {
        bookingId,
        businessId,
        type: data.type,
        description,
        amountCents,
        quantity: qty,
        totalCents: amountCents * qty,
        // Who posted it comes from the login, so a charge can't be blamed on someone else.
        postedBy,
        date: new Date(),
      },
    });
  }

  async removeFolioCharge(chargeId: string, businessId: string) {
    const charge = await this.prisma.guestFolioCharge.findUnique({
      where: { id: chargeId },
      include: { booking: { select: { status: true } } },
    });
    if (!charge || charge.businessId !== businessId) throw new NotFoundException('Charge not found');
    // After check-out the folio is the record of what the guest paid; it is not edited.
    if (['CHECKED_OUT', 'CANCELLED'].includes(charge.booking.status)) {
      throw new BadRequestException('This booking is closed, so its charges can no longer be removed');
    }
    await this.prisma.guestFolioCharge.delete({ where: { id: chargeId } });
    return { success: true };
  }

  // ── Void Single KOT Item ─────────────────────────────────────────────────────

  async voidOrderItem(orderId: string, itemId: string, reason: string, actorRole: string, actorName: string, businessId: string) {
    if (!reason?.trim()) throw new BadRequestException('A reason is required to void an item');
    const order = await this.assertOrderAccess(orderId, businessId);
    if (['PAID', 'CANCELLED'].includes(order.status)) throw new BadRequestException('Cannot modify a completed order');

    const item = await this.prisma.orderItem.findFirst({ where: { id: itemId, orderId } });
    if (!item) throw new NotFoundException('Item not found in order');

    // Taking back something the kitchen already has costs money, so that needs a
    // manager. Removing a line that was never sent is just correcting a mistake.
    if (item.sentToKitchenAt && !['OWNER', 'MANAGER', 'ADMIN'].includes(actorRole)) {
      throw new ForbiddenException('Only a manager can void an item the kitchen already has');
    }

    await this.prisma.orderItem.delete({ where: { id: itemId } });
    await this.pullFromTickets(order, [item]);

    // Audit notification (fire and forget)
    this.prisma.notification.create({
      data: {
        businessId: order.businessId,
        title: 'KOT Item Voided',
        body: `"${item.name}" x${item.quantity} removed from Order ${order.id.slice(-6).toUpperCase()} by ${actorName}. Reason: ${reason.trim()}`,
        type: 'VOID',
      },
    }).catch(() => {});

    return this.prisma.order.findUnique({ where: { id: orderId }, include: { items: true } });
  }

  /**
   * Take removed lines off any live ticket that carries them, and tell the
   * kitchen. A ticket left with no lines is cancelled. Until now a void just
   * deleted the line, so the cooks went on making a dish that was no longer on
   * the bill and nobody told them.
   */
  private async pullFromTickets(
    order: { id: string; businessId: string; tableId: string | null },
    removed: Array<{ id: string; name: string; quantity: number; sentToKitchenAt?: Date | null }>,
  ) {
    const sent = removed.filter((r) => r.sentToKitchenAt);
    if (sent.length === 0) return;

    const gone = new Set(sent.map((r) => r.id));
    const tickets = await this.prisma.kOT.findMany({
      where: { orderId: order.id, status: { in: [...OPEN_KOT_STATUSES] } },
    });
    const touched: string[] = [];
    for (const ticket of tickets) {
      let ids: string[] = [];
      try { const v = JSON.parse(ticket.itemIds ?? '[]'); ids = Array.isArray(v) ? v : []; } catch { /* legacy row */ }
      if (!ids.some((id) => gone.has(id))) continue;
      const left = ids.filter((id) => !gone.has(id));
      await this.prisma.kOT.update({
        where: { id: ticket.id },
        data: { itemIds: JSON.stringify(left), ...(left.length === 0 ? { status: 'CANCELLED' } : {}) },
      });
      touched.push(ticket.id);
    }

    const table = order.tableId
      ? await this.prisma.table.findUnique({ where: { id: order.tableId }, select: { number: true } })
      : null;
    this.emit(() => this.events.emitKotVoided(order.businessId, {
      orderId: order.id,
      table: table?.number ?? null,
      kotIds: touched,
      lines: sent.map((r) => ({ name: r.name, quantity: r.quantity })),
    }));
  }

  // ── Happy Hours ───────────────────────────────────────────────────────────────

  async getHappyHours(businessId: string) {
    return this.prisma.happyHour.findMany({
      where: { businessId, isActive: true },
      orderBy: { startHour: 'asc' },
    });
  }

  async createHappyHour(data: {
    name: string;
    discountPct: number;
    startHour: number;
    endHour: number;
    startMinute?: number;
    endMinute?: number;
    appliesTo?: string;
    storeId?: string;
  }, businessId: string) {
    if (data.storeId) await this.assertStoreAccess(data.storeId, businessId);
    const pct = Number(data.discountPct);
    if (!Number.isFinite(pct) || pct <= 0 || pct > 100) throw new BadRequestException('Discount must be between 1 and 100 percent');
    const inRange = (v: unknown, max: number) => Number.isInteger(Number(v)) && Number(v) >= 0 && Number(v) <= max;
    if (!inRange(data.startHour, 23) || !inRange(data.endHour, 23) || !inRange(data.startMinute ?? 0, 59) || !inRange(data.endMinute ?? 0, 59)) {
      throw new BadRequestException('Start and end must be valid times');
    }
    return this.prisma.happyHour.create({
      data: {
        businessId,
        name: data.name,
        discountPct: pct,
        startHour: Number(data.startHour),
        startMinute: Number(data.startMinute ?? 0),
        endHour: Number(data.endHour),
        endMinute: Number(data.endMinute ?? 0),
        appliesTo: data.appliesTo ?? 'ALL',
        storeId: data.storeId,
      },
    });
  }

  async deleteHappyHour(id: string, businessId: string) {
    const owned = await this.prisma.happyHour.findFirst({ where: { id, businessId }, select: { id: true } });
    if (!owned) throw new NotFoundException('Happy hour not found');
    return this.prisma.happyHour.delete({ where: { id } });
  }

  async getActiveHappyHourDiscount(businessId: string): Promise<number> {
    const now = new Date();
    const currentMins = now.getHours() * 60 + now.getMinutes();
    const currentDay = now.getDay();

    const happyHours = await this.prisma.happyHour.findMany({
      where: { businessId, isActive: true },
    });

    for (const hh of happyHours) {
      const days: number[] = JSON.parse(hh.daysOfWeek) as number[];
      if (!days.includes(currentDay)) continue;
      const startMins = hh.startHour * 60 + hh.startMinute;
      const endMins = hh.endHour * 60 + hh.endMinute;
      if (currentMins >= startMins && currentMins < endMins) {
        return hh.discountPct;
      }
    }
    return 0;
  }

  // ── RevPASH ───────────────────────────────────────────────────────────────

  async getRevPASH(businessId: string, storeId: string, date: string) {
    // The seat count below is read by store alone, so the store must be this business's.
    await this.assertStoreAccess(storeId, businessId);
    const dayStart = new Date(date);
    const dayEnd = new Date(date);
    dayEnd.setDate(dayEnd.getDate() + 1);

    // Total sales from table orders
    const sales = await this.prisma.sale.findMany({
      where: {
        businessId,
        storeId,
        // Sales are stored as PAID; 'COMPLETED' matched nothing, so this report was always zero.
        status: 'PAID',
        createdAt: { gte: dayStart, lt: dayEnd },
        orderId: { not: null },
      },
      select: { totalCents: true },
    });
    const totalRevenueCents = sales.reduce((s, sale) => s + sale.totalCents, 0);

    // Total seat capacity
    const tables = await this.prisma.table.findMany({ where: { storeId }, select: { capacity: true } });
    const totalSeats = tables.reduce((s, t) => s + t.capacity, 0);

    const openHours = 12; // default
    const revPASH = totalSeats > 0 ? totalRevenueCents / (totalSeats * openHours) : 0;

    return {
      date,
      totalRevenueCents,
      totalSeats,
      openHours,
      revPASHCents: Math.round(revPASH),
      revPASH: revPASH / 100,
      saleCount: sales.length,
      avgCheckCents: sales.length > 0 ? Math.round(totalRevenueCents / sales.length) : 0,
      tableCount: tables.length,
    };
  }

  // ── Housekeeping ─────────────────────────────────────────────────────────────

  async updateHousekeepingStatus(roomId: string, housekeepingStatus: string, businessId: string) {
    if (!HOUSEKEEPING_STATUSES.includes(housekeepingStatus)) {
      throw new BadRequestException(`Housekeeping status must be one of ${HOUSEKEEPING_STATUSES.join(', ')}`);
    }
    await this.assertRoomAccess(roomId, businessId);
    return this.prisma.hotelRoom.update({
      where: { id: roomId },
      data: { housekeepingStatus },
    });
  }

  async getHousekeepingQueue(businessId: string, storeId: string) {
    const rooms = await this.prisma.hotelRoom.findMany({
      where: { businessId, storeId },
      select: {
        id: true, number: true, floor: true, type: true,
        status: true, housekeepingStatus: true,
        bookings: {
          where: { status: { in: ['CHECKED_IN', 'CHECKED_OUT'] } },
          orderBy: { actualCheckOut: 'desc' },
          take: 1,
          select: { guestName: true, actualCheckOut: true, status: true },
        },
      },
      orderBy: [{ floor: 'asc' }, { number: 'asc' }],
    });
    return rooms.map(r => ({
      ...r,
      lastGuest: r.bookings[0] ?? null,
      bookings: undefined,
    }));
  }

  // ── Hotel Dashboard ──────────────────────────────────────────────────────────

  async getHotelDashboard(businessId: string, storeId: string) {
    const rooms = await this.prisma.hotelRoom.findMany({
      where: { businessId, storeId },
    });
    const total = rooms.length;
    const occupied = rooms.filter(r => r.status === 'OCCUPIED').length;
    const available = rooms.filter(r => r.status === 'AVAILABLE').length;
    const reserved = rooms.filter(r => r.status === 'RESERVED').length;
    const maintenance = rooms.filter(r => r.status === 'MAINTENANCE').length;
    const occupancyPct = total > 0 ? Math.round((occupied / total) * 100) : 0;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const todayArrivals = await this.prisma.roomBooking.count({
      where: {
        businessId, storeId,
        status: { in: ['RESERVED', 'CHECKED_IN'] },
        checkInDate: { gte: today, lt: tomorrow },
      },
    });

    const todayDepartures = await this.prisma.roomBooking.count({
      where: {
        businessId, storeId,
        status: 'CHECKED_IN',
        checkOutDate: { gte: today, lt: tomorrow },
      },
    });

    // Revenue this month
    const startOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthlyRevenue = await this.prisma.guestFolioCharge.aggregate({
      where: { businessId, createdAt: { gte: startOfMonth } },
      _sum: { totalCents: true },
    });

    // Dirty rooms needing housekeeping
    const dirtyRooms = rooms.filter(r => r.housekeepingStatus === 'DIRTY').length;

    return {
      total, occupied, available, reserved, maintenance,
      occupancyPct, todayArrivals, todayDepartures, dirtyRooms,
      monthlyRevenueCents: monthlyRevenue._sum.totalCents ?? 0,
    };
  }
}

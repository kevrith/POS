import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class HospitalityService {
  constructor(private prisma: PrismaService) {}

  async getTables(storeId: string, status?: string) {
    return this.prisma.table.findMany({
      where: { storeId, ...(status && { status }) },
      orderBy: { number: 'asc' },
    });
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
    modifiers?: string[];
  }>) {
    return Promise.all(
      items.map(item =>
        this.prisma.orderItem.create({
          data: {
            orderId,
            itemId: item.itemId,
            name: item.name,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalCents: item.quantity * item.unitPriceCents,
            specialInstructions: item.specialInstructions,
            modifiers: item.modifiers ? JSON.stringify(item.modifiers) : null,
          },
        })
      )
    );
  }

  async removeOrderItems(orderId: string, itemIds: string[]) {
    await this.prisma.orderItem.deleteMany({
      where: { orderId, id: { in: itemIds } },
    });
  }

  async requestBill(orderId: string) {
    return this.prisma.order.update({
      where: { id: orderId },
      data: { status: 'BILL_REQUESTED' },
    });
  }

  async getOrderDetails(orderId: string) {
    return this.prisma.order.findUnique({
      where: { id: orderId },
      include: { items: true, table: true, waiter: true },
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

    return this.prisma.kOT.create({
      data: {
        orderId,
        kotNumber,
        type,
        status: 'PENDING',
        printedAt: new Date(),
      },
    });
  }

  async updateKOTStatus(kotId: string, status: string) {
    return this.prisma.kOT.update({
      where: { id: kotId },
      data: {
        status,
        ...(status === 'READY' && { preparedAt: new Date() }),
      },
    });
  }

  async getKDSOrders(storeId: string) {
    return this.prisma.kOT.findMany({
      where: {
        order: { storeId },
        status: { in: ['PENDING', 'IN_PROGRESS'] },
      },
      include: {
        order: {
          include: { items: true, table: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });
  }
}

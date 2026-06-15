import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MpesaService } from '../payments/mpesa.service';

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mpesa: MpesaService,
  ) {}

  /** Customer self-service M-Pesa STK push for an order they just placed. */
  async payOrder(dto: { phone: string; amountCents: number; reference: string }) {
    return this.mpesa.initiateSTKPush({
      phone: dto.phone,
      amountCents: dto.amountCents,
      accountReference: dto.reference,
    });
  }

  /** Poll the STK result so the app can show paid/failed. */
  async payStatus(checkoutRequestId: string) {
    return this.mpesa.querySTKStatus(checkoutRequestId);
  }

  /**
   * Customer self-service table reservation. Auto-assigns the smallest free
   * table that fits the party at the requested time (customers don't know table
   * ids). A ±2h window counts as a clash, mirroring the POS reservation logic.
   */
  async reserveTable(dto: {
    businessId: string;
    customerName: string;
    phone?: string;
    partySize: number;
    reservationTime: string;
    notes?: string;
  }) {
    const store = await this.prisma.store.findFirst({ where: { businessId: dto.businessId } });
    if (!store) throw new Error('No store found');

    const when = new Date(dto.reservationTime);
    const tables = await this.prisma.table.findMany({
      where: { storeId: store.id },
      orderBy: { capacity: 'asc' },
    });

    for (const table of tables) {
      if (table.capacity < dto.partySize) continue;
      const clash = await this.prisma.tableReservation.findFirst({
        where: {
          tableId: table.id,
          status: 'CONFIRMED',
          reservationTime: {
            gte: new Date(when.getTime() - 120 * 60000),
            lte: new Date(when.getTime() + 120 * 60000),
          },
        },
      });
      if (clash) continue;

      const reservation = await this.prisma.tableReservation.create({
        data: {
          tableId: table.id,
          customerName: dto.customerName,
          customerPhone: dto.phone,
          partySize: dto.partySize,
          reservationTime: when,
          status: 'CONFIRMED',
          notes: dto.notes,
        },
      });

      if (dto.phone) {
        this.notifications.sendSMS(
          dto.businessId,
          dto.phone,
          `Hi ${dto.customerName}, your table for ${dto.partySize} is confirmed for ${when.toLocaleString('en-KE')} (Table ${table.number}).`,
        ).catch(() => {});
      }

      return { ...reservation, tableNumber: table.number };
    }

    throw new Error('No tables available at that time. Please try another slot.');
  }

  async getMenu(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true, taxType: true, posMode: true },
    });
    if (!business) return { business: null, categories: [] };

    const store = await this.prisma.store.findFirst({ where: { businessId } });
    if (!store) return { business, categories: [] };

    const items = await this.prisma.item.findMany({
      where: { businessId, storeId: store.id, deletedAt: null },
      select: { id: true, name: true, category: true, type: true, retailPriceCents: true, barcode: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });

    const categoryMap = new Map<string, typeof items>();
    for (const item of items) {
      const cat = item.category ?? 'General';
      if (!categoryMap.has(cat)) categoryMap.set(cat, []);
      categoryMap.get(cat)!.push(item);
    }

    const categories = Array.from(categoryMap.entries()).map(([name, items]) => ({ name, items }));
    return { business, categories };
  }

  async loyaltyLookup(phone: string, businessId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { businessId, phone },
      include: {
        sales: {
          where: { status: { in: ['PAID', 'AMENDED'] } },
          orderBy: { createdAt: 'desc' },
          take: 5,
          select: { receiptNumber: true, totalCents: true, createdAt: true },
        },
      },
    });

    if (!customer) return { found: false };

    const tiers = await this.prisma.loyaltyTier.findMany({
      where: { businessId },
      orderBy: { minPoints: 'desc' },
    });

    const currentTier = tiers.find((t) => customer.loyaltyPoints >= t.minPoints);

    return {
      found: true,
      customerId: customer.id,
      customerName: customer.name,
      points: customer.loyaltyPoints,
      tier: currentTier ? { name: currentTier.name, color: currentTier.color } : null,
      lastPurchase: customer.sales[0]?.createdAt ?? null,
      recentPurchases: customer.sales,
    };
  }

  async placeOrder(dto: {
    businessId: string;
    customerName: string;
    phone: string;
    address: string;
    items: Array<{ name: string; quantity: number; priceCents: number }>;
    orderType: 'DELIVERY' | 'PICKUP';
    notes?: string;
  }) {
    // Get first store for this business
    const store = await this.prisma.store.findFirst({ where: { businessId: dto.businessId } });
    if (!store) throw new Error('No store found');

    // Generate order number
    const year = new Date().getFullYear();
    const count = await this.prisma.deliveryOrder.count({
      where: { businessId: dto.businessId, orderNumber: { startsWith: `PRT-${year}` } },
    });
    const seq = String(count + 1).padStart(5, '0');
    const orderNumber = `PRT-${year}-${seq}`;

    const order = await this.prisma.deliveryOrder.create({
      data: {
        businessId: dto.businessId,
        storeId: store.id,
        orderNumber,
        customerName: dto.customerName,
        customerPhone: dto.phone,
        deliveryAddress: dto.orderType === 'DELIVERY' ? dto.address : 'PICKUP',
        notes: `${dto.orderType}: ${dto.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}${dto.notes ? '. ' + dto.notes : ''}`,
        status: 'PENDING',
      },
    });

    // Send confirmation SMS if AT credentials are configured
    if (dto.phone) {
      this.notifications.sendSMS(
        dto.businessId,
        dto.phone,
        `Hi ${dto.customerName}, your order #${orderNumber} has been received! ${dto.orderType === 'PICKUP' ? 'Ready for pickup shortly.' : 'We will deliver to your address shortly.'}`,
      ).catch(() => {});
    }

    return { orderNumber: order.orderNumber, orderId: order.id, status: 'PENDING' };
  }

  async getOrderHistory(phone: string, businessId: string) {
    const orders = await this.prisma.deliveryOrder.findMany({
      where: {
        businessId,
        customerPhone: phone,
        orderNumber: { startsWith: 'PRT-' },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      select: {
        id: true,
        orderNumber: true,
        status: true,
        deliveryAddress: true,
        notes: true,
        deliveryFeeCents: true,
        createdAt: true,
        deliveredAt: true,
      },
    });
    return orders;
  }
}

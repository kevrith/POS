import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { MpesaService } from '../payments/mpesa.service';
import { SalesService } from '../sales/sales.service';
import { SaleType } from '@pos/shared';

@Injectable()
export class PortalService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private mpesa: MpesaService,
    private sales: SalesService,
  ) {}

  /**
   * Verify an M-Pesa STK result and, if paid, mark the portal order PAID and turn
   * it into a real Sale (inventory + loyalty + eTIMS). Best-effort: a failure to
   * build the Sale never blocks marking the order paid.
   */
  async confirmPayment(orderId: string, checkoutRequestId: string) {
    const order = await this.prisma.deliveryOrder.findUnique({
      where: { id: orderId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('Order not found');
    if (order.paymentStatus === 'PAID') {
      return { paid: true, orderId, saleId: order.saleId };
    }

    // Trust M-Pesa, not the client, before flipping the order to paid.
    const status = await this.mpesa.querySTKStatus(checkoutRequestId);
    if (status.status !== 'paid') {
      return { paid: false, status: status.status, message: status.resultDesc };
    }

    await this.prisma.deliveryOrder.update({
      where: { id: orderId },
      data: {
        paymentStatus: 'PAID',
        paymentRef: checkoutRequestId,
        ...(order.status === 'PENDING' && { status: 'CONFIRMED', acceptedAt: new Date() }),
      },
    });

    // Reconcile into a Sale when every line maps to a catalog item.
    let saleId: string | null = order.saleId ?? null;
    const lineItems = order.items
      .filter((i) => !!i.itemId)
      .map((i) => ({ itemId: i.itemId as string, quantity: i.quantity }));
    if (!saleId && lineItems.length > 0 && lineItems.length === order.items.length) {
      try {
        const cashier = await this.prisma.user.findFirst({
          where: { businessId: order.businessId, role: 'OWNER' },
          select: { id: true },
        });
        if (cashier) {
          const sale = await this.sales.createSale(order.businessId, {
            storeId: order.storeId,
            cashierId: cashier.id,
            customerId: order.customerId ?? undefined,
            type: SaleType.NORMAL,
            priceLevel: 'RETAIL',
            items: lineItems,
            payments: [{ method: 'MPESA', amountCents: order.totalCents, reference: checkoutRequestId }],
          });
          saleId = (sale as { id?: string })?.id ?? null;
          if (saleId) {
            await this.prisma.deliveryOrder.update({ where: { id: orderId }, data: { saleId } });
          }
        }
      } catch {
        // Best-effort reconciliation — the order stays PAID even if Sale build fails.
      }
    }

    return { paid: true, orderId, saleId };
  }

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
    if (!store) throw new BadRequestException('No store found');

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

    throw new BadRequestException('No tables available at that time. Please try another slot.');
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
    items: Array<{ itemId?: string; name: string; quantity: number; priceCents: number }>;
    orderType: 'DELIVERY' | 'PICKUP';
    notes?: string;
  }) {
    if (!dto.items?.length) throw new BadRequestException('Order has no items');

    // Get first store for this business
    const store = await this.prisma.store.findFirst({ where: { businessId: dto.businessId } });
    if (!store) throw new BadRequestException('No store found');

    // Link to the registered customer (created at OTP login) so the order shows
    // up in their authenticated history and earns loyalty when paid.
    const customer = dto.phone
      ? await this.prisma.customer.findFirst({
          where: { businessId: dto.businessId, phone: dto.phone },
          select: { id: true },
        })
      : null;

    // Totals — prices are VAT-inclusive, so extract the embedded 16% VAT.
    const subtotalCents = dto.items.reduce((s, i) => s + i.priceCents * i.quantity, 0);
    const taxCents = Math.round(subtotalCents * 16 / 116);

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
        channel: 'PORTAL',
        fulfillmentType: dto.orderType,
        customerId: customer?.id ?? null,
        customerName: dto.customerName,
        customerPhone: dto.phone,
        deliveryAddress: dto.orderType === 'DELIVERY' ? dto.address : 'PICKUP',
        subtotalCents,
        taxCents,
        totalCents: subtotalCents,
        status: 'PENDING',
        paymentStatus: 'UNPAID',
        notes: dto.notes ?? null,
        items: {
          create: dto.items.map((i) => ({
            itemId: i.itemId ?? null,
            name: i.name,
            quantity: i.quantity,
            unitPriceCents: i.priceCents,
            totalCents: i.priceCents * i.quantity,
          })),
        },
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

    return { orderNumber: order.orderNumber, orderId: order.id, status: 'PENDING', totalCents: subtotalCents };
  }

  /** Legacy phone-based history (kept for the public tracking screen). */
  async getOrderHistory(phone: string, businessId: string) {
    const orders = await this.prisma.deliveryOrder.findMany({
      where: {
        businessId,
        customerPhone: phone,
        orderNumber: { startsWith: 'PRT-' },
      },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        items: { select: { name: true, quantity: true, unitPriceCents: true, totalCents: true } },
      },
    });
    return orders;
  }
}

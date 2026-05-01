import {
  Injectable,
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createHash, randomBytes } from 'crypto';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class CustomerPortalService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── Auth ─────────────────────────────────────────────────────────────────

  async requestOtp(phone: string, businessId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { phone, businessId },
      select: { id: true, name: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found with this phone number');
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = createHash('sha256').update(otp).digest('hex');
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Upsert session
    await this.prisma.customerPortalSession.upsert({
      where: { sessionToken: `otp-placeholder-${customer.id}` },
      update: {
        otpHash,
        otpExpiresAt,
        expiresAt: otpExpiresAt,
      },
      create: {
        customerId: customer.id,
        phone,
        sessionToken: `otp-placeholder-${customer.id}`,
        otpHash,
        otpExpiresAt,
        expiresAt: otpExpiresAt,
      },
    });

    // In production: send via AT SMS. In dev, return OTP for testing.
    const isDev = process.env.NODE_ENV !== 'production';
    return {
      sent: true,
      customerId: customer.id,
      ...(isDev ? { otp } : {}),
    };
  }

  async verifyOtp(phone: string, otp: string, businessId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { phone, businessId },
      select: { id: true, name: true, shopCode: true },
    });
    if (!customer) {
      throw new NotFoundException('Customer not found');
    }

    // Find pending OTP session
    const session = await this.prisma.customerPortalSession.findFirst({
      where: {
        customerId: customer.id,
        phone,
        otpExpiresAt: { gt: new Date() },
        otpHash: { not: null },
      },
    });

    if (!session) {
      throw new UnauthorizedException('OTP has expired or not found');
    }

    const inputHash = createHash('sha256').update(otp).digest('hex');
    if (inputHash !== session.otpHash) {
      throw new UnauthorizedException('Invalid OTP');
    }

    // Generate real session token
    const rawToken = randomBytes(32).toString('hex');
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days

    // Replace the OTP-placeholder session with a real session
    await this.prisma.customerPortalSession.delete({ where: { id: session.id } });
    await this.prisma.customerPortalSession.create({
      data: {
        customerId: customer.id,
        phone,
        sessionToken: tokenHash,
        otpHash: null,
        otpExpiresAt: null,
        expiresAt,
      },
    });

    return {
      sessionToken: rawToken,
      customerId: customer.id,
      shopCode: customer.shopCode,
      customerName: customer.name,
    };
  }

  // ─── Orders ───────────────────────────────────────────────────────────────

  async getPortalOrders(customerId: string) {
    return this.prisma.fieldOrder.findMany({
      where: { customerId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        items: true,
        route: { select: { id: true, name: true } },
        deliveryRunOrders: {
          select: {
            id: true,
            status: true,
            deliveredAt: true,
            proof: { select: { id: true, receivedByName: true, capturedAt: true } },
          },
        },
      },
    });
  }

  // ─── Statement ────────────────────────────────────────────────────────────

  async getPortalStatement(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        creditLimitCents: true,
        paymentTermsDays: true,
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // Outstanding: sum of unpaid/partial field orders
    const outstandingAgg = await this.prisma.fieldOrder.aggregate({
      where: {
        customerId,
        paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
        status: { notIn: ['CANCELLED', 'DRAFT'] },
      },
      _sum: { totalCents: true },
    });
    const outstandingCents = outstandingAgg._sum.totalCents ?? 0;

    // Recent payments (paid orders)
    const recentPayments = await this.prisma.fieldOrder.findMany({
      where: {
        customerId,
        paymentStatus: 'PAID',
      },
      orderBy: { updatedAt: 'desc' },
      take: 10,
      select: {
        id: true,
        orderNumber: true,
        totalCents: true,
        paidAmountCents: true,
        paymentMethod: true,
        mpesaReference: true,
        updatedAt: true,
      },
    });

    return {
      customerId: customer.id,
      customerName: customer.name,
      creditLimitCents: customer.creditLimitCents,
      outstandingCents,
      availableCreditCents: Math.max(
        0,
        (customer.creditLimitCents ?? 0) - outstandingCents,
      ),
      paymentTermsDays: customer.paymentTermsDays,
      recentPayments,
    };
  }

  // ─── Payment ──────────────────────────────────────────────────────────────

  async requestPayment(
    customerId: string,
    fieldOrderId: string,
    method: 'STK_PUSH' | 'PAYBILL',
  ) {
    const order = await this.prisma.fieldOrder.findFirst({
      where: { id: fieldOrderId, customerId },
      include: { customer: { select: { phone: true } } },
    });
    if (!order) throw new NotFoundException('Field order not found');
    if (order.paymentStatus === 'PAID') {
      throw new BadRequestException('Order is already paid');
    }

    if (method === 'PAYBILL') {
      // Return paybill details; actual paybill from business settings (stub)
      return {
        method: 'PAYBILL',
        paybillNumber: '400200', // stub — would come from Business settings
        accountReference: order.orderNumber ?? order.id,
        amountCents: order.totalCents - order.paidAmountCents,
        message: `Pay KES ${((order.totalCents - order.paidAmountCents) / 100).toFixed(2)} via Paybill 400200, Account: ${order.orderNumber ?? order.id}`,
      };
    }

    // STK_PUSH stub — wire to MpesaService when available
    return {
      method: 'STK_PUSH',
      message: 'STK push initiated (stub — integrate with MpesaService)',
      amountCents: order.totalCents - order.paidAmountCents,
    };
  }

  // ─── Reorder ──────────────────────────────────────────────────────────────

  async requestReorder(customerId: string, fieldOrderId: string) {
    const original = await this.prisma.fieldOrder.findFirst({
      where: { id: fieldOrderId, customerId },
      include: {
        items: true,
        customer: { select: { name: true, salesAgentId: true } },
      },
    });
    if (!original) throw new NotFoundException('Field order not found');

    // Duplicate as DRAFT
    const newOrder = await this.prisma.fieldOrder.create({
      data: {
        offlineId: uuidv4(),
        businessId: original.businessId,
        agentId: original.agentId,
        customerId: original.customerId,
        routeId: original.routeId,
        status: 'DRAFT',
        subtotalCents: original.subtotalCents,
        vatCents: original.vatCents,
        totalCents: original.totalCents,
        isSampleOrder: false,
        notes: `Reorder of ${original.orderNumber ?? original.id}`,
        items: {
          create: original.items.map((item) => ({
            itemId: item.itemId,
            itemName: item.itemName,
            itemSku: item.itemSku,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalCents: item.totalCents,
            isSample: false,
          })),
        },
      },
      include: { items: true },
    });

    // Notify the agent
    if (original.customer.salesAgentId) {
      await this.notifications.createNotification({
        businessId: original.businessId,
        type: 'REORDER_REQUEST',
        priority: 'NORMAL',
        title: 'Reorder Request',
        body: `Customer ${original.customer.name} has requested a reorder`,
        entityId: newOrder.id,
        entityType: 'FieldOrder',
      });
    }

    return newOrder;
  }
}

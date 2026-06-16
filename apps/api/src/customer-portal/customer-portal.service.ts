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

  async requestOtp(phone: string, businessId: string, name?: string) {
    if (!phone?.trim()) throw new BadRequestException('Phone number is required');
    if (!businessId) throw new BadRequestException('Business is required');

    // Self-service registration: find the customer or create one on first contact.
    // A bare phone-only Customer is harmless; phoneVerifiedAt gates "real" identity.
    let customer = await this.prisma.customer.findFirst({
      where: { phone, businessId },
      select: { id: true, name: true },
    });
    let isNew = false;
    if (!customer) {
      customer = await this.prisma.customer.create({
        data: { businessId, phone, name: name?.trim() || 'Customer' },
        select: { id: true, name: true },
      });
      isNew = true;
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const otpHash = createHash('sha256').update(otp).digest('hex');
    const otpExpiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

    // Upsert the OTP-placeholder session for this customer
    await this.prisma.customerPortalSession.upsert({
      where: { sessionToken: `otp-placeholder-${customer.id}` },
      update: { otpHash, otpExpiresAt, expiresAt: otpExpiresAt },
      create: {
        customerId: customer.id,
        phone,
        sessionToken: `otp-placeholder-${customer.id}`,
        otpHash,
        otpExpiresAt,
        expiresAt: otpExpiresAt,
      },
    });

    // Send the code via SMS (Africa's Talking). Fire-and-forget so an SMS failure
    // never blocks login; dev still echoes the OTP for testing.
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { name: true },
    });
    const brand = business?.name ?? 'KASTRA';
    this.notifications
      .sendSMS(businessId, phone, `${otp} is your ${brand} verification code. It expires in 10 minutes.`)
      .catch(() => {});

    const isDev = process.env.NODE_ENV !== 'production';
    return {
      sent: true,
      customerId: customer.id,
      isNew,
      ...(isDev ? { otp } : {}),
    };
  }

  async verifyOtp(phone: string, otp: string, businessId: string, name?: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { phone, businessId },
      select: { id: true, name: true, shopCode: true, phoneVerifiedAt: true },
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

    // First verified login for this phone → treat as a brand-new registration.
    const isNew = !customer.phoneVerifiedAt;

    // Capture/refresh profile: stamp verification, and set the name if the
    // customer supplied one and we only had the placeholder default.
    const shouldSetName = !!name?.trim() && (isNew || !customer.name || customer.name === 'Customer');
    const updated = await this.prisma.customer.update({
      where: { id: customer.id },
      data: {
        ...(customer.phoneVerifiedAt ? {} : { phoneVerifiedAt: new Date() }),
        ...(shouldSetName ? { name: name!.trim() } : {}),
      },
      select: { name: true, shopCode: true },
    });

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
      token: rawToken, // alias — web portal reads `token`, mobile reads `sessionToken`
      customerId: customer.id,
      shopCode: updated.shopCode,
      customerName: updated.name,
      isNew,
    };
  }

  // ─── Profile ──────────────────────────────────────────────────────────────

  async getProfile(customerId: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        shopCode: true,
        loyaltyPoints: true,
        phoneVerifiedAt: true,
        businessId: true,
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }

  async updateProfile(customerId: string, dto: { name?: string; email?: string }) {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { id: true } });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.prisma.customer.update({
      where: { id: customerId },
      data: {
        ...(dto.name?.trim() ? { name: dto.name.trim() } : {}),
        ...(dto.email !== undefined ? { email: dto.email.trim() || null } : {}),
      },
      select: { id: true, name: true, phone: true, email: true, loyaltyPoints: true },
    });
  }

  /** KDPA: customer-initiated data deletion. Creates a PENDING request the business
   *  owner reviews in Settings → KDPA (review cascades to anonymize the customer). */
  async requestAccountDeletion(customerId: string, reason?: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { id: true, businessId: true },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    const existing = await this.prisma.dataDeletionRequest.findFirst({
      where: { customerId, status: 'PENDING' },
    });
    if (existing) return { requested: true, status: 'PENDING', id: existing.id };

    const req = await this.prisma.dataDeletionRequest.create({
      data: {
        businessId: customer.businessId,
        requestedBy: 'CUSTOMER',
        customerId,
        reason: reason?.trim() || 'Customer self-service deletion request',
        status: 'PENDING',
      },
    });
    return { requested: true, status: 'PENDING', id: req.id };
  }

  // ─── Orders (unified: online portal orders + agent field orders) ──────────

  async getPortalOrders(customerId: string) {
    const [online, field] = await Promise.all([
      this.prisma.deliveryOrder.findMany({
        where: { customerId, channel: 'PORTAL' },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { items: true },
      }),
      this.prisma.fieldOrder.findMany({
        where: { customerId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        include: { items: true },
      }),
    ]);

    const normalized = [
      ...online.map((o) => this.normalizeOnline(o)),
      ...field.map((o) => this.normalizeField(o)),
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return normalized;
  }

  async getPortalOrder(customerId: string, orderId: string) {
    const online = await this.prisma.deliveryOrder.findFirst({
      where: { id: orderId, customerId, channel: 'PORTAL' },
      include: { items: true },
    });
    if (online) return this.normalizeOnline(online);

    const field = await this.prisma.fieldOrder.findFirst({
      where: { id: orderId, customerId },
      include: {
        items: true,
        route: { select: { id: true, name: true } },
        deliveryRunOrders: {
          select: {
            id: true, status: true, deliveredAt: true,
            proof: { select: { id: true, receivedByName: true, capturedAt: true } },
          },
        },
      },
    });
    if (!field) throw new NotFoundException('Order not found');
    return this.normalizeField(field);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private normalizeOnline(o: any) {
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      channel: 'ONLINE' as const,
      status: o.status,
      paymentStatus: o.paymentStatus,
      fulfillmentType: o.fulfillmentType,
      deliveryAddress: o.deliveryAddress,
      etaMinutes: o.etaMinutes,
      totalCents: o.totalCents,
      invoiceNumber: null as string | null,
      createdAt: o.createdAt,
      deliveredAt: o.deliveredAt,
      items: (o.items ?? []).map((i: any) => ({
        itemId: i.itemId, name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents, totalCents: i.totalCents,
      })),
    };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private normalizeField(o: any) {
    return {
      id: o.id,
      orderNumber: o.orderNumber ?? o.id.slice(0, 8),
      channel: 'AGENT' as const,
      status: o.status,
      paymentStatus: o.paymentStatus,
      fulfillmentType: 'DELIVERY' as const,
      deliveryAddress: null as string | null,
      etaMinutes: null as number | null,
      totalCents: o.totalCents,
      invoiceNumber: o.invoiceNumber ?? null,
      createdAt: o.createdAt,
      deliveredAt: o.deliveredAt ?? null,
      items: (o.items ?? []).map((i: any) => ({
        itemId: i.itemId, name: i.itemName, quantity: i.quantity, unitPriceCents: i.unitPriceCents, totalCents: i.totalCents,
      })),
    };
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

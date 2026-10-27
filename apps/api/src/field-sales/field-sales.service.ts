import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { v4 as uuidv4 } from 'uuid';

import { requireArray } from '../common/validate';

interface CreateRouteDto {
  name: string;
  branchId?: string;
  deliveryDays: string[];
  driverUserId?: string;
  color?: string;
}

interface UpdateRouteDto {
  name?: string;
  branchId?: string;
  deliveryDays?: string[];
  driverUserId?: string;
  color?: string;
  isActive?: boolean;
}

interface RegisterCustomerDto {
  name: string;
  phone: string;
  kraPin?: string;
  shopType?: string;
  gpsLat?: number;
  gpsLng?: number;
  routeId?: string;
  creditLimitCents?: number;
  /** Client-supplied idempotency key for offline queue replay (mobile-agent). */
  offlineId?: string;
}

interface CreateFieldOrderDto {
  customerId: string;
  routeId?: string;
  items: {
    itemId?: string;
    itemName: string;
    itemSku?: string;
    quantity: number;
    unitPriceCents: number;
    isSample?: boolean;
  }[];
  notes?: string;
  isSampleOrder?: boolean;
  /** Client-supplied idempotency key for offline queue replay (mobile-agent). */
  offlineId?: string;
}

interface UpdateFieldOrderStatusDto {
  status?: string;
  rejectionReason?: string;
  expectedDeliveryDate?: string;
  packedBy?: string;
}

interface RequestCreditIncreaseDto {
  customerId: string;
  fieldOrderId?: string;
  requestedBy: string;
  currentLimitCents: number;
  requestedLimitCents: number;
  orderTotalCents: number;
  reason?: string;
}

interface ReviewCreditRequestDto {
  status: 'APPROVED' | 'DECLINED';
  reviewNote?: string;
}

@Injectable()
export class FieldSalesService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  // ─── Routes ──────────────────────────────────────────────────────────────

  async createRoute(businessId: string, dto: CreateRouteDto) {
    return this.prisma.salesRoute.create({
      data: {
        businessId,
        name: dto.name,
        branchId: dto.branchId,
        deliveryDays: JSON.stringify(dto.deliveryDays ?? []),
        driverUserId: dto.driverUserId,
        color: dto.color ?? '#6366F1',
      },
    });
  }

  async getRoutes(businessId: string) {
    const routes = await this.prisma.salesRoute.findMany({
      where: { businessId, isActive: true },
      orderBy: { name: 'asc' },
      include: { _count: { select: { customers: true, fieldOrders: true } } },
    });
    return routes.map((r) => ({
      ...r,
      deliveryDays: this.parseDays(r.deliveryDays),
    }));
  }

  async updateRoute(id: string, dto: UpdateRouteDto) {
    const data: Record<string, unknown> = { ...dto };
    if (dto.deliveryDays !== undefined) {
      data.deliveryDays = JSON.stringify(dto.deliveryDays);
    }
    return this.prisma.salesRoute.update({ where: { id }, data });
  }

  async deleteRoute(id: string) {
    await this.prisma.salesRoute.update({
      where: { id },
      data: { isActive: false },
    });
    return { success: true };
  }

  // ─── Customers ───────────────────────────────────────────────────────────

  async getAgentCustomers(agentId: string, businessId: string, search?: string) {
    const where: Record<string, unknown> = { businessId };
    if (agentId) where.salesAgentId = agentId;
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
        { shopCode: { contains: search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { route: { select: { id: true, name: true, color: true } } },
    });
  }

  async registerCustomer(
    agentId: string,
    businessId: string,
    dto: RegisterCustomerDto,
  ) {
    // Idempotency: a retried offline registration returns the existing customer
    // instead of creating a duplicate (offlineId is @unique on Customer).
    if (dto.offlineId) {
      const existing = await this.prisma.customer.findUnique({
        where: { offlineId: dto.offlineId },
      });
      if (existing) return existing;
    }

    // Auto-generate shopCode: SHOP-XXXX
    const result = await this.prisma.$queryRaw<{ max: string | null }[]>`
      SELECT MAX("shopCode") as max FROM "Customer" WHERE "businessId" = ${businessId}
    `;
    const lastCode = result[0]?.max;
    let nextNum = 1;
    if (lastCode) {
      const parts = lastCode.split('-');
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num)) nextNum = num + 1;
    }
    const shopCode = `SHOP-${String(nextNum).padStart(4, '0')}`;

    return this.prisma.customer.create({
      data: {
        businessId,
        salesAgentId: agentId,
        name: dto.name,
        phone: dto.phone,
        kraPin: dto.kraPin,
        shopType: dto.shopType,
        gpsLat: dto.gpsLat,
        gpsLng: dto.gpsLng,
        routeId: dto.routeId,
        creditLimitCents: dto.creditLimitCents ?? 0,
        shopCode,
        offlineId: dto.offlineId,
      },
    });
  }

  async updateCustomerRoute(customerId: string, routeId: string) {
    return this.prisma.customer.update({
      where: { id: customerId },
      data: { routeId },
    });
  }

  async getCustomerOrderHistory(
    customerId: string,
    agentId: string,
    businessId: string,
  ) {
    const orders = await this.prisma.fieldOrder.findMany({
      where: { customerId, agentId, businessId },
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        items: true,
        customer: { select: { name: true, shopCode: true, phone: true } },
      },
    });

    return orders;
  }

  // ─── Field Orders ─────────────────────────────────────────────────────────

  async createFieldOrder(
    agentId: string,
    businessId: string,
    dto: CreateFieldOrderDto,
  ) {
    // Idempotency: if the client retried a queued order, return the existing one
    // instead of creating a duplicate (offlineId is @unique on FieldOrder).
    if (dto.offlineId) {
      const existing = await this.prisma.fieldOrder.findUnique({
        where: { offlineId: dto.offlineId },
        include: {
          items: true,
          customer: { select: { name: true, shopCode: true, phone: true } },
          agent: { select: { name: true } },
          route: { select: { name: true } },
        },
      });
      if (existing) return existing;
    }

    // Get agent's default store via UserStore junction
    const userStore = await this.prisma.userStore.findFirst({
      where: { userId: agentId },
      select: { storeId: true },
    });

    // Check customer credit limit
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, businessId },
    });
    if (!customer) throw new NotFoundException('Customer not found');

    // Calculate totals — respect business tax setting
    const businessSettings = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { taxType: true },
    });
    requireArray(dto.items, 'items');
    const subtotalCents = dto.items.reduce(
      (sum, item) => sum + item.quantity * item.unitPriceCents,
      0,
    );
    const vatCents = businessSettings?.taxType === 'VAT' ? Math.round(subtotalCents * 0.16) : 0;
    const totalCents = subtotalCents + vatCents;

    // Check credit limit (only for non-sample orders)
    if (!dto.isSampleOrder && customer.creditLimitCents > 0) {
      // Get outstanding unpaid amount
      const unpaidAgg = await this.prisma.fieldOrder.aggregate({
        where: {
          customerId: dto.customerId,
          paymentStatus: { in: ['UNPAID', 'PARTIAL'] },
          status: { notIn: ['CANCELLED'] },
        },
        _sum: { totalCents: true },
      });
      const outstandingCents = unpaidAgg._sum.totalCents ?? 0;

      if (outstandingCents + totalCents > customer.creditLimitCents) {
        throw new BadRequestException({
          code: 'CREDIT_LIMIT_EXCEEDED',
          message: 'Order total exceeds customer credit limit',
          creditLimitCents: customer.creditLimitCents,
          outstandingCents,
          orderTotalCents: totalCents,
        });
      }
    }

    // Generate orderNumber: FO-XXXX
    const result = await this.prisma.$queryRaw<{ max: string | null }[]>`
      SELECT MAX("orderNumber") as max FROM "FieldOrder" WHERE "businessId" = ${businessId}
    `;
    const lastNum = result[0]?.max;
    let nextNum = 1;
    if (lastNum) {
      const parts = lastNum.split('-');
      const num = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(num)) nextNum = num + 1;
    }
    const orderNumber = `FO-${String(nextNum).padStart(4, '0')}`;

    // Stock availability check
    if (!dto.isSampleOrder) {
      for (const item of dto.items) {
        if (!item.itemId) continue;
        const inv = await this.prisma.inventoryMovement.aggregate({
          where: { itemId: item.itemId, businessId },
          _sum: { quantity: true },
        });
        const available = inv._sum.quantity ?? 0;
        if (available < item.quantity) {
          throw new BadRequestException({
            code: 'INSUFFICIENT_STOCK',
            message: `Insufficient stock for "${item.itemName}". Available: ${available}, Requested: ${item.quantity}`,
            itemName: item.itemName,
            available,
            requested: item.quantity,
          });
        }
      }
    }

    const order = await this.prisma.fieldOrder.create({
      data: {
        offlineId: dto.offlineId ?? uuidv4(),
        businessId,
        storeId: userStore?.storeId ?? undefined,
        agentId,
        customerId: dto.customerId,
        routeId: dto.routeId,
        orderNumber,
        status: 'SUBMITTED',
        subtotalCents,
        vatCents,
        totalCents,
        isSampleOrder: dto.isSampleOrder ?? false,
        notes: dto.notes,
        items: {
          create: dto.items.map((item) => ({
            itemId: item.itemId,
            itemName: item.itemName,
            itemSku: item.itemSku,
            quantity: item.quantity,
            unitPriceCents: item.unitPriceCents,
            totalCents: item.quantity * item.unitPriceCents,
            isSample: item.isSample ?? false,
          })),
        },
      },
      include: { 
        items: true, 
        customer: { select: { name: true, shopCode: true, phone: true } },
        agent: { select: { name: true } },
        route: { select: { name: true } }
      },
    });

    // Record agent visit
    await this.prisma.agentVisit.create({
      data: {
        agentId,
        businessId,
        customerId: dto.customerId,
        fieldOrderId: order.id,
        outcome: 'ORDERED',
      },
    });

    return order;
  }

  async getFieldOrders(
    businessId: string,
    filters: {
      agentId?: string;
      status?: string;
      routeId?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    const where: Record<string, unknown> = { businessId };
    if (filters.agentId) where.agentId = filters.agentId;
    if (filters.status) where.status = filters.status;
    if (filters.routeId) where.routeId = filters.routeId;
    if (filters.startDate || filters.endDate) {
      where.createdAt = {
        ...(filters.startDate ? { gte: new Date(filters.startDate) } : {}),
        ...(filters.endDate ? { lte: new Date(filters.endDate + 'T23:59:59.999Z') } : {}),
      };
    }

    const orders = await this.prisma.fieldOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        items: true,
        customer: { select: { id: true, name: true, shopCode: true, phone: true } },
        agent: { select: { id: true, name: true } },
        route: { select: { id: true, name: true } },
      },
    });

    // Transform to match frontend expectations
    return orders.map(order => ({
      ...order,
      customerName: order.customer?.name,
      shopCode: order.customer?.shopCode,
      agentName: order.agent?.name,
      routeName: order.route?.name,
    }));
  }

  async getFieldOrder(id: string, businessId: string) {
    const order = await this.prisma.fieldOrder.findFirst({
      where: { id, businessId },
      include: {
        items: true,
        customer: true,
        agent: { select: { id: true, name: true, phone: true } },
        route: true,
        creditRequests: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        deliveryRunOrders: {
          include: { proof: true },
        },
      },
    });
    if (!order) throw new NotFoundException('Field order not found');
    return order;
  }

  async updateFieldOrderStatus(
    id: string,
    businessId: string,
    status: string,
    extra?: UpdateFieldOrderStatusDto,
  ) {
    const order = await this.prisma.fieldOrder.findFirst({
      where: { id, businessId },
    });
    if (!order) throw new NotFoundException('Field order not found');

    const validTransitions: Record<string, string[]> = {
      SUBMITTED: ['CONFIRMED', 'CANCELLED'],
      CONFIRMED: ['PACKED', 'CANCELLED'],
      PACKED: ['DISPATCHED', 'CANCELLED'],
      DISPATCHED: ['DELIVERED', 'CANCELLED'],
      DELIVERED: [],
    };

    const allowed = validTransitions[order.status] ?? [];
    if (!allowed.includes(status)) {
      throw new BadRequestException(
        `Cannot transition from ${order.status} to ${status}`,
      );
    }

    const updateData: Record<string, unknown> = { status };

    if (status === 'CONFIRMED') {
      updateData.confirmedAt = new Date();
      if (extra?.expectedDeliveryDate) {
        updateData.expectedDeliveryDate = new Date(extra.expectedDeliveryDate);
      }
    } else if (status === 'PACKED') {
      updateData.packedAt = new Date();
    } else if (status === 'DISPATCHED') {
      updateData.dispatchedAt = new Date();
      // Deduct stock when order is dispatched
      if (order.storeId) {
        const items = await this.prisma.fieldOrderItem.findMany({ where: { fieldOrderId: id } });
        for (const item of items) {
          if (!item.itemId || item.isSample) continue;
          await this.prisma.inventoryMovement.create({
            data: {
              offlineId: uuidv4(),
              businessId,
              itemId: item.itemId,
              storeId: order.storeId,
              type: 'SALE',
              quantity: -item.quantity,
              source: 'FIELD_ORDER',
            },
          });
        }
      }
    } else if (status === 'DELIVERED') {
      updateData.deliveredAt = new Date();
    } else if (status === 'CANCELLED') {
      if (extra?.rejectionReason) {
        updateData.rejectionReason = extra.rejectionReason;
      }
    }

    return this.prisma.fieldOrder.update({
      where: { id },
      data: updateData,
      include: { items: true, customer: { select: { name: true } } },
    });
  }

  // ─── Credit Approval ──────────────────────────────────────────────────────

  async requestCreditIncrease(
    businessId: string,
    dto: RequestCreditIncreaseDto,
  ) {
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId },
      select: { name: true },
    });
    const agent = await this.prisma.user.findUnique({
      where: { id: dto.requestedBy },
      select: { name: true },
    });

    const request = await this.prisma.creditApprovalRequest.create({
      data: {
        businessId,
        customerId: dto.customerId,
        fieldOrderId: dto.fieldOrderId,
        requestedBy: dto.requestedBy,
        currentLimitCents: dto.currentLimitCents,
        requestedLimitCents: dto.requestedLimitCents,
        orderTotalCents: dto.orderTotalCents,
        reason: dto.reason,
        status: 'PENDING',
      },
    });

    // Notify all managers/owners
    const managers = await this.prisma.user.findMany({
      where: { businessId, role: { in: ['MANAGER', 'OWNER'] } },
      select: { id: true },
    });

    const agentName = agent?.name ?? 'Agent';
    const customerName = customer?.name ?? 'Customer';
    const fromKes = (dto.currentLimitCents / 100).toFixed(0);
    const toKes = (dto.requestedLimitCents / 100).toFixed(0);

    for (const _mgr of managers) {
      await this.notifications.createNotification({
        businessId,
        type: 'CREDIT_REQUEST',
        priority: 'HIGH',
        title: 'Credit Increase Request',
        body: `${agentName} is requesting credit increase for ${customerName} from KES ${fromKes} to KES ${toKes}`,
        entityId: request.id,
        entityType: 'CreditApprovalRequest',
      });
    }

    return request;
  }

  async reviewCreditRequest(
    id: string,
    reviewedBy: string,
    dto: ReviewCreditRequestDto,
  ) {
    const req = await this.prisma.creditApprovalRequest.findUnique({
      where: { id },
      include: {
        customer: { select: { name: true } },
        requestedByUser: { select: { id: true, name: true } },
      },
    });
    if (!req) throw new NotFoundException('Credit request not found');

    const updated = await this.prisma.creditApprovalRequest.update({
      where: { id },
      data: {
        status: dto.status,
        reviewedBy,
        reviewedAt: new Date(),
        reviewNote: dto.reviewNote,
      },
    });

    // If approved, update the customer's credit limit
    if (dto.status === 'APPROVED') {
      await this.prisma.customer.update({
        where: { id: req.customerId },
        data: { creditLimitCents: req.requestedLimitCents },
      });
    }

    // Notify the requesting agent
    await this.notifications.createNotification({
      businessId: req.businessId,
      type: 'CREDIT_REQUEST_REVIEWED',
      priority: 'NORMAL',
      title: `Credit request ${dto.status === 'APPROVED' ? 'Approved' : 'Declined'}`,
      body: `Credit request for ${req.customer.name} was ${dto.status}`,
      entityId: req.requestedByUser.id,
      entityType: 'User',
    });

    return updated;
  }

  async getPendingCreditRequests(businessId: string, status?: string) {
    return this.prisma.creditApprovalRequest.findMany({
      where: {
        businessId,
        ...(status ? { status } : { status: 'PENDING' }),
      },
      orderBy: { createdAt: 'desc' },
      include: {
        customer: { select: { id: true, name: true, shopCode: true } },
        requestedByUser: { select: { id: true, name: true } },
        fieldOrder: { select: { id: true, orderNumber: true, totalCents: true } },
      },
    });
  }

  // ─── Agent Stats ──────────────────────────────────────────────────────────

  async getAgentStats(
    agentId: string,
    businessId: string,
    month: number,
    year: number,
  ) {
    const now = new Date();
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const todayEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    const daysInMonth = new Date(year, month, 0).getDate();
    const daysLeftInMonth = Math.max(0, daysInMonth - now.getDate());

    const [monthOrders, todayOrders] = await Promise.all([
      this.prisma.fieldOrder.findMany({
        where: {
          agentId,
          businessId,
          createdAt: { gte: startDate, lte: endDate },
          status: { not: 'CANCELLED' },
        },
        select: {
          id: true,
          orderNumber: true,
          status: true,
          totalCents: true,
          paymentStatus: true,
          createdAt: true,
          customer: { select: { name: true, shopCode: true } },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.fieldOrder.findMany({
        where: {
          agentId,
          businessId,
          createdAt: { gte: todayStart, lte: todayEnd },
          status: { not: 'CANCELLED' },
        },
        select: { totalCents: true },
      }),
    ]);

    const ordersThisMonth = monthOrders.length;
    const valueThisMonthCents = monthOrders.reduce((s, o) => s + o.totalCents, 0);
    const ordersToday = todayOrders.length;
    const valueTodayCents = todayOrders.reduce((s, o) => s + o.totalCents, 0);

    // Commission: use agent's Employee commissionRate, fall back to 3%
    const employee = await this.prisma.employee.findFirst({
      where: { userId: agentId, businessId },
      select: { commissionRate: true, salesTargetCents: true },
    });
    const commissionRate = (employee?.commissionRate ?? 3) / 100;
    const paidDeliveredValueCents = monthOrders
      .filter((o) => o.status === 'DELIVERED' && o.paymentStatus === 'PAID')
      .reduce((s, o) => s + o.totalCents, 0);
    const commissionEarnedCents = Math.round(paidDeliveredValueCents * commissionRate);

    const commissionTargetCents = employee?.salesTargetCents ?? 10_000_000;

    const recentOrders = monthOrders.slice(0, 10).map((o) => ({
      id: o.id,
      orderNumber: o.orderNumber ?? '',
      customerName: o.customer?.name ?? '',
      shopCode: o.customer?.shopCode ?? '',
      totalCents: o.totalCents,
      status: o.status,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt.toISOString(),
    }));

    return {
      ordersToday,
      valueTodayCents,
      ordersThisMonth,
      valueThisMonthCents,
      commissionEarnedCents,
      commissionTargetCents,
      daysLeftInMonth,
      recentOrders,
    };
  }

  // ─── Payment Collection ────────────────────────────────────────────────────

  async collectPayment(orderId: string, businessId: string, dto: { amountCents: number; method: string; reference?: string; collectedBy: string; offlineId?: string }) {
    // Idempotency: if this exact payment was already recorded (offline replay),
    // return the order untouched — never double-count money.
    if (dto.offlineId) {
      const existing = await this.prisma.fieldOrderPayment.findUnique({
        where: { offlineId: dto.offlineId },
      });
      if (existing) {
        return this.prisma.fieldOrder.findFirst({ where: { id: orderId, businessId } });
      }
    }

    const order = await this.prisma.fieldOrder.findFirst({ where: { id: orderId, businessId } });
    if (!order) throw new NotFoundException('Order not found');

    const newPaid = order.paidAmountCents + dto.amountCents;
    const paymentStatus = newPaid >= order.totalCents ? 'PAID' : newPaid > 0 ? 'PARTIAL' : 'UNPAID';

    // Record the payment (audit + idempotency) and update the order atomically.
    // The unique offlineId means a concurrent replay fails the create, so the
    // order increment only ever happens once per real payment.
    try {
      const [, updated] = await this.prisma.$transaction([
        this.prisma.fieldOrderPayment.create({
          data: {
            offlineId: dto.offlineId,
            fieldOrderId: orderId,
            businessId,
            amountCents: dto.amountCents,
            method: dto.method,
            reference: dto.reference,
            collectedBy: dto.collectedBy,
          },
        }),
        this.prisma.fieldOrder.update({
          where: { id: orderId },
          data: {
            paidAmountCents: newPaid,
            paymentStatus,
            paymentMethod: dto.method,
            mpesaReference: dto.reference,
          },
        }),
      ]);
      return updated;
    } catch (e: unknown) {
      // P2002 = unique constraint on offlineId → a parallel replay already
      // recorded it; return the current order rather than erroring.
      if ((e as { code?: string }).code === 'P2002') {
        return this.prisma.fieldOrder.findFirst({ where: { id: orderId, businessId } });
      }
      throw e;
    }
  }

  // ─── Visit Log ────────────────────────────────────────────────────────────

  async logVisit(agentId: string, businessId: string, customerId: string, dto: { outcome: string; notes?: string; fieldOrderId?: string; gpsLat?: number; gpsLng?: number }) {
    return this.prisma.agentVisit.create({
      data: { agentId, businessId, customerId, outcome: dto.outcome, notes: dto.notes, fieldOrderId: dto.fieldOrderId, gpsLat: dto.gpsLat, gpsLng: dto.gpsLng },
    });
  }

  async getVisits(customerId: string, businessId: string) {
    return this.prisma.agentVisit.findMany({
      where: { customerId, businessId },
      orderBy: { visitedAt: 'desc' },
      take: 20,
      include: { agent: { select: { id: true, name: true } } },
    });
  }

  // ─── Daily Call Plan ──────────────────────────────────────────────────────

  async getCallPlan(agentId: string, businessId: string) {
    // Customers assigned to this agent ordered by outstanding balance desc
    const customers = await this.prisma.customer.findMany({
      where: { businessId, salesAgentId: agentId },
      orderBy: { balanceCents: 'asc' }, // most negative = most outstanding
      take: 20,
      select: {
        id: true, name: true, phone: true, shopCode: true, shopType: true,
        creditLimitCents: true, balanceCents: true, gpsLat: true, gpsLng: true, routeId: true,
        _count: { select: { fieldOrders: true } },
        agentVisits: { orderBy: { visitedAt: 'desc' }, take: 1, select: { visitedAt: true, outcome: true } },
        fieldOrders: { where: { status: { not: 'CANCELLED' }, paymentStatus: { not: 'PAID' } }, orderBy: { createdAt: 'desc' }, take: 1, select: { id: true, orderNumber: true, totalCents: true, paidAmountCents: true, status: true } },
      },
    });

    const today = new Date();
    return customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      shopCode: c.shopCode,
      shopType: c.shopType,
      outstandingCents: Math.max(0, -(c.balanceCents ?? 0)),
      creditLimitCents: c.creditLimitCents,
      gpsLat: c.gpsLat,
      gpsLng: c.gpsLng,
      lastVisit: c.agentVisits[0]?.visitedAt ?? null,
      lastVisitOutcome: c.agentVisits[0]?.outcome ?? null,
      daysSinceVisit: c.agentVisits[0]
        ? Math.floor((today.getTime() - new Date(c.agentVisits[0].visitedAt).getTime()) / 86400000)
        : null,
      pendingOrder: c.fieldOrders[0] ?? null,
      totalOrders: c._count.fieldOrders,
      priority: c.balanceCents < 0 ? 'HIGH' : c.agentVisits[0] == null ? 'MEDIUM' : 'NORMAL',
    }));
  }

  // ─── Credit Collection ────────────────────────────────────────────────────

  async getCreditCollection(agentId: string, businessId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { businessId, salesAgentId: agentId, balanceCents: { lt: 0 } },
      orderBy: { balanceCents: 'asc' },
      select: {
        id: true, name: true, phone: true, shopCode: true, balanceCents: true, creditLimitCents: true,
        fieldOrders: {
          where: { paymentStatus: { not: 'PAID' }, status: { not: 'CANCELLED' } },
          orderBy: { createdAt: 'asc' },
          select: { id: true, orderNumber: true, totalCents: true, paidAmountCents: true, createdAt: true, status: true },
        },
      },
    });

    const today = new Date();
    return customers.map((c) => {
      const unpaidOrders = c.fieldOrders;
      const oldestUnpaid = unpaidOrders[0];
      const agingDays = oldestUnpaid
        ? Math.floor((today.getTime() - new Date(oldestUnpaid.createdAt).getTime()) / 86400000)
        : 0;
      return {
        id: c.id, name: c.name, phone: c.phone, shopCode: c.shopCode,
        outstandingCents: Math.abs(c.balanceCents),
        creditLimitCents: c.creditLimitCents,
        unpaidOrders: unpaidOrders.map((o) => ({
          ...o,
          balanceCents: o.totalCents - o.paidAmountCents,
          agingDays: Math.floor((today.getTime() - new Date(o.createdAt).getTime()) / 86400000),
        })),
        agingDays,
        agingBucket: agingDays <= 30 ? '0-30' : agingDays <= 60 ? '31-60' : agingDays <= 90 ? '61-90' : '90+',
      };
    });
  }

  // ─── Agent Leaderboard ────────────────────────────────────────────────────

  async getLeaderboard(businessId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const agents = await this.prisma.user.findMany({
      where: { businessId, role: 'SALES_AGENT' },
      select: { id: true, name: true, avatarUrl: true },
    });

    const results = await Promise.all(agents.map(async (agent) => {
      const orders = await this.prisma.fieldOrder.findMany({
        where: { agentId: agent.id, businessId, createdAt: { gte: startDate, lte: endDate }, status: { not: 'CANCELLED' } },
        select: { totalCents: true, status: true, paymentStatus: true },
      });
      const totalValue = orders.reduce((s, o) => s + o.totalCents, 0);
      const deliveredPaid = orders.filter((o) => o.status === 'DELIVERED' && o.paymentStatus === 'PAID');
      const agentEmployee = await this.prisma.employee.findFirst({
        where: { userId: agent.id, businessId },
        select: { commissionRate: true },
      });
      const agentCommissionRate = (agentEmployee?.commissionRate ?? 3) / 100;
      const commission = Math.round(deliveredPaid.reduce((s, o) => s + o.totalCents, 0) * agentCommissionRate);
      const visitCount = await this.prisma.agentVisit.count({ where: { agentId: agent.id, businessId, visitedAt: { gte: startDate, lte: endDate } } });
      return { agentId: agent.id, agentName: agent.name, avatarUrl: agent.avatarUrl, ordersCount: orders.length, totalValueCents: totalValue, commissionCents: commission, visitCount };
    }));

    return results
      .sort((a, b) => b.totalValueCents - a.totalValueCents)
      .map((r, i) => ({ ...r, rank: i + 1 }));
  }

  // ─── Partial Invoice by Delivered Quantity ────────────────────────────────

  async generatePartialInvoice(orderId: string, businessId: string) {
    const order = await this.prisma.fieldOrder.findFirst({
      where: { id: orderId, businessId },
      include: {
        items: true,
        customer: { select: { id: true, name: true, phone: true } },
        agent: { select: { name: true } },
      },
    });

    if (!order) throw new NotFoundException('Field order not found');
    if (order.status === 'DRAFT') throw new BadRequestException('Cannot invoice a draft order');
    if (order.status === 'CANCELLED') throw new BadRequestException('Cannot invoice a cancelled order');
    if (order.status === 'INVOICED') throw new BadRequestException('Invoice already generated for this order');

    const deliveredItems = order.items
      .filter((i) => !i.isSample && i.deliveredQuantity > 0)
      .map((i) => ({
        name: i.itemName,
        quantity: i.deliveredQuantity,
        unitPriceCents: i.unitPriceCents,
        totalCents: i.unitPriceCents * i.deliveredQuantity,
      }));

    if (deliveredItems.length === 0) {
      throw new BadRequestException('No delivered quantities recorded — update delivered quantities first');
    }

    const subtotalCents = deliveredItems.reduce((s, i) => s + i.totalCents, 0);

    const proforma = await this.prisma.sale.create({
      data: {
        offlineId: uuidv4(),
        businessId,
        storeId: order.storeId ?? undefined,
        receiptNumber: `INV-${order.orderNumber ?? orderId.slice(-6).toUpperCase()}-${Date.now().toString().slice(-5)}`,
        type: 'PROFORMA' as any,
        status: 'PROFORMA' as any,
        priceLevel: 'RETAIL' as any,
        customerId: order.customerId,
        customerName: order.customer.name,
        customerPhone: order.customer.phone ?? undefined,
        subtotalCents,
        serviceChargeCents: 0,
        vatCents: 0,
        totCents: 0,
        totalCents: subtotalCents,
        notes: `Partial invoice from field order ${order.orderNumber ?? orderId} (delivered qty only) — Agent: ${order.agent.name}`,
        items: { create: deliveredItems },
      },
      include: { items: true },
    });

    await (this.prisma.fieldOrder as any).update({
      where: { id: orderId },
      data: { status: 'INVOICED', invoiceNumber: proforma.receiptNumber, invoicedAt: new Date() },
    });

    if (order.customer.phone) {
      const amountKES = (subtotalCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 });
      const msg =
        `Dear ${order.customer.name}, partial invoice ${proforma.receiptNumber} for KES ${amountKES} (delivered items only) has been generated. Thank you.`;
      this.notifications.sendWhatsApp(businessId, order.customer.phone, msg).catch(() => {});
    }

    return { proforma, invoiceNumber: proforma.receiptNumber, deliveredItemCount: deliveredItems.length };
  }

  // ─── Bulk Generate Invoices for all DELIVERED orders ─────────────────────

  async bulkGenerateInvoices(businessId: string) {
    const orders = await this.prisma.fieldOrder.findMany({
      where: { businessId, status: 'DELIVERED' },
      select: { id: true },
    });
    const results: Array<{ orderId: string; invoiceNumber?: string; error?: string }> = [];
    for (const order of orders) {
      try {
        const result = await this.generateInvoice(order.id, businessId);
        results.push({ orderId: order.id, invoiceNumber: result.invoiceNumber });
      } catch (e: any) {
        results.push({ orderId: order.id, error: e.message });
      }
    }
    const succeeded = results.filter((r) => r.invoiceNumber).length;
    const failed = results.filter((r) => r.error).length;
    return { succeeded, failed, results };
  }

  // ─── Generate Invoice (Proforma) from Field Order ────────────────────────

  async generateInvoice(orderId: string, businessId: string) {
    const order = await this.prisma.fieldOrder.findFirst({
      where: { id: orderId, businessId },
      include: {
        items: true,
        customer: { select: { id: true, name: true, phone: true } },
        agent: { select: { name: true } },
      },
    });

    if (!order) throw new NotFoundException('Field order not found');
    if (order.status === 'DRAFT') throw new BadRequestException('Cannot invoice a draft order — confirm it first');
    if (order.status === 'CANCELLED') throw new BadRequestException('Cannot invoice a cancelled order');
    if (order.status === 'INVOICED') throw new BadRequestException('Invoice already generated for this order');

    const proforma = await this.prisma.sale.create({
      data: {
        offlineId: uuidv4(),
        businessId,
        storeId: order.storeId ?? undefined,
        receiptNumber: `INV-${order.orderNumber ?? orderId.slice(-6).toUpperCase()}-${Date.now().toString().slice(-5)}`,
        type: 'PROFORMA' as any,
        status: 'PROFORMA' as any,
        priceLevel: 'RETAIL' as any,
        customerId: order.customerId,
        customerName: order.customer.name,
        customerPhone: order.customer.phone ?? undefined,
        subtotalCents: order.subtotalCents,
        serviceChargeCents: 0,
        vatCents: order.vatCents,
        totCents: 0,
        totalCents: order.totalCents,
        notes: `Generated from field order ${order.orderNumber ?? orderId} — Agent: ${order.agent.name}`,
        items: {
          create: order.items
            .filter((i) => !i.isSample)
            .map((i) => ({
              name: i.itemName,
              quantity: i.quantity,
              unitPriceCents: i.unitPriceCents,
              totalCents: i.totalCents,
            })),
        },
      },
      include: { items: true },
    });

    await (this.prisma.fieldOrder as any).update({
      where: { id: orderId },
      data: { status: 'INVOICED', invoiceNumber: proforma.receiptNumber, invoicedAt: new Date() },
    });

    // Fire-and-forget WhatsApp/SMS to customer
    if (order.customer.phone) {
      const amountKES = (order.totalCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 });
      const msg =
        `Dear ${order.customer.name}, your invoice ${proforma.receiptNumber} for KES ${amountKES} has been generated. ` +
        `Please make payment to settle this invoice. Thank you for your business.`;
      this.notifications.sendWhatsApp(businessId, order.customer.phone, msg).catch(() => {});
    }

    return { proforma, invoiceNumber: proforma.receiptNumber };
  }

  // ─── Delivery Note ────────────────────────────────────────────────────────

  async getDeliveryNote(orderId: string, businessId: string) {
    const order = await this.prisma.fieldOrder.findFirst({
      where: { id: orderId, businessId },
      include: {
        items: true,
        customer: { select: { name: true, phone: true, shopCode: true, gpsLat: true, gpsLng: true } },
        agent: { select: { name: true, phone: true } },
        route: { select: { name: true } },
      },
    });
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private parseDays(raw: string): string[] {
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }
}

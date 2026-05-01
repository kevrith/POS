import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreateRunDto {
  routeId: string;
  date: string;
  driverUserId?: string;
  orderIds: string[];
}

interface AddExpenseDto {
  category: string;
  amountCents: number;
  description?: string;
  recordedBy: string;
}

interface CaptureProofDto {
  signatureBase64?: string;
  receivedByName: string;
  latitude?: number;
  longitude?: number;
  photoUrl?: string;
  notes?: string;
}

@Injectable()
export class DeliveryRoutesService {
  constructor(private prisma: PrismaService) {}

  async createRun(businessId: string, dto: CreateRunDto) {
    const run = await this.prisma.deliveryRun.create({
      data: {
        businessId,
        routeId: dto.routeId,
        date: new Date(dto.date),
        driverUserId: dto.driverUserId,
        status: 'PLANNED',
        orders: {
          create: dto.orderIds.map((fieldOrderId, idx) => ({
            fieldOrderId,
            sortOrder: idx,
            status: 'PENDING',
          })),
        },
      },
      include: { orders: true },
    });

    // Update field orders to DISPATCHED
    await this.prisma.fieldOrder.updateMany({
      where: { id: { in: dto.orderIds } },
      data: { status: 'DISPATCHED', dispatchedAt: new Date() },
    });

    return run;
  }

  async getRuns(
    businessId: string,
    filters: { routeId?: string; date?: string; status?: string },
  ) {
    const where: Record<string, unknown> = { businessId };
    if (filters.routeId) where.routeId = filters.routeId;
    if (filters.status) where.status = filters.status;
    if (filters.date) {
      const d = new Date(filters.date);
      const next = new Date(d);
      next.setDate(next.getDate() + 1);
      where.date = { gte: d, lt: next };
    }

    return this.prisma.deliveryRun.findMany({
      where,
      orderBy: { date: 'desc' },
      include: {
        route: { select: { id: true, name: true, color: true } },
        driver: { select: { id: true, name: true } },
        _count: { select: { orders: true } },
      },
    });
  }

  async getRun(id: string, businessId: string) {
    const run = await this.prisma.deliveryRun.findFirst({
      where: { id, businessId },
      include: {
        route: true,
        driver: { select: { id: true, name: true, phone: true } },
        orders: {
          orderBy: { sortOrder: 'asc' },
          include: {
            fieldOrder: {
              include: {
                customer: {
                  select: {
                    id: true,
                    name: true,
                    phone: true,
                    shopCode: true,
                    gpsLat: true,
                    gpsLng: true,
                  },
                },
                items: true,
              },
            },
            proof: true,
          },
        },
        expenses: true,
      },
    });
    if (!run) throw new NotFoundException('Delivery run not found');
    return run;
  }

  async addExpense(
    deliveryRunId: string,
    businessId: string,
    dto: AddExpenseDto,
  ) {
    // Verify run belongs to business
    const run = await this.prisma.deliveryRun.findFirst({
      where: { id: deliveryRunId, businessId },
    });
    if (!run) throw new NotFoundException('Delivery run not found');

    return this.prisma.routeExpense.create({
      data: {
        businessId,
        deliveryRunId,
        category: dto.category,
        amountCents: dto.amountCents,
        description: dto.description,
        recordedBy: dto.recordedBy,
      },
    });
  }

  async captureProof(deliveryRunOrderId: string, dto: CaptureProofDto) {
    const runOrder = await this.prisma.deliveryRunOrder.findUnique({
      where: { id: deliveryRunOrderId },
      include: { fieldOrder: { select: { id: true } } },
    });
    if (!runOrder) throw new NotFoundException('Delivery run order not found');

    // Check existing proof
    const existing = await this.prisma.deliveryProof.findUnique({
      where: { deliveryRunOrderId },
    });
    if (existing) {
      throw new BadRequestException('Proof already captured for this order');
    }

    const proof = await this.prisma.deliveryProof.create({
      data: {
        fieldOrderId: runOrder.fieldOrderId,
        deliveryRunOrderId,
        signatureBase64: dto.signatureBase64,
        receivedByName: dto.receivedByName,
        latitude: dto.latitude,
        longitude: dto.longitude,
        photoUrl: dto.photoUrl,
        notes: dto.notes,
      },
    });

    // Update run order status
    await this.prisma.deliveryRunOrder.update({
      where: { id: deliveryRunOrderId },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });

    // Update field order status
    await this.prisma.fieldOrder.update({
      where: { id: runOrder.fieldOrderId },
      data: { status: 'DELIVERED', deliveredAt: new Date() },
    });

    return proof;
  }

  async markRunComplete(id: string, businessId: string) {
    const run = await this.prisma.deliveryRun.findFirst({
      where: { id, businessId },
    });
    if (!run) throw new NotFoundException('Delivery run not found');
    if (run.status === 'COMPLETED') {
      throw new BadRequestException('Run is already completed');
    }

    return this.prisma.deliveryRun.update({
      where: { id },
      data: { status: 'COMPLETED', completedAt: new Date() },
    });
  }

  async getRouteProfitability(
    businessId: string,
    filters: { startDate: string; endDate: string },
  ) {
    const start = new Date(filters.startDate);
    const end = new Date(filters.endDate);

    // Get all routes
    const routes = await this.prisma.salesRoute.findMany({
      where: { businessId, isActive: true },
      select: { id: true, name: true, color: true },
    });

    const results = await Promise.all(
      routes.map(async (route) => {
        // Orders on route in period
        const orders = await this.prisma.fieldOrder.findMany({
          where: {
            businessId,
            routeId: route.id,
            createdAt: { gte: start, lte: end },
            status: { not: 'CANCELLED' },
          },
          select: { id: true, totalCents: true, status: true },
        });

        const totalOrdersCents = orders.reduce((s, o) => s + o.totalCents, 0);
        const deliveredOrdersCents = orders
          .filter((o) => o.status === 'DELIVERED')
          .reduce((s, o) => s + o.totalCents, 0);

        // Expenses on runs for this route in period
        const expensesAgg = await this.prisma.routeExpense.aggregate({
          where: {
            businessId,
            deliveryRun: {
              routeId: route.id,
              date: { gte: start, lte: end },
            },
          },
          _sum: { amountCents: true },
        });
        const expensesCents = expensesAgg._sum.amountCents ?? 0;

        // Top items
        const items = await this.prisma.fieldOrderItem.findMany({
          where: {
            fieldOrder: {
              businessId,
              routeId: route.id,
              createdAt: { gte: start, lte: end },
              status: { not: 'CANCELLED' },
            },
          },
          select: { itemId: true, itemName: true, quantity: true, totalCents: true },
        });

        const itemMap: Record<
          string,
          { itemName: string; totalQty: number; totalCents: number }
        > = {};
        for (const item of items) {
          const key = item.itemId ?? item.itemName;
          if (!itemMap[key]) {
            itemMap[key] = {
              itemName: item.itemName,
              totalQty: 0,
              totalCents: 0,
            };
          }
          itemMap[key].totalQty += item.quantity;
          itemMap[key].totalCents += item.totalCents;
        }
        const topItems = Object.values(itemMap)
          .sort((a, b) => b.totalCents - a.totalCents)
          .slice(0, 10);

        return {
          routeId: route.id,
          routeName: route.name,
          color: route.color,
          totalOrdersCents,
          deliveredOrdersCents,
          expensesCents,
          netProfitCents: deliveredOrdersCents - expensesCents,
          ordersCount: orders.length,
          topItems,
        };
      }),
    );

    return results;
  }
}

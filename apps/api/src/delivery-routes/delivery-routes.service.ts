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

    await this.syncDeliveryOrders(run.id);

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

  /**
   * Attach an already-packed field order to an existing (not yet completed) run.
   * Used by the "Add to Delivery Run" action on the field-orders board.
   */
  async addOrderToRun(runId: string, businessId: string, fieldOrderId: string) {
    const run = await this.prisma.deliveryRun.findFirst({
      where: { id: runId, businessId },
    });
    if (!run) throw new NotFoundException('Delivery run not found');
    if (run.status === 'COMPLETED' || run.status === 'CANCELLED') {
      throw new BadRequestException(`Cannot add orders to a ${run.status.toLowerCase()} run`);
    }

    const order = await this.prisma.fieldOrder.findFirst({
      where: { id: fieldOrderId, businessId },
    });
    if (!order) throw new NotFoundException('Field order not found');
    if (order.status === 'CANCELLED') {
      throw new BadRequestException('Cannot dispatch a cancelled order');
    }
    if (order.status === 'DELIVERED') {
      throw new BadRequestException('Order has already been delivered');
    }

    const existing = await this.prisma.deliveryRunOrder.findFirst({
      where: { fieldOrderId, deliveryRun: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } },
    });
    if (existing) {
      throw new BadRequestException(
        existing.deliveryRunId === runId
          ? 'Order is already on this run'
          : 'Order is already assigned to another active delivery run',
      );
    }

    const last = await this.prisma.deliveryRunOrder.findFirst({
      where: { deliveryRunId: runId },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const runOrder = await this.prisma.deliveryRunOrder.create({
      data: {
        deliveryRunId: runId,
        fieldOrderId,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        status: 'PENDING',
      },
    });

    await this.prisma.fieldOrder.update({
      where: { id: fieldOrderId },
      data: { status: 'DISPATCHED', dispatchedAt: new Date() },
    });

    await this.syncDeliveryOrders(runId);

    return runOrder;
  }

  /**
   * Project a run's stops into `DeliveryOrder` rows.
   *
   * Field/agent orders live on `FieldOrder` + `DeliveryRunOrder`, but the Kastra Driver
   * app reads its job list from `DeliveryOrder`. Without this projection a dispatched
   * field order never reaches the driver's phone. One delivery per field order, kept
   * in step with the run's driver.
   */
  private async syncDeliveryOrders(runId: string): Promise<void> {
    const run = await this.prisma.deliveryRun.findUnique({
      where: { id: runId },
      include: {
        orders: {
          include: {
            fieldOrder: {
              include: {
                customer: {
                  select: {
                    name: true,
                    phone: true,
                    gpsLat: true,
                    gpsLng: true,
                    shopCode: true,
                    addresses: {
                      where: { isDefault: true },
                      take: 1,
                      select: { address: true, lat: true, lng: true },
                    },
                  },
                },
                items: true,
              },
            },
          },
        },
      },
    });
    if (!run) return;

    for (const runOrder of run.orders) {
      const fo = runOrder.fieldOrder;
      if (!fo) continue;

      const existing = await this.prisma.deliveryOrder.findFirst({
        where: { fieldOrderId: fo.id },
      });

      if (existing) {
        // Keep the driver assignment in step; never downgrade a completed delivery.
        if (existing.status !== 'DELIVERED' && existing.status !== 'CANCELLED') {
          await this.prisma.deliveryOrder.update({
            where: { id: existing.id },
            data: {
              driverId: run.driverUserId ?? existing.driverId,
              status: run.driverUserId && existing.status === 'PENDING' ? 'ASSIGNED' : existing.status,
              scheduledAt: run.date,
            },
          });
        }
        continue;
      }

      const storeId =
        fo.storeId ??
        (
          await this.prisma.store.findFirst({
            where: { businessId: fo.businessId },
            orderBy: { createdAt: 'asc' },
            select: { id: true },
          })
        )?.id;
      if (!storeId) continue;

      await this.prisma.deliveryOrder.create({
        data: {
          orderNumber: `DEL-${fo.orderNumber ?? fo.id.slice(-8).toUpperCase()}`,
          businessId: fo.businessId,
          storeId,
          fieldOrderId: fo.id,
          customerId: fo.customerId,
          customerName: fo.customer?.name ?? 'Customer',
          customerPhone: fo.customer?.phone ?? undefined,
          deliveryAddress:
            fo.customer?.addresses?.[0]?.address ??
            (fo.customer?.shopCode ? `Shop ${fo.customer.shopCode}` : 'See route sheet'),
          lat: fo.customer?.gpsLat ?? fo.customer?.addresses?.[0]?.lat ?? undefined,
          lng: fo.customer?.gpsLng ?? fo.customer?.addresses?.[0]?.lng ?? undefined,
          driverId: run.driverUserId ?? undefined,
          status: run.driverUserId ? 'ASSIGNED' : 'PENDING',
          channel: 'FIELD',
          scheduledAt: run.date,
          subtotalCents: fo.subtotalCents,
          taxCents: fo.vatCents,
          totalCents: fo.totalCents,
          paymentStatus: fo.paymentStatus === 'PAID' ? 'PAID' : 'UNPAID',
          notes: fo.notes ?? undefined,
          items: {
            create: fo.items.map((i) => ({
              itemId: i.itemId,
              name: i.itemName,
              quantity: i.quantity,
              unitPriceCents: i.unitPriceCents,
              totalCents: i.totalCents,
            })),
          },
        },
      });
    }
  }

  /** Detach an order from a run and return it to PACKED so it can be re-dispatched. */
  async removeOrderFromRun(runOrderId: string, businessId: string) {
    const runOrder = await this.prisma.deliveryRunOrder.findFirst({
      where: { id: runOrderId, deliveryRun: { businessId } },
    });
    if (!runOrder) throw new NotFoundException('Delivery run order not found');
    if (runOrder.status === 'DELIVERED') {
      throw new BadRequestException('Cannot remove an order that has already been delivered');
    }

    await this.prisma.deliveryRunOrder.delete({ where: { id: runOrderId } });
    await this.prisma.fieldOrder.update({
      where: { id: runOrder.fieldOrderId },
      data: { status: 'PACKED', dispatchedAt: null },
    });
    await this.prisma.deliveryOrder.updateMany({
      where: { fieldOrderId: runOrder.fieldOrderId, status: { notIn: ['DELIVERED'] } },
      data: { status: 'CANCELLED' },
    });

    return { removed: true };
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

    // Close out the driver-app copy so the same stop is not shown as outstanding.
    await this.prisma.deliveryOrder.updateMany({
      where: { fieldOrderId: runOrder.fieldOrderId, status: { notIn: ['DELIVERED', 'CANCELLED'] } },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        receivedBy: dto.receivedByName,
        proofPhotoUrl: dto.photoUrl,
        lat: dto.latitude,
        lng: dto.longitude,
      },
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
      select: { id: true, name: true, color: true, deliveryDays: true },
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
          deliveryDays: DeliveryRoutesService.parseDays(route.deliveryDays),
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

  /** `SalesRoute.deliveryDays` is a JSON-encoded string array — never let a bad value throw. */
  private static parseDays(raw: string | null | undefined): string[] {
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
}

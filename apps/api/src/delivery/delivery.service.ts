import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService, deliveryStatusMessage } from '../push/push.service';
import { v4 as uuidv4 } from 'uuid';
import { newDeliveryOrderNumber } from './order-number';

interface CreateDeliveryOrderDto {
  businessId: string;
  storeId: string;
  saleId?: string;
  customerId?: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddress: string;
  lat?: number;
  lng?: number;
  scheduledAt?: string;
  notes?: string;
  /** Explicit fee from the delivery form. Overrides zone pricing when supplied. */
  deliveryFeeCents?: number;
  /** Driver chosen on the create form — assigns the delivery in one step. */
  driverId?: string;
}

interface UpdateDriverLocationDto {
  driverId: string;
  deliveryOrderId?: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  accuracy?: number;
}

interface CreateDeliveryZoneDto {
  businessId: string;
  name: string;
  coordinates: Array<{ lat: number; lng: number }>;
  basePriceCents: number;
  pricePerKm: number;
  maxDistanceKm: number;
  estimatedMinutes: number;
}

interface CourierOrderDto {
  provider: 'GLOVO' | 'SENDY' | 'UBER' | 'BOLT';
  deliveryOrderId: string;
  pickupAddress: string;
  deliveryAddress: string;
  customerPhone: string;
  notes?: string;
}

@Injectable()
export class DeliveryService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
    private notifications: NotificationsService,
    private push: PushService,
  ) {}

  async getDeliveryOrders(businessId: string, storeId?: string, status?: string, search?: string, channel?: string) {
    const where: any = { businessId };
    if (storeId) where.storeId = storeId;
    if (status && status !== 'ALL') where.status = status;
    if (channel && channel !== 'ALL') where.channel = channel;
    if (search) where.OR = [
      { customerName: { contains: search, mode: 'insensitive' } },
      { orderNumber: { contains: search } },
      { deliveryAddress: { contains: search, mode: 'insensitive' } },
    ];
    const data = await this.prisma.deliveryOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: { items: true },
    });
    return { data };
  }

  /** Single delivery order — used by the driver app's detail screen. */
  async getDeliveryOrderById(id: string, businessId?: string) {
    const where: any = { id };
    if (businessId) where.businessId = businessId;
    const order = await this.prisma.deliveryOrder.findFirst({
      where,
      // Items can come from either side: portal/field orders carry their own
      // DeliveryOrderItem rows, while POS deliveries reference the Sale.
      include: { items: true, sale: { include: { items: true } } },
    });
    if (!order) return null;

    const ownItems = order.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      totalCents: i.totalCents,
    }));
    const saleItems = order.sale?.items?.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      unitPriceCents: i.unitPriceCents,
      totalCents: i.totalCents,
    })) ?? [];

    return {
      ...order,
      items: ownItems.length > 0 ? ownItems : saleItems,
      totalCents: order.totalCents > 0 ? order.totalCents : order.sale?.totalCents ?? null,
    };
  }

  async createDeliveryOrder(dto: CreateDeliveryOrderDto) {
    // Zone pricing needs coordinates AND a zone whose polygon contains them, so it
    // yields 0 for most orders. The delivery form has its own fee field — honour it
    // when given, or the number the user typed silently becomes zero and the driver's
    // earnings read 0 for a delivery they actually made.
    const zone = await this.findDeliveryZone(dto.businessId, dto.lat, dto.lng);
    const typedFee = Math.round(Number(dto.deliveryFeeCents));
    const deliveryFeeCents =
      Number.isFinite(typedFee) && typedFee > 0
        ? typedFee
        : zone
          ? await this.calculateDeliveryFee(zone, dto.lat, dto.lng)
          : 0;

    const orderNumber = newDeliveryOrderNumber();
    
    const deliveryOrder = await this.prisma.deliveryOrder.create({
      data: {
        orderNumber,
        businessId: dto.businessId,
        storeId: dto.storeId,
        saleId: dto.saleId,
        customerId: dto.customerId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        deliveryAddress: dto.deliveryAddress,
        lat: dto.lat,
        lng: dto.lng,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        deliveryFeeCents,
        zoneId: zone?.id,
        estimatedDeliveryAt: zone ? new Date(Date.now() + zone.estimatedMinutes * 60000) : null,
        notes: dto.notes,
        // The create form has a driver picker; dropping it left the delivery
        // unassigned, so it never reached that driver's app or their earnings.
        driverId: dto.driverId || null,
        status: dto.driverId ? 'ASSIGNED' : 'PENDING',
      },
    });

    // Assigning on the form should notify exactly like the Assign action does.
    if (dto.driverId) {
      this.push
        .sendToUser(dto.driverId, {
          title: 'New delivery assigned',
          body: `Order #${orderNumber} · ${dto.deliveryAddress ?? 'tap to view'}`,
          data: { type: 'delivery', id: deliveryOrder.id },
        })
        .catch(() => {});
    }

    // Create SLA tracking
    if (zone) {
      await this.prisma.deliverySLA.create({
        data: {
          businessId: dto.businessId,
          deliveryOrderId: deliveryOrder.id,
          promisedAt: new Date(Date.now() + zone.estimatedMinutes * 60000),
        },
      });
    }

    await this.audit.createEntry({
      businessId: dto.businessId,
      actor: 'system',
      actorType: 'SYSTEM',
      action: 'DELIVERY_ORDER_CREATED',
      entity: 'DeliveryOrder',
      entityId: deliveryOrder.id,
      after: { orderNumber, customerName: dto.customerName },
      source: 'SYSTEM',
    });

    return deliveryOrder;
  }

  /**
   * Public web origin for customer-facing links.
   *
   * These links were built three different ways: one read WEB_URL — a variable that was
   * never defined anywhere, so it always fell back to localhost in production — one read
   * FRONTEND_URL with a localhost fallback, and one read FRONTEND_URL with no fallback at
   * all, which renders "undefined/track/..." when unset. One resolver now, so a tracking
   * link cannot silently point at a developer's laptop.
   */
  private static webBase(): string {
    const base = process.env.FRONTEND_URL ?? process.env.WEB_URL;
    if (!base) {
      if (process.env.NODE_ENV === 'production') {
        // Loud, because the symptom is a link that looks fine to us and is dead to them.
        console.error('[delivery] FRONTEND_URL is not set — customer tracking links will point at localhost');
      }
      return 'http://localhost:3001';
    }
    return base.replace(/\/$/, '');
  }

  private static trackingUrlFor(orderNumber: string): string {
    return `${DeliveryService.webBase()}/track/${orderNumber}`;
  }

  async updateDriverLocation(dto: UpdateDriverLocationDto) {
    const location = await this.prisma.driverLocation.create({
      data: {
        driverId: dto.driverId,
        deliveryOrderId: dto.deliveryOrderId,
        lat: dto.lat,
        lng: dto.lng,
        heading: dto.heading,
        speed: dto.speed,
        accuracy: dto.accuracy,
        timestamp: new Date(),
      },
    });

    // If this is for an active delivery, check if driver is close to destination
    if (dto.deliveryOrderId) {
      await this.checkDeliveryProximity(dto.deliveryOrderId, dto.lat, dto.lng);
    }

    return location;
  }

  /**
   * A driver's recent pings. `businessId` is required and checked against the driver's
   * own business — location history is about the most sensitive thing here, and without
   * the check anyone holding a driver's UUID could read another tenant's movements.
   */
  async getDriverLocations(driverId: string, businessId: string, since?: string) {
    const driver = await this.prisma.user.findFirst({
      where: { id: driverId, businessId },
      select: { id: true },
    });
    if (!driver) throw new NotFoundException('Driver not found in this business');

    const where: any = { driverId };
    if (since) {
      where.timestamp = { gte: new Date(since) };
    }

    return this.prisma.driverLocation.findMany({
      where,
      orderBy: { timestamp: 'desc' },
      take: 100,
    });
  }

  /**
   * Last known position of every driver in the business, for the dispatch map. One
   * query instead of the browser looping per driver, and it carries the driver's name
   * and open-delivery count so the map can label the pin.
   *
   * There is deliberately no time cut-off. The driver app only reports while it is
   * open, so a driver who locks their phone stops pinging — dropping them from the
   * response would erase the very thing dispatch needs ("last seen off Ngong Road at
   * 14:05"). The age of the fix goes to the client, which greys out and labels it.
   * `sinceMinutes` is there for callers that genuinely only want live drivers.
   */
  async getActiveDriverLocations(businessId: string, sinceMinutes?: number) {
    const drivers = await this.prisma.user.findMany({
      where: { businessId, role: 'DRIVER' },
      select: { id: true, name: true, phone: true },
    });
    if (drivers.length === 0) return [];

    const driverIds = drivers.map((d) => d.id);

    // DISTINCT ON walks the (driverId, timestamp) index and stops at the newest row
    // per driver, so this stays cheap however long the location history grows.
    const rows = await this.prisma.$queryRaw<
      Array<{
        driverId: string; lat: number; lng: number;
        heading: number | null; speed: number | null; accuracy: number | null;
        timestamp: Date;
      }>
    >(Prisma.sql`
      SELECT DISTINCT ON ("driverId")
        "driverId", "lat", "lng", "heading", "speed", "accuracy", "timestamp"
      FROM "DriverLocation"
      WHERE "driverId" IN (${Prisma.join(driverIds)})
      ${sinceMinutes
        // The cut-off is computed in SQL, not bound as a JS Date: `timestamp` is
        // `timestamp without time zone` holding UTC, so a bound instant gets compared
        // in the session's zone and the window lands hours off.
        // ::int because Prisma binds JS numbers as bigint, which make_interval rejects.
        ? Prisma.sql`AND "timestamp" >= (now() AT TIME ZONE 'utc') - make_interval(mins => ${sinceMinutes}::int)`
        : Prisma.empty}
      ORDER BY "driverId", "timestamp" DESC
    `);
    const latest = new Map(rows.map((r) => [r.driverId, r]));

    const openCounts = await this.prisma.deliveryOrder.groupBy({
      by: ['driverId'],
      where: {
        businessId,
        driverId: { in: driverIds },
        status: { in: ['ASSIGNED', 'IN_TRANSIT', 'ARRIVING'] },
      },
      _count: { _all: true },
    });
    const openByDriver = new Map(openCounts.map((c) => [c.driverId, c._count._all]));

    return drivers
      .map((d) => {
        const ping = latest.get(d.id);
        if (!ping) return null;
        return {
          driverId: d.id,
          name: d.name,
          phone: d.phone ?? null,
          lat: ping.lat,
          lng: ping.lng,
          heading: ping.heading,
          speed: ping.speed,
          accuracy: ping.accuracy,
          timestamp: ping.timestamp,
          activeDeliveries: openByDriver.get(d.id) ?? 0,
        };
      })
      .filter((d): d is NonNullable<typeof d> => d !== null);
  }


  /**
   * What a driver has actually earned, as opposed to what customers were charged.
   *
   * The app used to sum DeliveryOrder.deliveryFeeCents, which is the business's
   * delivery revenue — a driver on a flat rate sees no relation between the two,
   * and a driver whose orders carry no fee saw zero for a full day's work. Pay
   * comes from the driver's own rate: a flat amount per completed delivery, plus
   * an optional percentage of the fee for value-based routes.
   */
  async getDriverEarnings(driverId: string, businessId: string) {
    const driver = await this.prisma.user.findFirst({
      where: { id: driverId, businessId },
      select: { id: true, name: true, deliveryRateCents: true, deliveryCommissionPercent: true },
    });
    if (!driver) throw new NotFoundException('Driver not found in this business');

    const deliveries = await this.prisma.deliveryOrder.findMany({
      where: { businessId, driverId, status: 'DELIVERED' },
      select: {
        id: true, orderNumber: true, customerName: true, deliveryAddress: true,
        deliveryFeeCents: true, deliveredAt: true, createdAt: true,
      },
      orderBy: { deliveredAt: 'desc' },
      take: 500,
    });

    const rate = driver.deliveryRateCents ?? 0;
    const percent = driver.deliveryCommissionPercent ?? 0;
    const configured = rate > 0 || percent > 0;

    const rows = deliveries.map((d) => {
      const commission = percent > 0 ? Math.round((d.deliveryFeeCents * percent) / 100) : 0;
      return {
        ...d,
        // Fall back to the delivered timestamp; older rows may not have one.
        earnedAt: d.deliveredAt ?? d.createdAt,
        earnedCents: rate + commission,
      };
    });

    const since = (days: number) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - days);
      return d;
    };
    const sum = (from: Date) =>
      rows.filter((r) => new Date(r.earnedAt) >= from).reduce((t, r) => t + r.earnedCents, 0);

    return {
      // Surfaced so the app can say "no rate set" rather than an unexplained zero.
      rateConfigured: configured,
      ratePerDeliveryCents: rate,
      commissionPercent: percent,
      todayCents: sum(since(0)),
      weekCents: sum(since(6)),
      totalCents: rows.reduce((t, r) => t + r.earnedCents, 0),
      deliveryCount: rows.length,
      deliveries: rows,
    };
  }

  async getDeliveryTracking(orderNumber: string) {
    const delivery = await this.prisma.deliveryOrder.findUnique({
      where: { orderNumber },
      include: {
        customer: true,
        sale: true,
      },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery order not found');
    }

    // Get the assigned driver's latest positions. We match by driverId (not by
    // deliveryOrderId) because the driver app broadcasts foreground location that
    // isn't always tagged to a specific order — a driver is in one physical place
    // at a time, so their newest pings are what the customer wants to see.
    let driverLocations: Array<{ lat: number; lng: number; timestamp: Date }> = [];
    if (delivery.driverId) {
      driverLocations = await this.prisma.driverLocation.findMany({
        where: { driverId: delivery.driverId },
        orderBy: { timestamp: 'desc' },
        take: 10,
      });
    }

    return {
      ...delivery,
      driverLocations,
      trackingUrl: DeliveryService.trackingUrlFor(orderNumber),
    };
  }

  async createDeliveryZone(dto: CreateDeliveryZoneDto) {
    return this.prisma.deliveryZone.create({
      data: {
        businessId: dto.businessId,
        name: dto.name,
        coordinates: JSON.stringify(dto.coordinates),
        basePriceCents: dto.basePriceCents,
        pricePerKm: dto.pricePerKm,
        maxDistanceKm: dto.maxDistanceKm,
        estimatedMinutes: dto.estimatedMinutes,
      },
    });
  }

  async getDeliveryZones(businessId: string) {
    const zones = await this.prisma.deliveryZone.findMany({
      where: { businessId, isActive: true },
    });

    return zones.map(zone => ({
      ...zone,
      coordinates: JSON.parse(zone.coordinates),
    }));
  }

  async assignDriver(deliveryOrderId: string, driverId: string, businessId: string) {
    const delivery = await this.prisma.deliveryOrder.update({
      where: { id: deliveryOrderId },
      data: {
        driverId,
        status: 'ASSIGNED',
        pickedUpAt: new Date(),
      },
    });

    // Send SMS to customer with tracking link (fire-and-forget, don't fail the request)
    if (delivery.customerPhone && businessId) {
      this.notifications.sendSMS(
        businessId,
        delivery.customerPhone,
        `Your order #${delivery.orderNumber} has been assigned a driver. Track: ${DeliveryService.trackingUrlFor(delivery.orderNumber)}`,
      ).catch(() => {});
    }

    // Push the assigned driver so they see the job without manually refreshing.
    this.push
      .sendToUser(driverId, {
        title: 'New delivery assigned',
        body: `Order #${delivery.orderNumber} · ${delivery.deliveryAddress ?? 'tap to view'}`,
        data: { type: 'delivery', id: delivery.id },
      })
      .catch(() => {});

    return delivery;
  }


  /**
   * A delivery raised from a field/agent order has a twin on `FieldOrder` +
   * `DeliveryRunOrder`. When the driver closes it out in the app, push the same
   * outcome back so the field-sales board and the run sheet agree.
   */
  private async syncFieldOrderFromDelivery(
    delivery: { fieldOrderId: string | null; receivedBy?: string | null; lat?: number | null; lng?: number | null },
    status: string,
  ): Promise<void> {
    if (!delivery.fieldOrderId) return;

    if (status === 'DELIVERED') {
      await this.prisma.fieldOrder.updateMany({
        where: { id: delivery.fieldOrderId, status: { notIn: ['DELIVERED', 'INVOICED', 'CANCELLED'] } },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      });
      await this.prisma.deliveryRunOrder.updateMany({
        where: { fieldOrderId: delivery.fieldOrderId, status: { not: 'DELIVERED' } },
        data: { status: 'DELIVERED', deliveredAt: new Date() },
      });
    } else if (status === 'FAILED') {
      await this.prisma.deliveryRunOrder.updateMany({
        where: { fieldOrderId: delivery.fieldOrderId, status: 'PENDING' },
        data: { status: 'FAILED' },
      });
    }
  }

  async markDelivered(deliveryOrderId: string, businessId: string, proofPhotoUrl?: string) {
    const delivery = await this.prisma.deliveryOrder.update({
      where: { id: deliveryOrderId },
      data: {
        status: 'DELIVERED',
        deliveredAt: new Date(),
        proofPhotoUrl,
      },
    });

    // Update SLA tracking
    await this.prisma.deliverySLA.updateMany({
      where: { deliveryOrderId },
      data: {
        actualDeliveredAt: new Date(),
        isOnTime: new Date() <= new Date(delivery.estimatedDeliveryAt || 0),
        delayMinutes: delivery.estimatedDeliveryAt 
          ? Math.max(0, Math.floor((Date.now() - new Date(delivery.estimatedDeliveryAt).getTime()) / 60000))
          : 0,
      },
    });

    await this.syncFieldOrderFromDelivery(delivery, 'DELIVERED');

    return delivery;
  }

  async rescheduleDelivery(deliveryOrderId: string, newScheduledAt: string, reason: string) {
    return this.prisma.deliveryOrder.update({
      where: { id: deliveryOrderId },
      data: {
        scheduledAt: new Date(newScheduledAt),
        rescheduledAt: new Date(),
        rescheduleReason: reason,
        failedAttempts: { increment: 1 },
        status: 'RESCHEDULED',
      },
    });
  }

  async pushToCourier(dto: CourierOrderDto) {
    const delivery = await this.prisma.deliveryOrder.findUnique({
      where: { id: dto.deliveryOrderId },
    });

    if (!delivery) {
      throw new NotFoundException('Delivery order not found');
    }

    // Get courier integration config
    const integration = await this.prisma.courierIntegration.findFirst({
      where: {
        businessId: delivery.businessId,
        provider: dto.provider,
        isActive: true,
      },
    });

    if (!integration) {
      throw new BadRequestException(`${dto.provider} integration not configured`);
    }

    // Push to courier API (implementation depends on provider)
    const courierOrderId = await this.pushToProviderAPI(dto.provider, integration, {
      pickupAddress: dto.pickupAddress,
      deliveryAddress: dto.deliveryAddress,
      customerPhone: dto.customerPhone,
      notes: dto.notes,
    });

    // Update delivery order
    return this.prisma.deliveryOrder.update({
      where: { id: dto.deliveryOrderId },
      data: {
        courierProvider: dto.provider,
        courierOrderId,
        status: 'COURIER_ASSIGNED',
      },
    });
  }

  async getDeliverySLAReport(businessId: string, startDate?: string, endDate?: string) {
    // The report screen may open with no range selected — default to the last 30 days
    // instead of handing Prisma an Invalid Date.
    const parse = (value: string | undefined, fallback: Date) => {
      if (!value) return fallback;
      const d = new Date(value);
      return Number.isNaN(d.getTime()) ? fallback : d;
    };
    const end = parse(endDate, new Date());
    const defaultStart = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
    const start = parse(startDate, defaultStart);

    const slas = await this.prisma.deliverySLA.findMany({
      where: { businessId, createdAt: { gte: start, lte: end } },
    });

    const totalDeliveries = slas.length;
    const onTimeDeliveries = slas.filter(sla => sla.isOnTime).length;
    const completed = slas.filter(sla => sla.actualDeliveredAt);
    // Guard the divide — with no completed deliveries this produced NaN.
    const avgDeliveryTime = completed.length
      ? completed.reduce(
          (sum, sla) =>
            sum +
            (new Date(sla.actualDeliveredAt!).getTime() - new Date(sla.promisedAt).getTime()),
          0,
        ) / completed.length
      : 0;

    return {
      startDate: start.toISOString(),
      endDate: end.toISOString(),
      totalDeliveries,
      onTimeDeliveries,
      lateDeliveries: totalDeliveries - onTimeDeliveries,
      onTimeRate: totalDeliveries > 0 ? (onTimeDeliveries / totalDeliveries) * 100 : 0,
      avgDeliveryTimeMinutes: avgDeliveryTime / 60000,
      slas,
    };
  }

  private async findDeliveryZone(businessId: string, lat?: number, lng?: number) {
    if (!lat || !lng) return null;

    const zones = await this.prisma.deliveryZone.findMany({
      where: { businessId, isActive: true },
    });

    for (const zone of zones) {
      const coordinates = JSON.parse(zone.coordinates);
      if (this.isPointInPolygon({ lat, lng }, coordinates)) {
        return zone;
      }
    }

    return null;
  }

  private async calculateDeliveryFee(zone: any, lat?: number, lng?: number) {
    if (!lat || !lng) return zone.basePriceCents;

    // Calculate distance from zone center to delivery point
    const zoneCoords = JSON.parse(zone.coordinates);
    const centerLat = zoneCoords.reduce((sum: number, coord: any) => sum + coord.lat, 0) / zoneCoords.length;
    const centerLng = zoneCoords.reduce((sum: number, coord: any) => sum + coord.lng, 0) / zoneCoords.length;
    
    const distance = this.calculateDistance(centerLat, centerLng, lat, lng);
    
    return zone.basePriceCents + (distance * zone.pricePerKm);
  }

  private isPointInPolygon(point: { lat: number; lng: number }, polygon: Array<{ lat: number; lng: number }>) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      if (((polygon[i].lat > point.lat) !== (polygon[j].lat > point.lat)) &&
          (point.lng < (polygon[j].lng - polygon[i].lng) * (point.lat - polygon[i].lat) / (polygon[j].lat - polygon[i].lat) + polygon[i].lng)) {
        inside = !inside;
      }
    }
    return inside;
  }

  private calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLng/2) * Math.sin(dLng/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  private async checkDeliveryProximity(deliveryOrderId: string, driverLat: number, driverLng: number) {
    const delivery = await this.prisma.deliveryOrder.findUnique({
      where: { id: deliveryOrderId },
    });

    if (!delivery || !delivery.lat || !delivery.lng) return;

    const distance = this.calculateDistance(driverLat, driverLng, delivery.lat, delivery.lng);
    
    // If driver is within 100m of destination, notify customer
    if (distance < 0.1 && delivery.status === 'ASSIGNED') {
      await this.prisma.deliveryOrder.update({
        where: { id: deliveryOrderId },
        data: { status: 'ARRIVING' },
      });

      if (delivery.customerPhone) {
        await this.notifications.sendSMS(
          delivery.businessId,
          delivery.customerPhone,
          `Your delivery #${delivery.orderNumber} is arriving now!`,
        );
      }
    }
  }

  async updateDeliveryOrder(id: string, dto: { status?: string; notes?: string; scheduledAt?: string; deliveryFeeCents?: number; receivedBy?: string; deliveredAt?: string; etaMinutes?: number; rejectionReason?: string }) {
    const delivery = await this.prisma.deliveryOrder.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    const accepting = dto.status === 'CONFIRMED' || dto.status === 'ACCEPTED';
    const rejecting = dto.status === 'REJECTED' || dto.status === 'CANCELLED';
    const updated = await this.prisma.deliveryOrder.update({
      where: { id },
      data: {
        ...(dto.status && { status: dto.status }),
        ...(dto.notes !== undefined && { notes: dto.notes }),
        ...(dto.scheduledAt && { scheduledAt: new Date(dto.scheduledAt) }),
        ...(dto.deliveryFeeCents !== undefined && { deliveryFeeCents: dto.deliveryFeeCents }),
        ...(dto.receivedBy !== undefined && { receivedBy: dto.receivedBy }),
        ...(dto.etaMinutes !== undefined && { etaMinutes: dto.etaMinutes }),
        ...(dto.rejectionReason !== undefined && { rejectionReason: dto.rejectionReason }),
        ...(accepting && { acceptedAt: new Date() }),
        ...(rejecting && { rejectedAt: new Date() }),
        ...(dto.status === 'DELIVERED' && { deliveredAt: dto.deliveredAt ? new Date(dto.deliveredAt) : new Date() }),
      },
    });

    if (dto.status && dto.status !== delivery.status) {
      await this.syncFieldOrderFromDelivery(updated, dto.status);
    }

    // Keep the customer's self-service app in the loop on status changes.
    if (dto.status && dto.status !== delivery.status && delivery.customerPhone) {
      const msg = deliveryStatusMessage(dto.status, updated.orderNumber);
      if (msg) {
        this.push
          .sendToCustomerByPhone(updated.businessId, delivery.customerPhone, {
            ...msg,
            data: { type: 'order', id: updated.id },
          })
          .catch(() => {});
      }
    }

    return updated;
  }

  async cancelDeliveryOrder(id: string) {
    const delivery = await this.prisma.deliveryOrder.findUnique({ where: { id } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return this.prisma.deliveryOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async markFailed(deliveryOrderId: string, reason: string) {
    const delivery = await this.prisma.deliveryOrder.findUnique({ where: { id: deliveryOrderId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    return this.prisma.deliveryOrder.update({
      where: { id: deliveryOrderId },
      data: {
        status: 'FAILED',
        failedAttempts: { increment: 1 },
        rescheduleReason: reason,
      },
    });
  }

  async sendCustomerTrackingLink(deliveryOrderId: string) {
    const delivery = await this.prisma.deliveryOrder.findUnique({ where: { id: deliveryOrderId } });
    if (!delivery) throw new NotFoundException('Delivery not found');
    const trackingUrl = DeliveryService.trackingUrlFor(delivery.orderNumber);
    if (delivery.customerPhone) {
      await this.notifications.sendSMS(
        delivery.businessId,
        delivery.customerPhone,
        `Track your order #${delivery.orderNumber} here: ${trackingUrl}`,
      );
    }
    return { trackingUrl, sent: !!delivery.customerPhone };
  }

  async calcDeliveryFee(businessId: string, lat: number, lng: number) {
    const zone = await this.findDeliveryZone(businessId, lat, lng);
    if (!zone) return { feeCents: 0, zone: null, message: 'Outside delivery zones' };
    const feeCents = await this.calculateDeliveryFee(zone, lat, lng);
    return { feeCents: Math.round(feeCents), zone: zone.name, estimatedMinutes: zone.estimatedMinutes };
  }

  async getCourierIntegrations(businessId: string) {
    return this.prisma.courierIntegration.findMany({ where: { businessId } });
  }

  async saveCourierIntegration(dto: { businessId: string; provider: string; apiKey: string; webhookUrl?: string }) {
    const existing = await this.prisma.courierIntegration.findFirst({
      where: { businessId: dto.businessId, provider: dto.provider },
    });
    if (existing) {
      return this.prisma.courierIntegration.update({
        where: { id: existing.id },
        data: { apiKey: dto.apiKey, webhookUrl: dto.webhookUrl, isActive: true },
      });
    }
    return this.prisma.courierIntegration.create({ data: { ...dto, isActive: true } });
  }

  private async pushToProviderAPI(provider: string, integration: any, orderData: any) {
    // This would implement actual API calls to courier providers
    // For now, return a mock order ID
    return `${provider.toLowerCase()}_${Date.now()}`;
  }
}
import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { v4 as uuidv4 } from 'uuid';

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
  ) {}

  async getDeliveryOrders(businessId: string, storeId?: string, status?: string, search?: string) {
    const where: any = { businessId };
    if (storeId) where.storeId = storeId;
    if (status && status !== 'ALL') where.status = status;
    if (search) where.OR = [
      { customerName: { contains: search, mode: 'insensitive' } },
      { orderNumber: { contains: search } },
      { deliveryAddress: { contains: search, mode: 'insensitive' } },
    ];
    const data = await this.prisma.deliveryOrder.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return { data };
  }

  async createDeliveryOrder(dto: CreateDeliveryOrderDto) {
    // Calculate delivery zone and pricing
    const zone = await this.findDeliveryZone(dto.businessId, dto.lat, dto.lng);
    const deliveryFeeCents = zone ? await this.calculateDeliveryFee(zone, dto.lat, dto.lng) : 0;

    const orderNumber = `DEL-${Date.now()}`;
    
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
        status: 'PENDING',
      },
    });

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
      source: 'API',
    });

    return deliveryOrder;
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

  async getDriverLocations(driverId: string, since?: string) {
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

    // Get driver locations if assigned
    let driverLocations = [];
    if (delivery.driverId) {
      driverLocations = await this.prisma.driverLocation.findMany({
        where: {
          driverId: delivery.driverId,
          deliveryOrderId: delivery.id,
        },
        orderBy: { timestamp: 'desc' },
        take: 10,
      });
    }

    return {
      ...delivery,
      driverLocations,
      trackingUrl: `${process.env.FRONTEND_URL}/track/${orderNumber}`,
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

    // Send SMS to customer with tracking link
    if (delivery.customerPhone) {
      await this.notifications.sendDeliveryAssignedSMS(
        businessId,
        delivery.customerPhone,
        delivery.orderNumber,
        `${process.env.FRONTEND_URL}/track/${delivery.orderNumber}`,
      );
    }

    return delivery;
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

  async getDeliverySLAReport(businessId: string, startDate: string, endDate: string) {
    const slas = await this.prisma.deliverySLA.findMany({
      where: {
        businessId,
        createdAt: {
          gte: new Date(startDate),
          lte: new Date(endDate),
        },
      },
      include: {
        deliveryOrder: true,
      },
    });

    const totalDeliveries = slas.length;
    const onTimeDeliveries = slas.filter(sla => sla.isOnTime).length;
    const avgDeliveryTime = slas.reduce((sum, sla) => {
      if (sla.actualDeliveredAt) {
        return sum + (new Date(sla.actualDeliveredAt).getTime() - new Date(sla.promisedAt).getTime());
      }
      return sum;
    }, 0) / slas.filter(sla => sla.actualDeliveredAt).length;

    return {
      totalDeliveries,
      onTimeDeliveries,
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
        await this.notifications.sendDeliveryArrivingSMS(
          delivery.businessId,
          delivery.customerPhone,
          delivery.orderNumber,
        );
      }
    }
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
    const trackingUrl = `${process.env.WEB_URL ?? 'http://localhost:3001'}/track/${delivery.orderNumber}`;
    if (delivery.customerPhone) {
      await this.notifications.sendDeliveryArrivingSMS(
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
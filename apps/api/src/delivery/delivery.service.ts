import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../events/events.gateway';

@Injectable()
export class DeliveryService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
    private events: EventsGateway,
  ) {}

  private async generateOrderNumber(businessId: string): Promise<string> {
    const year = new Date().getFullYear();
    const count = await this.prisma.deliveryOrder.count({
      where: { businessId, orderNumber: { startsWith: `DLV-${year}` } },
    });
    const seq = String(count + 1).padStart(5, '0');
    return `DLV-${year}-${seq}`;
  }

  async findAll(businessId: string, storeId: string, status?: string) {
    return this.prisma.deliveryOrder.findMany({
      where: {
        businessId,
        ...(storeId ? { storeId } : {}),
        ...(status && status !== 'ALL' ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findByDriver(driverId: string, businessId: string) {
    return this.prisma.deliveryOrder.findMany({
      where: {
        businessId,
        driverId,
        status: { in: ['ASSIGNED', 'IN_TRANSIT'] },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.deliveryOrder.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: {
    businessId: string;
    storeId: string;
    saleId?: string;
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    deliveryAddress: string;
    driverId?: string;
    scheduledAt?: string;
    deliveryFeeCents?: number;
    lat?: number;
    lng?: number;
    notes?: string;
  }) {
    const orderNumber = await this.generateOrderNumber(dto.businessId);
    const order = await this.prisma.deliveryOrder.create({
      data: {
        businessId: dto.businessId,
        storeId: dto.storeId,
        orderNumber,
        saleId: dto.saleId,
        customerId: dto.customerId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        deliveryAddress: dto.deliveryAddress,
        driverId: dto.driverId,
        scheduledAt: dto.scheduledAt ? new Date(dto.scheduledAt) : null,
        deliveryFeeCents: dto.deliveryFeeCents ?? 0,
        lat: dto.lat,
        lng: dto.lng,
        notes: dto.notes,
      },
    });
    this.events.emitOrderUpdated(dto.businessId, { orderId: order.id, orderNumber, status: 'PENDING' });
    return order;
  }

  async update(id: string, dto: Partial<{
    customerName: string;
    customerPhone: string;
    deliveryAddress: string;
    driverId: string | null;
    scheduledAt: string | null;
    status: string;
    deliveryFeeCents: number;
    notes: string;
    pickedUpAt: string | null;
    deliveredAt: string | null;
    proofPhotoUrl: string | null;
    lat: number;
    lng: number;
  }>) {
    const existing = await this.prisma.deliveryOrder.findUniqueOrThrow({ where: { id } });
    const data: any = { ...dto };
    if ('scheduledAt' in dto) data.scheduledAt = dto.scheduledAt ? new Date(dto.scheduledAt) : null;
    if ('pickedUpAt' in dto) data.pickedUpAt = dto.pickedUpAt ? new Date(dto.pickedUpAt) : null;
    if ('deliveredAt' in dto) data.deliveredAt = dto.deliveredAt ? new Date(dto.deliveredAt) : null;
    // Auto-set timestamps on status change
    if (dto.status === 'IN_TRANSIT' && !existing.pickedUpAt) data.pickedUpAt = new Date();
    if (dto.status === 'DELIVERED' && !existing.deliveredAt) {
      data.deliveredAt = new Date();
      // Notify customer on delivery
      if (existing.customerPhone) {
        this.notifications.sendSMS(
          existing.businessId,
          existing.customerPhone,
          `Your order #${existing.orderNumber} has been delivered! Thank you for your purchase.`,
        ).catch(() => {});
      }
    }
    const updated = await this.prisma.deliveryOrder.update({ where: { id }, data });
    this.events.emitDeliveryUpdated(existing.businessId, { orderId: id, status: updated.status });
    return updated;
  }

  async assign(id: string, driverId: string) {
    const order = await this.prisma.deliveryOrder.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.deliveryOrder.update({
      where: { id },
      data: { driverId, status: 'ASSIGNED' },
    });
    // Notify driver via SMS
    const driver = await this.prisma.user.findUnique({
      where: { id: driverId },
      select: { name: true, email: true },
    });
    if (driver) {
      this.notifications.createNotification({
        businessId: order.businessId,
        type: 'DELIVERY_ASSIGNED',
        title: 'New Delivery Assigned',
        body: `Delivery #${order.orderNumber} has been assigned to you.`,
        priority: 'HIGH',
      }).catch(() => {});
    }
    this.events.emitDeliveryUpdated(order.businessId, { orderId: id, status: 'ASSIGNED', driverId });
    return updated;
  }

  async cancel(id: string) {
    const order = await this.prisma.deliveryOrder.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.deliveryOrder.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
    this.events.emitDeliveryUpdated(order.businessId, { orderId: id, status: 'CANCELLED' });
    return updated;
  }
}

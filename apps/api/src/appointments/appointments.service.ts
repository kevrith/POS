import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AppointmentsService {
  constructor(private prisma: PrismaService) {}

  async findAll(businessId: string, storeId: string, date?: string, status?: string) {
    const where: any = { businessId, storeId };
    if (status && status !== 'ALL') where.status = status;
    if (date) {
      const d = new Date(date);
      const start = new Date(d); start.setHours(0, 0, 0, 0);
      const end = new Date(d); end.setHours(23, 59, 59, 999);
      where.scheduledAt = { gte: start, lte: end };
    }
    return this.prisma.appointment.findMany({
      where,
      orderBy: { scheduledAt: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.appointment.findUniqueOrThrow({ where: { id } });
  }

  async create(dto: {
    businessId: string;
    storeId: string;
    customerId?: string;
    customerName: string;
    customerPhone?: string;
    serviceItemId?: string;
    staffId?: string;
    scheduledAt: string;
    duration?: number;
    notes?: string;
    depositCents?: number;
  }) {
    return this.prisma.appointment.create({
      data: {
        businessId: dto.businessId,
        storeId: dto.storeId,
        customerId: dto.customerId,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        serviceItemId: dto.serviceItemId,
        staffId: dto.staffId,
        scheduledAt: new Date(dto.scheduledAt),
        duration: dto.duration ?? 60,
        notes: dto.notes,
        depositCents: dto.depositCents ?? 0,
      },
    });
  }

  async update(id: string, dto: Partial<{
    customerName: string;
    customerPhone: string;
    serviceItemId: string;
    staffId: string;
    scheduledAt: string;
    duration: number;
    status: string;
    notes: string;
    depositCents: number;
  }>) {
    const data: any = { ...dto };
    if (dto.scheduledAt) data.scheduledAt = new Date(dto.scheduledAt);
    return this.prisma.appointment.update({ where: { id }, data });
  }

  async delete(id: string) {
    return this.prisma.appointment.delete({ where: { id } });
  }
}

import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WaitlistService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string, storeId?: string, status?: string) {
    return this.prisma.waitlist.findMany({
      where: {
        businessId,
        ...(storeId ? { storeId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async add(dto: {
    businessId: string;
    storeId: string;
    customerName: string;
    customerPhone?: string;
    partySize: number;
    notes?: string;
    estimatedWaitMinutes?: number;
  }) {
    return this.prisma.waitlist.create({ data: dto });
  }

  async seat(id: string, tableId?: string) {
    return this.prisma.waitlist.update({
      where: { id },
      data: { status: 'SEATED', seatedAt: new Date(), tableId },
    });
  }

  async notify(id: string) {
    const entry = await this.prisma.waitlist.findUnique({ where: { id } });
    if (!entry) throw new NotFoundException('Waitlist entry not found');

    await this.prisma.waitlist.update({
      where: { id },
      data: { status: 'NOTIFIED', notifiedAt: new Date() },
    });

    return { success: true, message: 'Table ready notification sent', customerPhone: entry.customerPhone };
  }

  async cancel(id: string) {
    return this.prisma.waitlist.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async noShow(id: string) {
    return this.prisma.waitlist.update({
      where: { id },
      data: { status: 'NO_SHOW' },
    });
  }
}

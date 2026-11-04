import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WaitlistService {
  constructor(private prisma: PrismaService) {}

  /** An entry the caller's business owns, or a 404 that does not say whether it exists elsewhere. */
  private async owned(id: string, businessId: string) {
    const entry = await this.prisma.waitlist.findFirst({ where: { id, businessId } });
    if (!entry) throw new NotFoundException('Waitlist entry not found');
    return entry;
  }

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

  async add(
    dto: {
      storeId: string;
      customerName: string;
      customerPhone?: string;
      partySize: number;
      notes?: string;
      estimatedWaitMinutes?: number;
    },
    businessId: string,
  ) {
    const store = await this.prisma.store.findFirst({ where: { id: dto.storeId, businessId }, select: { id: true } });
    if (!store) throw new NotFoundException('Store not found');
    if (!Number.isInteger(dto.partySize) || dto.partySize < 1) throw new BadRequestException('Party size must be at least 1');
    return this.prisma.waitlist.create({
      data: {
        businessId,
        storeId: store.id,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        partySize: dto.partySize,
        notes: dto.notes,
        estimatedWaitMinutes: dto.estimatedWaitMinutes,
      },
    });
  }

  async seat(id: string, businessId: string, tableId?: string) {
    const entry = await this.owned(id, businessId);
    if (tableId) {
      const table = await this.prisma.table.findFirst({ where: { id: tableId, store: { businessId } }, select: { id: true } });
      if (!table) throw new NotFoundException('Table not found');
    }
    return this.prisma.waitlist.update({
      where: { id: entry.id },
      data: { status: 'SEATED', seatedAt: new Date(), tableId },
    });
  }

  async notify(id: string, businessId: string) {
    const entry = await this.owned(id, businessId);

    await this.prisma.waitlist.update({
      where: { id },
      data: { status: 'NOTIFIED', notifiedAt: new Date() },
    });

    return { success: true, message: 'Table ready notification sent', customerPhone: entry.customerPhone };
  }

  async cancel(id: string, businessId: string) {
    await this.owned(id, businessId);
    return this.prisma.waitlist.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async noShow(id: string, businessId: string) {
    await this.owned(id, businessId);
    return this.prisma.waitlist.update({
      where: { id },
      data: { status: 'NO_SHOW' },
    });
  }
}

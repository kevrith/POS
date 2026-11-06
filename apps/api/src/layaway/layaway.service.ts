import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { v4 as uuidv4 } from 'uuid';

import { requireArray } from '../common/validate';

interface CreateLayawayDto {
  storeId: string;
  customerId: string;
  items: Array<{ itemId: string; quantity: number }>;
  depositCents: number;
}

@Injectable()
export class LayawayService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async create(businessId: string, dto: CreateLayawayDto) {
    requireArray(dto?.items, 'items');
    return this.prisma.$transaction(async (tx) => {
      const items = await tx.item.findMany({
        where: { id: { in: dto.items.map(i => i.itemId) } },
      });

      const totalCents = items.reduce((sum, item) => {
        const cartItem = dto.items.find(i => i.itemId === item.id);
        return sum + (item.retailPriceCents * (cartItem?.quantity ?? 0));
      }, 0);

      const layaway = await tx.layaway.create({
        data: {
          offlineId: uuidv4(),
          businessId,
          storeId: dto.storeId,
          customerId: dto.customerId,
          status: 'ACTIVE',
          totalCents,
          paidCents: dto.depositCents,
          remainingCents: totalCents - dto.depositCents,
          payments: {
            create: {
              amountCents: dto.depositCents,
              method: 'CASH',
            },
          },
        },
      });

      await this.audit.createEntry({
        businessId,
        actor: 'system',
        actorType: 'SYSTEM',
        action: 'LAYAWAY_CREATED',
        entity: 'Layaway',
        entityId: layaway.id,
        after: { totalCents, paidCents: dto.depositCents },
        source: 'POS',
      }, tx);

      return layaway;
    });
  }

  async addPayment(layawayId: string, businessId: string, amountCents: number, method: string) {
    return this.prisma.$transaction(async (tx) => {
      const layaway = await tx.layaway.findFirst({
        where: { id: layawayId, businessId },
      });

      if (!layaway) throw new BadRequestException('Layaway not found');

      const newPaid = layaway.paidCents + amountCents;
      const newRemaining = layaway.totalCents - newPaid;

      await tx.layawayPayment.create({
        data: { layawayId, amountCents, method },
      });

      await tx.layaway.update({
        where: { id: layawayId },
        data: {
          paidCents: newPaid,
          remainingCents: newRemaining,
          status: newRemaining <= 0 ? 'COMPLETED' : 'ACTIVE',
        },
      });

      return { success: true, remaining: newRemaining };
    });
  }

  async findAll(businessId: string, customerId?: string) {
    return this.prisma.layaway.findMany({
      where: { businessId, customerId },
      include: { customer: true, payments: true },
      orderBy: { createdAt: 'desc' },
    });
  }
}

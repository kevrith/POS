import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DamagedGoodsService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string, storeId?: string, status?: string) {
    const records = await this.prisma.damagedGoodsRecord.findMany({
      where: {
        businessId,
        ...(storeId ? { storeId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });

    // DamagedGoodsRecord has no Item relation — resolve names so the list
    // shows products rather than raw ids.
    const itemIds = [...new Set(records.map((r) => r.itemId))];
    const items = itemIds.length
      ? await this.prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, barcode: true },
        })
      : [];
    const byId = new Map(items.map((i) => [i.id, i]));

    return records.map((r) => ({
      ...r,
      item: byId.get(r.itemId)
        ? { name: byId.get(r.itemId)!.name, sku: byId.get(r.itemId)!.barcode }
        : undefined,
    }));
  }

  async create(dto: {
    businessId: string;
    storeId?: string;
    itemId: string;
    variantId?: string;
    quantity: number;
    costCents?: number;
    reason: string;
    notes?: string;
    imageUrl?: string;
    submittedBy: string;
  }) {
    if (!dto.itemId) throw new BadRequestException('Select an item to write off');
    if (!dto.quantity || dto.quantity <= 0) {
      throw new BadRequestException('Quantity must be greater than zero');
    }
    if (!dto.reason?.trim()) throw new BadRequestException('A reason is required');

    const item = await this.prisma.item.findFirst({
      where: { id: dto.itemId, businessId: dto.businessId },
      select: { id: true, costPriceCents: true },
    });
    if (!item) throw new BadRequestException('Item not found in this business');

    const storeId =
      dto.storeId ??
      (
        await this.prisma.store.findFirst({
          where: { businessId: dto.businessId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
      )?.id;
    if (!storeId) throw new BadRequestException('No store found for this business');

    return this.prisma.damagedGoodsRecord.create({
      data: {
        businessId: dto.businessId,
        storeId,
        itemId: dto.itemId,
        variantId: dto.variantId,
        quantity: dto.quantity,
        // Default the loss value to the item's cost so shrinkage reporting is meaningful.
        costCents: dto.costCents ?? item.costPriceCents * dto.quantity,
        reason: dto.reason,
        notes: dto.notes,
        imageUrl: dto.imageUrl,
        submittedBy: dto.submittedBy,
      },
    });
  }

  async approve(id: string, businessId: string, authorizedBy: string) {
    const record = await this.prisma.damagedGoodsRecord.findFirst({
      where: { id, businessId },
    });
    if (!record) throw new NotFoundException('Record not found');
    if (record.status !== 'PENDING') throw new ForbiddenException('Already processed');

    // Stock only moves on approval, and both writes must land together —
    // a movement without the status flip would let the same loss be booked twice.
    return this.prisma.$transaction(async (tx) => {
      await tx.inventoryMovement.create({
        data: {
          offlineId: uuidv4(),
          businessId: record.businessId,
          itemId: record.itemId,
          storeId: record.storeId,
          type: 'DAMAGED',
          quantity: -record.quantity,
          variantId: record.variantId ?? undefined,
          source: 'DAMAGED_GOODS_WRITEOFF',
        },
      });

      return tx.damagedGoodsRecord.update({
        where: { id },
        data: { status: 'APPROVED', authorizedBy },
      });
    });
  }

  async reject(id: string, businessId: string, authorizedBy: string) {
    const record = await this.prisma.damagedGoodsRecord.findFirst({
      where: { id, businessId },
    });
    if (!record) throw new NotFoundException('Record not found');
    if (record.status !== 'PENDING') throw new ForbiddenException('Already processed');

    return this.prisma.damagedGoodsRecord.update({
      where: { id },
      data: { status: 'REJECTED', authorizedBy },
    });
  }
}

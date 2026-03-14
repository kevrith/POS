import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryMovementType, NegativeStockPolicy } from '@pos/shared';
import { v4 as uuidv4 } from 'uuid';
import type { Prisma } from '@prisma/client';

type PrismaTx = Omit<PrismaService, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>;

@Injectable()
export class InventoryService {
  constructor(private prisma: PrismaService) {}

  /** Compute current stock from movement ledger. Never reads a direct count field. */
  async getStockLevel(itemId: string, storeId: string): Promise<number> {
    const result = await this.prisma.inventoryMovement.aggregate({
      where: { itemId, storeId },
      _sum: { quantity: true },
    });
    return result._sum.quantity ?? 0;
  }

  async getStockLevels(
    itemIds: string[],
    storeId: string,
  ): Promise<Map<string, number>> {
    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['itemId'],
      where: { itemId: { in: itemIds }, storeId },
      _sum: { quantity: true },
    });
    const map = new Map<string, number>();
    for (const m of movements) {
      map.set(m.itemId, m._sum.quantity ?? 0);
    }
    return map;
  }

  async checkAndDeductStock(
    itemId: string,
    storeId: string,
    quantity: number,
    saleId: string,
    tx: PrismaTx,
  ): Promise<void> {
    const item = await tx.item.findUnique({
      where: { id: itemId },
    });
    if (!item) throw new BadRequestException(`Item ${itemId} not found`);

    if (!item.trackStock) return; // SERVICE items skip stock tracking

    const stock = await this.getStockLevel(itemId, storeId);
    const policy = item.negativeStockPolicy ?? 'BLOCK';

    if (stock < quantity) {
      if (policy === NegativeStockPolicy.BLOCK) {
        throw new BadRequestException(
          `Insufficient stock for "${item.name}". Available: ${stock}`,
        );
      }
      // WARN or ALLOW → proceed
    }

    await tx.inventoryMovement.create({
      data: {
        offlineId: uuidv4(),
        itemId,
        storeId,
        businessId: item.businessId,
        type: InventoryMovementType.SALE,
        quantity: -quantity,
        saleId,
        source: 'POS',
      },
    });
  }

  async createMovement(
    data: {
      itemId: string;
      storeId: string;
      businessId: string;
      type: InventoryMovementType;
      quantity: number;
      saleId?: string;
      batchId?: string;
      grnId?: string;
      source?: string;
    },
    tx?: PrismaTx,
  ): Promise<void> {
    const client = tx ?? this.prisma;
    await client.inventoryMovement.create({
      data: {
        offlineId: uuidv4(),
        itemId: data.itemId,
        storeId: data.storeId,
        businessId: data.businessId,
        type: data.type,
        quantity: data.quantity,
        saleId: data.saleId,
        batchId: data.batchId,
        grnId: data.grnId,
        source: data.source ?? 'POS',
      },
    });
  }

  async getVariantStockLevel(variantId: string, storeId: string) {
    const movements = await this.prisma.inventoryMovement.findMany({
      where: { variantId, storeId },
    });
    const stock = movements.reduce((s, m) => s + m.quantity, 0);
    return { variantId, storeId, stock };
  }

  async getMovementHistory(
    itemId: string,
    storeId: string,
    limit = 50,
  ): Promise<Prisma.InventoryMovementGetPayload<object>[]> {
    return this.prisma.inventoryMovement.findMany({
      where: { itemId, storeId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}

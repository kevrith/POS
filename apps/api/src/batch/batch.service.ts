import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

interface CreateBatchDto {
  itemId: string;
  storeId: string;
  lotNumber: string;
  manufacturingDate?: Date;
  expiryDate?: Date;
  supplierId?: string;
  quantityReceived: number;
}

@Injectable()
export class BatchService {
  constructor(private prisma: PrismaService) {}

  async create(businessId: string, dto: CreateBatchDto) {
    const item = await this.prisma.item.findFirst({
      where: { id: dto.itemId, businessId },
    });

    if (!item?.trackBatches) {
      throw new BadRequestException('Item does not track batches');
    }

    return this.prisma.batch.create({
      data: {
        offlineId: uuidv4(),
        itemId: dto.itemId,
        storeId: dto.storeId,
        lotNumber: dto.lotNumber,
        manufacturingDate: dto.manufacturingDate,
        expiryDate: dto.expiryDate,
        supplierId: dto.supplierId,
        quantityReceived: dto.quantityReceived,
        quantityRemaining: dto.quantityReceived,
        status: 'ACTIVE',
      },
    });
  }

  async listBatches(businessId: string, status?: string) {
    return this.prisma.batch.findMany({
      where: {
        item: { businessId },
        ...(status ? { status } : {}),
      },
      include: { item: { select: { name: true, unit: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getExpiringBatches(businessId: string, daysThreshold: number) {
    const thresholdDate = new Date();
    thresholdDate.setDate(thresholdDate.getDate() + daysThreshold);

    return this.prisma.batch.findMany({
      where: {
        item: { businessId },
        status: 'ACTIVE',
        quantityRemaining: { gt: 0 },
        expiryDate: { lte: thresholdDate },
      },
      include: { item: true },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async recallBatch(batchId: string, businessId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, item: { businessId } },
      include: {
        movements: {
          where: { type: 'SALE' },
          include: { sale: { include: { customer: true } } },
        },
      },
    });

    if (!batch) throw new BadRequestException('Batch not found');

    await this.prisma.batch.update({
      where: { id: batchId },
      data: { status: 'RECALLED' },
    });

    return {
      batch,
      affectedSales: batch.movements.map(m => m.sale).filter(Boolean),
    };
  }

  async getBatchesFEFO(itemId: string) {
    return this.prisma.batch.findMany({
      where: {
        itemId,
        status: 'ACTIVE',
        quantityRemaining: { gt: 0 },
      },
      orderBy: { expiryDate: 'asc' },
    });
  }

  async deductFromBatchesFEFO(itemId: string, quantity: number, saleId: string, businessId: string) {
    const batches = await this.getBatchesFEFO(itemId);
    let remaining = quantity;
    const movements = [];

    for (const batch of batches) {
      if (remaining <= 0) break;

      const deductQty = Math.min(remaining, batch.quantityRemaining);
      
      await this.prisma.batch.update({
        where: { id: batch.id },
        data: { quantityRemaining: { decrement: deductQty } },
      });

      movements.push({
        offlineId: uuidv4(),
        businessId,
        itemId,
        storeId: batch.storeId,
        type: 'SALE',
        quantity: -deductQty,
        batchId: batch.id,
        saleId,
        source: 'POS',
      });

      remaining -= deductQty;
    }

    if (remaining > 0) {
      throw new BadRequestException(`Insufficient batch stock. Missing ${remaining} units`);
    }

    return movements;
  }

  async getBatchHistory(batchId: string, businessId: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId, item: { businessId } },
      include: {
        item: true,
        movements: {
          include: { sale: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    if (!batch) throw new BadRequestException('Batch not found');

    return batch;
  }
}

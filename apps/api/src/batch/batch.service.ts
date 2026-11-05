import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
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
  constructor(
    private prisma: PrismaService,
    private notificationsService: NotificationsService,
  ) {}

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
      include: { item: { select: { name: true, weightUnit: true } } },
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
        item: { select: { name: true, businessId: true } },
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

    const affectedSales = batch.movements.map(m => m.sale).filter(Boolean);

    const affectedCount = await this.prisma.inventoryMovement.count({
      where: { batchId: batch.id, type: 'SALE' },
    });
    this.notificationsService.notifyBatchRecall(
      batch.item.businessId,
      batch.id,
      batch.item.name,
      affectedCount,
    ).catch(() => {});

    return {
      batch,
      affectedSales,
    };
  }

  /** The order stock would be sold in: in-date batches with units left, soonest expiry first. */
  async getBatchesFEFO(itemId: string, businessId?: string) {
    return this.prisma.batch.findMany({
      where: {
        itemId,
        status: 'ACTIVE',
        quantityRemaining: { gt: 0 },
        ...(businessId ? { item: { businessId } } : {}),
      },
      orderBy: { expiryDate: 'asc' },
    });
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

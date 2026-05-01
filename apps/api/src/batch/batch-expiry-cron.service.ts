import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class BatchExpiryCronService {
  private readonly logger = new Logger(BatchExpiryCronService.name);

  constructor(private prisma: PrismaService) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async writeOffExpiredBatches() {
    this.logger.log('Running expired batch write-off...');
    const now = new Date();

    const expiredBatches = await this.prisma.batch.findMany({
      where: {
        expiryDate: { lt: now },
        quantityRemaining: { gt: 0 },
        status: { notIn: ['WRITTEN_OFF', 'RECALLED'] },
      },
      include: {
        item: { select: { name: true, businessId: true, costPriceCents: true } },
      },
    });

    let count = 0;
    for (const batch of expiredBatches) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const costCents = (batch.item.costPriceCents ?? 0) * batch.quantityRemaining;
          const expiryDateStr = batch.expiryDate?.toISOString().split('T')[0] ?? 'unknown';

          // 1. Create damaged goods record (auto-approved)
          await tx.damagedGoodsRecord.create({
            data: {
              businessId: batch.item.businessId,
              storeId: batch.storeId,
              itemId: batch.itemId,
              quantity: batch.quantityRemaining,
              costCents,
              reason: 'EXPIRED',
              notes: `Batch ${batch.lotNumber} expired on ${expiryDateStr}. Auto written off by system.`,
              submittedBy: 'SYSTEM',
              authorizedBy: 'SYSTEM',
              status: 'APPROVED',
            },
          });

          // 2. Create negative inventory movement
          await tx.inventoryMovement.create({
            data: {
              offlineId: uuidv4(),
              businessId: batch.item.businessId,
              itemId: batch.itemId,
              storeId: batch.storeId,
              batchId: batch.id,
              type: 'DAMAGED',
              quantity: -batch.quantityRemaining,
              source: 'EXPIRY_WRITEOFF',
            },
          });

          // 3. Update batch to written-off
          await tx.batch.update({
            where: { id: batch.id },
            data: { status: 'WRITTEN_OFF', quantityRemaining: 0 },
          });

          // 4. Create notification
          await tx.notification.create({
            data: {
              businessId: batch.item.businessId,
              type: 'EXPIRY_WRITEOFF',
              title: `Expired batch written off: ${batch.item.name}`,
              body: `Batch ${batch.lotNumber} of "${batch.item.name}" expired on ${expiryDateStr}. ${batch.quantityRemaining} units (KES ${(costCents / 100).toFixed(2)}) written off automatically.`,
              priority: 'HIGH',
            },
          });
        });
        count++;
      } catch (err) {
        this.logger.error(`Failed to write off batch ${batch.id}: ${err}`);
      }
    }

    if (count > 0) {
      this.logger.log(`Written off ${count} expired batches`);
    } else {
      this.logger.log('No expired batches to write off');
    }

    return { writtenOff: count };
  }

  async writeOffSingleBatch(batchId: string, authorizedBy: string) {
    const batch = await this.prisma.batch.findFirst({
      where: { id: batchId },
      include: {
        item: { select: { name: true, businessId: true, costPriceCents: true } },
      },
    });

    if (!batch) {
      throw new BadRequestException('Batch not found');
    }

    if (batch.quantityRemaining <= 0) {
      throw new BadRequestException('Batch has no remaining quantity to write off');
    }

    if (batch.status === 'WRITTEN_OFF') {
      throw new BadRequestException('Batch is already written off');
    }

    if (batch.status === 'RECALLED') {
      throw new BadRequestException('Recalled batches cannot be written off');
    }

    const costCents = (batch.item.costPriceCents ?? 0) * batch.quantityRemaining;
    const expiryDateStr = batch.expiryDate?.toISOString().split('T')[0] ?? 'unknown';

    return this.prisma.$transaction(async (tx) => {
      await tx.damagedGoodsRecord.create({
        data: {
          businessId: batch.item.businessId,
          storeId: batch.storeId,
          itemId: batch.itemId,
          quantity: batch.quantityRemaining,
          costCents,
          reason: 'EXPIRED',
          notes: `Batch ${batch.lotNumber} manually written off. Expiry: ${expiryDateStr}.`,
          submittedBy: authorizedBy,
          authorizedBy,
          status: 'APPROVED',
        },
      });

      await tx.inventoryMovement.create({
        data: {
          offlineId: uuidv4(),
          businessId: batch.item.businessId,
          itemId: batch.itemId,
          storeId: batch.storeId,
          batchId: batch.id,
          type: 'DAMAGED',
          quantity: -batch.quantityRemaining,
          source: 'EXPIRY_WRITEOFF',
        },
      });

      const updated = await tx.batch.update({
        where: { id: batch.id },
        data: { status: 'WRITTEN_OFF', quantityRemaining: 0 },
      });

      await tx.notification.create({
        data: {
          businessId: batch.item.businessId,
          type: 'EXPIRY_WRITEOFF',
          title: `Batch written off: ${batch.item.name}`,
          body: `Batch ${batch.lotNumber} of "${batch.item.name}" (expiry: ${expiryDateStr}). ${batch.quantityRemaining} units (KES ${(costCents / 100).toFixed(2)}) written off by ${authorizedBy}.`,
          priority: 'HIGH',
        },
      });

      return updated;
    });
  }

  async triggerManual(businessId?: string) {
    const now = new Date();

    const expiredBatches = await this.prisma.batch.findMany({
      where: {
        expiryDate: { lt: now },
        quantityRemaining: { gt: 0 },
        status: { notIn: ['WRITTEN_OFF', 'RECALLED'] },
        ...(businessId ? { item: { is: { businessId } } } : {}),
      },
      include: {
        item: { select: { name: true, businessId: true, costPriceCents: true } },
      },
    });

    let count = 0;
    for (const batch of expiredBatches) {
      try {
        await this.prisma.$transaction(async (tx) => {
          const costCents = (batch.item.costPriceCents ?? 0) * batch.quantityRemaining;
          const expiryDateStr = batch.expiryDate?.toISOString().split('T')[0] ?? 'unknown';

          await tx.damagedGoodsRecord.create({
            data: {
              businessId: batch.item.businessId,
              storeId: batch.storeId,
              itemId: batch.itemId,
              quantity: batch.quantityRemaining,
              costCents,
              reason: 'EXPIRED',
              notes: `Batch ${batch.lotNumber} expired on ${expiryDateStr}. Auto written off by system.`,
              submittedBy: 'SYSTEM',
              authorizedBy: 'SYSTEM',
              status: 'APPROVED',
            },
          });

          await tx.inventoryMovement.create({
            data: {
              offlineId: uuidv4(),
              businessId: batch.item.businessId,
              itemId: batch.itemId,
              storeId: batch.storeId,
              batchId: batch.id,
              type: 'DAMAGED',
              quantity: -batch.quantityRemaining,
              source: 'EXPIRY_WRITEOFF',
            },
          });

          await tx.batch.update({
            where: { id: batch.id },
            data: { status: 'WRITTEN_OFF', quantityRemaining: 0 },
          });

          await tx.notification.create({
            data: {
              businessId: batch.item.businessId,
              type: 'EXPIRY_WRITEOFF',
              title: `Expired batch written off: ${batch.item.name}`,
              body: `Batch ${batch.lotNumber} of "${batch.item.name}" expired on ${expiryDateStr}. ${batch.quantityRemaining} units (KES ${(costCents / 100).toFixed(2)}) written off automatically.`,
              priority: 'HIGH',
            },
          });
        });
        count++;
      } catch (err) {
        this.logger.error(`Failed to write off batch ${batch.id}: ${err}`);
      }
    }

    this.logger.log(`Manual trigger: written off ${count} expired batches`);
    return { writtenOff: count };
  }
}

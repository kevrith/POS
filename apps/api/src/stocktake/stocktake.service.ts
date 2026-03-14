import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class StocktakeService {
  constructor(private prisma: PrismaService) {}

  async getSessions(businessId: string, storeId?: string) {
    return this.prisma.stocktakeSession.findMany({
      where: { businessId, ...(storeId ? { storeId } : {}) },
      include: { _count: { select: { counts: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getSession(id: string) {
    const session = await this.prisma.stocktakeSession.findUnique({
      where: { id },
      include: { counts: { orderBy: { itemName: 'asc' } } },
    });
    if (!session) throw new NotFoundException('Stocktake session not found');
    return session;
  }

  /** Create session and auto-populate count sheet from current stock ledger */
  async createSession(dto: {
    businessId: string;
    storeId: string;
    name: string;
    createdBy: string;
    notes?: string;
  }) {
    // Get all items for this store that track stock
    const items = await this.prisma.item.findMany({
      where: { businessId: dto.businessId, trackStock: true, deletedAt: null },
      select: { id: true, name: true },
    });

    // Get current stock levels via movement ledger
    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['itemId'],
      where: {
        storeId: dto.storeId,
        itemId: { in: items.map((i) => i.id) },
      },
      _sum: { quantity: true },
    });

    const stockMap = new Map(movements.map((m) => [m.itemId, m._sum.quantity ?? 0]));

    const session = await this.prisma.stocktakeSession.create({
      data: {
        businessId: dto.businessId,
        storeId: dto.storeId,
        name: dto.name,
        createdBy: dto.createdBy,
        notes: dto.notes,
        status: 'DRAFT',
        counts: {
          create: items.map((item) => ({
            itemId: item.id,
            itemName: item.name,
            systemQty: stockMap.get(item.id) ?? 0,
          })),
        },
      },
      include: { _count: { select: { counts: true } } },
    });

    return session;
  }

  /** Save counted quantities (partial save OK — session stays IN_PROGRESS) */
  async saveCounts(
    sessionId: string,
    updates: Array<{ countId: string; countedQty: number; note?: string; countedBy?: string }>,
  ) {
    const session = await this.prisma.stocktakeSession.findUnique({ where: { id: sessionId } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status === 'FINALIZED') throw new BadRequestException('Session already finalized');

    // Mark as IN_PROGRESS on first save
    if (session.status === 'DRAFT') {
      await this.prisma.stocktakeSession.update({
        where: { id: sessionId },
        data: { status: 'IN_PROGRESS', startedAt: new Date() },
      });
    }

    await Promise.all(
      updates.map((u) =>
        this.prisma.stocktakeCount.update({
          where: { id: u.countId },
          data: {
            countedQty: u.countedQty,
            varianceQty: undefined, // computed on finalize
            note: u.note,
            countedBy: u.countedBy,
            countedAt: new Date(),
          },
        }),
      ),
    );

    return { saved: updates.length };
  }

  /** Finalize: compute variances, create adjustment movements, lock session */
  async finalizeSession(sessionId: string, finalizedBy: string) {
    const session = await this.prisma.stocktakeSession.findUnique({
      where: { id: sessionId },
      include: { counts: true },
    });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status === 'FINALIZED') throw new BadRequestException('Already finalized');

    const adjustments: Array<{ itemId: string; qty: number; sessionId: string }> = [];

    await this.prisma.$transaction(async (tx) => {
      for (const count of session.counts) {
        if (count.countedQty === null || count.countedQty === undefined) continue;

        const varianceQty = count.countedQty - count.systemQty;

        await tx.stocktakeCount.update({
          where: { id: count.id },
          data: { varianceQty },
        });

        // Create adjustment movement if there's a variance
        if (varianceQty !== 0) {
          await tx.inventoryMovement.create({
            data: {
              offlineId: uuidv4(),
              businessId: session.businessId,
              itemId: count.itemId,
              storeId: session.storeId,
              quantity: Math.round(varianceQty),
              type: 'ADJUSTMENT',
              source: `STOCKTAKE:${sessionId}`,
            },
          });
          adjustments.push({ itemId: count.itemId, qty: varianceQty, sessionId });
        }
      }

      await tx.stocktakeSession.update({
        where: { id: sessionId },
        data: { status: 'FINALIZED', finalizedAt: new Date() },
      });
    });

    const summary = {
      totalItems: session.counts.length,
      countedItems: session.counts.filter((c) => c.countedQty !== null).length,
      adjustmentsMade: adjustments.length,
    };

    return summary;
  }

  async deleteSession(id: string) {
    const session = await this.prisma.stocktakeSession.findUnique({ where: { id } });
    if (!session) throw new NotFoundException('Session not found');
    if (session.status === 'FINALIZED') throw new BadRequestException('Cannot delete a finalized session');
    await this.prisma.stocktakeSession.delete({ where: { id } });
    return { deleted: true };
  }
}

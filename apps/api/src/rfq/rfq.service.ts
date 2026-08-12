import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RFQService {
  constructor(private prisma: PrismaService) {}

  private async nextRfqNumber(businessId: string): Promise<string> {
    const count = await this.prisma.rFQ.count({ where: { businessId } });
    return `RFQ-${String(count + 1).padStart(5, '0')}`;
  }

  /** Every mutating call goes through this so an RFQ from another tenant is never touched. */
  private async requireRfq(rfqId: string, businessId: string) {
    const rfq = await this.prisma.rFQ.findFirst({ where: { id: rfqId, businessId } });
    if (!rfq) throw new NotFoundException('RFQ not found');
    return rfq;
  }

  async list(businessId: string, status?: string) {
    const rfqs = await this.prisma.rFQ.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      include: { items: true, responses: { include: { supplier: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // RFQItem stores only itemId — resolve names so the UI isn't showing UUIDs.
    const itemIds = [...new Set(rfqs.flatMap((r) => r.items.map((i) => i.itemId)))];
    const items = itemIds.length
      ? await this.prisma.item.findMany({
          where: { id: { in: itemIds } },
          select: { id: true, name: true, barcode: true },
        })
      : [];
    const byId = new Map(items.map((i) => [i.id, i]));

    return rfqs.map((r) => ({
      ...r,
      items: r.items.map((i) => ({
        ...i,
        itemName: byId.get(i.itemId)?.name ?? 'Unknown item',
        itemSku: byId.get(i.itemId)?.barcode ?? null,
      })),
    }));
  }

  async create(dto: {
    businessId: string;
    storeId?: string;
    createdBy: string;
    notes?: string;
    deadline?: string;
    items: Array<{ itemId: string; quantityNeeded: number }>;
  }) {
    const lines = (dto.items ?? []).filter((i) => i.itemId && i.quantityNeeded > 0);
    if (lines.length === 0) {
      throw new BadRequestException('Add at least one item with a quantity');
    }

    // storeId is required by the schema but the RFQ screen has no store picker —
    // fall back to the business's first store rather than failing the request.
    const storeId =
      dto.storeId ??
      (
        await this.prisma.store.findFirst({
          where: { businessId: dto.businessId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
      )?.id;
    if (!storeId) {
      throw new BadRequestException('Create a store before raising an RFQ');
    }

    const known = await this.prisma.item.count({
      where: { businessId: dto.businessId, id: { in: lines.map((l) => l.itemId) } },
    });
    if (known !== new Set(lines.map((l) => l.itemId)).size) {
      throw new BadRequestException('One or more items do not belong to this business');
    }

    const rfqNumber = await this.nextRfqNumber(dto.businessId);
    return this.prisma.rFQ.create({
      data: {
        rfqNumber,
        businessId: dto.businessId,
        storeId,
        createdBy: dto.createdBy,
        notes: dto.notes,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        items: {
          create: lines.map((l) => ({
            itemId: l.itemId,
            quantityNeeded: Math.round(l.quantityNeeded),
          })),
        },
      },
      include: { items: true },
    });
  }

  async send(id: string, businessId: string) {
    const rfq = await this.requireRfq(id, businessId);
    if (rfq.status === 'AWARDED') {
      throw new BadRequestException('This RFQ has already been awarded');
    }
    return this.prisma.rFQ.update({ where: { id }, data: { status: 'SENT' } });
  }

  async addResponse(
    rfqId: string,
    businessId: string,
    dto: {
      supplierId: string;
      quotedPriceCents: number;
      deliveryDays?: number;
      validUntil?: string;
      notes?: string;
    },
  ) {
    const rfq = await this.requireRfq(rfqId, businessId);
    if (rfq.status === 'AWARDED') {
      throw new BadRequestException('This RFQ has already been awarded');
    }
    if (!Number.isFinite(dto.quotedPriceCents) || dto.quotedPriceCents <= 0) {
      throw new BadRequestException('Enter a quoted price greater than zero');
    }

    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, businessId },
      select: { id: true },
    });
    if (!supplier) throw new BadRequestException('Supplier not found in this business');

    const existing = await this.prisma.rFQResponse.findFirst({
      where: { rfqId, supplierId: dto.supplierId },
    });

    const data = {
      quotedPriceCents: Math.round(dto.quotedPriceCents),
      deliveryDays: dto.deliveryDays,
      validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
      notes: dto.notes,
    };

    // A supplier re-quoting should replace their bid, not create a second row.
    if (existing) {
      return this.prisma.rFQResponse.update({ where: { id: existing.id }, data });
    }

    return this.prisma.rFQResponse.create({
      data: { rfqId, supplierId: dto.supplierId, ...data },
    });
  }

  async awardResponse(rfqId: string, responseId: string, businessId: string) {
    await this.requireRfq(rfqId, businessId);
    const response = await this.prisma.rFQResponse.findFirst({
      where: { id: responseId, rfqId },
    });
    if (!response) throw new NotFoundException('Quote not found on this RFQ');

    return this.prisma.$transaction(async (tx) => {
      await tx.rFQResponse.updateMany({ where: { rfqId }, data: { status: 'REJECTED' } });
      await tx.rFQResponse.update({ where: { id: responseId }, data: { status: 'AWARDED' } });
      return tx.rFQ.update({ where: { id: rfqId }, data: { status: 'AWARDED' } });
    });
  }

  async getComparison(rfqId: string, businessId: string) {
    await this.requireRfq(rfqId, businessId);
    return this.prisma.rFQ.findUnique({
      where: { id: rfqId },
      include: { items: true, responses: { include: { supplier: true } } },
    });
  }
}

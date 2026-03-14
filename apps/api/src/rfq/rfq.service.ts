import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class RFQService {
  constructor(private prisma: PrismaService) {}

  private async nextRfqNumber(businessId: string): Promise<string> {
    const count = await this.prisma.rFQ.count({ where: { businessId } });
    return `RFQ-${String(count + 1).padStart(5, '0')}`;
  }

  async list(businessId: string, status?: string) {
    return this.prisma.rFQ.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      include: { items: true, responses: { include: { supplier: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: { businessId: string; storeId: string; createdBy: string; notes?: string; deadline?: string; items: Array<{ itemId: string; quantityNeeded: number }> }) {
    const rfqNumber = await this.nextRfqNumber(dto.businessId);
    return this.prisma.rFQ.create({
      data: {
        rfqNumber,
        businessId: dto.businessId,
        storeId: dto.storeId,
        createdBy: dto.createdBy,
        notes: dto.notes,
        deadline: dto.deadline ? new Date(dto.deadline) : undefined,
        items: { create: dto.items },
      },
      include: { items: true },
    });
  }

  async send(id: string) {
    return this.prisma.rFQ.update({ where: { id }, data: { status: 'SENT' } });
  }

  async addResponse(rfqId: string, dto: { supplierId: string; quotedPriceCents: number; deliveryDays?: number; validUntil?: string; notes?: string }) {
    return this.prisma.rFQResponse.create({
      data: {
        rfqId,
        supplierId: dto.supplierId,
        quotedPriceCents: dto.quotedPriceCents,
        deliveryDays: dto.deliveryDays,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        notes: dto.notes,
      },
    });
  }

  async awardResponse(rfqId: string, responseId: string) {
    // Mark this response AWARDED, others REJECTED
    await this.prisma.rFQResponse.updateMany({ where: { rfqId }, data: { status: 'REJECTED' } });
    await this.prisma.rFQResponse.update({ where: { id: responseId }, data: { status: 'AWARDED' } });
    return this.prisma.rFQ.update({ where: { id: rfqId }, data: { status: 'AWARDED' } });
  }

  async getComparison(rfqId: string) {
    return this.prisma.rFQ.findUnique({
      where: { id: rfqId },
      include: { items: true, responses: { include: { supplier: true } } },
    });
  }
}

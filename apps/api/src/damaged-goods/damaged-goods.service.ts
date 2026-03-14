import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class DamagedGoodsService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string, storeId?: string, status?: string) {
    return this.prisma.damagedGoodsRecord.findMany({
      where: {
        businessId,
        ...(storeId ? { storeId } : {}),
        ...(status ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: {
    businessId: string;
    storeId: string;
    itemId: string;
    variantId?: string;
    quantity: number;
    costCents?: number;
    reason: string;
    notes?: string;
    imageUrl?: string;
    submittedBy: string;
  }) {
    return this.prisma.damagedGoodsRecord.create({ data: dto });
  }

  async approve(id: string, authorizedBy: string) {
    const record = await this.prisma.damagedGoodsRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Record not found');
    if (record.status !== 'PENDING') throw new ForbiddenException('Already processed');

    // Create inventory movement
    await this.prisma.inventoryMovement.create({
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

    return this.prisma.damagedGoodsRecord.update({
      where: { id },
      data: { status: 'APPROVED', authorizedBy },
    });
  }

  async reject(id: string, authorizedBy: string) {
    const record = await this.prisma.damagedGoodsRecord.findUnique({ where: { id } });
    if (!record) throw new NotFoundException('Record not found');
    return this.prisma.damagedGoodsRecord.update({
      where: { id },
      data: { status: 'REJECTED', authorizedBy },
    });
  }
}

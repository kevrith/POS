import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SupplierService {
  constructor(private prisma: PrismaService) {}

  async create(data: {
    businessId: string;
    name: string;
    contact?: string;
    address?: string;
    paymentTerms?: string;
    creditLimitCents?: number;
  }) {
    return this.prisma.supplier.create({ data });
  }

  async findAll(businessId: string) {
    return this.prisma.supplier.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.supplier.findUnique({
      where: { id },
      include: {
        purchaseOrders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  async update(id: string, data: Partial<{
    name: string;
    contact: string;
    address: string;
    paymentTerms: string;
    creditLimitCents: number;
  }>) {
    return this.prisma.supplier.update({
      where: { id },
      data,
    });
  }

  async getLedger(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    const pos = await this.prisma.purchaseOrder.findMany({
      where: { supplierId },
      include: {
        items: true,
        grns: {
          include: { items: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      supplier,
      purchaseOrders: pos,
      outstandingBalanceCents: supplier.outstandingBalanceCents,
    };
  }

  // ── Purchase Orders ──────────────────────────────────────────────────────────

  async createPO(data: {
    businessId: string;
    supplierId: string;
    expectedDelivery?: string;
    notes?: string;
    items: Array<{
      itemId: string;
      quantityOrdered: number;
      agreedPriceCents: number;
    }>;
  }) {
    if (!data.items || data.items.length === 0) {
      throw new BadRequestException('Purchase order must have at least one item');
    }

    // Generate PO number
    const count = await this.prisma.purchaseOrder.count({
      where: { businessId: data.businessId },
    });
    const poNumber = `PO-${data.businessId.slice(0, 4).toUpperCase()}-${String(count + 1).padStart(5, '0')}`;

    return this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        businessId: data.businessId,
        supplierId: data.supplierId,
        expectedDelivery: data.expectedDelivery ? new Date(data.expectedDelivery) : undefined,
        notes: data.notes,
        items: {
          create: data.items.map((item) => ({
            itemId: item.itemId,
            quantityOrdered: item.quantityOrdered,
            agreedPriceCents: item.agreedPriceCents,
          })),
        },
      },
      include: {
        supplier: { select: { name: true } },
        items: true,
        grns: { include: { items: true } },
      },
    });
  }

  async listPOs(businessId: string, options?: { supplierId?: string; status?: string }) {
    return this.prisma.purchaseOrder.findMany({
      where: {
        businessId,
        ...(options?.supplierId && { supplierId: options.supplierId }),
        ...(options?.status && options.status !== 'ALL' && { status: options.status }),
      },
      include: {
        supplier: { select: { name: true } },
        items: true,
        grns: { include: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPO(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { name: true } },
        items: true,
        grns: { include: { items: true } },
      },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async updatePOStatus(id: string, status: string) {
    const valid = ['DRAFT', 'SUBMITTED', 'APPROVED', 'CANCELLED'];
    if (!valid.includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status },
      include: {
        supplier: { select: { name: true } },
        items: true,
        grns: { include: { items: true } },
      },
    });
  }

  // ── Goods Received Notes ─────────────────────────────────────────────────────

  async createGRN(
    poId: string,
    storeId: string,
    items: Array<{
      poItemId: string;
      quantityReceived: number;
      batchLotNumber?: string;
      expiryDate?: string;
    }>,
  ) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      throw new BadRequestException('PO must be Approved before recording receipt');
    }

    const grn = await this.prisma.$transaction(async (tx) => {
      // Create the GRN record
      const newGrn = await tx.gRN.create({
        data: {
          poId,
          items: {
            create: items.map((item) => ({
              poItemId: item.poItemId,
              quantityReceived: item.quantityReceived,
              batchLotNumber: item.batchLotNumber,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
            })),
          },
        },
        include: { items: true },
      });

      // Create inventory movements for each received item
      for (const grnItem of items) {
        if (grnItem.quantityReceived <= 0) continue;
        const poItem = po.items.find((p) => p.id === grnItem.poItemId);
        if (!poItem) continue;

        await tx.inventoryMovement.create({
          data: {
            offlineId: uuidv4(),
            itemId: poItem.itemId,
            storeId,
            businessId: po.businessId,
            type: 'GRN_RECEIPT',
            quantity: grnItem.quantityReceived,
            grnId: newGrn.id,
            source: 'GRN',
          },
        });
      }

      // Determine new PO status based on all GRNs
      const allGrns = await tx.gRN.findMany({
        where: { poId },
        include: { items: true },
      });
      const totalOrdered = po.items.reduce((s, i) => s + i.quantityOrdered, 0);
      const totalReceived = allGrns.flatMap((g) => g.items).reduce((s, i) => s + i.quantityReceived, 0);
      const newStatus = totalReceived >= totalOrdered ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: newStatus },
      });

      return newGrn;
    });

    return grn;
  }
}

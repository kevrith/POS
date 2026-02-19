import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { SaleType, SaleStatus, InventoryMovementType, calculateVAT, calculateTOT, calculateServiceCharge } from '@pos/shared';
import { v4 as uuidv4 } from 'uuid';

interface FindAllOptions {
  businessId: string;
  storeId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  limit: number;
  offset: number;
}

interface CreateProformaDto {
  businessId: string;
  customerName: string;
  customerPhone?: string;
  items: Array<{ name: string; quantity: number; unitPriceCents: number }>;
  validUntil?: string;
  notes?: string;
}

interface ConvertProformaDto {
  businessId: string;
  storeId: string;
  cashierId: string;
  payments: Array<{ method: string; amountCents: number }>;
}

interface CreateSaleDto {
  storeId: string;
  cashierId: string;
  customerId?: string;
  type: SaleType;
  priceLevel: 'RETAIL' | 'WHOLESALE' | 'VIP';
  items: Array<{ itemId: string; quantity: number }>;
  payments: Array<{ method: string; amountCents: number; reference?: string }>;
}

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private audit: AuditService,
    private auth: AuthService,
  ) {}

  async createSale(businessId: string, dto: CreateSaleDto) {
    return this.prisma.$transaction(async (tx) => {
      const store = await tx.store.findUnique({
        where: { id: dto.storeId },
        include: { business: true },
      });

      if (!store || store.businessId !== businessId) {
        throw new BadRequestException('Invalid store');
      }

      const items = await tx.item.findMany({
        where: { id: { in: dto.items.map(i => i.itemId) } },
      });

      let subtotalCents = 0;
      const saleItems = [];

      for (const cartItem of dto.items) {
        const item = items.find(i => i.id === cartItem.itemId);
        if (!item) throw new BadRequestException(`Item not found`);

        const priceKey = `${dto.priceLevel.toLowerCase()}PriceCents` as keyof typeof item;
        const unitPrice = (item[priceKey] as number) ?? item.retailPriceCents;
        const totalCents = unitPrice * cartItem.quantity;

        subtotalCents += totalCents;
        saleItems.push({
          itemId: item.id,
          name: item.name,
          quantity: cartItem.quantity,
          unitPriceCents: unitPrice,
          totalCents,
        });

        if (item.trackStock) {
          const stock = await this.inventory.getStockLevel(item.id, dto.storeId);
          if (stock < cartItem.quantity && store.business.negativePolicyDefault === 'BLOCK') {
            throw new BadRequestException(`Insufficient stock for ${item.name}`);
          }
        }
      }

      const serviceChargeCents = calculateServiceCharge(subtotalCents, store.business.serviceChargeRate);
      const vatCents = store.business.taxType === 'VAT' ? calculateVAT(subtotalCents) : 0;
      const totCents = store.business.taxType === 'TOT' ? calculateTOT(subtotalCents) : 0;
      const totalCents = subtotalCents + serviceChargeCents + vatCents + totCents;

      const receiptNumber = `${store.storeCode}-${new Date().getFullYear()}-${String(store.receiptSequence + 1).padStart(7, '0')}`;

      const sale = await tx.sale.create({
        data: {
          offlineId: uuidv4(),
          businessId,
          storeId: dto.storeId,
          receiptNumber,
          cashierId: dto.cashierId,
          customerId: dto.customerId,
          type: dto.type,
          status: dto.type === SaleType.CREDIT ? SaleStatus.CREDIT : SaleStatus.PAID,
          priceLevel: dto.priceLevel,
          subtotalCents,
          serviceChargeCents,
          vatCents,
          totCents,
          totalCents,
          items: { create: saleItems },
          payments: {
            create: dto.payments.map(p => ({
              offlineId: uuidv4(),
              method: p.method,
              amountCents: p.amountCents,
              reference: p.reference,
            })),
          },
        },
        include: { items: true, payments: true },
      });

      await tx.store.update({
        where: { id: dto.storeId },
        data: { receiptSequence: { increment: 1 } },
      });

      for (const cartItem of dto.items) {
        const item = items.find(i => i.id === cartItem.itemId);
        if (item?.trackStock) {
          await tx.inventoryMovement.create({
            data: {
              offlineId: uuidv4(),
              businessId,
              itemId: cartItem.itemId,
              storeId: dto.storeId,
              type: InventoryMovementType.SALE,
              quantity: -cartItem.quantity,
              saleId: sale.id,
              source: 'POS',
            },
          });
        }
      }

      await this.audit.createEntry({
        businessId,
        actor: dto.cashierId,
        actorType: 'USER',
        action: 'SALE_CREATED',
        entity: 'Sale',
        entityId: sale.id,
        after: { receiptNumber, totalCents },
        source: 'POS',
      });

      return sale;
    });
  }

  async getSale(id: string, businessId: string) {
    return this.prisma.sale.findFirst({
      where: { id, businessId },
      include: { items: true, payments: true },
    });
  }

  async voidSale(saleId: string, businessId: string, managerId: string, reason: string, voidedItemIds?: string[]) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, businessId },
        include: { items: true },
      });

      if (!sale || sale.status !== SaleStatus.PAID) {
        throw new BadRequestException('Can only void paid sales');
      }

      const isLineItemVoid = voidedItemIds && voidedItemIds.length > 0;
      const itemsToVoid = isLineItemVoid
        ? sale.items.filter(i => voidedItemIds.includes(i.id))
        : sale.items;

      // Reverse inventory
      for (const item of itemsToVoid) {
        if (item.itemId) {
          await tx.inventoryMovement.create({
            data: {
              offlineId: uuidv4(),
              businessId,
              itemId: item.itemId,
              storeId: sale.storeId!,
              type: InventoryMovementType.VOID,
              quantity: item.quantity,
              saleId: sale.id,
              source: 'POS',
            },
          });
        }
      }

      // Create void record
      const refundAmount = itemsToVoid.reduce((sum, i) => sum + i.totalCents, 0);
      await tx.voidRecord.create({
        data: {
          saleId: sale.id,
          type: isLineItemVoid ? 'LINE_ITEM_VOID' : 'FULL_VOID',
          authorizedBy: managerId,
          reason,
          voidedItemIds: itemsToVoid.map(i => i.id).join(','),
          refundAmountCents: refundAmount,
        },
      });

      // Update sale status
      const newStatus = isLineItemVoid ? SaleStatus.AMENDED : SaleStatus.VOIDED;
      await tx.sale.update({
        where: { id: saleId },
        data: { status: newStatus },
      });

      await this.audit.createEntry({
        businessId,
        actor: managerId,
        actorType: 'USER',
        action: isLineItemVoid ? 'SALE_LINE_ITEM_VOIDED' : 'SALE_VOIDED',
        entity: 'Sale',
        entityId: saleId,
        after: { status: newStatus, reason },
        source: 'POS',
      });

      return { success: true, refundAmountCents: refundAmount };
    });
  }

  async verifyManagerPin(pin: string, businessId: string) {
    return this.auth.verifyManagerPin(pin, businessId);
  }

  async returnSale(
    saleId: string,
    businessId: string,
    dto: { returnedItemIds?: string[]; reason: string; refundMethod: 'CASH' | 'STORE_CREDIT' },
  ) {
    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, businessId },
        include: { items: true, customer: true },
      });

      if (!sale || sale.status !== SaleStatus.PAID) {
        throw new BadRequestException('Can only return paid sales');
      }

      const isPartialReturn = dto.returnedItemIds && dto.returnedItemIds.length > 0;
      const itemsToReturn = isPartialReturn
        ? sale.items.filter(i => dto.returnedItemIds!.includes(i.id))
        : sale.items;

      const refundAmount = itemsToReturn.reduce((sum, i) => sum + i.totalCents, 0);

      // Reverse inventory
      for (const item of itemsToReturn) {
        if (item.itemId) {
          await tx.inventoryMovement.create({
            data: {
              offlineId: uuidv4(),
              businessId,
              itemId: item.itemId,
              storeId: sale.storeId!,
              type: InventoryMovementType.RETURN,
              quantity: item.quantity,
              saleId: sale.id,
              source: 'POS',
            },
          });
        }
      }

      // Handle refund
      if (dto.refundMethod === 'STORE_CREDIT' && sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { balanceCents: { increment: refundAmount } },
        });
      }

      // Update sale status
      await tx.sale.update({
        where: { id: saleId },
        data: { status: SaleStatus.CANCELLED },
      });

      await this.audit.createEntry({
        businessId,
        actor: sale.cashierId ?? 'system',
        actorType: 'USER',
        action: 'SALE_RETURNED',
        entity: 'Sale',
        entityId: saleId,
        after: { reason: dto.reason, refundAmount, refundMethod: dto.refundMethod },
        source: 'POS',
      });

      return {
        success: true,
        refundAmountCents: refundAmount,
        refundMethod: dto.refundMethod,
        storeCreditBalance: dto.refundMethod === 'STORE_CREDIT' && sale.customer
          ? sale.customer.balanceCents + refundAmount
          : undefined,
      };
    });
  }

  async findAll(opts: FindAllOptions) {
    const where: Record<string, unknown> = {
      businessId: opts.businessId,
      type: { not: SaleType.PROFORMA },
    };

    if (opts.storeId) where['storeId'] = opts.storeId;
    if (opts.status) where['status'] = opts.status;
    if (opts.startDate || opts.endDate) {
      where['createdAt'] = {
        ...(opts.startDate ? { gte: opts.startDate } : {}),
        ...(opts.endDate ? { lte: opts.endDate } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: { items: true, payments: true },
        orderBy: { createdAt: 'desc' },
        take: opts.limit,
        skip: opts.offset,
      }),
      this.prisma.sale.count({ where }),
    ]);

    return { data, total, limit: opts.limit, offset: opts.offset };
  }

  async getProformas(businessId: string) {
    return this.prisma.sale.findMany({
      where: { businessId, type: SaleType.PROFORMA, status: SaleStatus.PROFORMA },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createProforma(dto: CreateProformaDto) {
    const totalCents = dto.items.reduce(
      (sum, i) => sum + i.unitPriceCents * i.quantity,
      0,
    );

    return this.prisma.sale.create({
      data: {
        offlineId: uuidv4(),
        businessId: dto.businessId,
        receiptNumber: `PRO-${Date.now()}`,
        type: SaleType.PROFORMA,
        status: SaleStatus.PROFORMA,
        priceLevel: 'RETAIL',
        subtotalCents: totalCents,
        serviceChargeCents: 0,
        vatCents: 0,
        totCents: 0,
        totalCents,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        notes: dto.notes,
        proformaValidUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        items: {
          create: dto.items.map(i => ({
            name: i.name,
            quantity: i.quantity,
            unitPriceCents: i.unitPriceCents,
            totalCents: i.unitPriceCents * i.quantity,
          })),
        },
      },
      include: { items: true },
    });
  }

  async convertProformaToSale(proformaId: string, dto: ConvertProformaDto) {
    const proforma = await this.prisma.sale.findFirst({
      where: { id: proformaId, businessId: dto.businessId, type: SaleType.PROFORMA },
      include: { items: true },
    });

    if (!proforma) throw new NotFoundException('Proforma not found');
    if (proforma.status !== SaleStatus.PROFORMA) {
      throw new BadRequestException('Proforma already converted or voided');
    }

    const store = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
      include: { business: true },
    });

    if (!store || store.businessId !== dto.businessId) {
      throw new BadRequestException('Invalid store');
    }

    const receiptNumber = `${store.storeCode}-${new Date().getFullYear()}-${String(store.receiptSequence + 1).padStart(7, '0')}`;

    return this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.update({
        where: { id: proformaId },
        data: {
          storeId: dto.storeId,
          cashierId: dto.cashierId,
          type: SaleType.NORMAL,
          status: SaleStatus.PAID,
          receiptNumber,
          payments: {
            create: dto.payments.map(p => ({
              offlineId: uuidv4(),
              method: p.method,
              amountCents: p.amountCents,
            })),
          },
        },
        include: { items: true, payments: true },
      });

      await tx.store.update({
        where: { id: dto.storeId },
        data: { receiptSequence: { increment: 1 } },
      });

      await this.audit.createEntry({
        businessId: dto.businessId,
        actor: dto.cashierId,
        actorType: 'USER',
        action: 'PROFORMA_CONVERTED',
        entity: 'Sale',
        entityId: proformaId,
        after: { receiptNumber, totalCents: sale.totalCents },
        source: 'POS',
      });

      return sale;
    });
  }
}

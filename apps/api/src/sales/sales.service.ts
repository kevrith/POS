import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EtimsService } from '../etims/etims.service';
import { NotificationsService } from '../notifications/notifications.service';
import { EventsGateway } from '../events/events.gateway';
import { SaleType, SaleStatus, InventoryMovementType, calculateVAT, calculateTOT, calculateServiceCharge } from '@pos/shared';
import { v4 as uuidv4 } from 'uuid';

interface FindAllOptions {
  businessId: string;
  storeId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  etimsSubmitted?: boolean;
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
  discountCents?: number;
  promotionId?: string;
  /** When provided by the frontend (0 = disabled, >0 = enabled), use it directly.
   *  Falls back to business.serviceChargeRate only when omitted (old clients). */
  serviceChargeCents?: number;
  /** Hospitality order ID — if provided, mark it PAID and free its table after checkout */
  orderId?: string;
}

@Injectable()
export class SalesService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
    private audit: AuditService,
    private auth: AuthService,
    private webhooks: WebhooksService,
    private etims: EtimsService,
    private notifications: NotificationsService,
    private events: EventsGateway,
  ) {}

  async createSale(businessId: string, dto: CreateSaleDto) {
    // ── Pre-flight checks (outside transaction to avoid SQLite lock contention) ──
    const store = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
      include: { business: true },
    });

    if (!store || store.businessId !== businessId) {
      throw new BadRequestException('Invalid store');
    }

    const items = await this.prisma.item.findMany({
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

    // Honour the cashier's explicit choice (0 = disabled). Fall back to business setting for old clients.
    const serviceChargeCents = dto.serviceChargeCents !== undefined
      ? dto.serviceChargeCents
      : calculateServiceCharge(subtotalCents, store.business.serviceChargeRate);
    const discountCents = dto.discountCents ?? 0;
    const taxBase = subtotalCents - discountCents;
    // VAT/TOT are inclusive in item prices — extract for reporting only, do NOT add to total
    const vatCents = store.business.taxType === 'VAT' ? calculateVAT(taxBase) : 0;
    const totCents = store.business.taxType === 'TOT' ? calculateTOT(taxBase) : 0;
    const totalCents = taxBase + serviceChargeCents;

    // ── Write transaction (kept minimal: sale + sequence + stock movements) ──
    const sale = await this.prisma.$transaction(async (tx) => {
      // Atomically increment sequence first so concurrent requests can't share a number
      const updatedStore = await tx.store.update({
        where: { id: dto.storeId },
        data: { receiptSequence: { increment: 1 } },
      });
      const receiptNumber = `${updatedStore.storeCode}-${new Date().getFullYear()}-${String(updatedStore.receiptSequence).padStart(7, '0')}`;

      const createdSale = await tx.sale.create({
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
          discountCents,
          promotionId: dto.promotionId,
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
              saleId: createdSale.id,
              source: 'POS',
            },
          });
        }
      }

      return createdSale;
    }, { timeout: 15000 });

    // ── Close hospitality order + free table (if applicable) ──
    if (dto.orderId) {
      const order = await this.prisma.order.update({
        where: { id: dto.orderId },
        data: { status: 'PAID' },
      }).catch(() => null);
      if (order?.tableId) {
        await this.prisma.table.update({
          where: { id: order.tableId },
          data: { status: 'AVAILABLE' },
        }).catch(() => null);
      }
    }

    // ── Post-transaction: audit log + webhook dispatch ──
    await this.audit.createEntry({
      businessId,
      actor: dto.cashierId,
      actorType: 'USER',
      action: 'SALE_CREATED',
      entity: 'Sale',
      entityId: sale.id,
      after: { receiptNumber: sale.receiptNumber, totalCents },
      source: 'POS',
    });

    // Fire-and-forget webhook dispatch
    this.webhooks.dispatch(businessId, 'sale.completed', {
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      totalCents,
      status: sale.status,
      customerId: dto.customerId,
      storeId: dto.storeId,
      cashierId: dto.cashierId,
      items: saleItems.map(i => ({ itemId: i.itemId, name: i.name, quantity: i.quantity, totalCents: i.totalCents })),
    }).catch(() => {});

    // Check stock levels for low-stock notifications + webhook
    this.checkAndDispatchLowStock(businessId, dto.storeId, dto.items.map(i => i.itemId)).catch(() => {});

    // Send SMS receipt to customer if they have a phone number
    if (dto.customerId) {
      this.sendSmsReceipt(businessId, dto.customerId, sale.receiptNumber, totalCents).catch(() => {});
    }

    // Notify on credit sale overdue
    if (dto.type === SaleType.CREDIT && dto.customerId) {
      this.notifyCreditOverdue(businessId, dto.customerId).catch(() => {});
    }

    // Broadcast to all connected terminals (LAN sync)
    this.events.emitSaleCreated(businessId, {
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      totalCents: sale.totalCents,
      storeId: dto.storeId,
      itemIds: dto.items.map(i => i.itemId),
    });

    return sale;
  }

  private async checkAndDispatchLowStock(businessId: string, storeId: string, itemIds: string[]): Promise<void> {
    const itemList = await this.prisma.item.findMany({ where: { id: { in: itemIds }, trackStock: true } });
    for (const item of itemList) {
      const stock = await this.inventory.getStockLevel(item.id, storeId);
      const threshold = item.reorderLevel ?? 0;
      if (threshold > 0 && stock <= threshold) {
        await this.webhooks.dispatch(businessId, 'inventory.low_stock', {
          itemId: item.id,
          itemName: item.name,
          storeId,
          currentStock: stock,
          reorderLevel: threshold,
        });
        // In-app notification
        this.notifications.notifyLowStock(businessId, item.name, stock, item.id).catch(() => {});
      }
    }
  }

  private async sendSmsReceipt(businessId: string, customerId: string, receiptNumber: string, totalCents: number): Promise<void> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId }, select: { phone: true } });
    if (customer?.phone) {
      await this.notifications.sendReceiptSMS(businessId, customer.phone, receiptNumber, totalCents);
    }
  }

  private async notifyCreditOverdue(businessId: string, customerId: string): Promise<void> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (customer && customer.balanceCents > 0) {
      this.notifications.notifyCreditOverdue(
        businessId,
        customer.name,
        customer.balanceCents,
        customer.id,
      ).catch(() => {});
    }
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
    }).then(async (result) => {
      // Best-effort eTIMS void submission (non-blocking, outside transaction)
      this.etims.voidSale(saleId, reason).catch(() => {
        // eTIMS void failure is non-fatal — logged by eTIMS service
      });
      return result;
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
    if (opts.etimsSubmitted !== undefined) where['etimsSubmitted'] = opts.etimsSubmitted;
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

  async convertProformaToSaleV2(
    proformaId: string,
    dto: { cashierId: string; payments: { method: string; amountCents: number; reference?: string }[] },
  ) {
    // 1. Find the proforma (businessId/storeId come from the proforma itself)
    const proforma = await this.prisma.sale.findFirst({
      where: { id: proformaId, type: SaleType.PROFORMA },
      include: { items: true },
    });

    if (!proforma) throw new NotFoundException('Proforma not found');
    if (proforma.status === SaleStatus.CANCELLED) {
      throw new BadRequestException('Proforma already converted or cancelled');
    }
    if (proforma.status !== SaleStatus.PROFORMA) {
      throw new BadRequestException('Proforma is not in a convertible state');
    }
    if (proforma.proformaValidUntil && new Date() > proforma.proformaValidUntil) {
      throw new BadRequestException('Proforma has expired');
    }

    // 2. Resolve store for receipt sequence; proforma may have no storeId if created without one —
    //    if missing, the caller must supply it via the legacy endpoint.
    if (!proforma.storeId) {
      throw new BadRequestException('Proforma has no associated store — use the legacy convert endpoint and supply storeId');
    }

    const store = await this.prisma.store.findUnique({ where: { id: proforma.storeId } });
    if (!store) throw new NotFoundException('Store not found');

    const updatedStore = await this.prisma.store.update({
      where: { id: proforma.storeId },
      data: { receiptSequence: { increment: 1 } },
    });

    const receiptNumber = `${store.storeCode}-${String(updatedStore.receiptSequence).padStart(6, '0')}`;

    // 3. Create the new NORMAL sale and reverse inventory inside a transaction
    const sale = await this.prisma.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          offlineId: uuidv4(),
          businessId: proforma.businessId,
          storeId: proforma.storeId,
          receiptNumber,
          cashierId: dto.cashierId,
          customerId: proforma.customerId,
          customerName: proforma.customerName,
          customerPhone: proforma.customerPhone,
          type: SaleType.NORMAL,
          status: SaleStatus.PAID,
          priceLevel: proforma.priceLevel ?? 'RETAIL',
          subtotalCents: proforma.subtotalCents,
          vatCents: proforma.vatCents,
          totCents: proforma.totCents,
          totalCents: proforma.totalCents,
          serviceChargeCents: proforma.serviceChargeCents,
          discountCents: proforma.discountCents,
          promotionId: proforma.promotionId,
          items: {
            create: proforma.items.map(item => ({
              itemId: item.itemId,
              name: item.name,
              quantity: item.quantity,
              unitPriceCents: item.unitPriceCents,
              totalCents: item.totalCents,
            })),
          },
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

      // 4. Decrement inventory for stock-tracked items
      for (const item of proforma.items) {
        if (item.itemId) {
          const dbItem = await tx.item.findUnique({ where: { id: item.itemId } });
          if (dbItem?.trackStock && dbItem.type !== 'SERVICE') {
            await tx.inventoryMovement.create({
              data: {
                offlineId: uuidv4(),
                businessId: proforma.businessId,
                itemId: item.itemId,
                storeId: proforma.storeId,
                type: InventoryMovementType.SALE,
                quantity: -item.quantity,
                saleId: newSale.id,
                source: 'POS',
              },
            });
          }
        }
      }

      // 5. Mark original proforma as CANCELLED (signals "converted/no longer active")
      await tx.sale.update({
        where: { id: proformaId },
        data: { status: SaleStatus.CANCELLED },
      });

      return newSale;
    }, { timeout: 15000 });

    await this.audit.createEntry({
      businessId: proforma.businessId,
      actor: dto.cashierId,
      actorType: 'USER',
      action: 'PROFORMA_CONVERTED',
      entity: 'Sale',
      entityId: proformaId,
      after: { receiptNumber, totalCents: sale.totalCents, newSaleId: sale.id },
      source: 'POS',
    });

    return { id: sale.id, receiptNumber: sale.receiptNumber, totalCents: sale.totalCents };
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

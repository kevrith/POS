import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { AuditService } from '../audit/audit.service';
import { AuthService } from '../auth/auth.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { EtimsService } from '../etims/etims.service';
import { NotificationsService } from '../notifications/notifications.service';
import { PushService } from '../push/push.service';
import { EventsGateway } from '../events/events.gateway';
import { LoyaltyService } from '../loyalty/loyalty.service';
import { SubscriptionLimitsService } from '../subscription/subscription-limits.service';
import { LedgerService } from '../ledger/ledger.service';
import { SaleType, SaleStatus, InventoryMovementType, calculateVAT, calculateTOT, calculateServiceCharge, normalizeTier, SubscriptionTier } from '@pos/shared';
import { v4 as uuidv4 } from 'uuid';

interface FindAllOptions {
  businessId: string;
  storeId?: string;
  startDate?: Date;
  endDate?: Date;
  status?: string;
  etimsSubmitted?: boolean;
  receiptNumber?: string;
  /** Restrict to one cashier's own sales (mobile scopes non-managers to self). */
  cashierId?: string;
  limit: number;
  offset: number;
}

interface CreateProformaDto {
  businessId: string;
  storeId?: string;
  customerName: string;
  customerPhone?: string;
  priceLevel?: string;
  items: Array<{ name: string; quantity: number; unitPriceCents: number; discountPercent?: number }>;
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
  tipCents?: number;
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
    private push: PushService,
    private events: EventsGateway,
    private loyalty: LoyaltyService,
    private subscriptionLimits: SubscriptionLimitsService,
    private ledger: LedgerService,
  ) {}

  async createSale(businessId: string, dto: CreateSaleDto) {
    // ── Check transaction limit (FREE tier only) ──
    const txLimitCheck = await this.subscriptionLimits.checkMonthlyTransactionLimit(businessId);
    if (!txLimitCheck.allowed) {
      throw new BadRequestException(txLimitCheck.message);
    }

    // ── Pre-flight checks (outside transaction to avoid SQLite lock contention) ──
    const store = await this.prisma.store.findUnique({
      where: { id: dto.storeId },
      include: { business: true },
    });

    if (!store || store.businessId !== businessId) {
      throw new BadRequestException('Invalid store');
    }

    // FREE tier: count transactions this calendar month
    let monthlyTxCount: number | null = null;
    const FREE_TX_LIMIT = 200;
    // Gate on the tier ALONE. This used to also fire when planName was 'Free',
    // and planName is a display label that drifts from the tier — an account
    // gifted ENTERPRISE keeps the label it had. The OR meant a paying Enterprise
    // business got the free-tier transaction counter and the upgrade prompt that
    // comes with it, at 200 sales a month.
    if (normalizeTier(store.business.subscriptionTier) === SubscriptionTier.FREE) {
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 1);
      const existingCount = await this.prisma.sale.count({
        where: {
          businessId,
          createdAt: { gte: monthStart, lt: monthEnd },
          status: { not: 'VOIDED' },
        },
      });
      // This sale will push the count to existingCount + 1
      monthlyTxCount = existingCount + 1;
      // At limit: allow the current sale to complete but signal the frontend to show upgrade modal
      // (sale already in progress — hard blocking mid-transaction is bad UX)
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

    // ── Credit limit check ──────────────────────────────────────────────────
    if (dto.type === SaleType.CREDIT && dto.customerId) {
      const customer = await this.prisma.customer.findUnique({ where: { id: dto.customerId } });
      if (customer && customer.creditLimitCents > 0) {
        const outstanding = Math.max(0, -customer.balanceCents);
        if (outstanding + subtotalCents > customer.creditLimitCents) {
          throw new BadRequestException(
            `Credit limit exceeded. Limit: KES ${(customer.creditLimitCents / 100).toFixed(2)}, ` +
            `Outstanding: KES ${(outstanding / 100).toFixed(2)}, ` +
            `This sale: KES ${(subtotalCents / 100).toFixed(2)}. ` +
            `Available credit: KES ${(Math.max(0, customer.creditLimitCents - outstanding) / 100).toFixed(2)}.`
          );
        }
      }
    }

    // Honour the cashier's explicit choice (0 = disabled). When the client omits
    // it, only apply service charge if the business has it ON by default — so a
    // client that doesn't send the value (e.g. mobile POS) still respects the
    // Settings toggle instead of always getting charged.
    const serviceChargeCents = dto.serviceChargeCents !== undefined
      ? dto.serviceChargeCents
      : store.business.serviceChargeDefault
        ? calculateServiceCharge(subtotalCents, store.business.serviceChargeRate)
        : 0;
    const discountCents = dto.discountCents ?? 0;
    const tipCents = dto.tipCents ?? 0;
    const taxBase = subtotalCents - discountCents;
    // VAT/TOT are inclusive in item prices — extract for reporting only, do NOT add to total
    const vatCents = store.business.taxType === 'VAT' ? calculateVAT(taxBase) : 0;
    const totCents = store.business.taxType === 'TOT' ? calculateTOT(taxBase, store.business.totRate ?? 3) : 0;
    const totalCents = taxBase + serviceChargeCents + tipCents;

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
          tipCents,
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

      // Debit customer balance on credit sale
      if (dto.type === SaleType.CREDIT && dto.customerId) {
        await tx.customer.update({
          where: { id: dto.customerId },
          data: { balanceCents: { decrement: totalCents } },
        });
      }

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

    // Post the double-entry so the trial balance and P&L reflect trading activity.
    // Fire-and-forget: a bookkeeping failure must never fail a sale at the till.
    this.postSaleToLedger({
      businessId,
      storeId: dto.storeId,
      receiptNumber: sale.receiptNumber,
      isCredit: dto.type === SaleType.CREDIT,
      totalCents,
      vatCents,
      totCents,
      serviceChargeCents,
      tipCents,
      payments: dto.payments,
    }).catch(() => {});

    // Send SMS receipt to customer if they have a phone number
    if (dto.customerId) {
      this.sendSmsReceipt(businessId, dto.customerId, sale.receiptNumber, totalCents).catch(() => {});
    }

    // Award loyalty points only on paid sales — not on credit (points earned when debt is settled)
    let pointsEarned = 0;
    let loyaltyBalance = 0;
    if (dto.customerId && dto.type !== SaleType.CREDIT) {
      const loyalty = await this.loyalty.earnPoints(dto.customerId, totalCents, sale.id).catch(() => ({ points: 0, balance: 0 }));
      pointsEarned = loyalty.points;
      loyaltyBalance = loyalty.balance;
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

    return { ...sale, pointsEarned, loyaltyBalance, monthlyTxCount, freeTxLimit: monthlyTxCount !== null ? FREE_TX_LIMIT : null };
  }

  /**
   * Kenyan retail chart-of-accounts posting for one sale.
   *
   *   Dr  Cash / M-Pesa / Bank / Accounts Receivable   (what was tendered)
   *     Cr  Sales Revenue                              (net of tax & service charge)
   *     Cr  VAT / Turnover Tax Payable                 (tax extracted from the inclusive price)
   *     Cr  Service Charge Income, Tips Payable        (when charged)
   */
  private async postSaleToLedger(input: {
    businessId: string;
    storeId: string;
    receiptNumber: string;
    isCredit: boolean;
    totalCents: number;
    vatCents: number;
    totCents: number;
    serviceChargeCents: number;
    tipCents: number;
    payments: Array<{ method: string; amountCents: number }>;
  }): Promise<void> {
    const lines: Array<{
      accountCode: string;
      accountName: string;
      debitCents: number;
      creditCents: number;
    }> = [];

    const debit = (accountCode: string, accountName: string, amount: number) => {
      if (amount > 0) lines.push({ accountCode, accountName, debitCents: amount, creditCents: 0 });
    };
    const credit = (accountCode: string, accountName: string, amount: number) => {
      if (amount > 0) lines.push({ accountCode, accountName, debitCents: 0, creditCents: amount });
    };

    if (input.isCredit) {
      debit('1200', 'Accounts Receivable', input.totalCents);
    } else {
      const tendered = new Map<string, number>();
      for (const p of input.payments) {
        tendered.set(p.method, (tendered.get(p.method) ?? 0) + p.amountCents);
      }
      // Over-tender is change handed back, so never debit more than the sale total.
      const totalTendered = [...tendered.values()].reduce((s, v) => s + v, 0);
      const scale = totalTendered > input.totalCents && totalTendered > 0
        ? input.totalCents / totalTendered
        : 1;

      for (const [method, amount] of tendered) {
        const value = Math.round(amount * scale);
        if (method === 'CASH') debit('1000', 'Cash on Hand', value);
        else if (method.startsWith('MPESA')) debit('1010', 'M-Pesa Control', value);
        else if (method === 'CARD') debit('1020', 'Card Settlement', value);
        else debit('1030', 'Bank / Other Receipts', value);
      }
    }

    credit('2100', 'VAT Payable', input.vatCents);
    credit('2110', 'Turnover Tax Payable', input.totCents);
    credit('4100', 'Service Charge Income', input.serviceChargeCents);
    credit('2200', 'Tips Payable', input.tipCents);

    const revenue =
      input.totalCents -
      input.vatCents -
      input.totCents -
      input.serviceChargeCents -
      input.tipCents;
    credit('4000', 'Sales Revenue', revenue);

    const debits = lines.reduce((s, l) => s + l.debitCents, 0);
    const credits = lines.reduce((s, l) => s + l.creditCents, 0);
    // Rounding from tax extraction can leave a cent; park it so the entry balances.
    if (debits !== credits) {
      const diff = debits - credits;
      if (diff > 0) credit('4900', 'Rounding Difference', diff);
      else debit('4900', 'Rounding Difference', -diff);
    }

    if (lines.length === 0) return;

    await this.ledger.autoPost({
      businessId: input.businessId,
      storeId: input.storeId,
      description: `Sale ${input.receiptNumber}`,
      reference: input.receiptNumber,
      sourceType: 'SALE',
      lines,
    });
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
        // Push the people who can act on it (Manage → Stock in the mobile app).
        this.push.sendToBusinessRoles(businessId, ['OWNER', 'MANAGER', 'ADMIN'], {
          title: 'Low stock',
          body: `${item.name} is low (${stock} left).`,
          data: { type: 'low_stock', id: item.id },
        }).catch(() => {});
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
      this.push.sendToBusinessRoles(businessId, ['OWNER', 'MANAGER', 'ADMIN'], {
        title: 'Customer credit due',
        body: `${customer.name} owes ${(customer.balanceCents / 100).toLocaleString('en-KE', { style: 'currency', currency: 'KES' })}.`,
        data: { type: 'credit', id: customer.id },
      }).catch(() => {});
    }
  }

  async getSale(id: string, businessId: string) {
    return this.prisma.sale.findFirst({
      where: { id, businessId },
      include: { items: true, payments: true, customer: true, cashier: true, voidRecords: true },
    });
  }

  async getVoidedAndReturns(businessId: string, storeId?: string, startDate?: Date, endDate?: Date) {
    const where: Record<string, unknown> = {
      businessId,
      status: { in: ['VOIDED', 'CANCELLED', 'AMENDED'] },
    };
    if (storeId) where['storeId'] = storeId;
    if (startDate || endDate) {
      where['createdAt'] = {
        ...(startDate ? { gte: startDate } : {}),
        ...(endDate ? { lte: endDate } : {}),
      };
    }
    return this.prisma.sale.findMany({
      where,
      include: { items: true, payments: true, customer: true, cashier: true, voidRecords: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
  }

  async voidSale(
    saleId: string,
    businessId: string,
    managerId: string,
    reason: string,
    voidedItemIds?: string[],
    voidedItemQuantities?: Array<{ itemId: string; quantity: number }>,
  ) {
    const result = await this.prisma.$transaction(async (tx) => {
      const sale = await tx.sale.findFirst({
        where: { id: saleId, businessId },
        include: { items: true },
      });

      if (!sale || sale.status !== SaleStatus.PAID) {
        throw new BadRequestException('Can only void paid sales');
      }

      const hasQuantityVoid = voidedItemQuantities && voidedItemQuantities.length > 0;
      const isLineItemVoid = hasQuantityVoid || (voidedItemIds && voidedItemIds.length > 0);
      const itemsToVoid = isLineItemVoid
        ? sale.items.filter(i => voidedItemIds?.includes(i.id) || voidedItemQuantities?.some(v => v.itemId === i.id))
        : sale.items;

      let refundAmount = 0;

      // Reverse inventory (using explicit quantities if provided)
      for (const item of itemsToVoid) {
        const qtyOverride = hasQuantityVoid
          ? (voidedItemQuantities!.find(v => v.itemId === item.id)?.quantity ?? item.quantity)
          : item.quantity;
        const clampedQty = Math.min(qtyOverride, item.quantity);

        if (item.itemId) {
          await tx.inventoryMovement.create({
            data: {
              offlineId: uuidv4(),
              businessId,
              itemId: item.itemId,
              storeId: sale.storeId!,
              type: InventoryMovementType.VOID,
              quantity: clampedQty,
              saleId: sale.id,
              source: 'POS',
            },
          });
        }

        const itemRefund = Math.round(item.unitPriceCents * clampedQty);
        refundAmount += itemRefund;

        // If partial quantity void: reduce item quantity on the sale
        if (hasQuantityVoid && clampedQty < item.quantity) {
          await tx.saleItem.update({
            where: { id: item.id },
            data: {
              quantity: item.quantity - clampedQty,
              totalCents: item.unitPriceCents * (item.quantity - clampedQty),
            },
          });
        }
      }

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

      return { success: true, refundAmountCents: refundAmount, newStatus, isLineItemVoid };
    }, { timeout: 15000 });

    // Audit log after transaction commits
    await this.audit.createEntry({
      businessId,
      actor: managerId,
      actorType: 'USER',
      action: result.isLineItemVoid ? 'SALE_LINE_ITEM_VOIDED' : 'SALE_VOIDED',
      entity: 'Sale',
      entityId: saleId,
      after: { status: result.newStatus, reason },
      source: 'POS',
    });

    // Best-effort eTIMS void submission (non-blocking)
    this.etims.voidSale(saleId, reason).catch(() => {});

    return { success: result.success, refundAmountCents: result.refundAmountCents };
  }

  async verifyManagerPin(pin: string, businessId: string) {
    return this.auth.verifyManagerPin(pin, businessId);
  }

  async returnSale(
    saleId: string,
    businessId: string,
    dto: { returnedItemIds?: string[]; reason: string; refundMethod: 'CASH' | 'STORE_CREDIT'; processedBy?: string },
  ) {
    let returnId: string | null = null;

    const result = await this.prisma.$transaction(async (tx) => {
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

      // Create Return record for audit trail and eTIMS credit note tracking
      const returnRecord = await tx.return.create({
        data: {
          offlineId: uuidv4(),
          businessId,
          saleId,
          refundAmountCents: refundAmount,
          refundMethod: dto.refundMethod,
          reason: dto.reason,
          returnedItemIds: JSON.stringify(dto.returnedItemIds ?? []),
          processedBy: dto.processedBy ?? sale.cashierId ?? 'system',
        },
      });
      returnId = returnRecord.id;

      await this.audit.createEntry({
        businessId,
        actor: sale.cashierId ?? 'system',
        actorType: 'USER',
        action: 'SALE_RETURNED',
        entity: 'Sale',
        entityId: saleId,
        after: { reason: dto.reason, refundAmount, refundMethod: dto.refundMethod, returnId: returnRecord.id },
        source: 'POS',
      });

      return {
        success: true,
        returnId: returnRecord.id,
        refundAmountCents: refundAmount,
        refundMethod: dto.refundMethod,
        storeCreditBalance: dto.refundMethod === 'STORE_CREDIT' && sale.customer
          ? sale.customer.balanceCents + refundAmount
          : undefined,
      };
    }, { timeout: 15000 });

    // Submit eTIMS credit note non-blocking, after transaction commits
    if (returnId) {
      this.etims.submitCreditNote(returnId).catch(() => {
        // Non-fatal — the Return record tracks submission status for retry
      });
    }

    return result;
  }

  async findAll(opts: FindAllOptions) {
    const where: Record<string, unknown> = {
      businessId: opts.businessId,
      type: { not: SaleType.PROFORMA },
    };

    if (opts.storeId) where['storeId'] = opts.storeId;
    if (opts.cashierId) where['cashierId'] = opts.cashierId;
    if (opts.status) where['status'] = opts.status;
    if (opts.etimsSubmitted !== undefined) where['etimsSubmitted'] = opts.etimsSubmitted;
    if (opts.receiptNumber) {
      where['receiptNumber'] = {
        contains: opts.receiptNumber,
        mode: 'insensitive',
      };
    }
    if (opts.startDate || opts.endDate) {
      where['createdAt'] = {
        ...(opts.startDate ? { gte: opts.startDate } : {}),
        ...(opts.endDate ? { lte: opts.endDate } : {}),
      };
    }

    const [data, total] = await this.prisma.$transaction([
      this.prisma.sale.findMany({
        where,
        include: { items: true, payments: true, customer: true, cashier: true },
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
    const subtotalCents = dto.items.reduce((sum, i) => {
      const disc = i.discountPercent ? i.discountPercent / 100 : 0;
      return sum + Math.round(i.unitPriceCents * i.quantity * (1 - disc));
    }, 0);

    return this.prisma.sale.create({
      data: {
        offlineId: uuidv4(),
        businessId: dto.businessId,
        storeId: dto.storeId,
        receiptNumber: `PRO-${Date.now()}`,
        type: SaleType.PROFORMA,
        status: SaleStatus.PROFORMA,
        priceLevel: (dto.priceLevel as any) ?? 'RETAIL',
        subtotalCents,
        serviceChargeCents: 0,
        vatCents: 0,
        totCents: 0,
        totalCents: subtotalCents,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        notes: dto.notes,
        proformaValidUntil: dto.validUntil ? new Date(dto.validUntil) : undefined,
        items: {
          create: dto.items.map(i => {
            const disc = i.discountPercent ? i.discountPercent / 100 : 0;
            const lineCents = Math.round(i.unitPriceCents * i.quantity * (1 - disc));
            return {
              name: i.name,
              quantity: i.quantity,
              unitPriceCents: i.unitPriceCents,
              totalCents: lineCents,
            };
          }),
        },
      },
      include: { items: true },
    });
  }

  /** Void a quotation that was never converted. Only PROFORMA-status records may be cancelled. */
  async cancelProforma(proformaId: string, businessId: string, actorId?: string) {
    const proforma = await this.prisma.sale.findFirst({
      where: { id: proformaId, businessId, type: SaleType.PROFORMA },
    });
    if (!proforma) throw new NotFoundException('Proforma not found');
    if (proforma.status !== SaleStatus.PROFORMA) {
      throw new BadRequestException('Only an active proforma can be cancelled');
    }

    const updated = await this.prisma.sale.update({
      where: { id: proformaId },
      data: { status: SaleStatus.CANCELLED },
    });

    // A field order that produced this invoice must not stay stuck in INVOICED.
    if (proforma.receiptNumber) {
      await this.prisma.fieldOrder.updateMany({
        where: { businessId, invoiceNumber: proforma.receiptNumber },
        data: { status: 'DELIVERED', invoiceNumber: null, invoicedAt: null },
      });
    }

    await this.audit.createEntry({
      businessId,
      actor: actorId ?? 'system',
      actorType: 'USER',
      action: 'PROFORMA_CANCELLED',
      entity: 'Sale',
      entityId: proformaId,
      before: { status: proforma.status },
      after: { status: SaleStatus.CANCELLED },
      source: 'POS',
    });

    return updated;
  }

  async convertProformaToSaleV2(
    proformaId: string,
    dto: { cashierId: string; storeId?: string; payments: { method: string; amountCents: number; reference?: string }[] },
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

    // 2. Resolve store for the receipt sequence. Proformas created outside the POS
    //    (e.g. from a field order) carry no storeId — fall back to the caller's store,
    //    then to the business's first store, rather than dead-ending the conversion.
    const storeId =
      proforma.storeId ??
      dto.storeId ??
      (
        await this.prisma.store.findFirst({
          where: { businessId: proforma.businessId },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        })
      )?.id;

    if (!storeId) {
      throw new BadRequestException('No store found for this business — create a store before converting proformas');
    }

    const store = await this.prisma.store.findUnique({ where: { id: storeId } });
    if (!store || store.businessId !== proforma.businessId) {
      throw new NotFoundException('Store not found');
    }

    const updatedStore = await this.prisma.store.update({
      where: { id: storeId },
      data: { receiptSequence: { increment: 1 } },
    });

    const receiptNumber = `${store.storeCode}-${String(updatedStore.receiptSequence).padStart(6, '0')}`;

    // 3. Create the new NORMAL sale and reverse inventory inside a transaction
    const sale = await this.prisma.$transaction(async (tx) => {
      const newSale = await tx.sale.create({
        data: {
          offlineId: uuidv4(),
          businessId: proforma.businessId,
          storeId,
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
                storeId,
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

  async markCreditPaid(saleId: string, businessId: string, amountCents?: number) {
    const sale = await this.prisma.sale.findFirst({
      where: { id: saleId, businessId },
    });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.status !== SaleStatus.CREDIT) throw new BadRequestException('Sale is not a credit sale');

    const paidAmount = amountCents ?? sale.totalCents;

    await this.prisma.$transaction(async (tx) => {
      await tx.sale.update({
        where: { id: saleId },
        data: { status: SaleStatus.PAID },
      });
      // Reverse the balance deduction
      if (sale.customerId) {
        await tx.customer.update({
          where: { id: sale.customerId },
          data: { balanceCents: { increment: paidAmount } },
        });
      }
      await tx.payment.create({
        data: {
          offlineId: require('uuid').v4(),
          saleId,
          method: 'CASH',
          amountCents: paidAmount,
          reference: 'Credit settlement',
        },
      });
    });

    // Award loyalty points now that debt is settled
    if (sale.customerId) {
      await this.loyalty.earnPoints(sale.customerId, paidAmount, saleId).catch(() => {});
    }

    return { success: true };
  }
}

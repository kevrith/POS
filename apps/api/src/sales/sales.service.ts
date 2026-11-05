import { Injectable, BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
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
import { SaleType, SaleStatus, InventoryMovementType, calculateTOT, calculateServiceCharge, normalizeTier, SubscriptionTier, computeTaxes, taxClassOf, type TaxClass } from '@pos/shared';
import { v4 as uuidv4 } from 'uuid';
import { hasTooManyDecimals, roundQty } from '../common/quantity';
import { intInRange, oneOf } from '../common/validate';
import { postSaleJournal, postSettlementJournal, reverseJournalLines, type SaleJournalInput } from './sale-ledger';
import { drawStock, restoreStock } from '../batch/batch-allocation';
import { ROOM_CHARGE_FOLIO_TYPE } from '../common/folio';

/** How a customer may settle a credit sale. */
const CREDIT_SETTLEMENT_METHODS = ['CASH', 'MPESA', 'CARD', 'BANK'] as const;

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
  /**
   * Idempotency key from a client that may retry (offline queues, flaky networks). A sale already recorded
   * with this key is returned instead of being created a second time.
   */
  offlineId?: string;
  storeId: string;
  cashierId: string;
  customerId?: string;
  type: SaleType;
  priceLevel: 'RETAIL' | 'WHOLESALE' | 'VIP';
  items: Array<{ itemId: string; quantity: number }>;
  payments: Array<{ method: string; amountCents: number; reference?: string; roomNumber?: string }>;
  discountCents?: number;
  promotionId?: string;
  /** When provided by the frontend (0 = disabled, >0 = enabled), use it directly.
   *  Falls back to business.serviceChargeRate only when omitted (old clients). */
  serviceChargeCents?: number;
  tipCents?: number;
  /** Hospitality order ID. The sale is built from the order and the order is closed with it. */
  orderId?: string;
  /**
   * With `orderId`: the total the client showed the payer. If the bill has moved on since
   * (a line added or voided on another screen) the checkout is refused so nobody pays an
   * amount they were not shown. Optional, so tills that don't send it behave as before.
   */
  expectedTotalCents?: number;
}

/** "Pilau" or "Pilau (Extra cheese, No onion)": the modifiers travel with the line they priced. */
function orderLineName(name: string, modifiers: string | null): string {
  if (!modifiers) return name;
  try {
    const list = JSON.parse(modifiers) as Array<string | { name?: string }>;
    const names = (Array.isArray(list) ? list : []).map((m) => (typeof m === 'string' ? m : m?.name ?? '')).filter(Boolean);
    return names.length > 0 ? `${name} (${names.join(', ')})` : name;
  } catch {
    return name;
  }
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

  /**
   * Who a checkout is credited to. Normally the person making the request. A sale rung up offline by one cashier is
   * uploaded later by whoever signs in next; an owner or manager may upload it ON BEHALF of that cashier, so shift
   * and cash-drawer reports stay right. Anyone else cannot choose, and the target must belong to the same business.
   */
  async resolveCashierId(businessId: string, requester: { id: string; role?: string }, onBehalfOf?: string): Promise<string> {
    if (!onBehalfOf || onBehalfOf === requester.id) return requester.id;
    if (requester.role !== 'OWNER' && requester.role !== 'MANAGER') return requester.id;
    const cashier = await this.prisma.user.findFirst({ where: { id: onBehalfOf, businessId }, select: { id: true } });
    return cashier?.id ?? requester.id;
  }

  /** Keys from clients are stored as the sale's unique offlineId, so keep them to a safe shape and size. */
  private cleanOfflineId(value: unknown): string | undefined {
    return typeof value === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(value) ? value : undefined;
  }

  /** The response a client gets for a sale that was already recorded: same sale, no second side effects. */
  private async replayExistingSale(businessId: string, offlineId: string) {
    const existing = await this.prisma.sale.findFirst({ where: { offlineId, businessId }, include: { items: true, payments: true } });
    if (!existing) return null;

    // The receipt of a replayed sale must show the points it really earned, as the original response did.
    let pointsEarned = 0;
    let loyaltyBalance = 0;
    if (existing.customerId && existing.type !== SaleType.CREDIT) {
      try {
        const loyalty = await this.loyalty.pointsAwardedForSale(existing.customerId, existing.id);
        pointsEarned = loyalty.points;
        loyaltyBalance = loyalty.balance;
      } catch {
        /* loyalty is decoration on the receipt; never fail a replay over it */
      }
    }
    return { ...existing, pointsEarned, loyaltyBalance, monthlyTxCount: null, freeTxLimit: null, replayed: true };
  }

  /**
   * Records a sale ONCE per offlineId. A till that lost the response to a successful checkout queues the sale
   * and sends it again; without this the retry created a second sale (double revenue, double stock deduction).
   */
  async createSale(businessId: string, dto: CreateSaleDto) {
    const offlineId = this.cleanOfflineId(dto?.offlineId);
    if (!offlineId) return this.createSaleOnce(businessId, { ...dto, offlineId: undefined });

    const already = await this.replayExistingSale(businessId, offlineId);
    if (already) return already;
    try {
      return await this.createSaleOnce(businessId, { ...dto, offlineId });
    } catch (e) {
      // Two copies of the same request racing: the loser hits the unique offlineId and gets the winner's sale.
      if ((e as { code?: string })?.code === 'P2002') {
        const raced = await this.replayExistingSale(businessId, offlineId);
        if (raced) return raced;
      }
      throw e;
    }
  }

  private async createSaleOnce(businessId: string, dto: CreateSaleDto) {
    // An order's sale is built from the order itself, so the cart may be empty then.
    if (!dto?.orderId && (!Array.isArray(dto?.items) || dto.items.length === 0)) {
      throw new BadRequestException('A sale needs at least one item');
    }
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

    // ── Paying an order: the order IS the bill ────────────────────────────────
    // When a checkout names an order, the sale is built from the order's own
    // lines at the prices they were taken at, modifiers included, and the cart
    // the client sent is ignored. The sale used to be built from the client's
    // `{ itemId, quantity }` list re-priced at retail, so a priced modifier never
    // reached the sale, and nothing tied what was sold to what was served.
    const order = dto.orderId
      ? await this.prisma.order.findFirst({ where: { id: dto.orderId, businessId }, include: { items: true } })
      : null;
    if (dto.orderId) {
      if (!order) throw new BadRequestException('Order not found');
      if (!['OPEN', 'BILL_REQUESTED'].includes(order.status)) {
        throw new BadRequestException('This order has already been paid or cancelled');
      }
      if (order.storeId !== dto.storeId) throw new BadRequestException('This order belongs to a different store');
      if (order.items.length === 0) throw new BadRequestException('This order has nothing on it');
    }

    interface CartLine { itemId: string; quantity: number; name?: string; totalCents?: number }
    const cart: CartLine[] = order
      ? order.items.map((l) => ({
          itemId: l.itemId,
          quantity: l.quantity,
          name: orderLineName(l.name, l.modifiers),
          totalCents: l.totalCents,
        }))
      : dto.items;

    // The business's own menu only: with the id alone, a sale could be rung up
    // against another business's item and read its name and price.
    const items = await this.prisma.item.findMany({
      where: { id: { in: cart.map(i => i.itemId) }, businessId },
    });

    let subtotalCents = 0;
    const saleItems = [];
    // Each line's tax class, parallel to saleItems. The class is the item's at the moment of the sale.
    const lineClasses: TaxClass[] = [];

    for (const cartItem of cart) {
      const item = items.find(i => i.id === cartItem.itemId);
      if (!item) throw new BadRequestException(`Item not found`);
      // Weighed and fractional items sell by decimals, so a quantity need not be
      // whole, but it must be a real positive number: a negative one is a refund
      // that skips the refund rules, and it lowers the total.
      if (!Number.isFinite(cartItem.quantity) || cartItem.quantity <= 0) {
        throw new BadRequestException(`Quantity of ${item.name} must be greater than zero`);
      }
      if (hasTooManyDecimals(cartItem.quantity)) {
        throw new BadRequestException(`Quantity of ${item.name} can have at most 3 decimal places`);
      }

      const priceKey = `${dto.priceLevel.toLowerCase()}PriceCents` as keyof typeof item;
      const unitPrice = (item[priceKey] as number) ?? item.retailPriceCents;
      // An order line carries its own total (price plus modifiers, times quantity).
      const totalCents = cartItem.totalCents ?? unitPrice * cartItem.quantity;

      subtotalCents += totalCents;
      saleItems.push({
        itemId: item.id,
        name: cartItem.name ?? item.name,
        quantity: cartItem.quantity,
        unitPriceCents: cartItem.totalCents !== undefined ? Math.round(cartItem.totalCents / cartItem.quantity) : unitPrice,
        totalCents,
      });
      lineClasses.push(taxClassOf(item));

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
    // Money adjustments are whole, non-negative amounts, and a discount can't
    // exceed what was sold. A negative discount raised the taxable base; a
    // discount past the subtotal drove the sale below zero.
    for (const [label, value] of [['Discount', discountCents], ['Tip', tipCents], ['Service charge', serviceChargeCents]] as const) {
      if (!Number.isInteger(value) || value < 0) throw new BadRequestException(`${label} must be zero or a positive whole amount`);
    }
    if (discountCents > subtotalCents) throw new BadRequestException('The discount is larger than the sale');
    const taxBase = subtotalCents - discountCents;
    // VAT/TOT are inclusive in item prices — extract for reporting only, do NOT add to total.
    // VAT is worked out line by line from each item's tax class: exempt, zero-rated and non-VAT lines carry
    // none, and the discount is shared across the lines. It used to be 16/116 of the whole sale, so flour and
    // exempt medicines were charged VAT on the books and on the eTIMS invoice.
    const taxes = computeTaxes(
      saleItems.map((l, i) => ({ totalCents: l.totalCents, taxClass: lineClasses[i] })),
      discountCents,
      { vatRegistered: store.business.taxType === 'VAT' },
    );
    const vatCents = taxes.vatCents;
    const totCents = store.business.taxType === 'TOT' ? calculateTOT(taxBase, store.business.totRate ?? 3) : 0;
    const totalCents = taxBase + serviceChargeCents + tipCents;

    if (order && dto.expectedTotalCents !== undefined && dto.expectedTotalCents !== totalCents) {
      throw new ConflictException(
        `The bill changed while you were paying: it is now ${totalCents} cents, not ${dto.expectedTotalCents}. Open the order again to check it.`,
      );
    }

    // A normal sale is paid for when it is rung up: what was tendered must cover
    // the total. Checkout used to store whatever payments it was handed, so a
    // KES 1 payment closed a KES 1,000 bill. (Credit and layaway sales are
    // deliberately short of cash and are not held to this.)
    if (dto.type === SaleType.NORMAL) {
      const payments = Array.isArray(dto.payments) ? dto.payments : [];
      for (const p of payments) {
        if (!Number.isInteger(p?.amountCents) || p.amountCents < 0) {
          throw new BadRequestException('Every payment must be a whole, non-negative amount');
        }
      }
      const tendered = payments.reduce((sum, p) => sum + p.amountCents, 0);
      if (tendered < totalCents) {
        throw new BadRequestException(`Payments (${tendered}) do not cover the total (${totalCents})`);
      }
    }

    // ── Write transaction (kept minimal: sale + sequence + stock movements) ──
    const sale = await this.prisma.$transaction(async (tx) => {
      // Close the order in the same transaction as the sale. It used to be closed
      // afterwards with any failure swallowed, so a sale could commit while its
      // order stayed open and be paid a second time. Claiming it here means two
      // tills paying one order cannot both win, and a failure rolls everything back.
      if (order) {
        const claimed = await tx.order.updateMany({
          where: { id: order.id, businessId, status: { in: ['OPEN', 'BILL_REQUESTED'] } },
          data: { status: 'PAID' },
        });
        if (claimed.count !== 1) throw new ConflictException('This order was just paid on another till');
      }

      // Atomically increment sequence first so concurrent requests can't share a number
      const updatedStore = await tx.store.update({
        where: { id: dto.storeId },
        data: { receiptSequence: { increment: 1 } },
      });
      const receiptNumber = `${updatedStore.storeCode}-${new Date().getFullYear()}-${String(updatedStore.receiptSequence).padStart(7, '0')}`;

      const createdSale = await tx.sale.create({
        data: {
          offlineId: dto.offlineId ?? uuidv4(),
          businessId,
          storeId: dto.storeId,
          receiptNumber,
          orderId: order?.id,
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
          taxClassified: true,
          items: {
            create: saleItems.map((l, i) => ({
              ...l,
              taxClass: taxes.lines[i].taxClass,
              vatCents: taxes.lines[i].vatCents,
              discountCents: taxes.lines[i].discountCents,
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

      // Debit customer balance on credit sale
      if (dto.type === SaleType.CREDIT && dto.customerId) {
        await tx.customer.update({
          where: { id: dto.customerId },
          data: { balanceCents: { decrement: totalCents } },
        });
      }

      for (const cartItem of cart) {
        const item = items.find(i => i.id === cartItem.itemId);
        if (item?.trackStock) {
          // First-expiry-first-out from the item's batches when it has them; one plain movement otherwise.
          await drawStock(tx, {
            businessId,
            storeId: dto.storeId,
            itemId: cartItem.itemId,
            itemName: item.name,
            quantity: cartItem.quantity,
            saleId: createdSale.id,
            trackBatches: !!item.trackBatches,
          });
        }
      }

      await this.chargeToRoom(tx, businessId, dto.cashierId, createdSale, dto.payments);

      return createdSale;
    }, { timeout: 15000 });

    // ── Free the table (the order itself was closed inside the transaction) ──
    if (order?.tableId) {
      await this.prisma.table.update({
        where: { id: order.tableId },
        data: { status: 'AVAILABLE' },
      }).catch(() => null);
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
   * A sale paid by ROOM_CHARGE lands on the folio of the guest in that room, to be settled at check-out. It used to
   * be recorded as a payment only, so the guest was never billed for it. The room is named by number; it must hold a
   * checked-in guest, and the whole sale goes to that one room. Inside the sale's transaction: no room, no sale.
   */
  private async chargeToRoom(
    tx: any,
    businessId: string,
    cashierId: string,
    sale: { id: string; receiptNumber: string; storeId: string | null; totalCents: number },
    payments: Array<{ method: string; amountCents: number; reference?: string; roomNumber?: string }>,
  ) {
    const charged = payments.filter((p) => p.method === 'ROOM_CHARGE' && p.amountCents > 0);
    if (charged.length === 0) return;
    if (charged.length > 1) throw new BadRequestException('Charge a sale to one room only');
    const p = charged[0];
    // Older tills sent only the reference ("Room 101 - Name").
    const number = String(p.roomNumber ?? /^Room\s+(\S+)/i.exec(p.reference ?? '')?.[1] ?? '').trim();
    if (!number) throw new BadRequestException('Say which room to charge');
    if (p.amountCents > sale.totalCents) throw new BadRequestException('A room cannot be charged more than the sale comes to');

    const stays: Array<{ id: string; storeId: string; guestName: string }> = await tx.roomBooking.findMany({
      where: { businessId, status: 'CHECKED_IN', room: { number } },
      select: { id: true, storeId: true, guestName: true },
    });
    const here = stays.filter((b) => b.storeId === sale.storeId);
    const stay = here.length === 1 ? here[0] : stays.length === 1 ? stays[0] : null;
    if (!stay) {
      throw new BadRequestException(stays.length === 0 ? `Room ${number} has no checked-in guest to charge` : `More than one guest is checked in to a room numbered ${number}`);
    }

    await tx.guestFolioCharge.create({
      data: {
        bookingId: stay.id,
        businessId,
        type: ROOM_CHARGE_FOLIO_TYPE,
        description: `Charged to room from sale ${sale.receiptNumber}`,
        amountCents: p.amountCents,
        quantity: 1,
        totalCents: p.amountCents,
        postedBy: cashierId,
        saleId: sale.id,
      },
    });
  }

  /**
   * Voiding a room-charged sale takes it back off the guest's folio, while the guest is still in. After check-out the
   * guest has paid it, and giving that back is a refund, not a void.
   */
  private async releaseRoomCharge(tx: any, businessId: string, saleId: string, refundCents: number, whole: boolean) {
    const charge = await tx.guestFolioCharge.findFirst({ where: { businessId, saleId, type: ROOM_CHARGE_FOLIO_TYPE }, include: { booking: { select: { status: true } } } });
    if (!charge) return;
    if (charge.booking.status !== 'CHECKED_IN') {
      throw new BadRequestException('This sale was charged to a room whose guest has checked out. Refund it instead.');
    }
    const left = whole ? 0 : Math.max(0, charge.totalCents - refundCents);
    if (left === 0) await tx.guestFolioCharge.deleteMany({ where: { id: charge.id, businessId } });
    else await tx.guestFolioCharge.updateMany({ where: { id: charge.id, businessId }, data: { amountCents: left, totalCents: left } });
  }

  /** Journal entry for one sale (shared with direct sales: see sale-ledger.ts). */
  private async postSaleToLedger(input: SaleJournalInput): Promise<void> {
    await postSaleJournal(this.ledger, input);
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
    const sale = await this.prisma.sale.findFirst({
      where: { id, businessId },
      include: { items: true, payments: true, customer: true, cashier: true, voidRecords: true },
    });
    // Another business's sale, or none at all, is not found: an empty 200 told the caller nothing and hid the mistake.
    if (!sale) throw new NotFoundException('Sale not found');
    return sale;
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
    const result = await this.prisma.$transaction(
      (tx) => this.voidInTx(tx, saleId, businessId, managerId, reason, voidedItemIds, voidedItemQuantities),
      { timeout: 15000 },
    );
    await this.afterVoid(saleId, businessId, managerId, reason, result);
    return { success: result.success, refundAmountCents: result.refundAmountCents };
  }

  /**
   * The database half of a void, for a caller (a pump sale, a prescription fill) that voids the sale inside its OWN
   * transaction, next to what else must be undone with it. Pair it with `afterVoid` once that transaction commits.
   */
  async voidInTx(
    tx: any,
    saleId: string,
    businessId: string,
    managerId: string,
    reason: string,
    voidedItemIds?: string[],
    voidedItemQuantities?: Array<{ itemId: string; quantity: number }>,
  ) {
    const sale = await tx.sale.findFirst({
      where: { id: saleId, businessId },
      include: { items: true, payments: true },
    });

    // A credit sale can be voided too (a pump sale charged to a customer, say): what the customer owed is cancelled.
    if (!sale || ![SaleStatus.PAID, SaleStatus.CREDIT].includes(sale.status)) {
      throw new BadRequestException('Can only void paid sales');
    }

    if (sale.status === SaleStatus.CREDIT && sale.payments.length > 0) {
      throw new BadRequestException('Part of this credit sale has been paid. Refund those payments before voiding it.');
    }

    const hasQuantityVoid = voidedItemQuantities && voidedItemQuantities.length > 0;
    const isLineItemVoid = hasQuantityVoid || (voidedItemIds && voidedItemIds.length > 0);
    const itemsToVoid = isLineItemVoid
      ? sale.items.filter((i: any) => voidedItemIds?.includes(i.id) || voidedItemQuantities?.some((v) => v.itemId === i.id))
      : sale.items;

    let refundAmount = 0;
    /** What is being taken back, line by line, for whatever else must follow it (a prescription's register, its claim). */
    const returned: Array<{ name: string; quantity: number; cents: number }> = [];

    // Reverse inventory (using explicit quantities if provided)
    for (const item of itemsToVoid) {
      const qtyOverride = hasQuantityVoid
        ? (voidedItemQuantities!.find((v) => v.itemId === item.id)?.quantity ?? item.quantity)
        : item.quantity;
      const clampedQty = Math.min(qtyOverride, item.quantity);

      if (item.itemId) {
        await restoreStock(tx, {
          businessId,
          storeId: sale.storeId!,
          itemId: item.itemId,
          quantity: clampedQty,
          saleId: sale.id,
          type: InventoryMovementType.VOID,
        });
      }

      // What the customer paid for this much of the line: its value after its share of the sale discount.
      // Lines from before quantities were exact (quantity 0 from the old integer column) fall back to price x qty.
      const paidForLine = item.totalCents - (item.discountCents ?? 0);
      const itemRefund = item.quantity > 0
        ? Math.round((paidForLine * clampedQty) / item.quantity)
        : Math.round(item.unitPriceCents * clampedQty);
      refundAmount += itemRefund;
      returned.push({ name: item.name, quantity: clampedQty, cents: itemRefund });

      // If partial quantity void: reduce item quantity on the sale, and the line's VAT and discount with it
      if (hasQuantityVoid && clampedQty < item.quantity) {
        const keep = (item.quantity - clampedQty) / item.quantity;
        await tx.saleItem.update({
          where: { id: item.id },
          data: {
            quantity: roundQty(item.quantity - clampedQty),
            totalCents: Math.round(item.totalCents * keep),
            vatCents: Math.round((item.vatCents ?? 0) * keep),
            discountCents: Math.round((item.discountCents ?? 0) * keep),
          },
        });
      }
    }

    const record = await tx.voidRecord.create({
      data: {
        saleId: sale.id,
        type: isLineItemVoid ? 'LINE_ITEM_VOID' : 'FULL_VOID',
        authorizedBy: managerId,
        reason,
        voidedItemIds: itemsToVoid.map((i: any) => i.id).join(','),
        refundAmountCents: refundAmount,
      },
    });

    // What was owed on account is no longer owed.
    if (sale.status === SaleStatus.CREDIT && sale.customerId) {
      await tx.customer.update({ where: { id: sale.customerId }, data: { balanceCents: { increment: refundAmount } } });
    }

    await this.releaseRoomCharge(tx, businessId, sale.id, refundAmount, !isLineItemVoid);
    // A cyber session that was invoiced as this sale is no longer revenue.
    if (!isLineItemVoid) {
      await tx.cyberSession.updateMany({ where: { saleId: sale.id, businessId, status: 'COMPLETED' }, data: { status: 'VOIDED' } });
      // An appointment invoiced as this sale is no longer a finished, paid one.
      await tx.appointment.updateMany({ where: { saleId: sale.id, businessId, status: 'COMPLETED' }, data: { status: 'CANCELLED' } });
    }
    await this.releasePharmacyFill(tx, businessId, sale, !isLineItemVoid, managerId, returned);

    // Update sale status
    const newStatus = isLineItemVoid ? SaleStatus.AMENDED : SaleStatus.VOIDED;
    await tx.sale.update({
      where: { id: saleId },
      data: { status: newStatus },
    });

    return {
      success: true,
      refundAmountCents: refundAmount,
      newStatus,
      isLineItemVoid: !!isLineItemVoid,
      receiptNumber: sale.receiptNumber as string | null,
      saleTotalCents: sale.totalCents as number,
      voidRecordId: record.id as string,
    };
  }

  /** What follows a committed void: the audit trail, KRA's credit note and the books taking the sale back. */
  async afterVoid(
    saleId: string,
    businessId: string,
    managerId: string,
    reason: string,
    result: { newStatus: string; isLineItemVoid: boolean; receiptNumber: string | null; saleTotalCents: number; refundAmountCents: number; voidRecordId: string },
  ) {
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

    // The books take back what the sale put in. Best-effort like the sale's own posting.
    if (result.receiptNumber) {
      const fraction = result.isLineItemVoid ? (result.saleTotalCents > 0 ? result.refundAmountCents / result.saleTotalCents : 0) : 1;
      this.reverseSaleJournal(businessId, result.receiptNumber, fraction, result.isLineItemVoid ? `VOIDLINE-${result.voidRecordId}` : `VOID-${result.receiptNumber}`).catch(() => {});
    }
  }

  /** Post the mirror image of a sale's journal entry (all of it, or the share a line void took back). */
  private async reverseSaleJournal(businessId: string, receiptNumber: string, fraction: number, reference: string): Promise<void> {
    const original = await this.prisma.journalEntry.findFirst({ where: { businessId, reference: receiptNumber, sourceType: 'SALE' }, include: { lines: true } });
    if (!original || fraction <= 0) return;
    const lines = reverseJournalLines(original.lines, fraction);
    if (lines.length === 0) return;
    await this.ledger.autoPost({
      businessId,
      storeId: original.storeId ?? undefined,
      description: `Void of ${receiptNumber}`,
      reference,
      sourceType: 'SALE_VOID',
      lines,
    });
  }

  /**
   * Voiding a fill's sale takes it back. In FULL, the prescription goes back to the fill before it, the insurer's claim
   * is cancelled and the controlled-drug register gets a return for what is still out. In PART (some medicines, or
   * some of a quantity, returned), the prescription stays as it is (the patient keeps the rest), the claim comes down
   * by the insurer's share of what came back, and the register gets a return for just those. The register is a legal
   * record, so nothing in it is deleted: a return is a new line. The stock was already restored by the void itself.
   * Not once the insurer has paid the claim.
   */
  private async releasePharmacyFill(
    tx: any,
    businessId: string,
    sale: { id: string; receiptNumber: string | null; totalCents?: number },
    whole: boolean,
    managerId: string,
    returned: Array<{ name: string; quantity: number; cents: number }> = [],
  ) {
    const fill = await tx.prescriptionFill.findFirst({ where: { saleId: sale.id, businessId } });
    if (!fill) return;
    const claim = await tx.insuranceClaim.findFirst({ where: { saleId: sale.id, businessId } });
    if (claim?.status === 'PAID') {
      throw new BadRequestException('The insurer has already paid this claim. Settle that with the insurer before returning the fill.');
    }
    const returnedCents = returned.reduce((sum, r) => sum + r.cents, 0);

    if (whole) {
      if (claim) await tx.insuranceClaim.updateMany({ where: { id: claim.id, businessId }, data: { status: 'VOIDED' } });
      const rx = await tx.prescription.findFirst({ where: { id: fill.prescriptionId, businessId } });
      if (rx) {
        const left = Math.max(0, rx.refillsUsed - 1);
        await tx.prescription.updateMany({
          where: { id: rx.id, businessId },
          data: left === 0
            ? { status: 'PENDING', refillsUsed: 0, dispensedAt: null, dispensedBy: null, lastFillDate: null, nextFillDate: null }
            : { refillsUsed: left, lastFillDate: fill.prevLastFillDate, nextFillDate: fill.prevNextFillDate },
        });
      }
      await tx.prescriptionFill.updateMany({ where: { id: fill.id, businessId }, data: { voidedAt: new Date() } });
    } else if (claim && (sale.totalCents ?? 0) > 0) {
      // The insurer's share of what came back, in the same proportion the sale was split.
      const share = Math.min(claim.billedCents, Math.round((returnedCents * claim.billedCents) / (sale.totalCents as number)));
      const billed = claim.billedCents - share;
      const approved = claim.approvedCents > 0 ? Math.max(0, claim.approvedCents - Math.round((claim.approvedCents * share) / Math.max(1, claim.billedCents))) : 0;
      await tx.insuranceClaim.updateMany({
        where: { id: claim.id, businessId },
        data: billed === 0 ? { status: 'VOIDED', billedCents: 0, approvedCents: 0 } : { billedCents: billed, approvedCents: approved },
      });
    }

    // What the register still shows out for this fill, drug by drug (earlier returns are negative lines).
    const logged = await tx.controlledSubstanceLog.findMany({
      where: { businessId, prescriptionId: fill.prescriptionId, notes: { contains: `receipt ${sale.receiptNumber}` } },
    });
    const byDrug = new Map<string, { entry: any; out: number }>();
    for (const l of logged) {
      const row = byDrug.get(l.itemName) ?? { entry: l, out: 0 };
      row.out += l.quantityDispensed;
      byDrug.set(l.itemName, row);
    }
    for (const [name, { entry, out }] of byDrug) {
      const back = whole ? out : Math.min(out, returned.filter((r) => r.name === name).reduce((sum, r) => sum + r.quantity, 0));
      if (!(back > 0)) continue;
      await tx.controlledSubstanceLog.create({
        data: {
          businessId,
          prescriptionId: entry.prescriptionId,
          itemName: entry.itemName,
          scheduleClass: entry.scheduleClass,
          quantityDispensed: -back,
          unit: entry.unit,
          patientName: entry.patientName,
          patientIdNumber: entry.patientIdNumber,
          prescriberName: entry.prescriberName,
          prescriberLicense: entry.prescriberLicense,
          dispensedBy: managerId,
          notes: `Returned${whole ? '' : ' in part'}: fill voided, receipt ${sale.receiptNumber}`,
        },
      });
    }
  }

  async verifyManagerPin(pin: string, businessId: string) {
    if (!pin || !businessId) throw new BadRequestException('pin and businessId are required');
    return this.auth.verifyManagerPin(pin, businessId);
  }

  /**
   * Who authorised a void. The request used to name its own approver, so anyone signed in could void a
   * paid sale by sending a manager's user id. The approver is now established here: either a manager PIN
   * checked against this business's managers, or the caller's own session when the caller is an owner or
   * manager. A bare id naming someone else counts for nothing.
   */
  async resolveVoidApprover(
    user: { id: string; role: string },
    businessId: string,
    dto: { managerId?: string; managerPin?: string },
  ): Promise<string> {
    if (dto.managerPin) {
      const manager = await this.auth.verifyManagerPin(dto.managerPin, businessId);
      return manager.userId;
    }
    const isManager = ['OWNER', 'ADMIN', 'MANAGER'].includes(user.role);
    if (isManager && (!dto.managerId || dto.managerId === user.id)) return user.id;
    throw new ForbiddenException('Voiding a sale needs a manager. Enter a manager PIN.');
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

      // Refund what was paid: the line's value after its share of the sale discount.
      const refundAmount = itemsToReturn.reduce((sum, i) => sum + i.totalCents - (i.discountCents ?? 0), 0);

      // Reverse inventory
      for (const item of itemsToReturn) {
        if (item.itemId) {
          await restoreStock(tx, {
            businessId,
            storeId: sale.storeId!,
            itemId: item.itemId,
            quantity: item.quantity,
            saleId: sale.id,
            type: InventoryMovementType.RETURN,
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
    if (!Array.isArray(dto?.items) || dto.items.length === 0) {
      throw new BadRequestException('A proforma needs at least one item');
    }
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
            await drawStock(tx, {
              businessId: proforma.businessId,
              storeId,
              itemId: item.itemId,
              itemName: dbItem.name,
              quantity: item.quantity,
              saleId: newSale.id,
              trackBatches: !!dbItem.trackBatches,
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

  /**
   * A customer paying down a credit sale. The method they paid by decides where the money lands (cash goes in the
   * drawer as a pay-in), the receivable is cleared in the books, and the sale becomes PAID only once what has been
   * paid covers it: a part-payment used to close the whole sale.
   */
  async markCreditPaid(
    saleId: string,
    businessId: string,
    amountCents?: number,
    method = 'CASH',
    actor?: { id?: string },
  ) {
    const sale = await this.prisma.sale.findFirst({ where: { id: saleId, businessId }, include: { payments: true } });
    if (!sale) throw new NotFoundException('Sale not found');
    if (sale.status !== SaleStatus.CREDIT) throw new BadRequestException('Sale is not a credit sale');

    const how = oneOf(String(method ?? 'CASH').toUpperCase(), 'Payment method', CREDIT_SETTLEMENT_METHODS);
    const paidSoFar = sale.payments.reduce((sum, p) => sum + p.amountCents, 0);
    const owing = Math.max(0, sale.totalCents - paidSoFar);
    const paidAmount = intInRange(amountCents ?? owing, 'Amount paid', 1, Math.max(1, owing));
    const settled = paidAmount >= owing;

    const payment = await this.prisma.$transaction(async (tx) => {
      // Conditional on the sale still being a credit sale, so two clicks cannot settle it twice.
      const claimed = await tx.sale.updateMany({
        where: { id: saleId, businessId, status: SaleStatus.CREDIT },
        // A part payment writes the sale back unchanged: the conditional update is what claims it (an empty update writes nothing).
        data: settled ? { status: SaleStatus.PAID } : { notes: sale.notes ?? null },
      });
      if (claimed.count !== 1) throw new BadRequestException('This sale was just settled by someone else. Reload it.');
      if (sale.customerId) {
        await tx.customer.update({ where: { id: sale.customerId }, data: { balanceCents: { increment: paidAmount } } });
      }
      const created = await tx.payment.create({
        data: { offlineId: uuidv4(), saleId, method: how, amountCents: paidAmount, reference: 'Credit settlement' },
      });
      // Cash received outside a sale reaches the drawer as a pay-in.
      if (sale.storeId) {
        await tx.cashMovement.create({
          data: { businessId, storeId: sale.storeId, cashierId: actor?.id, kind: 'PAY_IN', method: how, amountCents: paidAmount, reason: 'CREDIT_SETTLEMENT', reference: sale.receiptNumber },
        });
      }
      return created;
    });

    void postSettlementJournal(this.ledger, {
      businessId,
      storeId: sale.storeId ?? undefined,
      description: `Credit sale ${sale.receiptNumber} paid`,
      reference: `SETTLE-${sale.receiptNumber}-${payment.id.slice(0, 8)}`,
      sourceType: 'CREDIT_SETTLEMENT',
      method: how,
      amountCents: paidAmount,
    }).catch(() => undefined);

    // Award loyalty points now that debt is settled
    if (sale.customerId) {
      await this.loyalty.earnPoints(sale.customerId, paidAmount, saleId).catch(() => {});
    }

    return { success: true, settled, paidCents: paidAmount, owingCents: Math.max(0, owing - paidAmount) };
  }
}

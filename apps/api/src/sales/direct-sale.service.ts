import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';
import { SaleStatus, SaleType, calculateTOT, computeTaxes, type TaxClass } from '@pos/shared';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { EtimsService } from '../etims/etims.service';
import { AuditService } from '../audit/audit.service';
import { EventsGateway } from '../events/events.gateway';
import { postSaleJournal } from './sale-ledger';

/**
 * Turning a vertical's takings (a pump sale, a hotel stay, a dispensed prescription, a cyber session) into a real
 * Sale, so it reaches the receipt, eTIMS, Z-report, cash drawer, ledger and reports like anything sold at the till.
 *
 * The caller runs `createInTx` inside ITS OWN transaction, next to the rows that belong to the vertical (the tank
 * draw, the fleet charge), so the invoice commits or rolls back with them. Everything that must not roll the sale
 * back if it fails (the books, the KRA submission, the broadcast) runs afterwards in `afterCommit`.
 *
 * It is gated per business by `Business.verticalSalesFrom`: a shop that already rings these takings through the
 * till would count them twice, so existing businesses stay off until their owner switches over.
 */

export interface DirectSaleLine {
  /** The catalogue item the line is invoiced as. eTIMS needs an item, so a line without one prints as "Item". */
  itemId?: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  /** Value of the line, VAT included. May be negative (a discount line). */
  totalCents: number;
  taxClass: TaxClass;
  /** The staff member who performed this line (a stylist). Commission goes to them. The caller has checked they belong to the business. */
  staffId?: string;
}

export interface DirectSalePayment { method: string; amountCents: number; reference?: string }

export interface DirectSaleInput {
  businessId: string;
  storeId: string;
  cashierId?: string;
  lines: DirectSaleLine[];
  /** A sale-level discount, shared across the lines. */
  discountCents?: number;
  /** What the buyer handed over. Ignored for an on-account sale, which is paid for later. */
  payments?: DirectSalePayment[];
  /** Sold on account: no payment now, an invoice the buyer owes. */
  onAccount?: boolean;
  /** An on-account sale to a registered customer debits that customer's balance, within their credit limit. */
  customerId?: string;
  /**
   * An on-account sale whose receivable is tracked by the caller (a fleet account), not by a Customer record.
   * Without a customerId, an on-account sale must say so.
   */
  externalAccount?: boolean;
  customerName?: string;
  customerPhone?: string;
  buyerKraPin?: string;
  notes?: string;
  /** Where it came from (FUEL, HOTEL, ...): kept in the audit trail. */
  source: string;
}

export interface DirectSaleResult {
  sale: {
    id: string;
    receiptNumber: string | null;
    totalCents: number;
    vatCents: number;
    totCents: number;
    status: string;
    [key: string]: unknown;
  };
  isCredit: boolean;
  /** What was actually recorded as paid (the tender less any change given). */
  payments: DirectSalePayment[];
}

/** What eTIMS answered for a sale, as the receipt needs it (the QR code and control number). */
export interface EtimsOutcome {
  success: boolean;
  controlNumber?: string;
  intrlData?: string;
  qrUrl?: string;
  testMode?: boolean;
}

/** The slice of a transaction client this needs. */
type Tx = any;

@Injectable()
export class DirectSaleService {
  private readonly logger = new Logger(DirectSaleService.name);

  constructor(
    private prisma: PrismaService,
    private ledger: LedgerService,
    private etims: EtimsService,
    private audit: AuditService,
    private events: EventsGateway,
  ) {}

  /** Has this business switched its vertical takings over to the sales pipeline? */
  async isEnabled(businessId: string, db: Tx = this.prisma): Promise<boolean> {
    const b = await db.business.findUnique({ where: { id: businessId }, select: { verticalSalesFrom: true } });
    return !!b?.verticalSalesFrom && b.verticalSalesFrom.getTime() <= Date.now();
  }

  /**
   * Take the change off the cash tendered, so what is recorded as paid adds up to the sale. Recording the tender
   * itself overstated takings (and the drawer's expected cash) by the change every time a customer paid with a
   * note larger than the bill.
   */
  static settleTender(totalCents: number, payments: DirectSalePayment[]): DirectSalePayment[] {
    const clean = payments.map((p) => {
      if (!Number.isInteger(p?.amountCents) || p.amountCents <= 0) throw new BadRequestException('Every payment must be a positive whole amount');
      const method = String(p.method ?? '').trim().toUpperCase();
      if (!method) throw new BadRequestException('Every payment needs a method');
      return { method, amountCents: p.amountCents, ...(p.reference ? { reference: p.reference } : {}) };
    });
    const tendered = clean.reduce((s, p) => s + p.amountCents, 0);
    if (tendered < totalCents) {
      throw new BadRequestException(`Payments (${tendered}) do not cover the total (${totalCents})`);
    }
    let change = tendered - totalCents;
    // Change is only ever given in cash: take it off the cash lines, largest first.
    for (const p of [...clean].filter((x) => x.method === 'CASH').sort((a, b) => b.amountCents - a.amountCents)) {
      if (change <= 0) break;
      const take = Math.min(change, p.amountCents);
      p.amountCents -= take;
      change -= take;
    }
    if (change > 0) throw new BadRequestException('Change can only be given on cash: the non-cash payments are more than the bill');
    return clean.filter((p) => p.amountCents > 0);
  }

  async createInTx(tx: Tx, input: DirectSaleInput): Promise<DirectSaleResult> {
    if (!Array.isArray(input.lines) || input.lines.length === 0) throw new BadRequestException('A sale needs at least one line');
    for (const l of input.lines) {
      if (!Number.isFinite(l.quantity) || l.quantity <= 0) throw new BadRequestException(`Quantity of ${l.name} must be greater than zero`);
      if (!Number.isInteger(l.totalCents) || !Number.isInteger(l.unitPriceCents)) throw new BadRequestException(`Amounts for ${l.name} must be whole cents`);
    }

    const store = await tx.store.findFirst({
      where: { id: input.storeId, businessId: input.businessId },
      include: { business: { select: { taxType: true, totRate: true } } },
    });
    if (!store) throw new NotFoundException('Store not found');

    const subtotalCents = input.lines.reduce((s, l) => s + l.totalCents, 0);
    const discountCents = input.discountCents ?? 0;
    if (!Number.isInteger(discountCents) || discountCents < 0) throw new BadRequestException('Discount must be zero or a positive whole amount');
    if (discountCents > Math.max(0, subtotalCents)) throw new BadRequestException('The discount is larger than the sale');
    const totalCents = subtotalCents - discountCents;
    if (totalCents < 0) throw new BadRequestException('A sale cannot total less than zero');

    // VAT line by line from each line's class, as at the till.
    const taxes = computeTaxes(
      input.lines.map((l) => ({ totalCents: l.totalCents, taxClass: l.taxClass })),
      discountCents,
      { vatRegistered: store.business.taxType === 'VAT' },
    );
    const vatCents = taxes.vatCents;
    const totCents = store.business.taxType === 'TOT' ? calculateTOT(totalCents, store.business.totRate ?? 3) : 0;

    const isCredit = !!input.onAccount;
    let payments: DirectSalePayment[] = [];
    if (isCredit) {
      if ((input.payments ?? []).length > 0) throw new BadRequestException('An on-account sale is paid for later: it takes no payment now');
      if (!input.customerId && !input.externalAccount) throw new BadRequestException('A sale on account needs a registered customer');
    } else {
      payments = DirectSaleService.settleTender(totalCents, input.payments ?? []);
    }

    // On account to a registered customer: within their credit limit, and it goes on their balance.
    if (isCredit && input.customerId) {
      const customer = await tx.customer.findFirst({ where: { id: input.customerId, businessId: input.businessId } });
      if (!customer) throw new BadRequestException('Customer not found');
      if (customer.creditLimitCents > 0) {
        const outstanding = Math.max(0, -customer.balanceCents);
        if (outstanding + totalCents > customer.creditLimitCents) {
          throw new BadRequestException(
            `Credit limit exceeded. Limit: KES ${(customer.creditLimitCents / 100).toFixed(2)}, ` +
            `outstanding: KES ${(outstanding / 100).toFixed(2)}, this sale: KES ${(totalCents / 100).toFixed(2)}.`,
          );
        }
      }
      await tx.customer.update({ where: { id: customer.id }, data: { balanceCents: { decrement: totalCents } } });
    }

    // The receipt number: an atomic increment, so two sales at once can never share one.
    const updated = await tx.store.update({ where: { id: input.storeId }, data: { receiptSequence: { increment: 1 } } });
    const receiptNumber = `${updated.storeCode}-${new Date().getFullYear()}-${String(updated.receiptSequence).padStart(7, '0')}`;

    const sale = await tx.sale.create({
      data: {
        offlineId: uuidv4(),
        businessId: input.businessId,
        storeId: input.storeId,
        receiptNumber,
        cashierId: input.cashierId,
        customerId: input.customerId,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        buyerKraPin: input.buyerKraPin,
        notes: input.notes,
        type: isCredit ? SaleType.CREDIT : SaleType.NORMAL,
        status: isCredit ? SaleStatus.CREDIT : SaleStatus.PAID,
        priceLevel: 'RETAIL',
        subtotalCents,
        discountCents,
        serviceChargeCents: 0,
        tipCents: 0,
        vatCents,
        totCents,
        totalCents,
        taxClassified: true,
        items: {
          create: input.lines.map((l, i) => ({
            itemId: l.itemId,
            name: l.name,
            quantity: l.quantity,
            unitPriceCents: l.unitPriceCents,
            totalCents: l.totalCents,
            taxClass: taxes.lines[i].taxClass,
            vatCents: taxes.lines[i].vatCents,
            discountCents: taxes.lines[i].discountCents,
            staffId: l.staffId ?? null,
          })),
        },
        payments: {
          create: payments.map((p) => ({ offlineId: uuidv4(), method: p.method, amountCents: p.amountCents, reference: p.reference })),
        },
      },
      include: { items: true, payments: true },
    });

    return { sale, isCredit, payments };
  }

  /**
   * Everything that follows a committed direct sale. None of it may fail the sale, so each part is on its own:
   * the audit trail, the books, the broadcast to other terminals, and the submission to KRA. A KRA failure leaves
   * the sale "pending submission", which the sales list shows and can retry.
   *
   * Returns the eTIMS outcome as a promise that never rejects (null when KRA could not be reached), so a caller
   * can put the QR code on the receipt. The server owns the submission: a screen that also submitted would risk
   * sending KRA the same invoice twice.
   */
  afterCommit(result: DirectSaleResult, input: DirectSaleInput): { etims: Promise<EtimsOutcome | null> } {
    const { sale } = result;
    void this.audit.createEntry({
      businessId: input.businessId,
      actor: input.cashierId ?? 'system',
      actorType: input.cashierId ? 'USER' : 'SYSTEM',
      action: 'SALE_CREATED',
      entity: 'Sale',
      entityId: sale.id,
      after: { receiptNumber: sale.receiptNumber, totalCents: sale.totalCents, via: input.source },
      source: input.source,
    } as any).catch((e: unknown) => this.logger.warn(`Audit entry for ${sale.receiptNumber} failed: ${String(e)}`));

    void postSaleJournal(this.ledger, {
      businessId: input.businessId,
      storeId: input.storeId,
      receiptNumber: sale.receiptNumber ?? sale.id,
      isCredit: result.isCredit,
      totalCents: sale.totalCents,
      vatCents: sale.vatCents,
      totCents: sale.totCents,
      serviceChargeCents: 0,
      tipCents: 0,
      payments: result.payments,
    }).catch((e: unknown) => this.logger.warn(`Ledger posting for ${sale.receiptNumber} failed: ${String(e)}`));

    try {
      this.events.emitSaleCreated(input.businessId, {
        saleId: sale.id,
        receiptNumber: sale.receiptNumber,
        totalCents: sale.totalCents,
        storeId: input.storeId,
        itemIds: input.lines.map((l) => l.itemId).filter(Boolean) as string[],
      } as any);
    } catch (e) {
      this.logger.warn(`Broadcast for ${sale.receiptNumber} failed: ${String(e)}`);
    }

    const etims = this.etims.submitSale(sale.id).then(
      (r) => r as EtimsOutcome,
      (e: unknown) => {
        this.logger.warn(`eTIMS submission for ${sale.receiptNumber} failed, left pending: ${String(e)}`);
        return null;
      },
    );
    return { etims };
  }
}

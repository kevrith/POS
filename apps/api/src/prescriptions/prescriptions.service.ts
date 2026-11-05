import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { intInRange, numberInRange, oneOf, optionalKraPin, optionalText, requireArray, text } from '../common/validate';
import { hasTooManyDecimals, roundQty } from '../common/quantity';
import { parseFilterDate } from '../common/dates';
import { drawStock } from '../batch/batch-allocation';
import { taxClassOf } from '@pos/shared';
import { DirectSaleService, type DirectSaleInput, type DirectSaleLine, type DirectSaleResult, type EtimsOutcome } from '../sales/direct-sale.service';

const MAX_NUMBER_ATTEMPTS = 10;
/** A single line above this is a typo (or a fiddle), not a dispensing quantity. */
const MAX_LINE_QTY = 10_000;
const MAX_REFILLS = 12;
const FILL_INTERVAL_DAYS = 30;
/** Item.scheduleClass values that put a drug on the controlled-substance register. OTC and blank do not. */
const CONTROLLED_SCHEDULES = ['II', 'III', 'IV', 'V'] as const;
const MANAGER_ROLES = ['OWNER', 'ADMIN', 'MANAGER'];
/** How a patient may pay for a fill. The insurer's share is added by the fill itself, never sent. */
const PAYMENT_METHODS = ['CASH', 'MPESA', 'CARD', 'BANK'] as const;
/** How long a dispense waits for KRA so the receipt can carry the QR code. */
const ETIMS_WAIT_MS = 5000;

/** What a fill needs when the business takes its pharmacy takings through the sales pipeline. */
export interface FillOptions {
  /** What the patient hands over (their share, when an insurer pays the rest). */
  payments?: Array<{ method: string; amountCents: number; reference?: string }>;
  /** The insurer covers the rest of the bill: the patient pays `patientPct` percent. */
  insurance?: { providerId: string; memberNumber?: string; patientPct: number };
  buyerKraPin?: string;
}

export interface RxLine { itemId?: string; name: string; qty: number; instructions?: string }
export interface Actor { id: string; name: string; role: string }

/** Words that describe a pack, not the drug: stripped before two drug names are compared. */
const FORM_WORDS = /\b(tablets?|tabs?|capsules?|caps?|syrup|suspension|injection|inj|cream|ointment|gel|drops|sachets?|solution|oral|iv|im|sr|xr|er|film[- ]coated)\b/g;
const STRENGTH = /\b\d+(\.\d+)?\s*(mg|mcg|µg|g|ml|iu|%|units?)(\/\d*\.?\d*\s*(ml|mg|g))?\b/g;

/** "Warfarin 5 mg tablets" and "WARFARIN" are the same drug for an interaction check. */
export function normalizeDrugName(name: string): string {
  return String(name ?? '')
    .toLowerCase()
    .replace(/\([^)]*\)/g, ' ')
    .replace(STRENGTH, ' ')
    .replace(FORM_WORDS, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sameDrug(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const within = (needle: string, hay: string) => new RegExp(`(^|\\s)${needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(\\s|$)`).test(hay);
  return within(a, b) || within(b, a);
}

@Injectable()
export class PrescriptionsService {
  constructor(private prisma: PrismaService, private directSales: DirectSaleService) {}

  /**
   * RX-<business tag>-<YYYYMMDD>-<n>. `prescriptionNumber` is unique across the whole table, so the number
   * must carry the business: without it, two pharmacies' first prescription of the day were both
   * RX-<date>-0001 and one of them got a conflict. The day is the Nairobi day. The sequence continues from
   * the highest number issued for that business and day (a count would reuse a number after a deletion).
   */
  static businessTag(businessId: string): string {
    return createHash('sha256').update(businessId).digest('hex').slice(0, 5).toUpperCase();
  }

  private async nextRxNumber(businessId: string): Promise<string> {
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }).replace(/-/g, '');
    const prefix = `RX-${PrescriptionsService.businessTag(businessId)}-${day}-`;
    const last = await this.prisma.prescription.findFirst({
      where: { businessId, prescriptionNumber: { startsWith: prefix } },
      orderBy: { prescriptionNumber: 'desc' },
      select: { prescriptionNumber: true },
    });
    const lastSeq = last ? parseInt(last.prescriptionNumber.slice(prefix.length), 10) : 0;
    return `${prefix}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(4, '0')}`;
  }

  async findAll(businessId: string, storeId: string, status?: string) {
    return this.prisma.prescription.findMany({
      where: {
        businessId,
        storeId,
        ...(status && status !== 'ALL' ? { status } : {}),
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string, businessId: string) {
    return this.owned(id, businessId);
  }

  private async owned(id: string, businessId: string) {
    const rx = await this.prisma.prescription.findFirst({ where: { id, businessId } });
    if (!rx) throw new NotFoundException('Prescription not found');
    return rx;
  }

  /** The lines of a prescription as stored; tolerant of old rows. */
  private lines(rx: { items: string }): RxLine[] {
    try {
      const parsed = JSON.parse(rx.items);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  async create(dto: {
    businessId: string;
    storeId: string;
    patientName: string;
    patientPhone?: string;
    patientDOB?: string;
    patientIdNumber?: string;
    doctorName: string;
    doctorLicense?: string;
    diagnosis?: string;
    items: Array<{ itemId?: string; name: string; qty: number; instructions?: string }>;
    notes?: string;
    refillsAllowed?: number;
  }) {
    if (typeof dto.storeId !== 'string' || !dto.storeId) throw new BadRequestException('storeId is required');
    const store = await this.prisma.store.findFirst({ where: { id: dto.storeId, businessId: dto.businessId }, select: { id: true } });
    if (!store) throw new BadRequestException('Store not found');

    const rawLines = requireArray<Partial<RxLine>>(dto.items, 'items');
    if (rawLines.length === 0) throw new BadRequestException('A prescription needs at least one medicine');
    const lines: RxLine[] = rawLines.map((l, i) => {
      const qty = numberInRange(l?.qty, `Quantity of line ${i + 1}`, { min: 0, max: MAX_LINE_QTY, exclusiveMin: true });
      if (hasTooManyDecimals(qty)) throw new BadRequestException(`Quantity of line ${i + 1} can have at most 3 decimal places`);
      return {
        ...(l?.itemId ? { itemId: text(l.itemId, 'Item', 64) } : {}),
        name: text(l?.name, `Medicine name on line ${i + 1}`, 120),
        qty,
        ...(l?.instructions ? { instructions: text(l.instructions, 'Instructions', 300) } : {}),
      };
    });
    const itemIds = [...new Set(lines.map((l) => l.itemId).filter(Boolean) as string[])];
    if (itemIds.length > 0) {
      const found = await this.prisma.item.count({ where: { id: { in: itemIds }, businessId: dto.businessId } });
      if (found !== itemIds.length) throw new BadRequestException('A line names an item that is not in this business');
    }

    const data = {
      businessId: dto.businessId,
      storeId: dto.storeId,
      patientName: text(dto.patientName, 'Patient name', 120),
      patientPhone: optionalText(dto.patientPhone, 'Patient phone', 30),
      patientDOB: optionalText(dto.patientDOB, 'Patient date of birth', 30),
      patientIdNumber: optionalText(dto.patientIdNumber, 'Patient ID number', 30),
      doctorName: text(dto.doctorName, 'Doctor name', 120),
      doctorLicense: optionalText(dto.doctorLicense, 'Doctor licence', 60),
      diagnosis: optionalText(dto.diagnosis, 'Diagnosis', 300),
      items: JSON.stringify(lines),
      notes: optionalText(dto.notes, 'Notes', 500),
      refillsAllowed: intInRange(dto.refillsAllowed ?? 0, 'Refills allowed', 0, MAX_REFILLS),
    };
    // Two prescriptions written at the same moment can read the same "last number". The unique index stops
    // the second; it re-reads and takes the next one rather than failing the pharmacist's screen.
    for (let attempt = 1; ; attempt++) {
      const prescriptionNumber = await this.nextRxNumber(dto.businessId);
      try {
        return await this.prisma.prescription.create({ data: { ...data, prescriptionNumber } });
      } catch (err) {
        const clash = (err as { code?: string })?.code === 'P2002';
        if (!clash || attempt >= MAX_NUMBER_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 25 * attempt)));
      }
    }
  }

  // ── Dispensing ───────────────────────────────────────────────────────────

  /** The first fill of a PENDING prescription. */
  dispense(id: string, businessId: string, actor: Actor, opts: FillOptions = {}) {
    return this.fill(id, businessId, actor, 'FIRST', opts);
  }

  /** A repeat fill of a DISPENSED prescription that still has refills left. */
  refill(id: string, businessId: string, actor: Actor, opts: FillOptions = {}) {
    return this.fill(id, businessId, actor, 'REFILL', opts);
  }

  /**
   * What this fill costs, priced from the catalogue, for the pharmacist to collect against. For a business not on
   * the sales pipeline there is nothing to collect here (`invoice: false`). Changes nothing.
   */
  async quote(id: string, businessId: string) {
    const rx = await this.owned(id, businessId);
    const invoice = await this.directSales.isEnabled(businessId);
    if (!invoice) return { invoice, lines: [], totalCents: 0, unpriced: [] as string[] };
    const priced = await this.priceLines(this.prisma, businessId, this.lines(rx));
    return { invoice, lines: priced.lines, totalCents: priced.totalCents, unpriced: priced.unpriced };
  }

  /**
   * The catalogue price of each line. A line with no item, or an item with no price, cannot be invoiced: it is
   * returned in `unpriced` so the pharmacist is told which, rather than the bill silently leaving it out.
   */
  private async priceLines(db: any, businessId: string, lines: RxLine[]) {
    const ids = [...new Set(lines.map((l) => l.itemId).filter(Boolean) as string[])];
    const items: any[] = ids.length ? await db.item.findMany({ where: { id: { in: ids }, businessId } }) : [];
    const byId = new Map(items.map((i) => [i.id, i]));
    const priced: DirectSaleLine[] = [];
    const unpriced: string[] = [];
    for (const l of lines) {
      const item = l.itemId ? byId.get(l.itemId) : undefined;
      if (!item || !(item.retailPriceCents > 0)) { unpriced.push(l.name); continue; }
      priced.push({
        itemId: item.id,
        name: item.name,
        quantity: l.qty,
        unitPriceCents: item.retailPriceCents,
        totalCents: Math.round(item.retailPriceCents * l.qty),
        taxClass: taxClassOf(item),
      });
    }
    return { lines: priced, totalCents: priced.reduce((sum, l) => sum + l.totalCents, 0), unpriced };
  }

  /**
   * One fill. Everything that must agree happens in a single transaction: claiming the prescription, taking
   * the stock (from batches, soonest expiry first), and writing the controlled-substance register. If the
   * stock cannot be taken, or an expired batch is all that is left, the prescription is NOT marked dispensed:
   * it used to be marked first and the stock errors swallowed, so a failed deduction still dispensed.
   *
   * `refillsUsed` counts FILLS, including the first (existing rows already mean that), so a prescription
   * with `refillsAllowed = 2` allows three fills. Comparing `refillsUsed >= refillsAllowed` gave one refill
   * too few.
   */
  private async fill(id: string, businessId: string, actor: Actor, kind: 'FIRST' | 'REFILL', opts: FillOptions = {}) {
    const rx = await this.owned(id, businessId);

    if (kind === 'FIRST') {
      if (rx.status === 'DISPENSED') throw new BadRequestException('This prescription has already been dispensed. Use Refill for another fill.');
      if (rx.status !== 'PENDING') throw new BadRequestException(`A ${rx.status.toLowerCase().replace(/_/g, ' ')} prescription cannot be dispensed`);
    } else {
      if (rx.status !== 'DISPENSED') throw new BadRequestException(rx.status === 'PENDING' ? 'Dispense the prescription before refilling it' : `A ${rx.status.toLowerCase().replace(/_/g, ' ')} prescription cannot be refilled`);
      if (rx.refillsUsed >= rx.refillsAllowed + 1) throw new BadRequestException('No refills remaining');
      // Too early to fill again, unless a manager decides otherwise.
      if (rx.nextFillDate && rx.nextFillDate.getTime() > Date.now() && !MANAGER_ROLES.includes(actor.role)) {
        throw new BadRequestException(`Not due until ${rx.nextFillDate.toISOString().slice(0, 10)}. A manager can fill it early.`);
      }
    }

    const lines = this.lines(rx);
    if (lines.length === 0) throw new BadRequestException('This prescription has no medicines to dispense');
    const source = `Prescription ${rx.prescriptionNumber}`;
    const now = new Date();
    const nextFill = new Date(now.getTime() + FILL_INTERVAL_DAYS * 86_400_000);

    // A business on the sales pipeline takes the money for the fill here and gives the patient a real receipt.
    // Check what was sent before anything is claimed, so a typo costs the pharmacist nothing.
    const invoice = await this.directSales.isEnabled(businessId);
    const terms = invoice ? await this.fillTerms(businessId, opts) : null;

    const outcome = await this.prisma.$transaction(async (tx) => {
      // Claim the fill. Conditioning on the status AND the fill count means two pharmacists pressing Dispense
      // together, or a double click, cannot both win.
      const claimed = await tx.prescription.updateMany({
        where: { id, businessId, status: rx.status, refillsUsed: rx.refillsUsed },
        data: {
          status: 'DISPENSED',
          dispensedAt: now,
          dispensedBy: actor.name,
          lastFillDate: now,
          nextFillDate: nextFill,
          refillsUsed: { increment: 1 },
        },
      });
      if (claimed.count !== 1) throw new BadRequestException('This prescription was just dispensed by someone else. Reload it.');

      // The sale first, so the stock leaving can be tied to it.
      let direct: { result: DirectSaleResult; input: DirectSaleInput } | null = null;
      let insurerCents = 0;
      let claimId: string | null = null;
      if (invoice && terms) {
        const priced = await this.priceLines(tx, businessId, lines);
        if (priced.unpriced.length > 0) {
          throw new BadRequestException(`Link and price every medicine in the catalogue before dispensing. Missing: ${priced.unpriced.join(', ')}`);
        }
        const patientPct = terms.insurance?.patientPct ?? 100;
        const patientCents = Math.round((priced.totalCents * patientPct) / 100);
        insurerCents = priced.totalCents - patientCents;
        const input: DirectSaleInput = {
          businessId,
          storeId: rx.storeId,
          cashierId: actor.id,
          source: 'PHARMACY',
          lines: priced.lines,
          // The insurer's share is owed to the pharmacy by the insurer until the claim is paid.
          payments: [...terms.payments, ...(insurerCents > 0 ? [{ method: 'INSURANCE', amountCents: insurerCents }] : [])],
          customerName: rx.patientName,
          customerPhone: rx.patientPhone ?? undefined,
          buyerKraPin: terms.buyerKraPin,
          notes: `${source}, ${kind === 'FIRST' ? 'first fill' : `refill ${rx.refillsUsed}`}`,
        };
        const result = await this.directSales.createInTx(tx, input);
        direct = { result, input };
        // So that voiding this sale can take the fill back (see SalesService.releasePharmacyFill).
        await tx.prescriptionFill.create({
          data: { businessId, prescriptionId: rx.id, saleId: result.sale.id, kind, prevLastFillDate: rx.lastFillDate, prevNextFillDate: rx.nextFillDate },
        });
        if (terms.insurance && insurerCents > 0) {
          const claim = await tx.insuranceClaim.create({
            data: {
              businessId,
              prescriptionId: rx.id,
              providerId: terms.insurance.providerId,
              patientInsuranceId: terms.insurance.memberNumber,
              billedCents: insurerCents,
              copayPct: patientPct,
              status: 'SUBMITTED',
              saleId: result.sale.id,
            },
          });
          claimId = claim.id;
        }
      }
      const saleId = direct?.result.sale.id;
      const receipt = direct?.result.sale.receiptNumber;

      const business = await tx.business.findUnique({ where: { id: businessId }, select: { negativePolicyDefault: true } });
      for (const line of lines) {
        if (!line.itemId) continue;
        const item = await tx.item.findFirst({ where: { id: line.itemId, businessId } });
        if (!item) throw new BadRequestException(`${line.name}: this item is no longer in the catalogue`);

        if (item.trackStock) {
          const policy = item.negativeStockPolicy ?? business?.negativePolicyDefault ?? 'ALLOW';
          if (policy === 'BLOCK') {
            const agg = await tx.inventoryMovement.aggregate({
              where: { itemId: item.id, storeId: rx.storeId, businessId },
              _sum: { quantity: true },
            });
            const onHand = roundQty(agg._sum.quantity ?? 0);
            if (onHand < line.qty) throw new BadRequestException(`Insufficient stock for ${item.name}. Available: ${onHand}, needed: ${line.qty}`);
          }
          await drawStock(tx, {
            businessId,
            storeId: rx.storeId,
            itemId: item.id,
            itemName: item.name,
            quantity: line.qty,
            trackBatches: !!item.trackBatches,
            saleId,
            source,
          });
        }

        // A controlled drug goes on the register at the moment it leaves, by the person who dispensed it.
        if (item.scheduleClass && (CONTROLLED_SCHEDULES as readonly string[]).includes(item.scheduleClass)) {
          await tx.controlledSubstanceLog.create({
            data: {
              businessId,
              prescriptionId: rx.id,
              itemName: item.name,
              scheduleClass: item.scheduleClass,
              quantityDispensed: line.qty,
              unit: item.unitLabel ?? item.weightUnit ?? 'units',
              patientName: rx.patientName,
              patientIdNumber: rx.patientIdNumber,
              prescriberName: rx.doctorName,
              prescriberLicense: rx.doctorLicense,
              dispensedBy: actor.name,
              notes: `${source}, ${kind === 'FIRST' ? 'first fill' : `refill ${rx.refillsUsed}`}${receipt ? `, receipt ${receipt}` : ''}`,
            },
          });
        }
      }
      return { direct, insurerCents, claimId };
    });

    const dispensed = await this.owned(id, businessId);
    if (!outcome.direct) return dispensed;

    // Books, KRA and the broadcast follow the commit and cannot undo it. Wait briefly for KRA so the receipt can
    // carry the QR code; if it is slow the fill is already recorded and the receipt prints without it.
    const after = this.directSales.afterCommit(outcome.direct.result, outcome.direct.input);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const etims: EtimsOutcome | null = await Promise.race([after.etims, new Promise<null>((resolve) => { timer = setTimeout(() => resolve(null), ETIMS_WAIT_MS); })]);
    clearTimeout(timer);
    const sale = outcome.direct.result.sale;
    const paid = outcome.direct.result.payments.filter((p) => p.method !== 'INSURANCE').reduce((sum, p) => sum + p.amountCents, 0);
    return {
      ...dispensed,
      saleId: sale.id,
      receiptNumber: sale.receiptNumber,
      invoice: sale,
      etims,
      totalCents: sale.totalCents,
      insurerShareCents: outcome.insurerCents,
      patientShareCents: sale.totalCents - outcome.insurerCents,
      patientPaidCents: paid,
      claimId: outcome.claimId,
    };
  }

  /** Check what the pharmacist sent with a fill on the sales pipeline: the payments, the insurer, the buyer's PIN. */
  private async fillTerms(businessId: string, opts: FillOptions) {
    const payments = requireArray<{ method: string; amountCents: number; reference?: string }>(opts.payments ?? [], 'payments').map((p) => ({
      method: oneOf(String(p?.method ?? '').toUpperCase(), 'Payment method', PAYMENT_METHODS),
      amountCents: intInRange(p?.amountCents, 'Payment amount', 1, 1_000_000_000),
      ...(p?.reference ? { reference: text(p.reference, 'Payment reference', 80) } : {}),
    }));
    let insurance: { providerId: string; memberNumber?: string; patientPct: number } | undefined;
    if (opts.insurance) {
      const providerId = text(opts.insurance.providerId, 'Insurer', 64);
      const provider = await this.prisma.insuranceProvider.findFirst({ where: { id: providerId, businessId, isActive: true }, select: { id: true } });
      if (!provider) throw new BadRequestException('That insurer is not set up for this pharmacy');
      insurance = {
        providerId,
        memberNumber: optionalText(opts.insurance.memberNumber, 'Member number', 60),
        // 100 would mean the insurer pays nothing, so there is no claim to make: just take payment.
        patientPct: intInRange(opts.insurance.patientPct, 'Patient share (%)', 0, 99),
      };
    }
    return { payments, insurance, buyerKraPin: optionalKraPin(opts.buyerKraPin, 'Buyer KRA PIN') };
  }

  async refer(id: string, businessId: string, referralNotes: string) {
    const rx = await this.owned(id, businessId);
    if (rx.status !== 'PENDING') {
      throw new BadRequestException(`Cannot refer a prescription with status ${rx.status}`);
    }
    return this.prisma.prescription.update({
      where: { id },
      data: { status: 'REFERRED_EXTERNAL', referralNotes: optionalText(referralNotes, 'Referral notes', 500) ?? null },
    });
  }

  /**
   * Cancel a prescription that is waiting, or stop the remaining refills of one already dispensed. What was
   * dispensed is not undone (stock stays out, the register keeps its entry); cancelling only closes it.
   */
  async cancel(id: string, businessId: string, reason?: string) {
    const rx = await this.owned(id, businessId);
    if (!['PENDING', 'DISPENSED'].includes(rx.status)) {
      throw new BadRequestException(`A ${rx.status.toLowerCase().replace(/_/g, ' ')} prescription cannot be cancelled`);
    }
    const why = optionalText(reason, 'Reason', 200);
    const claimed = await this.prisma.prescription.updateMany({
      where: { id, businessId, status: { in: ['PENDING', 'DISPENSED'] } },
      data: { status: 'CANCELLED', ...(why && { notes: [rx.notes, `Cancelled: ${why}`].filter(Boolean).join(' | ') }) },
    });
    if (claimed.count !== 1) throw new BadRequestException('This prescription was just changed by someone else. Reload it.');
    return this.owned(id, businessId);
  }

  async getRefillQueue(businessId: string) {
    const now = new Date();
    // Dispensed prescriptions with fills left (one fill plus refillsAllowed) that are due today or overdue.
    const all = await this.prisma.prescription.findMany({
      where: { businessId, status: 'DISPENSED' },
      orderBy: { nextFillDate: 'asc' },
    });
    return all.filter(
      (rx) => rx.refillsUsed < rx.refillsAllowed + 1 && (!rx.nextFillDate || rx.nextFillDate <= now),
    );
  }

  // ── Interactions ─────────────────────────────────────────────────────────

  /**
   * Which pairs of the named drugs interact. Names are compared the way a pharmacist would: strengths and
   * pack words are ignored ("Warfarin 5mg tablets" is warfarin), and a brand in the drug catalogue counts as
   * its generic name. Exact-string matching missed almost every real entry.
   */
  async checkInteractions(businessId: string, drugNames: string[]) {
    requireArray(drugNames, 'drugNames');
    if (drugNames.length < 2) return [];
    const [interactions, catalogue] = await Promise.all([
      this.prisma.drugInteraction.findMany({ where: { businessId } }),
      this.prisma.drugCatalogue.findMany({ where: { businessId, isActive: true }, select: { genericName: true, brandName: true } }),
    ]);
    const brandToGeneric = new Map<string, string>();
    for (const d of catalogue) {
      if (d.brandName) brandToGeneric.set(normalizeDrugName(d.brandName), normalizeDrugName(d.genericName));
    }
    const canon = (n: string) => {
      const norm = normalizeDrugName(n);
      return brandToGeneric.get(norm) ?? norm;
    };

    const names = drugNames.map((n) => canon(String(n ?? '')));
    const found = new Map<string, (typeof interactions)[number]>();
    for (let i = 0; i < names.length; i++) {
      for (let j = i + 1; j < names.length; j++) {
        for (const it of interactions) {
          const a = canon(it.drug1Name);
          const b = canon(it.drug2Name);
          if ((sameDrug(a, names[i]) && sameDrug(b, names[j])) || (sameDrug(a, names[j]) && sameDrug(b, names[i]))) {
            found.set(it.id, it);
          }
        }
      }
    }
    return [...found.values()];
  }

  // ── Controlled-substance register ────────────────────────────────────────

  async getControlledLog(businessId: string, startDate?: string, endDate?: string) {
    return this.prisma.controlledSubstanceLog.findMany({
      where: {
        businessId,
        ...(startDate || endDate
          ? {
              dispensedAt: {
                ...(startDate ? { gte: parseFilterDate(startDate, 'start', 'Start date') } : {}),
                // A bare end date means the end of that Nairobi day, so [today, today] is today.
                ...(endDate ? { lte: parseFilterDate(endDate, 'end', 'End date') } : {}),
              },
            }
          : {}),
      },
      orderBy: { dispensedAt: 'desc' },
    });
  }

  /** A manual register entry (a dispense that did not go through a prescription). Who dispensed it is the login. */
  async addControlledLog(
    dto: {
      businessId: string;
      prescriptionId?: string;
      itemName: string;
      scheduleClass: string;
      quantityDispensed: number;
      unit: string;
      patientName: string;
      patientIdNumber?: string;
      prescriberName: string;
      prescriberLicense?: string;
      notes?: string;
    },
    actor: Actor,
  ) {
    if (dto.prescriptionId) await this.owned(dto.prescriptionId, dto.businessId);
    return this.prisma.controlledSubstanceLog.create({
      data: {
        businessId: dto.businessId,
        prescriptionId: dto.prescriptionId,
        itemName: text(dto.itemName, 'Item name', 120),
        scheduleClass: oneOf(dto.scheduleClass, 'Schedule', CONTROLLED_SCHEDULES),
        quantityDispensed: numberInRange(dto.quantityDispensed, 'Quantity dispensed', { min: 0, max: MAX_LINE_QTY, exclusiveMin: true }),
        unit: text(dto.unit, 'Unit', 30),
        patientName: text(dto.patientName, 'Patient name', 120),
        patientIdNumber: optionalText(dto.patientIdNumber, 'Patient ID number', 30),
        prescriberName: text(dto.prescriberName, 'Prescriber name', 120),
        prescriberLicense: optionalText(dto.prescriberLicense, 'Prescriber licence', 60),
        dispensedBy: actor.name,
        notes: optionalText(dto.notes, 'Notes', 500),
      },
    });
  }
}

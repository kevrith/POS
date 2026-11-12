import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { intInRange, oneOf, optionalText, text } from '../common/validate';
import { ageYears, presentPatient } from '../patients/patient-data';
import { NotificationsService } from '../notifications/notifications.service';
import { OPEN_STATUSES } from '../clinic/visit-flow';
import {
  canVerify, cleanParameters, evaluateResults, LAB_CATEGORIES, orderStatusFrom, parseParameters, parseValues, SPECIMENS,
} from './lab-results';
import { STARTER_TESTS } from './starter-tests';
import { Logger } from '@nestjs/common';

export interface Actor { id: string; name: string; role: string }
const MANAGER_ROLES = ['OWNER', 'ADMIN', 'MANAGER'];
const MAX_ATTEMPTS = 10;
const MAX_TESTS_PER_ORDER = 20;
const UNFINISHED = ['ORDERED', 'COLLECTED', 'RESULTED'];

@Injectable()
export class LabService {
  private readonly logger = new Logger(LabService.name);
  constructor(private prisma: PrismaService, private notifications: NotificationsService) {}

  // ── the catalogue ───────────────────────────────────────────────────────────────────────────────────────────────

  async tests(businessId: string, includeInactive = false) {
    const rows = await this.prisma.labTest.findMany({ where: { businessId, ...(includeInactive ? {} : { isActive: true }) }, orderBy: [{ category: 'asc' }, { name: 'asc' }] });
    return Promise.all(rows.map((t) => this.presentTest(businessId, t)));
  }

  private async presentTest(businessId: string, t: { id: string; itemId: string | null; parameters: string } & Record<string, unknown>) {
    const item = t.itemId ? await this.prisma.item.findFirst({ where: { id: t.itemId, businessId }, select: { name: true, retailPriceCents: true } }) : null;
    return { ...t, parameters: parseParameters(t.parameters), priceCents: item?.retailPriceCents ?? null, itemName: item?.name ?? null };
  }

  /** The price-list service a test is charged under: it must be a SERVICE of this business. */
  private async chargeItem(businessId: string, itemId: unknown): Promise<string | null> {
    if (itemId === undefined || itemId === null || itemId === '') return null;
    const item = await this.prisma.item.findFirst({ where: { id: text(itemId, 'Price list item', 64), businessId }, select: { id: true, type: true, name: true } });
    if (!item) throw new BadRequestException('That price list item does not exist');
    if (item.type !== 'SERVICE') throw new BadRequestException(`${item.name} is a product. A test is charged under a service in Items & Stock.`);
    return item.id;
  }

  private testData(dto: Record<string, unknown>, creating: boolean) {
    const data: Record<string, unknown> = {};
    if (creating || dto.name !== undefined) data.name = text(dto.name, 'Test name', 120);
    if (dto.code !== undefined) data.code = optionalText(dto.code, 'Code', 20)?.toUpperCase() ?? null;
    if (creating || dto.category !== undefined) data.category = oneOf(String(dto.category ?? 'OTHER').toUpperCase(), 'Category', LAB_CATEGORIES);
    if (creating || dto.specimen !== undefined) data.specimen = oneOf(String(dto.specimen ?? 'BLOOD').toUpperCase(), 'Specimen', SPECIMENS);
    if (creating || dto.parameters !== undefined) data.parameters = JSON.stringify(cleanParameters(dto.parameters));
    if (dto.turnaroundHours !== undefined) data.turnaroundHours = dto.turnaroundHours === null || dto.turnaroundHours === '' ? null : intInRange(dto.turnaroundHours, 'Turnaround (hours)', 1, 720);
    if (dto.isActive !== undefined) data.isActive = dto.isActive === true;
    return data;
  }

  async createTest(businessId: string, dto: Record<string, unknown>) {
    const data = this.testData(dto, true);
    const itemId = await this.chargeItem(businessId, dto.itemId);
    try {
      const row = await this.prisma.labTest.create({ data: { ...(data as { name: string }), businessId, itemId } });
      return this.presentTest(businessId, row);
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') throw new BadRequestException(`There is already a test called "${String(data.name)}"`);
      throw err;
    }
  }

  async updateTest(businessId: string, id: string, dto: Record<string, unknown>) {
    const data = this.testData(dto, false);
    if (dto.itemId !== undefined) data.itemId = await this.chargeItem(businessId, dto.itemId);
    if (Object.keys(data).length === 0) throw new BadRequestException('Nothing to change');
    try {
      const done = await this.prisma.labTest.updateMany({ where: { id, businessId }, data });
      if (done.count !== 1) throw new NotFoundException('Test not found');
    } catch (err) {
      if ((err as { code?: string })?.code === 'P2002') throw new BadRequestException('There is already a test with that name');
      throw err;
    }
    const row = await this.prisma.labTest.findFirst({ where: { id, businessId } });
    return this.presentTest(businessId, row!);
  }

  /** Add the common tests that are not in the catalogue yet. Existing tests are left exactly as they are. */
  async loadStarter(businessId: string) {
    const have = new Set((await this.prisma.labTest.findMany({ where: { businessId }, select: { name: true } })).map((t) => t.name.toLowerCase()));
    const missing = STARTER_TESTS.filter((t) => !have.has(t.name.toLowerCase()));
    if (missing.length > 0) {
      await this.prisma.labTest.createMany({
        data: missing.map((t) => ({ businessId, name: t.name, code: t.code, category: t.category, specimen: t.specimen, parameters: JSON.stringify(t.parameters), turnaroundHours: t.turnaroundHours ?? null })),
        skipDuplicates: true,
      });
    }
    return { added: missing.length };
  }

  // ── orders ──────────────────────────────────────────────────────────────────────────────────────────────────────

  /** L-<YYYYMMDD>-<nnn>: per business, per Nairobi day, continuing from the highest issued so a deletion never reuses a number. */
  private async nextNumber(businessId: string): Promise<string> {
    const day = new Date().toLocaleDateString('en-CA', { timeZone: 'Africa/Nairobi' }).replace(/-/g, '');
    const prefix = `L-${day}-`;
    const last = await this.prisma.labOrder.findFirst({ where: { businessId, orderNumber: { startsWith: prefix } }, orderBy: { orderNumber: 'desc' }, select: { orderNumber: true } });
    const lastSeq = last ? parseInt(last.orderNumber.slice(prefix.length), 10) : 0;
    return `${prefix}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(3, '0')}`;
  }

  /**
   * Ask for tests on the patient of an open visit. Each test that has a price on the price list is charged to the visit in the
   * same transaction, so the work is billed with the visit and cancelling the order takes the charge off again.
   */
  async createOrder(businessId: string, dto: { visitId?: string; tests?: unknown; priority?: string; clinicalNotes?: string }, actor: Actor) {
    const visit = await this.prisma.visit.findFirst({ where: { id: text(dto.visitId, 'Visit', 64), businessId } });
    if (!visit) throw new NotFoundException('Visit not found');
    if (!(OPEN_STATUSES as readonly string[]).includes(visit.status)) throw new BadRequestException('Tests can only be ordered inside an open visit. Open a visit for the patient first.');
    if (!Array.isArray(dto.tests) || dto.tests.length === 0) throw new BadRequestException('Choose at least one test');
    const ids = [...new Set(dto.tests.map((t) => text(t, 'Test', 64)))];
    if (ids.length > MAX_TESTS_PER_ORDER) throw new BadRequestException(`At most ${MAX_TESTS_PER_ORDER} tests on one order`);
    const tests = await this.prisma.labTest.findMany({ where: { businessId, id: { in: ids }, isActive: true } });
    if (tests.length !== ids.length) throw new BadRequestException('One of those tests is not in the catalogue any more');

    // The same test is not ordered twice while the first is still being done: it would be charged twice.
    const openOrders = await this.prisma.labOrder.findMany({ where: { businessId, visitId: visit.id, status: { in: UNFINISHED } }, select: { id: true } });
    const clash = openOrders.length === 0 ? null : await this.prisma.labOrderItem.findFirst({
      where: { businessId, orderId: { in: openOrders.map((o) => o.id) }, testId: { in: ids }, status: { in: ['PENDING', 'RESULTED'] } },
      select: { testName: true },
    });
    if (clash) throw new BadRequestException(`${clash.testName} has already been ordered for this visit and is not finished`);

    const priced = tests.filter((t) => t.itemId);
    const items = priced.length ? await this.prisma.item.findMany({ where: { businessId, id: { in: priced.map((t) => t.itemId as string) } } }) : [];
    const itemById = new Map(items.map((i) => [i.id, i]));
    for (const t of priced) {
      const item = itemById.get(t.itemId as string);
      if (!item || !(item.retailPriceCents > 0)) throw new BadRequestException(`${t.name} has no price on the price list. Set it in Items & Stock, or unlink the test from it.`);
    }
    const priority = dto.priority ? oneOf(String(dto.priority).toUpperCase(), 'Priority', ['NORMAL', 'URGENT'] as const) : 'NORMAL';
    const clinicalNotes = optionalText(dto.clinicalNotes, 'Clinical notes', 500) ?? null;

    for (let attempt = 1; ; attempt++) {
      const orderNumber = await this.nextNumber(businessId);
      try {
        const orderId = await this.prisma.$transaction(async (tx) => {
          const order = await tx.labOrder.create({
            data: { businessId, storeId: visit.storeId, orderNumber, patientId: visit.patientId, visitId: visit.id, priority, clinicalNotes, orderedBy: actor.id, orderedByName: actor.name },
          });
          for (const t of tests) {
            let chargeId: string | null = null;
            const item = t.itemId ? itemById.get(t.itemId) : undefined;
            if (item) {
              const charge = await tx.visitCharge.create({ data: { businessId, visitId: visit.id, itemId: item.id, name: t.name, quantity: 1, unitPriceCents: item.retailPriceCents, addedBy: actor.name } });
              chargeId = charge.id;
            }
            await tx.labOrderItem.create({ data: { businessId, orderId: order.id, testId: t.id, testName: t.name, specimen: t.specimen, parameters: t.parameters, chargeId } });
          }
          return order.id;
        });
        return this.order(businessId, orderId);
      } catch (err) {
        if ((err as { code?: string })?.code !== 'P2002' || attempt >= MAX_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 25 * attempt)));
      }
    }
  }

  private async owned(businessId: string, id: string) {
    const o = await this.prisma.labOrder.findFirst({ where: { id, businessId } });
    if (!o) throw new NotFoundException('Lab order not found');
    return o;
  }

  private async ownedItem(businessId: string, orderId: string, itemId: string) {
    const item = await this.prisma.labOrderItem.findFirst({ where: { id: itemId, orderId, businessId } });
    if (!item) throw new NotFoundException('That test is not on this order');
    return item;
  }

  /** Orders with their tests and the patient, in the shape the screens use. */
  private async presentOrders<O extends { id: string; patientId: string; visitId: string }>(businessId: string, orders: O[]) {
    if (orders.length === 0) return [];
    const [items, patients, visits] = await Promise.all([
      this.prisma.labOrderItem.findMany({ where: { businessId, orderId: { in: orders.map((o) => o.id) } }, orderBy: { createdAt: 'asc' } }),
      this.prisma.patient.findMany({ where: { businessId, id: { in: [...new Set(orders.map((o) => o.patientId))] } } }),
      this.prisma.visit.findMany({ where: { businessId, id: { in: [...new Set(orders.map((o) => o.visitId))] } }, select: { id: true, visitNumber: true } }),
    ]);
    const byPatient = new Map(patients.map((p) => [p.id, { id: p.id, name: p.name, patientNumber: p.patientNumber, sex: p.sex, ageYears: presentPatient(p).ageYears }]));
    const visitNumber = new Map(visits.map((v) => [v.id, v.visitNumber]));
    return orders.map((o) => ({
      ...o,
      patient: byPatient.get(o.patientId) ?? null,
      visitNumber: visitNumber.get(o.visitId) ?? null,
      items: items.filter((i) => i.orderId === o.id).map((i) => ({ ...i, parameters: parseParameters(i.parameters), results: parseValues(i.results) })),
    }));
  }

  async order(businessId: string, id: string) {
    const o = await this.owned(businessId, id);
    return (await this.presentOrders(businessId, [o]))[0];
  }

  async forVisit(businessId: string, visitId: string) {
    const rows = await this.prisma.labOrder.findMany({ where: { businessId, visitId }, orderBy: { createdAt: 'asc' } });
    return this.presentOrders(businessId, rows);
  }

  /** The lab's worklist: everything not yet released, urgent first then the longest wait, and what was released in the last day. */
  async board(businessId: string, storeId?: string) {
    const since = new Date(Date.now() - 24 * 3_600_000);
    const rows = await this.prisma.labOrder.findMany({
      where: { businessId, ...(storeId ? { storeId } : {}), OR: [{ status: { in: UNFINISHED } }, { status: 'VERIFIED', updatedAt: { gte: since } }] },
      orderBy: { createdAt: 'asc' },
      take: 300,
    });
    const orders = await this.presentOrders(businessId, rows);
    const open = orders.filter((o) => UNFINISHED.includes(String(o.status)))
      .sort((a, b) => (a.priority === b.priority ? 0 : a.priority === 'URGENT' ? -1 : 1));
    return { open, done: orders.filter((o) => o.status === 'VERIFIED').reverse() };
  }

  /** A patient's released results, newest first, so the doctor can compare with what they had before. */
  async history(businessId: string, patientId: string) {
    const orders = await this.prisma.labOrder.findMany({ where: { businessId, patientId }, select: { id: true, orderNumber: true } });
    if (orders.length === 0) return [];
    const items = await this.prisma.labOrderItem.findMany({ where: { businessId, orderId: { in: orders.map((o) => o.id) }, status: 'VERIFIED' }, orderBy: { verifiedAt: 'desc' }, take: 60 });
    const number = new Map(orders.map((o) => [o.id, o.orderNumber]));
    return items.map((i) => ({ id: i.id, testName: i.testName, orderNumber: number.get(i.orderId), results: parseValues(i.results), hasCritical: i.hasCritical, comment: i.comment, verifiedAt: i.verifiedAt }));
  }

  async collect(businessId: string, id: string, actor: Actor) {
    await this.owned(businessId, id);
    const done = await this.prisma.labOrder.updateMany({ where: { id, businessId, status: 'ORDERED' }, data: { status: 'COLLECTED', collectedAt: new Date(), collectedByName: actor.name } });
    if (done.count !== 1) throw new BadRequestException('The specimen for this order was already collected, or the order was cancelled');
    return this.order(businessId, id);
  }

  /** Keep the order's status in step with its tests. Runs inside the transaction that changed a test. */
  private async refreshStatus(tx: Pick<PrismaService, 'labOrder' | 'labOrderItem'>, businessId: string, orderId: string) {
    const [order, items] = await Promise.all([
      tx.labOrder.findFirst({ where: { id: orderId, businessId }, select: { status: true } }),
      tx.labOrderItem.findMany({ where: { orderId, businessId }, select: { status: true } }),
    ]);
    if (!order) return;
    const next = orderStatusFrom(order.status, items.map((i) => i.status));
    if (next !== order.status) await tx.labOrder.updateMany({ where: { id: orderId, businessId }, data: { status: next } });
  }

  /** Enter (or correct, before release) a test's results. Values are checked against the test and flagged here. */
  async saveResults(businessId: string, orderId: string, itemId: string, dto: { values?: unknown; comment?: string }, actor: Actor) {
    const order = await this.owned(businessId, orderId);
    if (order.status === 'CANCELLED') throw new BadRequestException('This order was cancelled');
    if (order.status === 'ORDERED') throw new BadRequestException('Collect the specimen before entering results');
    const item = await this.ownedItem(businessId, orderId, itemId);
    if (item.status === 'VERIFIED') throw new BadRequestException('This result has been released. A manager can send it back for correction.');
    const patient = await this.prisma.patient.findFirst({ where: { id: order.patientId, businessId }, select: { name: true, sex: true, dateOfBirth: true } });
    const { values, hasCritical } = evaluateResults(parseParameters(item.parameters), dto.values, patient?.sex, ageYears(patient?.dateOfBirth));
    const comment = optionalText(dto.comment, 'Comment', 500) ?? null;
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.labOrderItem.updateMany({
        where: { id: itemId, orderId, businessId, status: { in: ['PENDING', 'RESULTED'] } },
        data: { results: JSON.stringify(values), hasCritical, comment, status: 'RESULTED', resultedAt: new Date(), resultedById: actor.id, resultedBy: actor.name, verifiedAt: null, verifiedById: null, verifiedBy: null, criticalAckAt: null, criticalAckBy: null },
      });
      if (done.count !== 1) throw new BadRequestException('This result was just released by someone else. Reload it.');
      await this.refreshStatus(tx, businessId, orderId);
    });
    // A critical value is told to the clinicians at once, not left for someone to notice on the worklist. A failure to tell never undoes the result.
    if (hasCritical) {
      const flagged = values.filter((v) => v.flag === 'CRITICAL_LOW' || v.flag === 'CRITICAL_HIGH').map((v) => `${v.name} ${v.value}${v.unit ? ` ${v.unit}` : ''}`).join(', ');
      await this.notifications.createNotification({
        businessId, type: 'LAB_CRITICAL', priority: 'HIGH', title: `Critical result: ${item.testName}`,
        body: `${patient?.name ?? 'A patient'}: ${flagged}. Ordered by ${order.orderedByName}.`, entityId: orderId, entityType: 'LabOrder',
      }).catch((e: unknown) => this.logger.warn(`Could not announce a critical result: ${String(e)}`));
    }
    return this.order(businessId, orderId);
  }

  /** A clinician has seen a critical result. Kept with who and when, so an unseen one can be chased. */
  async acknowledgeCritical(businessId: string, orderId: string, itemId: string, actor: Actor) {
    const item = await this.ownedItem(businessId, orderId, itemId);
    if (!item.hasCritical || item.status === 'PENDING') throw new BadRequestException('This test has no critical result to acknowledge');
    const done = await this.prisma.labOrderItem.updateMany({ where: { id: itemId, orderId, businessId, hasCritical: true, criticalAckAt: null }, data: { criticalAckAt: new Date(), criticalAckBy: actor.name } });
    if (done.count !== 1) throw new BadRequestException('This critical result was already acknowledged');
    return this.order(businessId, orderId);
  }

  /** Release a result so the doctor can rely on it. A second person checks what the first entered. */
  async verify(businessId: string, orderId: string, itemId: string, actor: Actor) {
    const item = await this.ownedItem(businessId, orderId, itemId);
    if (item.status !== 'RESULTED') throw new BadRequestException(item.status === 'VERIFIED' ? 'This result is already released' : 'There are no results to release yet');
    if (!canVerify(item.resultedById, actor)) throw new ForbiddenException('Someone other than the person who entered these results must release them');
    await this.prisma.$transaction(async (tx) => {
      // Conditional on the same entry still being there, so a correction made a moment ago is not released unseen.
      const done = await tx.labOrderItem.updateMany({
        where: { id: itemId, orderId, businessId, status: 'RESULTED', resultedAt: item.resultedAt },
        data: { status: 'VERIFIED', verifiedAt: new Date(), verifiedById: actor.id, verifiedBy: actor.name },
      });
      if (done.count !== 1) throw new BadRequestException('These results were just changed. Reload and check them again.');
      await this.refreshStatus(tx, businessId, orderId);
    });
    return this.order(businessId, orderId);
  }

  /** Send a released result back for correction. Only a manager, and the reason is kept. */
  async reopen(businessId: string, orderId: string, itemId: string, reason: unknown, actor: Actor) {
    if (!MANAGER_ROLES.includes(actor.role)) throw new ForbiddenException('Only a manager can send a released result back');
    const why = text(reason, 'Reason', 300);
    await this.ownedItem(businessId, orderId, itemId);
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.labOrderItem.updateMany({
        where: { id: itemId, orderId, businessId, status: 'VERIFIED' },
        data: { status: 'RESULTED', verifiedAt: null, verifiedById: null, verifiedBy: null, amendedNote: `${actor.name}: ${why}` },
      });
      if (done.count !== 1) throw new BadRequestException('Only a released result can be sent back');
      await this.refreshStatus(tx, businessId, orderId);
    });
    return this.order(businessId, orderId);
  }

  /** Cancel an order before the specimen is taken. The charges it added to the visit come off again. */
  async cancel(businessId: string, id: string, reason: unknown) {
    const order = await this.owned(businessId, id);
    const why = text(reason, 'Reason', 200);
    await this.prisma.$transaction(async (tx) => {
      const done = await tx.labOrder.updateMany({ where: { id, businessId, status: 'ORDERED' }, data: { status: 'CANCELLED', cancelReason: why } });
      if (done.count !== 1) throw new BadRequestException('Only an order whose specimen has not been taken can be cancelled');
      const items = await tx.labOrderItem.findMany({ where: { orderId: id, businessId }, select: { chargeId: true } });
      const chargeIds = items.map((i) => i.chargeId).filter((c): c is string => !!c);
      if (chargeIds.length > 0) await tx.visitCharge.deleteMany({ where: { id: { in: chargeIds }, visitId: order.visitId, businessId } });
    });
    return this.order(businessId, id);
  }
}

import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { oneOf, optionalText, text } from '../common/validate';
import { cleanDiagnoses, parseDiagnoses } from '../clinic/diagnosis-codes';
import { ageDays, agingByProvider, claimReadiness, COVER_STATUSES, coverStanding, type CoverStanding } from './cover';

interface Actor { id: string; name: string }

const OPEN = ['SUBMITTED', 'APPROVED'];

@Injectable()
export class CoverService {
  constructor(private prisma: PrismaService) {}

  /**
   * Write down the answer to "does this insurer cover this person?". Today a person looks it up (the insurer's portal, the
   * card, a phone call) and types the result; when the insurer's own service is connected it records through here as well,
   * with its own `method`. The answer is kept with who gave it, so a claim can later be traced to the check behind it.
   */
  async recordCheck(
    businessId: string,
    dto: { patientId?: string; providerId?: string; memberNumber?: string; status?: string; reference?: string; notes?: string; visitId?: string },
    actor: Actor,
    method = 'MANUAL',
  ) {
    const patientId = text(dto.patientId, 'Patient', 64);
    const providerId = text(dto.providerId, 'Insurer', 64);
    const [patient, provider] = await Promise.all([
      this.prisma.patient.findFirst({ where: { id: patientId, businessId }, select: { id: true, insuranceProviderId: true, insuranceMemberNumber: true } }),
      this.prisma.insuranceProvider.findFirst({ where: { id: providerId, businessId, isActive: true }, select: { id: true } }),
    ]);
    if (!patient) throw new NotFoundException('Patient not found');
    if (!provider) throw new BadRequestException('That insurer is not set up here');
    const memberNumber = text(dto.memberNumber, 'Member number', 60);
    const status = oneOf(String(dto.status ?? '').toUpperCase(), 'Result', COVER_STATUSES);
    let visitId: string | null = null;
    if (dto.visitId) {
      const visit = await this.prisma.visit.findFirst({ where: { id: text(dto.visitId, 'Visit', 64), businessId, patientId }, select: { id: true } });
      if (!visit) throw new BadRequestException('That visit is not this patient\'s');
      visitId = visit.id;
    }
    const check = await this.prisma.coverCheck.create({
      data: {
        businessId, patientId, providerId, visitId, memberNumber, status, method,
        reference: optionalText(dto.reference, 'Reference', 80) ?? null,
        notes: optionalText(dto.notes, 'Notes', 300) ?? null,
        checkedBy: actor.id, checkedByName: actor.name,
      },
    });
    // A patient with no insurer on file gets the one that was just found good, so the next visit starts filled in.
    if (status === 'ELIGIBLE' && !patient.insuranceProviderId && !patient.insuranceMemberNumber) {
      await this.prisma.patient.updateMany({ where: { id: patientId, businessId }, data: { insuranceProviderId: providerId, insuranceMemberNumber: memberNumber } });
    }
    return check;
  }

  /** A patient's recent checks, newest first. */
  async checks(businessId: string, patientId: string) {
    const rows = await this.prisma.coverCheck.findMany({ where: { businessId, patientId }, orderBy: { checkedAt: 'desc' }, take: 20 });
    const providers = await this.prisma.insuranceProvider.findMany({ where: { businessId, id: { in: [...new Set(rows.map((r) => r.providerId))] } }, select: { id: true, name: true } });
    const names = new Map(providers.map((p) => [p.id, p.name]));
    return rows.map((r) => ({ ...r, providerName: names.get(r.providerId) ?? 'Insurer' }));
  }

  /** Where the patient stands with one insurer for one visit (see `coverStanding`). */
  async standingFor(businessId: string, visit: { id: string; createdAt: Date; patientId: string }, providerId: string, memberNumber: string): Promise<{ standing: CoverStanding; checkId: string | null }> {
    const rows = await this.prisma.coverCheck.findMany({ where: { businessId, patientId: visit.patientId, providerId }, orderBy: { checkedAt: 'desc' }, take: 30 });
    const standing = coverStanding(rows, visit, providerId, memberNumber);
    const used = rows.find((r) => r.status === standing && (r.visitId === visit.id || r.visitId === null));
    return { standing, checkId: used?.id ?? null };
  }

  /** The same answer for a screen: where this member stands with this insurer for this visit. */
  async standingForVisit(businessId: string, visitId: string, providerId: string, memberNumber: string) {
    const visit = await this.prisma.visit.findFirst({ where: { id: visitId, businessId }, select: { id: true, createdAt: true, patientId: true } });
    if (!visit) throw new NotFoundException('Visit not found');
    return this.standingFor(businessId, visit, providerId, memberNumber);
  }

  /** The claims, newest first, each with what still stands in the way of sending it. */
  async claims(businessId: string, opts: { status?: string; providerId?: string; q?: string; readyOnly?: boolean } = {}) {
    const rows = await this.prisma.insuranceClaim.findMany({
      where: { businessId, ...(opts.status ? { status: opts.status } : {}), ...(opts.providerId ? { providerId: opts.providerId } : {}) },
      include: { provider: true },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });
    const present = await this.present(businessId, rows);
    const q = (opts.q ?? '').trim().toLowerCase();
    return present.filter((c) => (!q || `${c.patientName} ${c.claimNumber ?? ''} ${c.memberNumber ?? ''}`.toLowerCase().includes(q)) && (!opts.readyOnly || c.problems.length === 0));
  }

  async claim(businessId: string, id: string) {
    const row = await this.prisma.insuranceClaim.findFirst({ where: { id, businessId }, include: { provider: true } });
    if (!row) throw new NotFoundException('Claim not found');
    const [summary] = await this.present(businessId, [row]);
    const lines = row.saleId
      ? (await this.prisma.saleItem.findMany({ where: { saleId: row.saleId }, select: { name: true, quantity: true, unitPriceCents: true, totalCents: true } }))
      : await this.fallbackLines(businessId, row);
    return { ...summary, lines, diagnoses: parseDiagnoses(row.diagnoses) };
  }

  /** A claim that has no sale behind it (real sales were off): its lines are the visit's charges, or the prescription's medicines. */
  private async fallbackLines(businessId: string, row: { visitId: string | null; prescriptionId: string | null }) {
    if (row.visitId) {
      const charges = await this.prisma.visitCharge.findMany({ where: { visitId: row.visitId, businessId } });
      return charges.map((c) => ({ name: c.name, quantity: c.quantity, unitPriceCents: c.unitPriceCents, totalCents: Math.round(c.unitPriceCents * c.quantity) }));
    }
    return [];
  }

  /**
   * Send a rejected claim again, usually after fixing what the insurer objected to (a member number, an ICD-11 code, a
   * pre-authorisation number). The rejection already wrote the amount off the books, so the new claim starts with no receivable:
   * if the insurer pays it, that is recovered income (the ordinary rule for a claim with no sale behind it), not a second receivable.
   * Each rejected claim can be resubmitted once; further rounds are resubmissions of the new claim if it is rejected too.
   */
  async resubmit(businessId: string, claimId: string, dto: { memberNumber?: string; preauthNumber?: string; diagnoses?: unknown } = {}) {
    const old = await this.prisma.insuranceClaim.findFirst({ where: { id: claimId, businessId } });
    if (!old) throw new NotFoundException('Claim not found');
    if (old.status !== 'REJECTED') throw new BadRequestException('Only a rejected claim can be sent again');
    if (old.resubmittedToId) throw new BadRequestException('This claim was already sent again');
    const memberNumber = dto.memberNumber === undefined ? old.patientInsuranceId : optionalText(dto.memberNumber, 'Member number', 60) ?? null;
    const preauthNumber = dto.preauthNumber === undefined ? old.preauthNumber : optionalText(dto.preauthNumber, 'Pre-authorisation number', 60) ?? null;
    const diagnoses = dto.diagnoses === undefined ? old.diagnoses : JSON.stringify(cleanDiagnoses(dto.diagnoses));
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.insuranceClaim.updateMany({ where: { id: claimId, businessId, status: 'REJECTED', resubmittedToId: null }, data: { resubmittedToId: 'pending' } });
      if (claimed.count !== 1) throw new BadRequestException('This claim was just sent again by someone else. Reload it.');
      const fresh = await tx.insuranceClaim.create({
        data: {
          businessId, prescriptionId: old.prescriptionId, visitId: old.visitId, patientId: old.patientId, providerId: old.providerId, patientInsuranceId: memberNumber,
          billedCents: old.billedCents, copayPct: old.copayPct, status: 'SUBMITTED', diagnoses, preauthNumber, coverCheckId: old.coverCheckId, saleId: null, receivableBooked: false, resubmittedFromId: old.id,
        },
      });
      await tx.insuranceClaim.updateMany({ where: { id: claimId, businessId }, data: { resubmittedToId: fresh.id } });
      return fresh;
    });
  }

  /** What each insurer still owes, by how long ago the claim was raised. */
  async aging(businessId: string) {
    const rows = await this.prisma.insuranceClaim.findMany({ where: { businessId, status: { in: OPEN } }, include: { provider: { select: { name: true } } } });
    return agingByProvider(rows.map((r) => ({ providerId: r.providerId, providerName: r.provider.name, status: r.status, billedCents: r.billedCents, approvedCents: r.approvedCents, submittedAt: r.submittedAt })));
  }

  private async present(businessId: string, rows: Array<Awaited<ReturnType<PrismaService['insuranceClaim']['findMany']>>[number] & { provider: { name: string; kind: string; requiresEligibility: boolean } }>) {
    const patientIds = [...new Set(rows.map((r) => r.patientId).filter((x): x is string => !!x))];
    const rxIds = [...new Set(rows.filter((r) => !r.patientId && r.prescriptionId).map((r) => r.prescriptionId as string))];
    const checkIds = [...new Set(rows.map((r) => r.coverCheckId).filter((x): x is string => !!x))];
    const visitIds = [...new Set(rows.map((r) => r.visitId).filter((x): x is string => !!x))];
    const [patients, prescriptions, checks, charges] = await Promise.all([
      this.prisma.patient.findMany({ where: { businessId, id: { in: patientIds } }, select: { id: true, name: true } }),
      this.prisma.prescription.findMany({ where: { businessId, id: { in: rxIds } }, select: { id: true, patientName: true } }),
      this.prisma.coverCheck.findMany({ where: { businessId, id: { in: checkIds } }, select: { id: true, status: true } }),
      this.prisma.visitCharge.groupBy({ by: ['visitId'], where: { businessId, visitId: { in: visitIds } }, _count: true }),
    ]);
    const patientName = new Map(patients.map((p) => [p.id, p.name]));
    const rxById = new Map(prescriptions.map((p) => [p.id, p]));
    const checkStatus = new Map(checks.map((c) => [c.id, c.status as CoverStanding]));
    const chargeCount = new Map(charges.map((c) => [c.visitId, c._count as unknown as number]));
    return rows.map((r) => {
      const rx = r.prescriptionId ? rxById.get(r.prescriptionId) : undefined;
      const diagnoses = parseDiagnoses(r.diagnoses);
      const lineCount = r.visitId ? chargeCount.get(r.visitId) ?? 0 : r.saleId || r.prescriptionId ? 1 : 0;
      const problems = OPEN.includes(r.status)
        ? claimReadiness({
            providerKind: r.provider.kind, requiresEligibility: r.provider.requiresEligibility && !!r.visitId,
            memberNumber: r.patientInsuranceId,
            coverStatus: r.coverCheckId ? checkStatus.get(r.coverCheckId) ?? 'NOT_CHECKED' : 'NOT_CHECKED',
            diagnoses, lineCount, fromVisit: !!r.visitId,
          })
        : [];
      return {
        id: r.id, claimNumber: r.claimNumber, status: r.status, providerId: r.providerId, providerName: r.provider.name, providerKind: r.provider.kind,
        patientId: r.patientId, patientName: (r.patientId ? patientName.get(r.patientId) : rx?.patientName) ?? 'Unknown patient',
        memberNumber: r.patientInsuranceId, visitId: r.visitId, prescriptionId: r.prescriptionId, saleId: r.saleId,
        billedCents: r.billedCents, approvedCents: r.approvedCents, paidCents: r.paidCents, copayPct: r.copayPct,
        preauthNumber: r.preauthNumber, rejectionReason: r.rejectionReason, submittedAt: r.submittedAt, paidAt: r.paidAt,
        resubmittedFromId: r.resubmittedFromId, resubmittedToId: r.resubmittedToId,
        ageDays: OPEN.includes(r.status) ? ageDays(r.submittedAt) : null,
        problems,
      };
    });
  }
}

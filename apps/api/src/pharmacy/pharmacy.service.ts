import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { buildClaimJournalLines, buildUnmatchedClaimReceiptLines } from '../sales/sale-ledger';
import { intInRange, oneOf, optionalText, text } from '../common/validate';
import { PROVIDER_KINDS } from '../cover/cover';
import { drugData, type DrugInput } from './drug-data';
import { STARTER_DRUGS, STARTER_INTERACTIONS } from './starter-data';
import { normalizeDrugName } from '../prescriptions/clinical-safety';

/** Claim statuses after which the money is settled (or written off) and the claim no longer moves. */
const CLOSED_CLAIM_STATUSES = ['PAID', 'REJECTED', 'VOIDED'];
const CLAIM_STATUSES = ['SUBMITTED', 'APPROVED', 'PAID', 'REJECTED'] as const;

@Injectable()
export class PharmacyService {
  private readonly logger = new Logger(PharmacyService.name);

  constructor(private prisma: PrismaService, private ledger: LedgerService) {}

  // ---------- Drug Interactions ----------
  async getInteractions(businessId: string) {
    return this.prisma.drugInteraction.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createInteraction(dto: {
    businessId: string;
    drug1Name: string;
    drug2Name: string;
    severity: string;
    description: string;
  }) {
    return this.prisma.drugInteraction.create({ data: dto });
  }

  async deleteInteraction(id: string) {
    return this.prisma.drugInteraction.delete({ where: { id } });
  }

  // ---------- Insurance Providers ----------
  async getProviders(businessId: string) {
    return this.prisma.insuranceProvider.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
  }

  /** The fields of an insurer a user may set, checked. Only what was sent is touched when updating. */
  private providerData(dto: Record<string, unknown>, creating: boolean) {
    const out: Record<string, unknown> = {};
    if (creating || dto.name !== undefined) out.name = text(dto.name, 'Insurer name', 120);
    if (creating || dto.code !== undefined) out.code = text(dto.code, 'Insurer code', 30).toUpperCase();
    if (dto.contactPhone !== undefined) out.contactPhone = optionalText(dto.contactPhone, 'Phone', 40) ?? null;
    if (dto.contactEmail !== undefined) out.contactEmail = optionalText(dto.contactEmail, 'Email', 120) ?? null;
    if (dto.kind !== undefined) out.kind = oneOf(String(dto.kind).toUpperCase(), 'Insurer type', PROVIDER_KINDS);
    if (dto.requiresEligibility !== undefined) out.requiresEligibility = dto.requiresEligibility === true;
    if (dto.isActive !== undefined) out.isActive = dto.isActive === true;
    return out;
  }

  async createProvider(dto: Record<string, unknown> & { businessId: string }) {
    const data = this.providerData(dto, true);
    return this.prisma.insuranceProvider.create({ data: { ...(data as { name: string; code: string }), businessId: dto.businessId } });
  }

  async updateProvider(id: string, businessId: string, dto: Record<string, unknown>) {
    const data = this.providerData(dto, false);
    const done = await this.prisma.insuranceProvider.updateMany({ where: { id, businessId }, data });
    if (done.count !== 1) throw new NotFoundException('Insurer not found');
    return this.prisma.insuranceProvider.findFirst({ where: { id, businessId } });
  }

  // ---------- Insurance Claims ----------
  async getClaims(businessId: string, status?: string) {
    return this.prisma.insuranceClaim.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      include: { provider: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createClaim(dto: {
    businessId: string;
    prescriptionId: string;
    providerId: string;
    patientInsuranceId?: string;
    billedCents: number;
    copayPct?: number;
  }) {
    // A claim raised by hand has no sale behind it: `saleId` is only ever set when a fill is invoiced.
    const { businessId, prescriptionId, providerId, patientInsuranceId, billedCents, copayPct } = dto;
    return this.prisma.insuranceClaim.create({ data: { businessId, prescriptionId, providerId, patientInsuranceId, billedCents, copayPct, status: 'SUBMITTED' } });
  }

  /**
   * Move a claim along. A claim raised from a dispensed fill (it carries `saleId`) is an amount the insurer owes the
   * pharmacy, held in Accounts Receivable since the sale, so paying it clears that receivable into the bank, and a
   * shortfall or a rejection is written off. A claim raised by hand has a receivable only once an opening balance brought
   * it in; otherwise what the insurer pays is income.
   * A paid or rejected claim is settled and does not move again, so a double click cannot post it twice.
   */
  async updateClaim(
    id: string,
    businessId: string,
    dto: {
      status?: string;
      claimNumber?: string;
      preauthNumber?: string;
      approvedCents?: number;
      paidCents?: number;
      rejectionReason?: string;
      paidAt?: Date | string;
    },
  ) {
    const claim = await this.prisma.insuranceClaim.findFirst({ where: { id, businessId } });
    if (!claim) throw new NotFoundException('Claim not found');
    if (CLOSED_CLAIM_STATUSES.includes(claim.status)) throw new BadRequestException(`A ${claim.status.toLowerCase()} claim cannot be changed`);

    // Only these fields move; anything else in the body (the amount billed, the business) is not the screen's to set.
    const data: Record<string, unknown> = {};
    if (dto.status !== undefined) data.status = oneOf(String(dto.status), 'Claim status', CLAIM_STATUSES);
    if (dto.claimNumber !== undefined) data.claimNumber = optionalText(dto.claimNumber, 'Claim number', 60) ?? null;
    if (dto.preauthNumber !== undefined) data.preauthNumber = optionalText(dto.preauthNumber, 'Pre-authorisation number', 60) ?? null;
    if (dto.approvedCents !== undefined) data.approvedCents = intInRange(dto.approvedCents, 'Amount approved', 0, 1_000_000_000);
    if (dto.rejectionReason !== undefined) data.rejectionReason = optionalText(dto.rejectionReason, 'Rejection reason', 300) ?? null;
    let paidCents = 0;
    const closing = data.status === 'PAID' || data.status === 'REJECTED';
    if (data.status === 'PAID') {
      paidCents = intInRange(dto.paidCents ?? claim.approvedCents, 'Amount paid', 0, 1_000_000_000);
      data.paidCents = paidCents;
      data.paidAt = new Date();
    }
    // Conditional on the claim still being open, so two clicks cannot both close it.
    const claimed = await this.prisma.insuranceClaim.updateMany({
      where: { id, businessId, status: { notIn: CLOSED_CLAIM_STATUSES } },
      data,
    });
    if (claimed.count !== 1) throw new BadRequestException('This claim was just changed by someone else. Reload it.');

    // A claim from a fill (or one an opening balance brought into receivables) clears that receivable. A hand-raised one
    // that never reached receivables has nothing to clear: what the insurer pays is income, and a rejection posts nothing.
    if (closing) {
      const inReceivables = !!claim.saleId || claim.receivableBooked;
      const lines = inReceivables
        ? buildClaimJournalLines(data.status === 'PAID' ? 'PAID' : 'REJECTED', claim.billedCents, paidCents)
        : data.status === 'PAID' ? buildUnmatchedClaimReceiptLines(paidCents) : [];
      if (lines.length > 0) {
        void this.ledger.autoPost({
          businessId,
          description: `Insurance claim ${claim.claimNumber ?? claim.id} ${data.status === 'PAID' ? 'paid' : 'rejected'}`,
          reference: `CLAIM-${claim.id}`,
          sourceType: 'INSURANCE_CLAIM',
          lines,
        }).catch((e: unknown) => this.logger.warn(`Ledger posting for claim ${claim.id} failed: ${String(e)}`));
      }
    }
    return this.prisma.insuranceClaim.findFirst({ where: { id, businessId }, include: { provider: true } });
  }

  // ---------- Drug list (the formulary) ----------
  // One list: what the screen calls the drug catalogue and the formulary are the same rows, so the dose limit and cautions the
  // safety check reads are on the same drug the pharmacist sees.
  getDrugs(businessId: string, search?: string) {
    return this.prisma.formularyEntry.findMany({
      where: {
        businessId,
        isActive: true,
        ...(search
          ? {
              OR: [
                { genericName: { contains: search, mode: 'insensitive' as const } },
                { brandName: { contains: search, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { genericName: 'asc' },
    });
  }

  async createDrug(businessId: string, dto: DrugInput) {
    const data = drugData(dto, true);
    await this.assertNotListed(businessId, data);
    return this.prisma.formularyEntry.create({ data: { ...(data as { genericName: string }), businessId } });
  }

  /** The same drug (generic, brand and strength) is listed once. */
  private async assertNotListed(businessId: string, data: Record<string, unknown>, exceptId?: string) {
    const clash = await this.prisma.formularyEntry.findFirst({
      where: {
        businessId,
        isActive: true,
        genericName: { equals: String(data.genericName ?? ''), mode: 'insensitive' },
        brandName: data.brandName ? { equals: String(data.brandName), mode: 'insensitive' } : null,
        strength: data.strength ? { equals: String(data.strength), mode: 'insensitive' } : null,
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash) throw new BadRequestException('That drug is already on the list');
  }

  async updateDrug(id: string, businessId: string, dto: DrugInput) {
    const current = await this.prisma.formularyEntry.findFirst({ where: { id, businessId } });
    if (!current) throw new NotFoundException('Drug not found');
    const data = drugData(dto, false);
    if (data.genericName !== undefined || data.brandName !== undefined || data.strength !== undefined) {
      await this.assertNotListed(businessId, { genericName: data.genericName ?? current.genericName, brandName: data.brandName !== undefined ? data.brandName : current.brandName, strength: data.strength !== undefined ? data.strength : current.strength }, id);
    }
    return this.prisma.formularyEntry.update({ where: { id }, data });
  }

  async deleteDrug(id: string, businessId: string) {
    const current = await this.prisma.formularyEntry.findFirst({ where: { id, businessId } });
    if (!current) throw new NotFoundException('Drug not found');
    return this.prisma.formularyEntry.update({ where: { id }, data: { isActive: false } });
  }

  /**
   * Add the starter interactions and drugs this business does not have yet. Anything already on the lists, including one the
   * pharmacist changed, is left exactly as it is, so loading it a second time adds nothing.
   */
  async loadStarterData(businessId: string) {
    const [interactions, drugs] = await Promise.all([
      this.prisma.drugInteraction.findMany({ where: { businessId }, select: { drug1Name: true, drug2Name: true } }),
      this.prisma.formularyEntry.findMany({ where: { businessId }, select: { genericName: true, brandName: true, strength: true } }),
    ]);
    const pairKey = (a: string, b: string) => [normalizeDrugName(a), normalizeDrugName(b)].sort().join('|');
    const havePairs = new Set(interactions.map((i) => pairKey(i.drug1Name, i.drug2Name)));
    const newInteractions = STARTER_INTERACTIONS.filter((i) => {
      const key = pairKey(i.drug1Name, i.drug2Name);
      if (havePairs.has(key)) return false;
      havePairs.add(key);
      return true;
    });
    const drugKey = (g: string, b?: string | null, s?: string | null) => [g, b ?? '', s ?? ''].map((x) => x.trim().toLowerCase()).join('|');
    const haveDrugs = new Set(drugs.map((d) => drugKey(d.genericName, d.brandName, d.strength)));
    // A drug the pharmacy already lists under its generic name is theirs: do not add a second row for another strength.
    const haveGenerics = new Set(drugs.map((d) => d.genericName.trim().toLowerCase()));
    const newDrugs = STARTER_DRUGS.filter((d) => !haveDrugs.has(drugKey(d.genericName, d.brandName, d.strength)) && !haveGenerics.has(d.genericName.toLowerCase()));

    if (newInteractions.length > 0) {
      await this.prisma.drugInteraction.createMany({ data: newInteractions.map((i) => ({ ...i, businessId })) });
    }
    if (newDrugs.length > 0) {
      await this.prisma.formularyEntry.createMany({
        data: newDrugs.map((d) => ({ ...d, businessId, scheduleClass: 'OTC', unit: d.unit ?? 'mg' })),
      });
    }
    return { interactionsAdded: newInteractions.length, drugsAdded: newDrugs.length };
  }

  async getClaimStats(businessId: string) {
    const [submitted, approved, paid, rejected] = await Promise.all([
      this.prisma.insuranceClaim.aggregate({ where: { businessId, status: 'SUBMITTED' }, _count: true, _sum: { billedCents: true } }),
      this.prisma.insuranceClaim.aggregate({ where: { businessId, status: 'APPROVED' }, _count: true, _sum: { approvedCents: true } }),
      this.prisma.insuranceClaim.aggregate({ where: { businessId, status: 'PAID' }, _count: true, _sum: { paidCents: true } }),
      this.prisma.insuranceClaim.aggregate({ where: { businessId, status: 'REJECTED' }, _count: true, _sum: { billedCents: true } }),
    ]);
    return { submitted, approved, paid, rejected };
  }
}

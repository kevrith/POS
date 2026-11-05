import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LedgerService } from '../ledger/ledger.service';
import { buildClaimJournalLines, buildUnmatchedClaimReceiptLines } from '../sales/sale-ledger';
import { intInRange, oneOf, optionalText } from '../common/validate';

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

  async createProvider(dto: {
    businessId: string;
    name: string;
    code: string;
    contactPhone?: string;
    contactEmail?: string;
  }) {
    return this.prisma.insuranceProvider.create({ data: dto });
  }

  async updateProvider(id: string, dto: { name?: string; code?: string; contactPhone?: string; contactEmail?: string; isActive?: boolean }) {
    return this.prisma.insuranceProvider.update({ where: { id }, data: dto });
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

  // ---------- Drug Catalogue ----------
  getDrugs(businessId: string, search?: string) {
    return this.prisma.drugCatalogue.findMany({
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

  createDrug(dto: {
    businessId: string;
    genericName: string;
    brandName?: string;
    strength?: string;
    dosageForm?: string;
    category?: string;
    scheduleClass?: string;
    defaultInstructions?: string;
  }) {
    return this.prisma.drugCatalogue.create({ data: dto });
  }

  updateDrug(id: string, dto: any) {
    return this.prisma.drugCatalogue.update({ where: { id }, data: dto });
  }

  deleteDrug(id: string) {
    return this.prisma.drugCatalogue.update({ where: { id }, data: { isActive: false } });
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

  // ── Formulary ──────────────────────────────────────────────────────────────────────────────

  getFormulary(businessId: string, search?: string) {
    return this.prisma.formularyEntry.findMany({
      where: {
        businessId,
        isActive: true,
        ...(search ? { genericName: { contains: search, mode: 'insensitive' as const } } : {}),
      },
      orderBy: { genericName: 'asc' },
    });
  }

  createFormularyEntry(businessId: string, dto: {
    genericName: string; brandName?: string; strength?: string;
    dosageForm?: string; category?: string; scheduleClass?: string;
    maxDailyDose?: number; unit?: string; contraindicationsText?: string; notes?: string;
  }) {
    return this.prisma.formularyEntry.create({ data: { businessId, ...dto } });
  }

  deleteFormularyEntry(id: string) {
    return this.prisma.formularyEntry.update({ where: { id }, data: { isActive: false } });
  }
}

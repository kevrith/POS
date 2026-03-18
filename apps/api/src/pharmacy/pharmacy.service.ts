import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PharmacyService {
  constructor(private prisma: PrismaService) {}

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
    return this.prisma.insuranceClaim.create({ data: { ...dto, status: 'SUBMITTED' } });
  }

  async updateClaim(
    id: string,
    dto: {
      status?: string;
      claimNumber?: string;
      approvedCents?: number;
      paidCents?: number;
      rejectionReason?: string;
      paidAt?: Date;
    },
  ) {
    return this.prisma.insuranceClaim.update({ where: { id }, data: dto });
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

import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { parseAllergies, parseStringList } from '../prescriptions/clinical-safety';
import { patientData, presentPatient, type PatientInput } from './patient-data';
import { requireArray, text } from '../common/validate';

const MAX_NUMBER_ATTEMPTS = 10;
const MAX_LIST = 100;

@Injectable()
export class PatientsService {
  constructor(private prisma: PrismaService) {}

  /** PT-0001, PT-0002 ... per business; continues from the highest issued, so a deletion never reuses a number. */
  private async nextNumber(businessId: string): Promise<string> {
    const last = await this.prisma.patient.findFirst({
      where: { businessId, patientNumber: { startsWith: 'PT-' } },
      orderBy: { patientNumber: 'desc' },
      select: { patientNumber: true },
    });
    const lastSeq = last ? parseInt(last.patientNumber.slice(3), 10) : 0;
    return `PT-${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(4, '0')}`;
  }

  async list(businessId: string, opts: { q?: string; limit?: number; includeInactive?: boolean } = {}) {
    const q = (opts.q ?? '').trim();
    const rows = await this.prisma.patient.findMany({
      where: {
        businessId,
        ...(opts.includeInactive ? {} : { isActive: true }),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' as const } },
                { phone: { contains: q } },
                { idNumber: { contains: q, mode: 'insensitive' as const } },
                { patientNumber: { contains: q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      orderBy: { name: 'asc' },
      take: Math.min(Math.max(opts.limit ?? 50, 1), MAX_LIST),
    });
    return rows.map(presentPatient);
  }

  private async owned(id: string, businessId: string) {
    const p = await this.prisma.patient.findFirst({ where: { id, businessId } });
    if (!p) throw new NotFoundException('Patient not found');
    return p;
  }

  /** The record with their prescriptions, newest first. */
  async get(id: string, businessId: string) {
    const p = await this.owned(id, businessId);
    const prescriptions = await this.prisma.prescription.findMany({ where: { businessId, patientId: id }, orderBy: { createdAt: 'desc' }, take: 50 });
    return { ...presentPatient(p), prescriptions };
  }

  /** The ID number is the one thing two people cannot share: a second registration is refused with the existing record named. */
  private async assertIdFree(businessId: string, idNumber: unknown, exceptId?: string) {
    if (typeof idNumber !== 'string' || !idNumber) return;
    const clash = await this.prisma.patient.findFirst({
      where: { businessId, idNumber, isActive: true, ...(exceptId ? { id: { not: exceptId } } : {}) },
      select: { patientNumber: true, name: true },
    });
    if (clash) throw new ConflictException(`ID ${idNumber} is already registered to ${clash.name} (${clash.patientNumber})`);
  }

  async create(businessId: string, dto: PatientInput) {
    const data = patientData(dto, true);
    await this.assertIdFree(businessId, data.idNumber);
    if (typeof data.insuranceProviderId === 'string') await this.assertInsurer(businessId, data.insuranceProviderId);
    for (let attempt = 1; ; attempt++) {
      const patientNumber = await this.nextNumber(businessId);
      try {
        const created = await this.prisma.patient.create({ data: { ...(data as { name: string }), businessId, patientNumber } });
        return presentPatient(created);
      } catch (err) {
        const clash = (err as { code?: string })?.code === 'P2002';
        // The same ID twice at once lands on the partial unique index: say so, do not retry for a number.
        if (clash && typeof data.idNumber === 'string' && (await this.prisma.patient.findFirst({ where: { businessId, idNumber: data.idNumber, isActive: true } }))) {
          throw new ConflictException(`ID ${data.idNumber} is already registered`);
        }
        if (!clash || attempt >= MAX_NUMBER_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 25 * attempt)));
      }
    }
  }

  private async assertInsurer(businessId: string, providerId: string) {
    const found = await this.prisma.insuranceProvider.findFirst({ where: { id: providerId, businessId }, select: { id: true } });
    if (!found) throw new BadRequestException('That insurer is not set up for this business');
  }

  async update(id: string, businessId: string, dto: PatientInput) {
    await this.owned(id, businessId);
    const data = patientData(dto, false);
    if (Object.keys(data).length === 0) throw new BadRequestException('Nothing to change');
    await this.assertIdFree(businessId, data.idNumber, id);
    if (typeof data.insuranceProviderId === 'string') await this.assertInsurer(businessId, data.insuranceProviderId);
    const updated = await this.prisma.patient.update({ where: { id }, data });
    return presentPatient(updated);
  }

  /** A patient is never deleted (their prescriptions and the controlled register name them): switched off, and the ID is freed. */
  async setActive(id: string, businessId: string, active: boolean) {
    const p = await this.owned(id, businessId);
    if (active && p.idNumber) await this.assertIdFree(businessId, p.idNumber, id);
    const updated = await this.prisma.patient.update({ where: { id }, data: { isActive: active } });
    return presentPatient(updated);
  }

  /** Records that might be the same person, for the receptionist to look at before registering a new one. */
  async possibleMatches(businessId: string, q: { name?: string; phone?: string; idNumber?: string }) {
    const or: Array<Record<string, unknown>> = [];
    if (q.idNumber?.trim()) or.push({ idNumber: q.idNumber.trim() });
    if (q.phone?.trim()) or.push({ phone: q.phone.trim() });
    if (q.name?.trim().length && q.name.trim().length >= 3) or.push({ name: { contains: q.name.trim(), mode: 'insensitive' } });
    if (or.length === 0) return [];
    const rows = await this.prisma.patient.findMany({ where: { businessId, isActive: true, OR: or }, orderBy: { name: 'asc' }, take: 10 });
    return rows.map(presentPatient);
  }

  /** Old prescriptions written before there were patient records that look like this person's (same ID, or same name and phone). */
  async unlinkedHistory(id: string, businessId: string) {
    const p = await this.owned(id, businessId);
    const or: Array<Record<string, unknown>> = [];
    if (p.idNumber) or.push({ patientIdNumber: p.idNumber });
    or.push(p.phone ? { patientName: { equals: p.name, mode: 'insensitive' }, patientPhone: p.phone } : { patientName: { equals: p.name, mode: 'insensitive' } });
    return this.prisma.prescription.findMany({ where: { businessId, patientId: null, OR: or }, orderBy: { createdAt: 'desc' }, take: 100 });
  }

  /** Attach those prescriptions to this patient. Only unlinked ones of this business move. */
  async adoptPrescriptions(id: string, businessId: string, prescriptionIds: unknown) {
    await this.owned(id, businessId);
    const ids = requireArray<string>(prescriptionIds, 'prescriptionIds').map((x) => text(x, 'Prescription', 64));
    if (ids.length === 0 || ids.length > 200) throw new BadRequestException('Choose between 1 and 200 prescriptions');
    const res = await this.prisma.prescription.updateMany({ where: { id: { in: ids }, businessId, patientId: null }, data: { patientId: id } });
    return { linked: res.count };
  }

  /** What the safety check needs from a patient, in one place (so a missing patient is handled the same everywhere). */
  async safetyFacts(businessId: string, patientId: string | null | undefined) {
    if (!patientId) return null;
    const p = await this.prisma.patient.findFirst({ where: { id: patientId, businessId } });
    if (!p) return null;
    return { id: p.id, name: p.name, allergies: parseAllergies(p.allergies), conditions: parseStringList(p.conditions), pregnant: p.pregnant, breastfeeding: p.breastfeeding, weightKg: p.weightKg };
  }
}

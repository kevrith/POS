import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PrescriptionsService {
  constructor(private prisma: PrismaService) {}

  private async generateRxNumber(businessId: string): Promise<string> {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const count = await this.prisma.prescription.count({
      where: { businessId, prescriptionNumber: { startsWith: `RX-${dateStr}` } },
    });
    const seq = String(count + 1).padStart(4, '0');
    return `RX-${dateStr}-${seq}`;
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

  async findOne(id: string) {
    return this.prisma.prescription.findUniqueOrThrow({ where: { id } });
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
    const prescriptionNumber = await this.generateRxNumber(dto.businessId);
    return this.prisma.prescription.create({
      data: {
        businessId: dto.businessId,
        storeId: dto.storeId,
        prescriptionNumber,
        patientName: dto.patientName,
        patientPhone: dto.patientPhone,
        patientDOB: dto.patientDOB,
        patientIdNumber: dto.patientIdNumber,
        doctorName: dto.doctorName,
        doctorLicense: dto.doctorLicense,
        diagnosis: dto.diagnosis,
        items: JSON.stringify(dto.items),
        notes: dto.notes,
        refillsAllowed: dto.refillsAllowed ?? 0,
      },
    });
  }

  private async deductPrescriptionInventory(rx: { id: string; businessId: string; storeId: string; prescriptionNumber: string; items: string }) {
    const items: Array<{ itemId?: string; name: string; qty: number; instructions?: string }> = (() => {
      try { return JSON.parse(rx.items); } catch { return []; }
    })();
    for (const item of items) {
      if (item.itemId && item.qty > 0) {
        try {
          await this.prisma.inventoryMovement.create({
            data: {
              offlineId: `rx-${rx.id}-${item.itemId}-${Date.now()}`,
              businessId: rx.businessId,
              storeId: rx.storeId,
              itemId: item.itemId,
              type: 'SALE',
              quantity: -item.qty,
              source: `Prescription ${rx.prescriptionNumber}`,
            },
          });
        } catch (err: any) {
          console.error('Inventory deduction error:', err?.message);
        }
      }
    }
  }

  async dispense(id: string, dispensedBy: string) {
    const rx = await this.prisma.prescription.findUniqueOrThrow({ where: { id } });
    const updated = await this.prisma.prescription.update({
      where: { id },
      data: {
        status: 'DISPENSED',
        dispensedAt: new Date(),
        dispensedBy,
        lastFillDate: new Date(),
        refillsUsed: rx.refillsUsed + 1,
      },
    });
    await this.deductPrescriptionInventory(rx);
    return updated;
  }

  async refill(id: string, dispensedBy: string) {
    const rx = await this.prisma.prescription.findUniqueOrThrow({ where: { id } });
    if (rx.status === 'CANCELLED') throw new BadRequestException('Prescription is cancelled');
    if (rx.refillsUsed >= rx.refillsAllowed) throw new BadRequestException('No refills remaining');
    const nextFill = new Date();
    nextFill.setDate(nextFill.getDate() + 30);
    const updated = await this.prisma.prescription.update({
      where: { id },
      data: {
        status: 'DISPENSED',
        dispensedAt: new Date(),
        dispensedBy,
        lastFillDate: new Date(),
        nextFillDate: nextFill,
        refillsUsed: rx.refillsUsed + 1,
      },
    });
    await this.deductPrescriptionInventory(rx);
    return updated;
  }

  async refer(id: string, referralNotes: string) {
    const rx = await this.prisma.prescription.findUniqueOrThrow({ where: { id } });
    if (rx.status !== 'PENDING') {
      throw new BadRequestException(`Cannot refer a prescription with status ${rx.status}`);
    }
    return this.prisma.prescription.update({
      where: { id },
      data: { status: 'REFERRED_EXTERNAL', referralNotes },
    });
  }

  async cancel(id: string) {
    return this.prisma.prescription.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }

  async getRefillQueue(businessId: string) {
    const now = new Date();
    // Fetch dispensed prescriptions with remaining refills due today or overdue
    const all = await this.prisma.prescription.findMany({
      where: { businessId, status: 'DISPENSED' },
      orderBy: { nextFillDate: 'asc' },
    });
    return all.filter(
      (rx) => rx.refillsUsed < rx.refillsAllowed && (!rx.nextFillDate || rx.nextFillDate <= now),
    );
  }

  async checkInteractions(businessId: string, drugNames: string[]) {
    if (drugNames.length < 2) return [];
    const interactions = await this.prisma.drugInteraction.findMany({ where: { businessId } });
    const found: any[] = [];
    for (let i = 0; i < drugNames.length; i++) {
      for (let j = i + 1; j < drugNames.length; j++) {
        const d1 = drugNames[i].toLowerCase();
        const d2 = drugNames[j].toLowerCase();
        const match = interactions.find(
          (it) =>
            (it.drug1Name.toLowerCase() === d1 && it.drug2Name.toLowerCase() === d2) ||
            (it.drug1Name.toLowerCase() === d2 && it.drug2Name.toLowerCase() === d1),
        );
        if (match) found.push(match);
      }
    }
    return found;
  }

  async getControlledLog(businessId: string, startDate?: string, endDate?: string) {
    return this.prisma.controlledSubstanceLog.findMany({
      where: {
        businessId,
        ...(startDate || endDate
          ? {
              dispensedAt: {
                ...(startDate ? { gte: new Date(startDate) } : {}),
                ...(endDate ? { lte: new Date(endDate) } : {}),
              },
            }
          : {}),
      },
      orderBy: { dispensedAt: 'desc' },
    });
  }

  async addControlledLog(dto: {
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
    dispensedBy: string;
    notes?: string;
  }) {
    return this.prisma.controlledSubstanceLog.create({ data: { ...dto } });
  }
}

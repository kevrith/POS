import { Injectable } from '@nestjs/common';
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
    doctorName: string;
    doctorLicense?: string;
    diagnosis?: string;
    items: Array<{ itemId?: string; name: string; qty: number; instructions?: string }>;
    notes?: string;
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
        doctorName: dto.doctorName,
        doctorLicense: dto.doctorLicense,
        diagnosis: dto.diagnosis,
        items: JSON.stringify(dto.items),
        notes: dto.notes,
      },
    });
  }

  async dispense(id: string, dispensedBy: string) {
    return this.prisma.prescription.update({
      where: { id },
      data: { status: 'DISPENSED', dispensedAt: new Date(), dispensedBy },
    });
  }

  async cancel(id: string) {
    return this.prisma.prescription.update({
      where: { id },
      data: { status: 'CANCELLED' },
    });
  }
}

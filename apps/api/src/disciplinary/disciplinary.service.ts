import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class DisciplinaryService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string, employeeId?: string) {
    return this.prisma.disciplinaryRecord.findMany({
      where: { businessId, ...(employeeId ? { employeeId } : {}) },
      orderBy: { createdAt: 'desc' },
      include: { employee: { include: { user: { select: { name: true } } } } },
    });
  }

  async create(dto: {
    businessId: string;
    employeeId: string;
    type: string;
    incidentDate: string;
    description: string;
    actionTaken: string;
    issuedBy: string;
  }) {
    return this.prisma.disciplinaryRecord.create({
      data: { ...dto, incidentDate: new Date(dto.incidentDate) },
    });
  }

  async acknowledge(id: string) {
    return this.prisma.disciplinaryRecord.update({
      where: { id },
      data: { employeeAck: true, ackDate: new Date() },
    });
  }
}

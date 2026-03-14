import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HousekeepingService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string, status?: string) {
    return this.prisma.housekeepingAssignment.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assign(dto: {
    businessId: string;
    roomId: string;
    employeeId: string;
    assignedBy: string;
    task?: string;
    priority?: string;
    notes?: string;
  }) {
    return this.prisma.housekeepingAssignment.create({ data: dto });
  }

  async updateStatus(id: string, status: string) {
    const data: any = { status };
    if (status === 'IN_PROGRESS') data.startedAt = new Date();
    if (status === 'DONE') data.completedAt = new Date();
    return this.prisma.housekeepingAssignment.update({ where: { id }, data });
  }
}

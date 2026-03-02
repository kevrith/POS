import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ReportSchedulesService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string) {
    return this.prisma.reportSchedule.findMany({
      where: { businessId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(dto: {
    businessId: string;
    reportType: string;
    frequency: string;
    hour: number;
    dayOfWeek?: number;
    dayOfMonth?: number;
    recipients: string[];
  }) {
    return this.prisma.reportSchedule.create({
      data: {
        businessId: dto.businessId,
        reportType: dto.reportType,
        frequency: dto.frequency,
        hour: dto.hour,
        dayOfWeek: dto.dayOfWeek,
        dayOfMonth: dto.dayOfMonth,
        recipients: JSON.stringify(dto.recipients),
        isActive: true,
      },
    });
  }

  async update(id: string, dto: { isActive?: boolean; recipients?: string[]; hour?: number }) {
    return this.prisma.reportSchedule.update({
      where: { id },
      data: {
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
        ...(dto.recipients !== undefined && { recipients: JSON.stringify(dto.recipients) }),
        ...(dto.hour !== undefined && { hour: dto.hour }),
      },
    });
  }

  async remove(id: string) {
    return this.prisma.reportSchedule.delete({ where: { id } });
  }

  /** Mark schedule as sent now (used by cron or manual trigger) */
  async markSent(id: string) {
    return this.prisma.reportSchedule.update({
      where: { id },
      data: { lastSentAt: new Date() },
    });
  }
}

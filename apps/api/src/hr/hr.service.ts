import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HrService {
  constructor(private prisma: PrismaService) {}

  async getEmployees(businessId: string) {
    return this.prisma.employee.findMany({
      where: { businessId },
      include: {
        user: { select: { name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async getAllAttendance(businessId: string, storeId: string, date: Date) {
    const start = new Date(date);
    start.setHours(0, 0, 0, 0);
    const end = new Date(date);
    end.setHours(23, 59, 59, 999);

    return this.prisma.attendanceRecord.findMany({
      where: {
        storeId,
        shiftDate: { gte: start, lte: end },
        employee: { businessId },
      },
      include: {
        employee: {
          include: { user: { select: { name: true, role: true } } },
        },
      },
      orderBy: { clockIn: 'asc' },
    });
  }

  async clockIn(data: {
    offlineId: string;
    employeeId: string;
    storeId: string;
    clockIn: Date;
    shiftDate: Date;
  }) {
    const isLate = data.clockIn.getHours() > 8;
    
    return this.prisma.attendanceRecord.create({
      data: {
        ...data,
        isLate,
      },
    });
  }

  async clockOut(attendanceId: string, clockOut: Date) {
    return this.prisma.attendanceRecord.update({
      where: { id: attendanceId },
      data: { clockOut },
    });
  }

  async getAttendance(employeeId: string, startDate: Date, endDate: Date) {
    return this.prisma.attendanceRecord.findMany({
      where: {
        employeeId,
        shiftDate: {
          gte: startDate,
          lte: endDate,
        },
      },
      orderBy: { shiftDate: 'desc' },
    });
  }

  async requestLeave(data: {
    employeeId: string;
    type: string;
    startDate: Date;
    endDate: Date;
    reason?: string;
  }) {
    return this.prisma.leave.create({ data });
  }

  async getLeaves(employeeId: string) {
    return this.prisma.leave.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getShifts(businessId: string, storeId?: string) {
    return this.prisma.shift.findMany({
      where: { businessId, ...(storeId ? { storeId } : {}) },
      orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
    });
  }

  async createShift(data: {
    businessId: string;
    storeId: string;
    employeeId: string;
    startTime: string;
    endTime: string;
    dayOfWeek: number;
  }) {
    return this.prisma.shift.create({ data });
  }

  async deleteShift(shiftId: string, businessId: string) {
    return this.prisma.shift.deleteMany({ where: { id: shiftId, businessId } });
  }

  async getEmployeeStats(employeeId: string, month: number, year: number) {
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0);

    const attendance = await this.prisma.attendanceRecord.findMany({
      where: {
        employeeId,
        shiftDate: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    const leaves = await this.prisma.leave.findMany({
      where: {
        employeeId,
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });

    return {
      daysWorked: attendance.length,
      daysLate: attendance.filter(a => a.isLate).length,
      leaveDays: leaves.reduce((sum, l) => {
        const days = Math.ceil((l.endDate.getTime() - l.startDate.getTime()) / (1000 * 60 * 60 * 24));
        return sum + days;
      }, 0),
    };
  }
}

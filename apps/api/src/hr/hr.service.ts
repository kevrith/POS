import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import * as bcrypt from 'bcrypt';

@Injectable()
export class HrService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async getEmployees(businessId: string) {
    return this.prisma.employee.findMany({
      where: { businessId },
      include: {
        user: { select: { name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createEmployee(businessId: string, dto: {
    userId: string;
    idNumber?: string;
    employmentType?: string;
    commissionRate?: number;
    commissionBasis?: string;
    salesTargetCents?: number;
    startDate?: string;
    emergencyContact?: string;
    bankName?: string;
    bankAccount?: string;
  }) {
    // Verify user belongs to this business
    const user = await this.prisma.user.findFirst({ where: { id: dto.userId, businessId } });
    if (!user) throw new BadRequestException('User not found in this business');
    // Prevent duplicate employee records
    const existing = await this.prisma.employee.findFirst({ where: { userId: dto.userId, businessId } });
    if (existing) throw new BadRequestException('Employee record already exists for this user');

    return this.prisma.employee.create({
      data: {
        userId: dto.userId,
        businessId,
        idNumber: dto.idNumber,
        employmentType: dto.employmentType ?? 'PERMANENT',
        commissionRate: dto.commissionRate ?? 0,
        commissionBasis: dto.commissionBasis ?? 'SALES_VALUE',
        salesTargetCents: dto.salesTargetCents ?? 0,
        startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
        emergencyContact: dto.emergencyContact,
      },
      include: { user: { select: { name: true, email: true, role: true } } },
    });
  }

  async updateEmployee(employeeId: string, businessId: string, dto: {
    // Employee HR fields
    commissionRate?: number;
    commissionBasis?: string;
    salesTargetCents?: number;
    commissionMilestonePercent?: number;
    employmentType?: string;
    idNumber?: string;
    emergencyContact?: string;
    startDate?: string;
    // Payroll / salary fields
    salaryBaseCents?: number;
    housingAllowanceCents?: number;
    transportAllowanceCents?: number;
    otherAllowancesCents?: number;
    saccoDeductionCents?: number;
    loanDeductionCents?: number;
    otherDeductionsCents?: number;
    bankName?: string;
    bankAccountNumber?: string;
    // User account fields (applied to linked User)
    name?: string;
    role?: string;
    pin?: string;   // raw PIN — will be hashed
    email?: string;
  }) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, businessId },
    });
    if (!employee) throw new BadRequestException('Employee not found');

    // Update Employee record
    await this.prisma.employee.update({
      where: { id: employeeId },
      data: {
        ...(dto.commissionRate !== undefined && { commissionRate: dto.commissionRate }),
        ...(dto.commissionBasis !== undefined && { commissionBasis: dto.commissionBasis }),
        ...(dto.salesTargetCents !== undefined && { salesTargetCents: dto.salesTargetCents }),
        ...(dto.commissionMilestonePercent !== undefined && { commissionMilestonePercent: dto.commissionMilestonePercent }),
        ...(dto.employmentType !== undefined && { employmentType: dto.employmentType }),
        ...(dto.idNumber !== undefined && { idNumber: dto.idNumber || null }),
        ...(dto.emergencyContact !== undefined && { emergencyContact: dto.emergencyContact || null }),
        ...(dto.startDate !== undefined && { startDate: dto.startDate ? new Date(dto.startDate) : null }),
        // Payroll fields
        ...(dto.salaryBaseCents !== undefined && { salaryBaseCents: dto.salaryBaseCents }),
        ...(dto.housingAllowanceCents !== undefined && { housingAllowanceCents: dto.housingAllowanceCents }),
        ...(dto.transportAllowanceCents !== undefined && { transportAllowanceCents: dto.transportAllowanceCents }),
        ...(dto.otherAllowancesCents !== undefined && { otherAllowancesCents: dto.otherAllowancesCents }),
        ...(dto.saccoDeductionCents !== undefined && { saccoDeductionCents: dto.saccoDeductionCents }),
        ...(dto.loanDeductionCents !== undefined && { loanDeductionCents: dto.loanDeductionCents }),
        ...(dto.otherDeductionsCents !== undefined && { otherDeductionsCents: dto.otherDeductionsCents }),
        ...(dto.bankName !== undefined && { bankName: dto.bankName || null }),
        ...(dto.bankAccountNumber !== undefined && { bankAccountNumber: dto.bankAccountNumber || null }),
      },
    });

    // Update linked User account (name, role, PIN, email)
    const userUpdate: Record<string, unknown> = {};
    if (dto.name !== undefined) userUpdate.name = dto.name;
    if (dto.role !== undefined) userUpdate.role = dto.role;
    if (dto.email !== undefined) userUpdate.email = dto.email || null;
    if (dto.pin !== undefined && dto.pin.length >= 4) {
      userUpdate.pinHash = await bcrypt.hash(dto.pin, 10);
    }

    if (Object.keys(userUpdate).length > 0) {
      await this.prisma.user.update({ where: { id: employee.userId }, data: userUpdate });
    }

    return this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: { select: { name: true, email: true, role: true } } },
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
    const leave = await this.prisma.leave.create({ data });
    // Notify managers about the pending leave request
    const employee = await this.prisma.employee.findUnique({
      where: { id: data.employeeId },
      select: { businessId: true, user: { select: { name: true } } },
    });
    if (employee) {
      this.notifications.createNotification({
        businessId: employee.businessId,
        type: 'LEAVE_REQUEST',
        priority: 'NORMAL',
        title: 'Leave Request Pending Approval',
        body: `${employee.user.name} has requested ${data.type} leave from ${data.startDate.toLocaleDateString()} to ${data.endDate.toLocaleDateString()}.`,
        entityId: leave.id,
        entityType: 'Leave',
      }).catch(() => {});
    }
    return leave;
  }

  async getLeaves(employeeId: string) {
    return this.prisma.leave.findMany({
      where: { employeeId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPendingLeaves(businessId: string) {
    return this.prisma.leave.findMany({
      where: {
        status: 'PENDING',
        employee: { businessId },
      },
      include: {
        employee: {
          include: { user: { select: { name: true, role: true } } },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async approveLeave(leaveId: string, approvedBy: string) {
    const updated = await this.prisma.leave.update({
      where: { id: leaveId },
      data: { status: 'APPROVED', approvedBy },
    });

    // Update leave balance for the approved leave
    const leave = await this.prisma.leave.findUnique({ where: { id: leaveId } });
    const duration = Math.ceil((leave.endDate.getTime() - leave.startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
    await this.prisma.leaveBalance.upsert({
      where: {
        employeeId_year_leaveType: {
          employeeId: leave.employeeId,
          year: leave.startDate.getFullYear(),
          leaveType: leave.type,
        },
      },
      create: {
        employeeId: leave.employeeId,
        year: leave.startDate.getFullYear(),
        leaveType: leave.type,
        allocatedDays: 21,
        usedDays: duration,
      },
      update: { usedDays: { increment: duration } },
    });

    return updated;
  }

  async rejectLeave(leaveId: string, approvedBy: string) {
    return this.prisma.leave.update({
      where: { id: leaveId },
      data: { status: 'REJECTED', approvedBy },
    });
  }

  async getLeaveBalances(employeeId: string, year: number) {
    return this.prisma.leaveBalance.findMany({ where: { employeeId, year } });
  }

  async allocateLeave(employeeId: string, year: number, leaveType: string, allocatedDays: number) {
    return this.prisma.leaveBalance.upsert({
      where: { employeeId_year_leaveType: { employeeId, year, leaveType } },
      create: { employeeId, year, leaveType, allocatedDays, usedDays: 0 },
      update: { allocatedDays },
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
    // Check for shift overlap
    const existing = await this.prisma.shift.findMany({
      where: { employeeId: data.employeeId, dayOfWeek: data.dayOfWeek },
    });
    for (const s of existing) {
      const newStart = data.startTime; // "HH:MM"
      const newEnd = data.endTime;
      const existStart = s.startTime;
      const existEnd = s.endTime;
      // Overlap if newStart < existEnd && newEnd > existStart
      if (newStart < existEnd && newEnd > existStart) {
        throw new BadRequestException(
          `Shift overlaps with existing shift ${s.startTime}-${s.endTime} on day ${s.dayOfWeek}`,
        );
      }
    }

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

  async getPerformanceDashboard(businessId: string, month: number, year: number) {
    const employees = await this.prisma.employee.findMany({
      where: { businessId },
      include: { user: true },
    });
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const result = await Promise.all(employees.map(async (emp) => {
      // Sales by this employee
      const sales = await this.prisma.sale.findMany({
        where: {
          cashierId: emp.userId,
          createdAt: { gte: startDate, lte: endDate },
          status: { in: ['PAID', 'AMENDED'] },
        },
        select: { totalCents: true },
      });
      const totalSalesCents = sales.reduce((s, x) => s + x.totalCents, 0);
      const salesCount = sales.length;

      // Attendance
      const attendance = await this.prisma.attendanceRecord.findMany({
        where: { employeeId: emp.id, shiftDate: { gte: startDate, lte: endDate } },
      });
      const daysWorked = attendance.length;
      const daysLate = attendance.filter(a => a.isLate).length;
      const attendanceStreak = await this._getAttendanceStreak(emp.id);

      // Commission
      const commissionCents = Math.round(totalSalesCents * (emp.commissionRate / 100));
      const targetAttainmentPct = emp.salesTargetCents
        ? Math.round((totalSalesCents / emp.salesTargetCents) * 100)
        : null;

      return {
        employeeId: emp.id,
        employeeName: emp.user.name,
        totalSalesCents,
        salesCount,
        salesTargetCents: emp.salesTargetCents ?? 0,
        targetAttainmentPct,
        commissionCents,
        commissionRate: emp.commissionRate,
        daysWorked,
        daysLate,
        attendanceStreak,
      };
    }));

    // Sort by totalSalesCents desc, mark top performer
    result.sort((a, b) => b.totalSalesCents - a.totalSalesCents);
    if (result.length > 0) (result[0] as any).isTopPerformer = true;
    return result;
  }

  private async _getAttendanceStreak(employeeId: string): Promise<number> {
    const records = await this.prisma.attendanceRecord.findMany({
      where: { employeeId },
      orderBy: { shiftDate: 'desc' },
      take: 30,
    });
    let streak = 0;
    for (const r of records) {
      if (!r.isLate) streak++;
      else break;
    }
    return streak;
  }

  async getShiftSalesReport(
    businessId: string,
    storeId: string | undefined,
    startDate: string,
    endDate: string,
  ) {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const shifts = await this.prisma.shift.findMany({
      where: { businessId, ...(storeId ? { storeId } : {}) },
    });

    const empIds = [...new Set(shifts.map(s => s.employeeId))];
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: empIds } },
      include: { user: true },
    });
    const empMap = new Map(employees.map(e => [e.id, e]));

    const result = await Promise.all(shifts.map(async (shift) => {
      const sales = await this.prisma.sale.findMany({
        where: {
          cashierId: shift.employeeId,
          businessId,
          createdAt: { gte: start, lte: end },
          status: { in: ['PAID', 'AMENDED'] },
        },
        select: { totalCents: true, createdAt: true },
      });
      // Filter sales that fall within shift hours
      const shiftSales = sales.filter(s => {
        const hour = s.createdAt.getHours();
        const [sh] = shift.startTime.split(':').map(Number);
        const [eh] = shift.endTime.split(':').map(Number);
        return hour >= sh && hour < eh;
      });
      return {
        shiftId: shift.id,
        employeeName: empMap.get(shift.employeeId)?.user?.name ?? 'Unknown',
        dayOfWeek: shift.dayOfWeek,
        startTime: shift.startTime,
        endTime: shift.endTime,
        salesCount: shiftSales.length,
        totalSalesCents: shiftSales.reduce((s, x) => s + x.totalCents, 0),
      };
    }));
    return result;
  }
}

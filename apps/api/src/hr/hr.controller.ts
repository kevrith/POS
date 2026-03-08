import { Controller, Post, Get, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { HrService } from './hr.service';
import { PayrollService } from './payroll.service';

@Controller('hr')
export class HrController {
  constructor(
    private hrService: HrService,
    private payrollService: PayrollService,
  ) {}

  @Get('employees')
  async getEmployees(@Query('businessId') businessId: string) {
    return this.hrService.getEmployees(businessId);
  }

  @Post('employees')
  async createEmployee(
    @Query('businessId') businessId: string,
    @Body() dto: {
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
    },
  ) {
    return this.hrService.createEmployee(businessId, dto);
  }

  @Patch('employees/:id')
  async updateEmployee(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
    @Body() dto: {
      commissionRate?: number;
      commissionBasis?: string;
      salesTargetCents?: number;
      commissionMilestonePercent?: number;
      employmentType?: string;
      idNumber?: string;
      emergencyContact?: string;
      startDate?: string;
      name?: string;
      role?: string;
      pin?: string;
      email?: string;
    },
  ) {
    return this.hrService.updateEmployee(id, businessId, dto);
  }

  @Post('attendance/clock-in')
  async clockIn(@Body() data: {
    offlineId: string;
    employeeId: string;
    storeId: string;
    clockIn: string;
    shiftDate: string;
  }) {
    return this.hrService.clockIn({
      ...data,
      clockIn: new Date(data.clockIn),
      shiftDate: new Date(data.shiftDate),
    });
  }

  @Patch('attendance/:id/clock-out')
  async clockOut(@Param('id') id: string, @Body('clockOut') clockOut: string) {
    return this.hrService.clockOut(id, new Date(clockOut));
  }

  @Get('attendance/:employeeId')
  async getAttendance(
    @Param('employeeId') employeeId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.hrService.getAttendance(
      employeeId,
      new Date(startDate),
      new Date(endDate),
    );
  }

  @Get('attendance')
  async getAllAttendance(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('date') date: string,
  ) {
    return this.hrService.getAllAttendance(businessId, storeId, date ? new Date(date) : new Date());
  }

  @Post('leave')
  async requestLeave(@Body() data: {
    employeeId: string;
    type: string;
    startDate: string;
    endDate: string;
    reason?: string;
  }) {
    return this.hrService.requestLeave({
      ...data,
      startDate: new Date(data.startDate),
      endDate: new Date(data.endDate),
    });
  }

  @Get('leave')
  async getPendingLeaves(@Query('businessId') businessId: string) {
    return this.hrService.getPendingLeaves(businessId);
  }

  @Get('leave/:employeeId')
  async getLeaves(@Param('employeeId') employeeId: string) {
    return this.hrService.getLeaves(employeeId);
  }

  @Patch('leave/:id/approve')
  async approveLeave(
    @Param('id') id: string,
    @Body('approvedBy') approvedBy: string,
  ) {
    return this.hrService.approveLeave(id, approvedBy);
  }

  @Patch('leave/:id/reject')
  async rejectLeave(
    @Param('id') id: string,
    @Body('approvedBy') approvedBy: string,
  ) {
    return this.hrService.rejectLeave(id, approvedBy);
  }

  @Get('leave-balance')
  getLeaveBalance(
    @Query('employeeId') employeeId: string,
    @Query('year') year: string,
  ) {
    return this.hrService.getLeaveBalances(employeeId, parseInt(year) || new Date().getFullYear());
  }

  @Post('leave-balance')
  allocateLeave(
    @Body() body: { employeeId: string; year: number; leaveType: string; allocatedDays: number },
  ) {
    return this.hrService.allocateLeave(body.employeeId, body.year, body.leaveType, body.allocatedDays);
  }

  @Get('performance')
  getPerformanceDashboard(
    @Query('businessId') businessId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    const now = new Date();
    return this.hrService.getPerformanceDashboard(
      businessId,
      parseInt(month) || now.getMonth() + 1,
      parseInt(year) || now.getFullYear(),
    );
  }

  @Get('shift-sales')
  getShiftSalesReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.hrService.getShiftSalesReport(businessId, storeId, startDate, endDate);
  }

  @Get('stats/:employeeId')
  async getEmployeeStats(
    @Param('employeeId') employeeId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.hrService.getEmployeeStats(employeeId, parseInt(month), parseInt(year));
  }

  @Get('shifts')
  async getShifts(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.hrService.getShifts(businessId, storeId);
  }

  @Post('shifts')
  async createShift(@Body() data: {
    businessId: string;
    storeId: string;
    employeeId: string;
    startTime: string;
    endTime: string;
    dayOfWeek: number;
  }) {
    return this.hrService.createShift(data);
  }

  @Delete('shifts/:id')
  async deleteShift(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
  ) {
    return this.hrService.deleteShift(id, businessId);
  }

  // ─── Payroll Routes ──────────────────────────────────────────────────────────

  @Post('payroll')
  async createPayrollRun(
    @Body() body: { businessId: string; storeId?: string; month: number; year: number },
  ) {
    return this.payrollService.createPayrollRun(body.businessId, body.storeId, body.month, body.year);
  }

  @Get('payroll')
  async getPayrollRuns(@Query('businessId') businessId: string) {
    return this.payrollService.getPayrollRuns(businessId);
  }

  @Get('payroll/employee/:employeeId')
  async getEmployeePayslips(@Param('employeeId') employeeId: string) {
    return this.payrollService.getEmployeePayslips(employeeId);
  }

  @Get('payroll/:runId/payslips')
  async getPayslipsByRun(@Param('runId') runId: string) {
    return this.payrollService.getPayslipsByRun(runId);
  }

  @Patch('payroll/:runId/approve')
  async approvePayrollRun(
    @Param('runId') runId: string,
    @Body('approvedBy') approvedBy: string,
  ) {
    return this.payrollService.approvePayrollRun(runId, approvedBy);
  }

  @Patch('payroll/:runId/paid')
  async markAsPaid(@Param('runId') runId: string) {
    return this.payrollService.markAsPaid(runId);
  }

  @Delete('payroll/:runId')
  async deletePayrollRun(@Param('runId') runId: string) {
    return this.payrollService.deletePayrollRun(runId);
  }
}

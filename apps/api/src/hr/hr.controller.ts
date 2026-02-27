import { Controller, Post, Get, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { HrService } from './hr.service';

@Controller('hr')
export class HrController {
  constructor(private hrService: HrService) {}

  @Get('employees')
  async getEmployees(@Query('businessId') businessId: string) {
    return this.hrService.getEmployees(businessId);
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

  @Get('leave/:employeeId')
  async getLeaves(@Param('employeeId') employeeId: string) {
    return this.hrService.getLeaves(employeeId);
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
}

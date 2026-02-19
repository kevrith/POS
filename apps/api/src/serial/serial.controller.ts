import { Controller, Get, Post, Body, Query, UseGuards } from '@nestjs/common';
import { SerialService } from './serial.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@Controller('serial')
@UseGuards(JwtAuthGuard, TenantGuard)
export class SerialController {
  constructor(private serialService: SerialService) {}

  @Get()
  findAll(
    @Query('businessId') businessId: string,
    @Query('itemId') itemId?: string,
  ) {
    return this.serialService.findAll(businessId, itemId);
  }

  @Get('search')
  search(
    @Query('serialNumber') serialNumber: string,
    @Query('businessId') businessId: string,
  ) {
    return this.serialService.searchSerial(serialNumber, businessId);
  }

  @Post()
  add(
    @Query('businessId') businessId: string,
    @Body() body: { itemId: string; serialNumber: string },
  ) {
    return this.serialService.addSerial(businessId, body);
  }
}

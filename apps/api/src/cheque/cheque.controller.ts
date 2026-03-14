import { Controller, Get, Post, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { ChequeService } from './cheque.service';

@Controller('payments/cheques')
export class ChequeController {
  constructor(private readonly svc: ChequeService) {}

  @Get()
  list(@Query('businessId') businessId: string, @Query('status') status: string, @Query('type') type: string) {
    return this.svc.list(businessId, status, type);
  }

  @Post()
  create(@Body() dto: any) {
    return this.svc.create(dto);
  }

  @Patch(':id/status')
  updateStatus(@Param('id') id: string, @Body('status') status: string, @Body('clearanceDate') clearanceDate?: string) {
    return this.svc.updateStatus(id, status, clearanceDate);
  }

  @Delete(':id')
  delete(@Param('id') id: string) {
    return this.svc.delete(id);
  }
}

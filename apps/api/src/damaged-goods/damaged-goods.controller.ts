import { Controller, Get, Post, Patch, Body, Param, Query, Request } from '@nestjs/common';
import { DamagedGoodsService } from './damaged-goods.service';

@Controller('damaged-goods')
export class DamagedGoodsController {
  constructor(private readonly svc: DamagedGoodsService) {}

  @Get()
  list(@Query('businessId') businessId: string, @Query('storeId') storeId: string, @Query('status') status: string) {
    return this.svc.list(businessId, storeId, status);
  }

  @Post()
  create(@Body() dto: any) {
    return this.svc.create(dto);
  }

  @Patch(':id/approve')
  approve(@Param('id') id: string, @Body('authorizedBy') authorizedBy: string) {
    return this.svc.approve(id, authorizedBy);
  }

  @Patch(':id/reject')
  reject(@Param('id') id: string, @Body('authorizedBy') authorizedBy: string) {
    return this.svc.reject(id, authorizedBy);
  }
}

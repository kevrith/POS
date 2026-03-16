import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { LayawayService } from './layaway.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { RolesGuard, RequirePermission } from '../auth/roles.guard';

@Controller('businesses/:businessId/layaway')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class LayawayController {
  constructor(private layawayService: LayawayService) {}

  @Post()
  @RequirePermission('pos.create')
  async create(@Param('businessId') businessId: string, @Body() body: unknown) {
    return this.layawayService.create(businessId, body as Parameters<LayawayService['create']>[1]);
  }

  @Post(':id/payment')
  @RequirePermission('pos.create')
  async addPayment(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body() body: { amountCents: number; method: string },
  ) {
    return this.layawayService.addPayment(id, businessId, body.amountCents, body.method);
  }

  @Get()
  @RequirePermission('pos.read')
  async findAll(@Param('businessId') businessId: string, @Query('customerId') customerId?: string) {
    return this.layawayService.findAll(businessId, customerId);
  }
}

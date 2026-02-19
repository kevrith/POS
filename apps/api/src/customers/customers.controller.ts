import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { RoleGuard, RequirePermission } from '../auth/role.guard';

@Controller('businesses/:businessId/customers')
@UseGuards(JwtAuthGuard, TenantGuard, RoleGuard)
export class CustomersController {
  constructor(private customersService: CustomersService) {}

  @Post()
  @RequirePermission('customers.create')
  async create(@Param('businessId') businessId: string, @Body() body: unknown) {
    return this.customersService.create(businessId, body as Parameters<CustomersService['create']>[1]);
  }

  @Get()
  @RequirePermission('customers.read')
  async findAll(@Param('businessId') businessId: string, @Query('search') search?: string) {
    return this.customersService.findAll(businessId, search);
  }

  @Get(':id')
  @RequirePermission('customers.read')
  async findOne(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.customersService.findOne(id, businessId);
  }
}

import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards, HttpException, HttpStatus } from '@nestjs/common';
import { CustomersService } from './customers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { RolesGuard, RequirePermission } from '../auth/roles.guard';

@Controller('businesses/:businessId/customers')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
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

  @Get('segmentation')
  @RequirePermission('customers.read')
  async segmentation(@Param('businessId') businessId: string) {
    return this.customersService.getCustomerSegmentation(businessId);
  }

  @Get('duplicates')
  @RequirePermission('customers.read')
  async findDuplicates(@Param('businessId') businessId: string) {
    return this.customersService.findDuplicates(businessId);
  }

  @Post('merge')
  @RequirePermission('customers.create')
  async merge(@Param('businessId') businessId: string, @Body() body: { primaryId: string; secondaryId: string }) {
    try {
      return await this.customersService.mergeCustomers(body.primaryId, body.secondaryId, businessId);
    } catch (err) {
      throw new HttpException((err as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('import-csv')
  @RequirePermission('customers.create')
  async importCsv(
    @Param('businessId') businessId: string,
    @Body() body: { rows: Array<{ name: string; phone?: string; email?: string; creditLimit?: number }> },
  ) {
    return this.customersService.importFromCsv(businessId, body.rows);
  }

  @Get(':id')
  @RequirePermission('customers.read')
  async findOne(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.customersService.findOne(id, businessId);
  }

  @Patch(':id/request-credit')
  @RequirePermission('customers.create')
  async requestCreditIncrease(@Param('id') id: string, @Body('requestedLimitCents') requestedLimitCents: number) {
    return this.customersService.requestCreditIncrease(id, requestedLimitCents);
  }

  @Patch(':id/approve-credit')
  @RequirePermission('customers.create')
  async approveCredit(@Param('id') id: string) {
    return this.customersService.approveCredit(id);
  }

  @Patch(':id/reject-credit')
  @RequirePermission('customers.create')
  async rejectCredit(@Param('id') id: string) {
    return this.customersService.rejectCredit(id);
  }
}

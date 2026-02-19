import { Controller, Get, Post, Body, Param, Query, UseGuards } from '@nestjs/common';
import { BatchService } from './batch.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { RoleGuard, RequirePermission } from '../auth/role.guard';

@Controller('businesses/:businessId/batch')
@UseGuards(JwtAuthGuard, TenantGuard, RoleGuard)
export class BatchController {
  constructor(private batchService: BatchService) {}

  @Post()
  @RequirePermission('inventory.create')
  async create(@Param('businessId') businessId: string, @Body() body: unknown) {
    return this.batchService.create(businessId, body as Parameters<BatchService['create']>[1]);
  }

  @Get('expiring')
  @RequirePermission('inventory.read')
  async getExpiring(@Param('businessId') businessId: string, @Query('days') days?: string) {
    return this.batchService.getExpiringBatches(businessId, parseInt(days ?? '30'));
  }

  @Post(':id/recall')
  @RequirePermission('inventory.create')
  async recall(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.batchService.recallBatch(id, businessId);
  }

  @Get('fefo/:itemId')
  @RequirePermission('inventory.read')
  async getFEFO(@Param('itemId') itemId: string) {
    return this.batchService.getBatchesFEFO(itemId);
  }

  @Get(':id/history')
  @RequirePermission('inventory.read')
  async getHistory(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.batchService.getBatchHistory(id, businessId);
  }
}

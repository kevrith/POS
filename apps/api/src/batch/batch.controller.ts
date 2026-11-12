import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { BatchService } from './batch.service';
import { BatchExpiryCronService } from './batch-expiry-cron.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { RolesGuard, RequirePermission } from '../auth/roles.guard';

@RequiresFeature(Feature.BATCH_TRACKING)
@Controller('businesses/:businessId/batch')
@UseGuards(JwtAuthGuard, TenantGuard, RolesGuard)
export class BatchController {
  constructor(
    private batchService: BatchService,
    private batchExpiryCronService: BatchExpiryCronService,
  ) {}

  @Get()
  @RequirePermission('inventory.read')
  async listAll(
    @Param('businessId') businessId: string,
    @Query('status') status?: string,
  ) {
    return this.batchService.listBatches(businessId, status);
  }

  @Post()
  @RequirePermission('inventory.create')
  async create(@Param('businessId') businessId: string, @Body() body: unknown) {
    return this.batchService.create(businessId, body as Parameters<BatchService['create']>[1]);
  }

  @Get('expiry-summary')
  @RequirePermission('inventory.read')
  async expirySummary(@Param('businessId') businessId: string) {
    return this.batchService.getExpirySummary(businessId);
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
  async getFEFO(@Param('businessId') businessId: string, @Param('itemId') itemId: string) {
    return this.batchService.getBatchesFEFO(itemId, businessId);
  }

  @Get(':id/history')
  @RequirePermission('inventory.read')
  async getHistory(@Param('businessId') businessId: string, @Param('id') id: string) {
    return this.batchService.getBatchHistory(id, businessId);
  }

  @Post('expire-writeoff')
  @RequirePermission('inventory.create')
  async manualExpireWriteoff(@Query('businessId') businessId?: string) {
    return this.batchExpiryCronService.triggerManual(businessId);
  }

  @Patch(':id/write-off')
  @RequirePermission('inventory.create')
  async writeOffBatch(
    @Param('businessId') businessId: string,
    @Param('id') id: string,
    @Body('authorizedBy') authorizedBy: string,
  ) {
    return this.batchExpiryCronService.writeOffSingleBatch(id, authorizedBy ?? 'MANAGER', businessId);
  }
}

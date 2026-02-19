import { Controller, Post, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';

@Controller('integrations')
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  @Post()
  async createIntegration(@Body() data: {
    businessId: string;
    type: string;
    name: string;
    config: Record<string, unknown>;
  }) {
    return this.integrationsService.createIntegration(data);
  }

  @Patch(':id')
  async updateIntegration(@Param('id') id: string, @Body() data: {
    name?: string;
    config?: Record<string, unknown>;
    isActive?: boolean;
  }) {
    return this.integrationsService.updateIntegration(id, data);
  }

  @Get()
  async getIntegrations(
    @Query('businessId') businessId: string,
    @Query('type') type?: string
  ) {
    return this.integrationsService.getIntegrations(businessId, type);
  }

  @Post(':id/sync-sale')
  async syncSale(@Param('id') id: string, @Body('saleId') saleId: string) {
    return this.integrationsService.syncSale(id, saleId);
  }

  @Post(':id/sync-inventory')
  async syncInventory(@Param('id') id: string, @Body('itemId') itemId: string) {
    return this.integrationsService.syncInventory(id, itemId);
  }

  @Post('webhook/:type')
  async webhookHandler(@Param('type') type: string, @Body() payload: Record<string, unknown>) {
    return this.integrationsService.webhookHandler(type, payload);
  }
}

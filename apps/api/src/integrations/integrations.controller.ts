import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { IntegrationsService } from './integrations.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('integrations')
@UseGuards(JwtAuthGuard)
export class IntegrationsController {
  constructor(private integrationsService: IntegrationsService) {}

  // ── CRUD ───────────────────────────────────────────────────────────────────

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
    @Query('type') type?: string,
  ) {
    return this.integrationsService.getIntegrations(businessId, type);
  }

  // ── Generic integration-id–based sync ─────────────────────────────────────

  @Post(':id/sync-sale')
  async syncSale(@Param('id') id: string, @Body('saleId') saleId: string) {
    return this.integrationsService.syncSale(id, saleId);
  }

  @Post(':id/sync-inventory')
  async syncInventory(@Param('id') id: string, @Body('itemId') itemId: string) {
    return this.integrationsService.syncInventory(id, itemId);
  }

  // ── Webhook (no auth required — Shopify/WooCommerce call this) ─────────────

  @Post('webhook/:type')
  async webhookHandler(@Param('type') type: string, @Body() payload: Record<string, unknown>) {
    return this.integrationsService.webhookHandler(type, payload);
  }

  // ── QuickBooks Online ──────────────────────────────────────────────────────

  /**
   * POST /integrations/quickbooks/sync-sale
   * Body: { businessId: string; saleId: string }
   *
   * Looks up the active QuickBooks integration for the business, refreshes the
   * access token via the stored refreshToken, and creates an Invoice in QBO.
   */
  @Post('quickbooks/sync-sale')
  async qbSyncSale(
    @Body('businessId') businessId: string,
    @Body('saleId') saleId: string,
  ) {
    return this.integrationsService.syncToQuickbooksBySaleId(businessId, saleId);
  }

  // ── Xero ───────────────────────────────────────────────────────────────────

  /**
   * POST /integrations/xero/sync-sale
   * Body: { businessId: string; saleId: string }
   *
   * Looks up the active Xero integration, refreshes the access token, and
   * creates an Authorised Invoice in Xero.
   */
  @Post('xero/sync-sale')
  async xeroSyncSale(
    @Body('businessId') businessId: string,
    @Body('saleId') saleId: string,
  ) {
    return this.integrationsService.syncToXeroBySaleId(businessId, saleId);
  }

  // ── Shopify ────────────────────────────────────────────────────────────────

  /**
   * POST /integrations/shopify/sync-inventory
   * Body: { businessId: string }
   *
   * Matches POS items to Shopify products by barcode and updates inventory
   * levels using the Shopify Admin REST API.
   */
  @Post('shopify/sync-inventory')
  async shopifySyncInventory(@Body('businessId') businessId: string) {
    return this.integrationsService.syncInventoryToShopify(businessId);
  }

  /**
   * POST /integrations/shopify/push-order
   * Body: { businessId: string; saleId: string }
   *
   * Pushes a completed POS sale as a paid Shopify order.
   */
  @Post('shopify/push-order')
  async shopifyPushOrder(
    @Body('businessId') businessId: string,
    @Body('saleId') saleId: string,
  ) {
    return this.integrationsService.pushOrderToShopify(businessId, saleId);
  }

  // ── WooCommerce ────────────────────────────────────────────────────────────

  /**
   * POST /integrations/woocommerce/sync-sale
   * Body: { businessId: string; saleId: string }
   *
   * Pushes a completed POS sale as a completed WooCommerce order via the
   * WooCommerce REST API (Basic auth with consumer key/secret).
   */
  @Post('woocommerce/sync-sale')
  async wcSyncSale(
    @Body('businessId') businessId: string,
    @Body('saleId') saleId: string,
  ) {
    return this.integrationsService.syncToWooCommerceBySaleId(businessId, saleId);
  }
}

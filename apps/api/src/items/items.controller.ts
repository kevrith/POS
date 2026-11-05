import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards, HttpCode,
} from '@nestjs/common';
import { ItemsService } from './items.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { ItemType } from '@pos/shared';

interface CreateVariantDto {
  name: string;
  sku?: string;
  barcode?: string;
  retailPriceCents: number;
  wholesalePriceCents?: number;
  vipPriceCents?: number;
  costPriceCents?: number;
  attributes: Record<string, string>;
}

interface CreateItemDto {
  name: string;
  type: ItemType;
  barcode?: string;
  categoryId?: string;
  categoryName?: string;
  retailPriceCents: number;
  wholesalePriceCents?: number;
  vipPriceCents?: number;
  costPriceCents?: number;
  trackStock: boolean;
  trackSerials?: boolean;
  trackBatches?: boolean;
  trackExpiry?: boolean;
  defaultExpiryDays?: number;
  taxClass?: string;
  vatApplicable?: boolean;
  totApplicable?: boolean;
  storeId: string;
  businessId: string;
  initialStock?: number;
  unit?: string;
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('items')
export class ItemsController {
  constructor(private items: ItemsService) {}

  // ── Static GET routes MUST come before @Get(':id') ──────────────────────────

  @Get()
  findAll(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('search') search?: string,
    @Query('activeOnly') activeOnly?: string,
    @Query('barcode') barcode?: string,
  ) {
    return this.items.findAll(businessId, storeId, search, activeOnly === 'true', barcode);
  }

  @Get('categories')
  getCategories(@Query('businessId') businessId: string) {
    return this.items.getCategories(businessId);
  }

  @Get('fefo-suggestions')
  async getFEFOSuggestions(
    @Query('storeId') storeId: string,
    @Query('itemIds') itemIds: string,
  ) {
    const ids = itemIds ? itemIds.split(',').filter(Boolean) : [];
    return this.items.getFEFOSuggestions(ids, storeId);
  }

  @Get('expiring')
  async getExpiringItems(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('days') days?: string,
  ) {
    return this.items.getExpiringItems(businessId, storeId, days ? Number(days) : undefined);
  }

  @Get('low-stock')
  async getLowStock(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
  ) {
    return this.items.getLowStock(businessId, storeId);
  }

  // ── Parameterised routes AFTER static routes ─────────────────────────────────

  @Get(':id')
  findOne(@Param('id') id: string, @Query('businessId') businessId: string) {
    return this.items.findOne(id, businessId);
  }

  @Get(':id/variants')
  listVariants(
    @Param('id') itemId: string,
    @Query('businessId') businessId: string,
  ) {
    return this.items.listVariants(itemId, businessId);
  }

  // ── POST routes ───────────────────────────────────────────────────────────────

  @Post()
  create(@Body() dto: CreateItemDto) {
    return this.items.create(dto);
  }

  @Post('categories')
  createCategory(
    @Query('businessId') businessId: string,
    @Body() body: { name: string; color?: string },
  ) {
    return this.items.createCategory(businessId, body.name, body.color);
  }

  @Patch('categories/:id')
  updateCategory(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
    @Body() body: { name?: string; color?: string; sortOrder?: number },
  ) {
    return this.items.updateCategory(id, businessId, body);
  }

  @Delete('categories/:id')
  deleteCategory(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
  ) {
    return this.items.deleteCategory(id, businessId);
  }

  @Post('import')
  importBulk(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Body() body: { items: CreateItemDto[] },
  ) {
    return this.items.importBulk(businessId, storeId, body.items);
  }

  @Post('import-csv')
  async importCsv(@Body() data: {
    businessId: string;
    storeId: string;
    rows: Array<{
      name: string;
      category?: string;
      retailPrice: number;
      costPrice?: number;
      barcode?: string;
      currentStock?: number;
      expiryDate?: string;
      lotNumber?: string;
    }>;
  }) {
    return this.items.importFromCsv(data.businessId, data.storeId, data.rows);
  }

  @Post('gs1-decode')
  decodeGS1(@Body('barcode') barcode: string) {
    return this.items.decodeGS1Barcode(barcode);
  }

  @Post('check-expiry')
  async checkCartExpiry(
    @Body() body: { itemIds: string[]; storeId: string; businessId: string },
  ) {
    return this.items.checkCartExpiry(body.itemIds, body.storeId, body.businessId);
  }

  @Post(':id/variants')
  createVariant(
    @Param('id') itemId: string,
    @Query('businessId') businessId: string,
    @Body() dto: CreateVariantDto,
  ) {
    return this.items.createVariant(itemId, businessId, dto);
  }

  // ── PATCH / DELETE ────────────────────────────────────────────────────────────

  /** Set the tax class of many items. Before `:id`, so "tax-class" is not read as an item id. */
  @Patch('tax-class')
  setTaxClass(
    @Query('businessId') businessId: string,
    @Body() body: { itemIds: string[]; taxClass: string },
  ) {
    return this.items.setTaxClass(businessId, body?.itemIds, body?.taxClass);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
    @Body() dto: Partial<CreateItemDto>,
  ) {
    return this.items.update(id, businessId, dto);
  }

  @Patch(':id/variants/:variantId')
  updateVariant(
    @Param('id') itemId: string,
    @Param('variantId') variantId: string,
    @Query('businessId') businessId: string,
    @Body() dto: Partial<CreateVariantDto>,
  ) {
    return this.items.updateVariant(itemId, variantId, businessId, dto);
  }

  @Patch(':id/toggle-active')
  toggleActive(@Param('id') id: string, @Query('businessId') businessId: string) {
    return this.items.toggleActive(id, businessId);
  }

  @Patch(':id/86')
  @UseGuards(JwtAuthGuard)
  async toggle86(@Param('id') id: string, @Query('businessId') businessId: string) {
    return this.items.toggle86(id, businessId);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Query('businessId') businessId: string) {
    return this.items.softDelete(id, businessId);
  }

  @Delete(':id/variants/:variantId')
  @HttpCode(204)
  deleteVariant(
    @Param('id') itemId: string,
    @Param('variantId') variantId: string,
    @Query('businessId') businessId: string,
  ) {
    return this.items.deleteVariant(itemId, variantId, businessId);
  }

  // ── Item UOM (packaging / units of measure) ────────────────────────────────
  @Get(':id/uoms')
  getUOMs(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
  ) {
    return this.items.getUOMs(id, businessId);
  }

  @Post(':id/uoms')
  createUOM(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
    @Body() body: { unitName: string; unitAbbrev: string; conversionFactor: number; isBaseUnit?: boolean; priceCents?: number; barcode?: string },
  ) {
    return this.items.createUOM(id, businessId, body);
  }

  @Patch(':id/uoms/:uomId')
  updateUOM(
    @Param('id') id: string,
    @Param('uomId') uomId: string,
    @Query('businessId') businessId: string,
    @Body() body: Partial<{ unitName: string; unitAbbrev: string; conversionFactor: number; isBaseUnit: boolean; priceCents: number; barcode: string }>,
  ) {
    return this.items.updateUOM(id, uomId, businessId, body);
  }

  @Delete(':id/uoms/:uomId')
  deleteUOM(
    @Param('id') id: string,
    @Param('uomId') uomId: string,
    @Query('businessId') businessId: string,
  ) {
    return this.items.deleteUOM(uomId, id, businessId);
  }
}

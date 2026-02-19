import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { ItemsService } from './items.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { ItemType } from '@pos/shared';

interface CreateItemDto {
  name: string;
  type: ItemType;
  barcode?: string;
  categoryId?: string;
  retailPriceCents: number;
  wholesalePriceCents?: number;
  vipPriceCents?: number;
  costPriceCents?: number;
  trackStock: boolean;
  trackSerials?: boolean;
  trackBatches?: boolean;
  trackExpiry?: boolean;
  defaultExpiryDays?: number;
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

  @Get()
  findAll(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('search') search?: string,
  ) {
    return this.items.findAll(businessId, storeId, search);
  }

  @Get('categories')
  getCategories(@Query('businessId') businessId: string) {
    return this.items.getCategories(businessId);
  }

  @Get(':id')
  findOne(@Param('id') id: string, @Query('businessId') businessId: string) {
    return this.items.findOne(id, businessId);
  }

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

  @Post('import')
  importBulk(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Body() body: { items: CreateItemDto[] },
  ) {
    return this.items.importBulk(businessId, storeId, body.items);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
    @Body() dto: Partial<CreateItemDto>,
  ) {
    return this.items.update(id, businessId, dto);
  }

  @Delete(':id')
  remove(@Param('id') id: string, @Query('businessId') businessId: string) {
    return this.items.softDelete(id, businessId);
  }
}

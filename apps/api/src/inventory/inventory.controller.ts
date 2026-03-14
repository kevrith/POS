import { Controller, Get, Post, Body, Query, Param, UseGuards } from '@nestjs/common';
import { InventoryService } from './inventory.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { InventoryMovementType } from '@pos/shared';

interface CreateMovementDto {
  itemId: string;
  storeId: string;
  businessId: string;
  type: InventoryMovementType;
  quantity: number;
  notes?: string;
}

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('inventory')
export class InventoryController {
  constructor(private inventory: InventoryService) {}

  @Get('stock/:itemId')
  async getStock(
    @Param('itemId') itemId: string,
    @Query('storeId') storeId: string,
  ): Promise<{ stock: number }> {
    const stock = await this.inventory.getStockLevel(itemId, storeId);
    return { stock };
  }

  @Get('movements/:itemId')
  async getMovements(
    @Param('itemId') itemId: string,
    @Query('storeId') storeId: string,
    @Query('limit') limit?: string,
  ) {
    return this.inventory.getMovementHistory(itemId, storeId, limit ? parseInt(limit) : 50);
  }

  @Post('adjustment')
  async createAdjustment(@Body() dto: CreateMovementDto) {
    await this.inventory.createMovement(dto);
    return { success: true };
  }

  @Get('variant-stock')
  getVariantStockLevel(@Query('variantId') variantId: string, @Query('storeId') storeId: string) {
    return this.inventory.getVariantStockLevel(variantId, storeId);
  }
}

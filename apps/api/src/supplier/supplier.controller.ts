import { Controller, Post, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { SupplierService } from './supplier.service';

@Controller('suppliers')
export class SupplierController {
  constructor(private supplierService: SupplierService) {}

  @Post()
  async create(@Body() data: {
    businessId: string;
    name: string;
    contact?: string;
    address?: string;
    paymentTerms?: string;
    creditLimitCents?: number;
  }) {
    return this.supplierService.create(data);
  }

  @Get()
  async findAll(@Query('businessId') businessId: string) {
    return this.supplierService.findAll(businessId);
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.supplierService.findOne(id);
  }

  @Patch(':id')
  async update(@Param('id') id: string, @Body() data: Partial<{
    name: string;
    contact: string;
    address: string;
    paymentTerms: string;
    creditLimitCents: number;
  }>) {
    return this.supplierService.update(id, data);
  }

  @Get(':id/ledger')
  async getLedger(@Param('id') id: string) {
    return this.supplierService.getLedger(id);
  }

  // ── Purchase Orders ──────────────────────────────────────────────────────────

  @Post('purchase-orders')
  async createPO(@Body() data: {
    businessId: string;
    supplierId: string;
    expectedDelivery?: string;
    notes?: string;
    items: Array<{
      itemId: string;
      quantityOrdered: number;
      agreedPriceCents: number;
    }>;
  }) {
    return this.supplierService.createPO(data);
  }

  @Get('purchase-orders')
  async listPOs(
    @Query('businessId') businessId: string,
    @Query('supplierId') supplierId?: string,
    @Query('status') status?: string,
  ) {
    return this.supplierService.listPOs(businessId, { supplierId, status });
  }

  @Get('purchase-orders/:id')
  async getPO(@Param('id') id: string) {
    return this.supplierService.getPO(id);
  }

  @Patch('purchase-orders/:id/status')
  async updatePOStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.supplierService.updatePOStatus(id, status);
  }

  // ── Goods Received Notes ─────────────────────────────────────────────────────

  @Post('purchase-orders/:id/grn')
  async createGRN(
    @Param('id') id: string,
    @Body() body: {
      storeId: string;
      items: Array<{
        poItemId: string;
        quantityReceived: number;
        batchLotNumber?: string;
        expiryDate?: string;
      }>;
    },
  ) {
    return this.supplierService.createGRN(id, body.storeId, body.items);
  }
}

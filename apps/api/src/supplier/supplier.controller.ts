import { Controller, Post, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { SupplierService } from './supplier.service';


@Controller('suppliers')
export class SupplierController {
  constructor(private supplierService: SupplierService) {}

  // ── Suppliers ─────────────────────────────────────────────────────────────────

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

  // ── Purchase Orders (static routes MUST come before :id) ─────────────────────

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

  @Post('purchase-orders/:id/email')
  async emailPO(
    @Param('id') id: string,
    @Body('recipientEmail') recipientEmail: string,
  ) {
    return this.supplierService.emailPO(id, recipientEmail);
  }

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

  @Patch('purchase-orders/:id/invoice')
  async invoicePO(@Param('id') id: string, @Body() body: { invoiceNumber: string }) {
    return this.supplierService.invoicePO(id, body.invoiceNumber);
  }

  @Get('purchase-orders/:id/print-text')
  async printPO(@Param('id') id: string) {
    const text = await this.supplierService.generatePOText(id);
    return { text };
  }

  @Post('purchase-orders/:id/close')
  async closePO(@Param('id') id: string) {
    await this.supplierService.closePO(id);
    return { success: true };
  }

  // ── Credit Notes (static routes MUST come before :id) ────────────────────────

  @Post('credit-notes')
  async createCreditNote(@Body() body: {
    businessId: string;
    supplierId: string;
    amountCents: number;
    reason: string;
  }) {
    return this.supplierService.createCreditNote(body);
  }

  @Get('credit-notes')
  async getCreditNotes(
    @Query('businessId') businessId: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.supplierService.getCreditNotes(businessId, supplierId);
  }

  @Patch('credit-notes/:id/apply')
  async applyCreditNote(@Param('id') id: string, @Body('poId') poId: string) {
    return this.supplierService.applyCreditNote(id, poId);
  }

  @Patch('credit-notes/:id/void')
  async voidCreditNote(@Param('id') id: string) {
    return this.supplierService.voidCreditNote(id);
  }

  // ── Other static routes ───────────────────────────────────────────────────────

  @Get('outstanding-pos')
  async getOutstandingPOs(@Query('businessId') businessId: string) {
    return this.supplierService.getOutstandingPOs(businessId);
  }

  // ── Supplier by ID (parameterised — must be LAST) ─────────────────────────────

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
}

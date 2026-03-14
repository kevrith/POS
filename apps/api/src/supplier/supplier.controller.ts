import { Controller, Post, Get, Patch, Delete, Body, Param, Query, BadRequestException } from '@nestjs/common';
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

  // ── Supplier Returns ──────────────────────────────────────────────────────────

  @Get('returns')
  async getReturns(@Query('businessId') businessId: string, @Query('supplierId') supplierId?: string) {
    return this.supplierService.getSupplierReturns(businessId, supplierId);
  }

  @Post('returns')
  async createReturn(@Body() body: any) {
    const { businessId, ...rest } = body;
    return this.supplierService.createSupplierReturn(businessId, rest);
  }

  @Patch('returns/:id/status')
  async updateReturnStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.supplierService.updateReturnStatus(id, body.status);
  }

  // ── Supplier Invoices ──────────────────────────────────────────────────────────

  @Get('invoices')
  async getInvoices(@Query('businessId') businessId: string, @Query('supplierId') supplierId?: string) {
    return this.supplierService.getSupplierInvoices(businessId, supplierId);
  }

  @Post('invoices')
  async createInvoice(@Body() body: any) {
    const { businessId, ...rest } = body;
    return this.supplierService.createSupplierInvoice(businessId, rest);
  }

  @Patch('invoices/:id/status')
  async updateInvoiceStatus(@Param('id') id: string, @Body() body: { status: string }) {
    return this.supplierService.updateInvoiceStatus(id, body.status);
  }

  @Get('purchase-orders/:id/three-way-match')
  async threeWayMatch(@Param('id') id: string, @Query('businessId') businessId: string) {
    return this.supplierService.threeWayMatch(businessId, id);
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

  @Post('auto-reorder')
  async autoReorder(
    @Body() body: { businessId: string; storeId: string; supplierId?: string },
  ) {
    return this.supplierService.autoReorderCheck(body.businessId, body.storeId, body.supplierId);
  }

  // ── Price Agreements ──────────────────────────────────────────────────────

  @Get(':id/price-agreements')
  async listPriceAgreements(@Param('id') id: string, @Query('businessId') businessId: string) {
    return this.supplierService.listPriceAgreements(id, businessId);
  }

  @Post(':id/price-agreements')
  async createPriceAgreement(@Param('id') id: string, @Body() dto: any) {
    return this.supplierService.createPriceAgreement(id, dto);
  }

  @Delete('price-agreements/:id')
  async deactivatePriceAgreement(@Param('id') id: string) {
    return this.supplierService.deactivatePriceAgreement(id);
  }

  // ── Price Agreements (global listing) ────────────────────────────────────────

  @Get('price-agreements')
  async getPriceAgreements(
    @Query('businessId') businessId: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.supplierService.getPriceAgreements(businessId, supplierId);
  }

  @Post('price-agreements')
  async createPriceAgreementGlobal(@Body() dto: any) {
    const { supplierId, ...rest } = dto;
    return this.supplierService.createPriceAgreement(supplierId, rest);
  }

  @Delete('price-agreements-delete/:id')
  async deletePriceAgreement(@Param('id') id: string) {
    return this.supplierService.deletePriceAgreement(id);
  }

  // ── Landed Cost Allocation ────────────────────────────────────────────────────

  @Post('grn/:id/landed-cost')
  async allocateLandedCost(
    @Param('id') id: string,
    @Body() body: { totalFreightCents: number; method?: 'PROPORTIONAL' | 'EQUAL' },
  ) {
    try {
      return await this.supplierService.allocateLandedCost(id, body.totalFreightCents, body.method ?? 'PROPORTIONAL');
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }
}

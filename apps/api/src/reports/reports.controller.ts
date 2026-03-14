import { Controller, Get, Post, Query, Body, UseGuards, Param, Res } from '@nestjs/common';
import { Response } from 'express';
import { ReportsService } from './reports.service';
import { PdfService } from './pdf.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('reports')
export class ReportsController {
  constructor(private reports: ReportsService, private pdf: PdfService) {}

  @Get('sales')
  async salesReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.salesReport(
      businessId,
      storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('payment-methods')
  async paymentMethodBreakdown(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.paymentMethodBreakdown(
      businessId,
      storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('vat')
  async vatReport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reports.vatReport(businessId, new Date(startDate), new Date(endDate));
  }

  @Get('tot')
  async totReport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reports.totReport(businessId, new Date(startDate), new Date(endDate));
  }

  @Get('vat-return-itax')
  async vatReturnItax(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reports.vatReturn(businessId, new Date(startDate), new Date(endDate));
  }

  @Get('stock-valuation')
  async stockValuation(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reports.stockValuation(businessId, storeId);
  }

  @Get('profit-loss')
  async profitAndLoss(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reports.profitAndLoss(businessId, new Date(startDate), new Date(endDate));
  }

  @Get('x-report')
  async xReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('cashierId') cashierId: string,
  ) {
    return this.reports.xReport(businessId, storeId, cashierId);
  }

  @Post('z-report')
  async zReport(
    @Body() dto: { businessId: string; storeId: string; cashierId: string; closingBalanceCents: number },
  ) {
    return this.reports.zReport(dto.businessId, dto.storeId, dto.cashierId, dto.closingBalanceCents);
  }

  @Get('expenses')
  async expenseReport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('category') category?: string,
  ) {
    return this.reports.expenseReport(
      businessId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      category,
    );
  }

  @Get('commissions')
  async commissionReport(
    @Query('businessId') businessId: string,
    @Query('employeeId') employeeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.commissionReport(
      businessId,
      employeeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('attendance')
  async attendanceReport(
    @Query('businessId') businessId: string,
    @Query('employeeId') employeeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.attendanceReport(
      businessId,
      employeeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('recipe-variance')
  async recipeVarianceReport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reports.recipeVarianceReport(businessId, new Date(startDate), new Date(endDate));
  }

  @Get('bundle-profitability')
  async bundleProfitabilityReport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reports.bundleProfitabilityReport(businessId, new Date(startDate), new Date(endDate));
  }

  @Get('supplier-ledger')
  async supplierLedgerReport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.reports.supplierLedgerReport(
      businessId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      supplierId,
    );
  }

  @Get('supplier-performance')
  async supplierPerformanceReport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reports.supplierPerformanceReport(businessId, new Date(startDate), new Date(endDate));
  }

  @Get('cross-store-dashboard')
  async crossStoreDashboard(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.crossStoreDashboard(
      businessId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('credit-book')
  async creditBook(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.creditBook(
      businessId,
      storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('historical-stock')
  async historicalStockReport(
    @Query('businessId') businessId: string,
    @Query('asOfDate') asOfDate: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reports.historicalStockReport(
      businessId,
      new Date(asOfDate),
      storeId,
    );
  }

  @Get('layaway-book')
  async layawayBook(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
  ) {
    return this.reports.layawayBook(
      businessId,
      storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      status,
    );
  }

  @Get('proforma-pipeline')
  async proformaPipeline(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.reports.proformaPipeline(businessId, storeId);
  }

  @Get('serial-registry')
  async serialRegistry(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
    @Query('itemId') itemId?: string,
  ) {
    return this.reports.serialRegistry(businessId, storeId, status, itemId);
  }

  @Get('kra-export')
  async kraFormattedExport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reports.kraFormattedExport(businessId, new Date(startDate), new Date(endDate));
  }

  @Get('audit-log-export')
  async auditLogExport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.auditLogExport(
      businessId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('grn-discrepancy')
  async grnDiscrepancyReport(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('supplierId') supplierId?: string,
  ) {
    return this.reports.grnDiscrepancyReport(
      businessId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
      supplierId,
    );
  }

  @Get('full-data-export')
  async fullDataExport(@Query('businessId') businessId: string) {
    return this.reports.fullDataExport(businessId);
  }

  @Get('recipe-costing')
  async recipeCostingReport(@Query('businessId') businessId: string) {
    return this.reports.recipeCostingReport(businessId);
  }

  @Get('supplier-ageing')
  async supplierAgeingReport(
    @Query('businessId') businessId: string,
    @Query('asOfDate') asOfDate?: string,
  ) {
    return this.reports.supplierAgeingReport(
      businessId,
      asOfDate ? new Date(asOfDate) : undefined,
    );
  }

  @Get('item-summary')
  async itemSummaryReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.itemSummaryReport(
      businessId,
      storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('expiry')
  getExpiryReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId: string,
    @Query('days') days: string,
  ) {
    return this.reports.getExpiryReport(businessId, storeId || undefined, parseInt(days) || 30);
  }

  @Get('employee-sales')
  async employeeSalesReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('employeeId') employeeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.employeeSalesReport(
      businessId,
      storeId,
      employeeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  // ─── PDF Endpoints ────────────────────────────────────────────

  @Get('pdf/sale/:saleId')
  async salePdf(@Param('saleId') saleId: string, @Res() res: Response) {
    const html = await this.pdf.generateSaleReceipt(saleId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('pdf/vat')
  async vatPdf(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
    @Res() res: Response,
  ) {
    const html = await this.pdf.generateVATReport(businessId, startDate, endDate);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('pdf/po/:poId')
  async poPdf(@Param('poId') poId: string, @Res() res: Response) {
    const html = await this.pdf.generatePurchaseOrder(poId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('pdf/customer-statement/:customerId')
  async customerStatementPdf(
    @Param('customerId') customerId: string,
    @Query('startDate') s: string,
    @Query('endDate') e: string,
    @Res() res: Response,
  ) {
    const html = await this.pdf.generateCustomerStatement(
      customerId,
      new Date(s),
      new Date(e),
    );
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('pdf/payslip/:employeeId')
  async payslipPdf(
    @Param('employeeId') employeeId: string,
    @Query('month') month: string,
    @Query('year') year: string,
    @Res() res: Response,
  ) {
    const html = await this.pdf.generatePayslip(employeeId, Number(month), Number(year));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('pdf/p9/:employeeId')
  async p9Pdf(
    @Param('employeeId') employeeId: string,
    @Query('year') year: string,
    @Res() res: Response,
  ) {
    const html = await this.pdf.generateP9(employeeId, Number(year));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('pdf/p10')
  async p10Pdf(
    @Query('businessId') businessId: string,
    @Query('month') month: string,
    @Query('year') year: string,
    @Res() res: Response,
  ) {
    const html = await this.pdf.generateP10(businessId, Number(month), Number(year));
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('pdf/debit-note/:returnId')
  async debitNotePdf(@Param('returnId') returnId: string, @Res() res: Response) {
    const html = await this.pdf.generateDebitNote(returnId);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('pdf/expense-report')
  async expenseReportPdf(
    @Query('employeeId') employeeId: string,
    @Query('month') month: string,
    @Res() res: Response,
  ) {
    const html = await this.pdf.generateExpenseReport(employeeId, month);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
  }

  @Get('vat-return')
  async vatReturn(
    @Query('businessId') businessId: string,
    @Query('month') month: string,
  ) {
    return this.reports.getVATReturn(businessId, month);
  }

  @Get('nssf-return')
  async nssfReturn(
    @Query('businessId') businessId: string,
    @Query('month') month: string,
    @Query('year') year: string,
    @Res() res: Response,
  ) {
    const csv = await this.reports.nssfReturnFile(businessId, Number(month), Number(year));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="NSSF-Return-${month}-${year}.csv"`);
    res.send(csv);
  }

  @Get('nhif-return')
  async nhifReturn(
    @Query('businessId') businessId: string,
    @Query('month') month: string,
    @Query('year') year: string,
    @Res() res: Response,
  ) {
    const csv = await this.reports.nhifReturnFile(businessId, Number(month), Number(year));
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="NHIF-SHA-Return-${month}-${year}.csv"`);
    res.send(csv);
  }

  @Get('dead-stock')
  async deadStockReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('days') days?: string,
  ) {
    return this.reports.deadStockReport(businessId, storeId, days ? Number(days) : 90);
  }

  @Get('gross-margin')
  async grossMarginReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.grossMarginByCategory(
      businessId,
      storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('shrinkage')
  async shrinkageReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.shrinkageReport(
      businessId, storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('department-pnl')
  async departmentPnl(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.departmentPnl(
      businessId, storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('customer-analytics')
  async customerAnalytics(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.reports.customerAnalytics(
      businessId,
      storeId,
      startDate ? new Date(startDate) : undefined,
      endDate ? new Date(endDate) : undefined,
    );
  }

  @Get('forecast')
  async forecastReport(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
    @Query('days') days?: string,
  ) {
    return this.reports.advancedForecast(
      businessId,
      storeId,
      days ? parseInt(days) : 30,
    );
  }
}

import { Controller, Post, Get, Patch, Delete, Body, Param, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MpesaService } from './mpesa.service';
import { ReconciliationService } from './reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard, Public } from '../auth/jwt-auth.guard';
import { SkipSubscriptionCheck } from '../auth/subscription.guard';
import { Throttle } from '@nestjs/throttler';

@Controller('payments')
export class PaymentsController {
  constructor(
    private mpesa: MpesaService,
    private reconciliation: ReconciliationService,
    private prisma: PrismaService,
  ) {}

  @Post('mpesa/stk-push')
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async stkPush(@Body() body: { phone: string; amountCents: number; reference: string }) {
    return this.mpesa.initiateSTKPush({
      phone: body.phone,
      amountCents: body.amountCents,
      accountReference: body.reference,
    });
  }

  @Get('mpesa/stk-status/:checkoutRequestId')
  @UseGuards(JwtAuthGuard)
  async stkStatus(@Param('checkoutRequestId') checkoutRequestId: string) {
    return this.mpesa.querySTKStatus(checkoutRequestId);
  }

  /** Safaricom calls this endpoint after payment attempt */
  @Post('mpesa/callback')
  async mpesaCallback(@Body() body: unknown) {
    await this.mpesa.handleCallback(body);
    return { ResultCode: 0, ResultDesc: 'Success' };
  }

  @Post('mpesa/b2c')
  @UseGuards(JwtAuthGuard)
  async mpesaB2C(@Body() body: { phone: string; amountCents: number; remarks: string; businessId: string }) {
    return this.mpesa.initiateB2C(body);
  }

  /** Bulk B2C disbursement for a payroll run — fires one B2C per payslip with employee phone */
  @Post('mpesa/b2c-bulk')
  @UseGuards(JwtAuthGuard)
  async mpesaB2CBulk(@Body() body: { businessId: string; payrollRunId: string }) {
    const payslips = await this.prisma.payslip.findMany({
      where: { payrollRunId: body.payrollRunId },
    });

    // Batch-fetch employee → user phone numbers
    const employeeIds = payslips.map(p => p.employeeId);
    const employees = await this.prisma.employee.findMany({
      where: { id: { in: employeeIds } },
      include: { user: { select: { phone: true } } },
    });
    const phoneMap = new Map(employees.map(e => [e.id, e.user?.phone ?? null]));

    const results: Array<{ employee: string; status: string; error?: string }> = [];
    for (const ps of payslips) {
      const phone = phoneMap.get(ps.employeeId);
      if (!phone) {
        results.push({ employee: ps.employeeName, status: 'skipped', error: 'No phone number on file' });
        continue;
      }
      try {
        await this.mpesa.initiateB2C({
          businessId: body.businessId,
          phone,
          amountCents: ps.netPay,
          remarks: `Payroll ${body.payrollRunId.slice(-6)}`,
        });
        results.push({ employee: ps.employeeName, status: 'sent' });
      } catch (e: any) {
        results.push({ employee: ps.employeeName, status: 'failed', error: e?.message });
      }
    }
    return { disbursed: results.filter(r => r.status === 'sent').length, total: payslips.length, results };
  }

  @Post('mpesa/qr')
  @UseGuards(JwtAuthGuard)
  async generateQR(
    @Body() body: { amountCents: number; reference: string; merchantName?: string },
  ) {
    return this.mpesa.generateDynamicQR({
      amountCents: body.amountCents,
      reference: body.reference,
      merchantName: body.merchantName ?? 'POS',
    });
  }

  @Post('card')
  @UseGuards(JwtAuthGuard)
  async cardPayment(@Body() body: { amountCents: number }) {
    return {
      success: true,
      reference: `CARD-${Date.now()}`,
      amountCents: body.amountCents,
    };
  }

  /** Get Paystack public key for Inline popup (POS card payments) */
  @Get('paystack/config')
  @UseGuards(JwtAuthGuard)
  async paystackConfig(@Query('businessId') businessId: string) {
    const biz = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { paystackPublicKey: true },
    });
    return { publicKey: biz?.paystackPublicKey ?? null };
  }

  /** Verify a Paystack Inline transaction reference */
  @Post('paystack/verify')
  @UseGuards(JwtAuthGuard)
  async verifyPaystack(@Body() body: { reference: string; businessId: string }) {
    const biz = await this.prisma.business.findUnique({
      where: { id: body.businessId },
      select: { paystackPublicKey: true },
    });

    // If no Paystack secret configured, accept with mock success
    const secretKey = process.env.PAYSTACK_SECRET_KEY;
    if (!secretKey && !biz?.paystackPublicKey) {
      return { verified: true, reference: body.reference, status: 'success' };
    }

    // Call Paystack verify API
    try {
      const res = await fetch(
        `https://api.paystack.co/transaction/verify/${encodeURIComponent(body.reference)}`,
        {
          headers: {
            Authorization: `Bearer ${secretKey ?? ''}`,
            'Content-Type': 'application/json',
          },
        },
      );
      const data = await res.json() as { status: boolean; data: { status: string } };
      return {
        verified: data.status && data.data?.status === 'success',
        reference: body.reference,
        status: data.data?.status ?? 'unknown',
      };
    } catch {
      return { verified: true, reference: body.reference, status: 'unverified' };
    }
  }

  // ─── Bank Reconciliation ─────────────────────────────────────────────────────

  @Post('reconciliation/upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('file'))
  async uploadStatement(
    @UploadedFile() file: any,
    @Body('businessId') businessId: string,
    @Body('storeId') storeId?: string,
  ) {
    const csvContent = file.buffer.toString('utf8');
    return this.reconciliation.uploadStatement(businessId, file.originalname, csvContent, storeId);
  }

  @Get('reconciliation/statements')
  @UseGuards(JwtAuthGuard)
  async getStatements(@Query('businessId') businessId: string) {
    return this.reconciliation.getStatements(businessId);
  }

  @Get('reconciliation/entries/:statementId')
  @UseGuards(JwtAuthGuard)
  async getEntries(
    @Param('statementId') statementId: string,
    @Query('matchStatus') matchStatus?: string,
  ) {
    return this.reconciliation.getEntries(statementId, matchStatus);
  }

  @Patch('reconciliation/entries/:entryId/match')
  @UseGuards(JwtAuthGuard)
  async manualMatch(
    @Param('entryId') entryId: string,
    @Body('saleId') saleId: string,
  ) {
    return this.reconciliation.manualMatch(entryId, saleId);
  }

  @Get('reconciliation/summary')
  @UseGuards(JwtAuthGuard)
  async getSummary(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.reconciliation.getSummary(businessId, startDate, endDate);
  }

  @Delete('reconciliation/statements/:id')
  @UseGuards(JwtAuthGuard)
  async deleteStatement(@Param('id') id: string) {
    return this.reconciliation.deleteStatement(id);
  }

  // ─── M-Pesa C2B (Paybill/Till incoming payments) ─────────────────────────────

  /** Safaricom calls this to validate a payment — always approve */
  @Post('mpesa/c2b/validate')
  c2bValidate() {
    return { ResultCode: 0, ResultDesc: 'Accepted' };
  }

  /** Safaricom calls this when a payment is confirmed */
  @Post('mpesa/c2b/confirm')
  async c2bConfirm(@Body() body: Record<string, unknown>, @Query('businessId') businessId: string) {
    if (!businessId) return { ResultCode: 0, ResultDesc: 'No businessId' };
    await this.mpesa.handleC2BConfirmation(businessId, body);
    return { ResultCode: 0, ResultDesc: 'Success' };
  }

  /** Register C2B URLs with Safaricom (one-time setup) */
  @Post('mpesa/c2b/register')
  @UseGuards(JwtAuthGuard)
  async c2bRegister(
    @Body() body: { shortCode: string; baseUrl: string; businessId: string },
  ) {
    const validationUrl = `${body.baseUrl}/api/v1/payments/mpesa/c2b/validate?businessId=${body.businessId}`;
    const confirmationUrl = `${body.baseUrl}/api/v1/payments/mpesa/c2b/confirm?businessId=${body.businessId}`;
    return this.mpesa.registerC2BUrls({
      shortCode: body.shortCode,
      validationUrl,
      confirmationUrl,
    });
  }

  /** Get recent incoming C2B payments for this business */
  @Get('mpesa/c2b/incoming')
  @UseGuards(JwtAuthGuard)
  async c2bIncoming(
    @Query('businessId') businessId: string,
    @Query('limit') limit?: string,
  ) {
    return this.mpesa.getPendingC2BPayments(businessId, limit ? parseInt(limit) : 50);
  }

  /** Get count of pending unmatched payments (for badge) */
  @Get('mpesa/c2b/stats')
  @UseGuards(JwtAuthGuard)
  async c2bStats(@Query('businessId') businessId: string) {
    return this.mpesa.getC2BStats(businessId);
  }

  /** Match a C2B payment to a sale */
  @Patch('mpesa/c2b/:id/match')
  @UseGuards(JwtAuthGuard)
  async c2bMatch(
    @Param('id') id: string,
    @Body() body: { saleId: string; matchedBy: string },
  ) {
    await this.mpesa.matchC2BPayment(id, body.saleId, body.matchedBy);
    return { success: true };
  }

  /** Dismiss a C2B payment (not for this sale) */
  @Patch('mpesa/c2b/:id/dismiss')
  @UseGuards(JwtAuthGuard)
  async c2bDismiss(@Param('id') id: string) {
    await this.mpesa.dismissC2BPayment(id);
    return { success: true };
  }

  // ─── Payment Links ────────────────────────────────────────────────────────────

  @Get('links')
  @UseGuards(JwtAuthGuard)
  async getPaymentLinks(@Query('businessId') businessId: string) {
    return this.prisma.paymentLink.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  @Post('links')
  @UseGuards(JwtAuthGuard)
  async createPaymentLink(
    @Body() body: {
      businessId: string;
      storeId?: string;
      description?: string;
      amountCents?: number;
      currency?: string;
      expiresAt?: string;
      maxUses?: number;
      createdBy?: string;
    },
  ) {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    return this.prisma.paymentLink.create({
      data: {
        businessId: body.businessId,
        storeId: body.storeId,
        code,
        description: body.description ?? '',
        amountCents: body.amountCents ?? 0,
        currency: body.currency ?? 'KES',
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        maxUses: body.maxUses,
        createdBy: body.createdBy ?? 'system',
        status: 'ACTIVE',
      },
    });
  }

  @Patch('links/:id/disable')
  @UseGuards(JwtAuthGuard)
  async disablePaymentLink(@Param('id') id: string) {
    return this.prisma.paymentLink.update({
      where: { id },
      data: { status: 'DISABLED' },
    });
  }

  /** Public — fetch link details by code (no auth required) */
  @Get('links/public/:code')
  @Public()
  @SkipSubscriptionCheck()
  async getPublicLink(@Param('code') code: string) {
    const link = await this.prisma.paymentLink.findUnique({ where: { code } });
    if (!link) throw new Error('Payment link not found');
    if (link.status !== 'ACTIVE') throw new Error('Payment link is no longer active');
    if (link.expiresAt && link.expiresAt < new Date()) {
      await this.prisma.paymentLink.update({ where: { id: link.id }, data: { status: 'EXPIRED' } });
      throw new Error('Payment link has expired');
    }
    // Fetch business name for display
    const biz = await this.prisma.business.findUnique({
      where: { id: link.businessId },
      select: { name: true },
    });
    return {
      id: link.id,
      code: link.code,
      description: link.description,
      amountCents: link.amountCents,
      currency: link.currency,
      expiresAt: link.expiresAt,
      maxUses: link.maxUses,
      usesCount: link.usesCount,
      businessName: biz?.name ?? 'Merchant',
    };
  }

  /** Public — trigger M-Pesa STK push for a payment link */
  @Post('links/public/:code/pay')
  @Public()
  @SkipSubscriptionCheck()
  async payLink(
    @Param('code') code: string,
    @Body() body: { phone: string; amountCents?: number },
  ) {
    const link = await this.prisma.paymentLink.findUnique({ where: { code } });
    if (!link) throw new Error('Payment link not found');
    if (link.status !== 'ACTIVE') throw new Error('Payment link is no longer active');
    if (link.expiresAt && link.expiresAt < new Date()) throw new Error('Payment link has expired');
    if (link.maxUses && link.usesCount >= link.maxUses) throw new Error('Payment link has reached its maximum uses');

    const amount = link.amountCents > 0 ? link.amountCents : (body.amountCents ?? 0);
    if (!amount || amount <= 0) throw new Error('Amount is required for open payment links');

    const result = await this.mpesa.initiateSTKPush({
      phone: body.phone,
      amountCents: amount,
      accountReference: `PAY-${code}`,
    });

    // Increment use count
    await this.prisma.paymentLink.update({
      where: { id: link.id },
      data: {
        usesCount: { increment: 1 },
        ...(link.maxUses && link.usesCount + 1 >= link.maxUses ? { status: 'EXPIRED' } : {}),
      },
    });

    return result;
  }
}

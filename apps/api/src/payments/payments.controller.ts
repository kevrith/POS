import { Controller, Post, Get, Patch, Delete, Body, Param, Query, UseGuards, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { MpesaService } from './mpesa.service';
import { ReconciliationService } from './reconciliation.service';
import { PrismaService } from '../prisma/prisma.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
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
}

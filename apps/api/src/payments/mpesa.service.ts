import { Injectable, BadRequestException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';

interface STKPushRequest {
  phone: string;
  amountCents: number;
  accountReference: string;
}

interface DarajaTokenResponse {
  access_token: string;
  expires_in: string;
}

interface DarajaSTKResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

interface MpesaCallbackBody {
  Body: {
    stkCallback: {
      MerchantRequestID: string;
      CheckoutRequestID: string;
      ResultCode: number;
      ResultDesc: string;
      CallbackMetadata?: {
        Item: Array<{ Name: string; Value?: string | number }>;
      };
    };
  };
}

@Injectable()
export class MpesaService {
  private readonly logger = new Logger(MpesaService.name);

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
    private events: EventsGateway,
  ) {}

  private get isProduction(): boolean {
    return this.config.get<string>('MPESA_ENV') === 'production';
  }

  private get baseUrl(): string {
    return this.isProduction
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
  }

  private normalizePhone(phone: string): string {
    const cleaned = phone.replace(/\D/g, '');
    if (cleaned.startsWith('0')) return `254${cleaned.slice(1)}`;
    if (cleaned.startsWith('254')) return cleaned;
    if (cleaned.startsWith('7') || cleaned.startsWith('1')) return `254${cleaned}`;
    throw new BadRequestException('Invalid phone number format');
  }

  private getTimestamp(): string {
    const now = new Date();
    return [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
      String(now.getHours()).padStart(2, '0'),
      String(now.getMinutes()).padStart(2, '0'),
      String(now.getSeconds()).padStart(2, '0'),
    ].join('');
  }

  private getPassword(timestamp: string): string {
    const shortcode = this.config.getOrThrow<string>('MPESA_SHORTCODE');
    const passkey = this.config.getOrThrow<string>('MPESA_PASSKEY');
    return Buffer.from(`${shortcode}${passkey}${timestamp}`).toString('base64');
  }

  private async getAccessToken(): Promise<string> {
    const consumerKey = this.config.getOrThrow<string>('MPESA_CONSUMER_KEY');
    const consumerSecret = this.config.getOrThrow<string>('MPESA_CONSUMER_SECRET');
    const credentials = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');

    const response = await fetch(
      `${this.baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        method: 'GET',
        headers: { Authorization: `Basic ${credentials}` },
      },
    );

    if (!response.ok) {
      throw new BadRequestException('Failed to get M-Pesa access token');
    }

    const data = (await response.json()) as DarajaTokenResponse;
    return data.access_token;
  }

  async initiateSTKPush(data: STKPushRequest): Promise<{ checkoutRequestId: string; merchantRequestId: string }> {
    if (typeof data.phone !== 'string' || !data.phone.trim()) throw new BadRequestException('phone is required');
    if (!Number.isFinite(data.amountCents) || data.amountCents <= 0) throw new BadRequestException('amountCents must be a positive number');
    const phone = this.normalizePhone(data.phone);
    const amount = Math.max(1, Math.round(data.amountCents / 100));
    const shortcode = this.config.getOrThrow<string>('MPESA_SHORTCODE');
    const callbackUrl = this.config.getOrThrow<string>('MPESA_CALLBACK_URL');
    const timestamp = this.getTimestamp();
    const password = this.getPassword(timestamp);

    const token = await this.getAccessToken();

    const payload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerPayBillOnline',
      Amount: amount,
      PartyA: phone,
      PartyB: shortcode,
      PhoneNumber: phone,
      CallBackURL: callbackUrl,
      AccountReference: data.accountReference.slice(0, 12),
      TransactionDesc: 'POS Payment',
    };

    const response = await fetch(`${this.baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = (await response.json()) as DarajaSTKResponse;

    if (result.ResponseCode !== '0') {
      throw new BadRequestException(`M-Pesa error: ${result.ResponseDescription}`);
    }

    this.logger.log(`STK Push initiated: ${result.CheckoutRequestID}`);
    return {
      checkoutRequestId: result.CheckoutRequestID,
      merchantRequestId: result.MerchantRequestID,
    };
  }

  async querySTKStatus(checkoutRequestId: string): Promise<{ status: 'pending' | 'paid' | 'failed'; resultDesc: string }> {
    const shortcode = this.config.getOrThrow<string>('MPESA_SHORTCODE');
    const timestamp = this.getTimestamp();
    const password = this.getPassword(timestamp);
    const token = await this.getAccessToken();

    const response = await fetch(`${this.baseUrl}/mpesa/stkpushquery/v1/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        BusinessShortCode: shortcode,
        Password: password,
        Timestamp: timestamp,
        CheckoutRequestID: checkoutRequestId,
      }),
    });

    const result = await response.json() as { ResultCode?: string; ResultDesc?: string; ResponseCode?: string; ResponseDescription?: string };

    if (result.ResultCode === '0') return { status: 'paid', resultDesc: result.ResultDesc ?? 'Success' };
    if (result.ResultCode) return { status: 'failed', resultDesc: result.ResultDesc ?? 'Failed' };
    return { status: 'pending', resultDesc: 'Processing' };
  }

  async generateDynamicQR(params: {
    amountCents: number;
    reference: string;
    merchantName: string;
  }): Promise<{ qrCode: string | null; demoMode: boolean }> {
    const shortcode = this.config.get<string>('MPESA_SHORTCODE');
    const consumerKey = this.config.get<string>('MPESA_CONSUMER_KEY');

    // No credentials → return demo mode flag (no fake QR — M-Pesa app rejects custom URLs)
    if (!consumerKey || !shortcode) {
      return { qrCode: null, demoMode: true };
    }

    const amount = Math.max(1, Math.round(params.amountCents / 100));
    const token = await this.getAccessToken();

    const payload = {
      MerchantName: params.merchantName.slice(0, 30),
      RefNo: params.reference.slice(0, 12),
      Amount: amount,
      TrxCode: 'BG', // Buy Goods
      CPI: shortcode,
      Size: '300',
    };

    const response = await fetch(`${this.baseUrl}/mpesa/qrcode/v1/generate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json() as {
      ResponseCode: string;
      QRCode?: string;
      ResponseDescription?: string;
    };

    if (result.ResponseCode !== '0') {
      throw new BadRequestException(
        `QR generation failed: ${result.ResponseDescription ?? 'Unknown error'}`,
      );
    }

    return { qrCode: result.QRCode!, demoMode: false };
  }

  async initiateB2C(params: {
    phone: string;
    amountCents: number;
    remarks: string;
    businessId: string;
  }): Promise<{ conversationId: string; originatorConversationId: string; responseDescription: string }> {
    const token = await this.getAccessToken();
    const shortCode = this.config.get<string>('MPESA_SHORTCODE') ?? '174379';
    const securityCred = this.config.get<string>('MPESA_B2C_SECURITY_CREDENTIAL') ?? 'MOCK_CRED';
    const callbackUrl = this.config.get<string>('MPESA_CALLBACK_URL') ?? 'https://example.com/callback';

    // Sandbox / mock fallback when B2C credential not set
    if (!this.config.get<string>('MPESA_B2C_SECURITY_CREDENTIAL')) {
      return {
        conversationId: `B2C-MOCK-${Date.now()}`,
        originatorConversationId: `OC-${Date.now()}`,
        responseDescription: `Mock B2C: KES ${(params.amountCents / 100).toFixed(2)} → ${params.phone}`,
      };
    }

    const res = await fetch('https://sandbox.safaricom.co.ke/mpesa/b2c/v1/paymentrequest', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        InitiatorName: 'testapi',
        SecurityCredential: securityCred,
        CommandID: 'BusinessPayment',
        Amount: Math.round(params.amountCents / 100),
        PartyA: shortCode,
        PartyB: params.phone,
        Remarks: params.remarks,
        QueueTimeOutURL: `${callbackUrl}/b2c/timeout`,
        ResultURL: `${callbackUrl}/b2c/result`,
        Occasion: params.businessId,
      }),
    });
    const data = await res.json() as any;
    return {
      conversationId: data.ConversationID,
      originatorConversationId: data.OriginatorConversationID,
      responseDescription: data.ResponseDescription,
    };
  }

  async handleCallback(body: unknown): Promise<void> {
    const data = body as MpesaCallbackBody;
    const callback = data?.Body?.stkCallback;

    if (!callback) {
      this.logger.warn('Invalid M-Pesa callback payload');
      return;
    }

    const { CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = callback;

    if (ResultCode === 0 && CallbackMetadata) {
      const items = CallbackMetadata.Item;
      const get = (name: string) => items.find(i => i.Name === name)?.Value;

      const amount = get('Amount');
      const mpesaCode = get('MpesaReceiptNumber');
      const phone = get('PhoneNumber');

      this.logger.log(
        `M-Pesa payment success: ${CheckoutRequestID} | Code: ${mpesaCode} | Amount: ${amount} | Phone: ${phone}`,
      );

      // Update Payment.reference from checkoutRequestId → real M-Pesa receipt code
      if (mpesaCode) {
        try {
          const updated = await this.prisma.payment.updateMany({
            where: { method: 'MPESA_STK', reference: CheckoutRequestID as string },
            data: { reference: String(mpesaCode) },
          });
          if (updated.count > 0) {
            this.logger.log(`Updated ${updated.count} payment(s) with M-Pesa receipt: ${mpesaCode}`);
          } else {
            this.logger.warn(`No payment found for CheckoutRequestID ${CheckoutRequestID} — receipt ${mpesaCode} not persisted`);
          }
        } catch (err: any) {
          this.logger.error(`Failed to persist M-Pesa receipt code: ${err.message}`);
        }
      }
    } else {
      this.logger.warn(`M-Pesa payment failed: ${CheckoutRequestID} | ${ResultDesc}`);
    }
  }

  // ─── M-Pesa C2B (Customer-to-Business / Paybill & Till) ─────────────────────

  /** Register C2B callback URLs with Safaricom Daraja */
  async registerC2BUrls(params: {
    shortCode: string;
    validationUrl: string;
    confirmationUrl: string;
  }): Promise<{ ResponseCode: string; ResponseDescription: string; CustomerMessage: string }> {
    const token = await this.getAccessToken();
    const res = await fetch(`${this.baseUrl}/mpesa/c2b/v1/registerurl`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ShortCode: params.shortCode,
        ResponseType: 'Completed',
        ConfirmationURL: params.confirmationUrl,
        ValidationURL: params.validationUrl,
      }),
    });
    return res.json() as Promise<{ ResponseCode: string; ResponseDescription: string; CustomerMessage: string }>;
  }

  /** Handle Safaricom C2B confirmation webhook — saves to DB and emits socket event */
  async handleC2BConfirmation(businessId: string, payload: Record<string, unknown>): Promise<void> {
    const transactionId = String(payload.TransID ?? payload.TransId ?? `MOCK-${Date.now()}`);
    const phoneRaw = String(payload.MSISDN ?? '');
    const firstName = String(payload.FirstName ?? '');
    const middleName = String(payload.MiddleName ?? '').trim();
    const lastName = String(payload.LastName ?? '');
    const customerName = [firstName, middleName, lastName].filter(Boolean).join(' ') || phoneRaw;
    const amountRaw = parseFloat(String(payload.TransAmount ?? payload.Amount ?? '0'));
    const amountCents = Math.round(amountRaw * 100);
    const billRefNumber = String(payload.BillRefNumber ?? payload.AccountReference ?? '');
    const transactionType = String(payload.TransactionType ?? 'CustomerPayBillOnline');
    const shortCode = String(payload.BusinessShortCode ?? payload.ShortCode ?? '');
    const orgBalance = payload.OrgAccountBalance
      ? Math.round(parseFloat(String(payload.OrgAccountBalance)) * 100)
      : null;

    // Idempotent upsert — Safaricom can send duplicates
    let record: { id: string; amountCents: number; customerName: string; phoneNumber: string; billRefNumber: string; status: string; createdAt: Date };
    try {
      record = await this.prisma.mpesaC2BTransaction.upsert({
        where: { transactionId },
        create: {
          businessId,
          transactionId,
          transactionType,
          phoneNumber: phoneRaw,
          customerName,
          amountCents,
          billRefNumber,
          orgAccountBalance: orgBalance,
          shortCode,
          rawPayload: payload as any,
        },
        update: {}, // Already exists — don't overwrite
      });
    } catch (err: any) {
      this.logger.error(`C2B upsert failed: ${err.message}`);
      return;
    }

    this.logger.log(`C2B payment: ${transactionId} | ${customerName} | KES ${amountRaw} | Ref: ${billRefNumber}`);

    // Emit real-time event to all cashiers in this business
    this.events.emitC2BPaymentReceived(businessId, {
      id: record.id,
      transactionId,
      customerName,
      phoneNumber: phoneRaw,
      amountCents,
      billRefNumber,
      status: 'PENDING',
      createdAt: record.createdAt,
    });

    // Also fire an in-app notification
    try {
      await this.prisma.notification.create({
        data: {
          businessId,
          type: 'MPESA_C2B_PAYMENT',
          priority: 'HIGH',
          title: `M-Pesa Payment: KES ${amountRaw.toFixed(0)}`,
          body: `${customerName} paid KES ${amountRaw.toFixed(2)} via ${transactionType === 'CustomerBuyGoodsOnline' ? 'Till' : 'Paybill'}. Ref: ${billRefNumber || transactionId}`,
          entityId: record.id,
          entityType: 'MpesaC2BTransaction',
        },
      });
      this.events.emitNotificationCreated(businessId, {
        type: 'MPESA_C2B_PAYMENT',
        priority: 'HIGH',
        title: `M-Pesa Payment: KES ${amountRaw.toFixed(0)}`,
        body: `${customerName} · ${billRefNumber || transactionId}`,
      });
    } catch { /* non-critical */ }
  }

  async getPendingC2BPayments(businessId: string, limit = 50): Promise<{
    id: string; transactionId: string; customerName: string; phoneNumber: string;
    amountCents: number; billRefNumber: string; status: string; createdAt: Date;
    shortCode: string | null; transactionType: string;
  }[]> {
    return this.prisma.mpesaC2BTransaction.findMany({
      where: { businessId, status: { in: ['PENDING', 'MATCHED'] } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true, transactionId: true, customerName: true, phoneNumber: true,
        amountCents: true, billRefNumber: true, status: true, createdAt: true,
        shortCode: true, transactionType: true,
      },
    });
  }

  async matchC2BPayment(id: string, saleId: string, matchedBy: string): Promise<void> {
    await this.prisma.mpesaC2BTransaction.update({
      where: { id },
      data: { status: 'MATCHED', saleId, matchedBy, matchedAt: new Date() },
    });
  }

  async dismissC2BPayment(id: string): Promise<void> {
    await this.prisma.mpesaC2BTransaction.update({
      where: { id },
      data: { status: 'DISMISSED' },
    });
  }

  async getC2BStats(businessId: string): Promise<{ pendingCount: number; pendingAmountCents: number }> {
    const rows = await this.prisma.mpesaC2BTransaction.findMany({
      where: { businessId, status: 'PENDING' },
      select: { amountCents: true },
    });
    return {
      pendingCount: rows.length,
      pendingAmountCents: rows.reduce((s, r) => s + r.amountCents, 0),
    };
  }
}

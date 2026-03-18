import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as crypto from 'crypto';

// ─── KRA eTIMS API interfaces ─────────────────────────────────────────────────

interface EtimsInvoiceItem {
  itemSeq: number;
  itemCd: string;
  itemClsCd: string;
  itemNm: string;
  pkgUnitCd: string;
  pkg: number;
  qtyUnitCd: string;
  qty: number;
  prc: number;
  splyAmt: number;
  dcRt: number;
  dcAmt: number;
  taxblAmt: number;
  taxTyCd: string;
  taxAmt: number;
  totAmt: number;
}

interface EtimsInvoicePayload {
  invoiceNo: string;
  tpin: string;
  branchId: string;
  tradeTerms: string;
  saleDate: string;
  stockRlsDt?: string;
  cfmDt?: string;
  cnclReqDt?: string;
  cnclDate?: string;
  rfdRsnCd?: string;
  orgInvcNo?: string;
  pmtTyCd: string;
  rcptTyCd: string;
  salesSttsCd?: string;
  totItemCnt?: number;
  prchrAcptcYn?: string;
  remark?: string;
  taxblAmtA: number;
  taxblAmtB: number;
  taxblAmtC: number;
  taxblAmtD: number;
  taxAmtA: number;
  taxAmtB: number;
  taxAmtC: number;
  taxAmtD: number;
  totTaxblAmt: number;
  totTaxAmt: number;
  totAmt: number;
  itemList: EtimsInvoiceItem[];
}

interface EtimsProductionOnboardingDto {
  businessId: string;
  kraPin: string;
  businessName: string;
  businessAddress: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  certificateFile?: string;
}

interface ItaxVatReturnDto {
  businessId: string;
  period: string;
  totalSales: number;
  totalPurchases: number;
  vatOnSales: number;
  vatOnPurchases: number;
  netVat: number;
}

@Injectable()
export class EtimsService {
  private readonly ETIMS_SANDBOX_URL = 'https://etims-sbx.kra.go.ke/etims-api';
  private readonly ETIMS_PRODUCTION_URL = 'https://etims-api.kra.go.ke/etims-api';

  private get isProductionEnv(): boolean {
    return process.env.ETIMS_ENV === 'production';
  }

  private get baseUrl(): string {
    return this.isProductionEnv ? this.ETIMS_PRODUCTION_URL : this.ETIMS_SANDBOX_URL;
  }

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ─── Production onboarding ────────────────────────────────────────────────

  async initiateProductionOnboarding(dto: EtimsProductionOnboardingDto) {
    const business = await this.prisma.business.findUnique({ where: { id: dto.businessId } });
    if (!business) throw new BadRequestException('Business not found');
    if (business.etimsProductionOnboarded) throw new BadRequestException('Business already onboarded to production');

    if (!/^[A-Z]\d{9}[A-Z]$/.test(dto.kraPin)) {
      throw new BadRequestException('Invalid KRA PIN format (expected: A123456789B)');
    }

    try {
      const response = await this.callEtimsApi('/api/device/initialize', {
        kraPin: dto.kraPin,
        bhfId: '00', // branch ID — default head office
        dvcSrlNo: `KASTRA-${dto.businessId.slice(0, 8).toUpperCase()}`,
        txdtDt: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      });

      const deviceId = response.deviceId ?? response.dvcId ?? `DEV_${Date.now()}`;
      const deviceKey = response.deviceKey ?? response.sdcId ?? crypto.randomBytes(32).toString('hex');

      await this.prisma.business.update({
        where: { id: dto.businessId },
        data: {
          etimsMode: 'PRODUCTION',
          etimsProductionOnboarded: true,
          etimsCredentialsEncrypted: this.encryptCredentials({
            deviceId,
            deviceKey,
            kraPin: dto.kraPin,
            branchId: '00',
          }),
        },
      });

      await this.audit.createEntry({
        businessId: dto.businessId,
        actor: 'system',
        actorType: 'SYSTEM',
        action: 'ETIMS_PRODUCTION_ONBOARDED',
        entity: 'Business',
        entityId: dto.businessId,
        after: { etimsMode: 'PRODUCTION', kraPin: dto.kraPin },
        source: 'SYSTEM',
      });

      return { success: true, deviceId, message: 'Successfully onboarded to eTIMS production' };
    } catch (error) {
      throw new BadRequestException(`eTIMS onboarding failed: ${error.message}`);
    }
  }

  async switchToProductionMode(businessId: string) {
    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    if (!business) throw new BadRequestException('Business not found');
    if (!business.etimsProductionOnboarded) {
      throw new BadRequestException('Business must complete production onboarding first');
    }

    await this.prisma.business.update({ where: { id: businessId }, data: { etimsMode: 'PRODUCTION' } });
    await this.audit.createEntry({
      businessId, actor: 'system', actorType: 'SYSTEM',
      action: 'ETIMS_MODE_SWITCHED', entity: 'Business', entityId: businessId,
      after: { etimsMode: 'PRODUCTION' }, source: 'SYSTEM',
    });

    return { success: true, message: 'Switched to eTIMS production mode' };
  }

  // ─── iTax integration ─────────────────────────────────────────────────────

  async enableItaxIntegration(businessId: string, credentials: {
    username: string;
    password: string;
    kraPin: string;
  }) {
    const isValid = await this.validateItaxCredentials(credentials);
    if (!isValid) throw new BadRequestException('Invalid iTax credentials');

    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        kraItaxIntegrationEnabled: true,
        kraItaxCredentials: this.encryptCredentials(credentials),
      },
    });

    await this.audit.createEntry({
      businessId, actor: 'system', actorType: 'SYSTEM',
      action: 'ITAX_INTEGRATION_ENABLED', entity: 'Business', entityId: businessId,
      source: 'SYSTEM',
    });

    return { success: true, message: 'iTax integration enabled successfully' };
  }

  async submitVatReturn(dto: ItaxVatReturnDto) {
    const business = await this.prisma.business.findUnique({ where: { id: dto.businessId } });
    if (!business?.kraItaxIntegrationEnabled || !business.kraItaxCredentials) {
      throw new BadRequestException('iTax integration not enabled for this business');
    }

    const credentials = this.decryptCredentials(business.kraItaxCredentials);

    try {
      const response = await this.callItaxApi(credentials, {
        kraPin: credentials.kraPin,
        period: dto.period,
        totalSales: dto.totalSales,
        totalPurchases: dto.totalPurchases,
        vatOnSales: dto.vatOnSales,
        vatOnPurchases: dto.vatOnPurchases,
        netVat: dto.netVat,
        submissionDate: new Date().toISOString(),
      });

      await this.audit.createEntry({
        businessId: dto.businessId, actor: 'system', actorType: 'SYSTEM',
        action: 'VAT_RETURN_SUBMITTED', entity: 'Business', entityId: dto.businessId,
        after: { period: dto.period, netVat: dto.netVat, referenceNumber: response.referenceNumber },
        source: 'SYSTEM',
      });

      return { success: true, referenceNumber: response.referenceNumber, message: 'VAT return submitted successfully' };
    } catch (error) {
      throw new BadRequestException(`VAT return submission failed: ${error.message}`);
    }
  }

  async getVatReturnData(businessId: string, period: string) {
    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    const sales = await this.prisma.sale.findMany({
      where: { businessId, status: 'PAID', createdAt: { gte: startDate, lte: endDate } },
      include: { items: true },
    });
    const expenses = await this.prisma.expense.findMany({
      where: { businessId, createdAt: { gte: startDate, lte: endDate }, vatReclaimable: true },
    });

    const totalSales = sales.reduce((s, sale) => s + sale.totalCents, 0);
    const vatOnSales = sales.reduce((s, sale) => s + sale.vatCents, 0);
    const totalPurchases = expenses.reduce((s, e) => s + e.amountCents, 0);
    const vatOnPurchases = expenses.reduce((s, e) => s + e.vatAmountCents, 0);

    return {
      period,
      totalSales: totalSales / 100,
      totalPurchases: totalPurchases / 100,
      vatOnSales: vatOnSales / 100,
      vatOnPurchases: vatOnPurchases / 100,
      netVat: (vatOnSales - vatOnPurchases) / 100,
      salesCount: sales.length,
      expensesCount: expenses.length,
    };
  }

  // ─── Sale submission ──────────────────────────────────────────────────────

  async submitSale(saleId: string): Promise<{ success: boolean; controlNumber?: string; intrlData?: string; reason?: string }> {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new BadRequestException('Sale not found');
    if (sale.etimsSubmitted) return {
      success: true,
      controlNumber: sale.etimsControlNumber ?? undefined,
      intrlData: (sale as any).etimsIntrlData ?? sale.etimsControlNumber ?? undefined,
    };

    const business = await this.prisma.business.findUnique({ where: { id: sale.businessId } });
    let controlNumber: string;
    let intrlData: string;

    if (business?.etimsMode === 'PRODUCTION' && business.etimsCredentialsEncrypted) {
      // Real KRA eTIMS submission
      const result = await this.submitToEtims(sale, business);
      controlNumber = result.controlNumber;
      intrlData = result.intrlData;
    } else {
      // Sandbox: generate realistic mock values
      controlNumber = `ETM${Date.now()}`;
      intrlData = `${sale.receiptNumber}|${controlNumber}|${new Date().toISOString().slice(0,10)}`;
    }

    await this.prisma.sale.update({
      where: { id: saleId },
      data: {
        etimsSubmitted: true,
        etimsControlNumber: controlNumber,
        ...(intrlData && { etimsInvoiceNo: intrlData }),
      },
    });

    await this.audit.createEntry({
      businessId: sale.businessId, action: 'ETIMS_SUBMIT',
      entity: 'Sale', entityId: saleId, source: 'SYSTEM',
      actor: 'system', actorType: 'SYSTEM',
      after: { controlNumber },
    });

    return { success: true, controlNumber, intrlData };
  }

  async submitAmendment(saleId: string): Promise<{ success: boolean }> {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new BadRequestException('Sale not found');

    const business = await this.prisma.business.findUnique({ where: { id: sale.businessId } });
    if (business?.etimsMode === 'PRODUCTION' && business.etimsCredentialsEncrypted && sale.etimsControlNumber) {
      await this.submitToEtimsAmendment(sale, business);
    }

    await this.audit.createEntry({
      businessId: sale.businessId, action: 'ETIMS_AMEND',
      entity: 'Sale', entityId: saleId, source: 'SYSTEM',
      actor: 'system', actorType: 'SYSTEM',
    });

    return { success: true };
  }

  async voidSale(saleId: string, reason: string) {
    const sale = await this.prisma.sale.findUnique({ where: { id: saleId } });
    if (!sale) throw new BadRequestException('Sale not found');

    const business = await this.prisma.business.findUnique({ where: { id: sale.businessId } });

    if (business?.etimsMode === 'PRODUCTION' && sale.etimsSubmitted && business.etimsCredentialsEncrypted) {
      try {
        const voidRef = await this.submitEtimsVoid(sale, business, reason);
        await this.prisma.voidRecord.updateMany({
          where: { saleId },
          data: { etimsVoidRef: voidRef },
        });
      } catch (error) {
        console.error('eTIMS void submission failed:', error);
      }
    }

    return { success: true };
  }

  async getStockStatus(businessId: string): Promise<{ pending: number; submitted: number }> {
    const [pending, submitted] = await Promise.all([
      this.prisma.sale.count({ where: { businessId, etimsSubmitted: false, status: 'PAID' } }),
      this.prisma.sale.count({ where: { businessId, etimsSubmitted: true } }),
    ]);
    return { pending, submitted };
  }

  async getPendingCount(businessId: string): Promise<{ count: number }> {
    const count = await this.prisma.sale.count({ where: { businessId, etimsSubmitted: false, status: 'PAID' } });
    return { count };
  }

  async batchSubmit(businessId: string): Promise<{ submitted: number; failed: number }> {
    const pending = await this.prisma.sale.findMany({
      where: { businessId, etimsSubmitted: false, status: 'PAID' },
      take: 50,
      select: { id: true },
    });
    let submitted = 0;
    let failed = 0;
    for (const sale of pending) {
      try { await this.submitSale(sale.id); submitted++; }
      catch { failed++; }
    }
    return { submitted, failed };
  }

  // ─── Real KRA eTIMS HTTP calls ────────────────────────────────────────────

  /** Map POS payment method to KRA eTIMS payment type code */
  private mapPaymentType(payments: any[]): string {
    if (!payments?.length) return '01'; // default cash
    const methods = payments.map((p: any) => p.method ?? p.paymentMethod ?? '');
    if (methods.some((m: string) => m.includes('MPESA') || m.includes('MOBILE'))) return '04'; // Mobile money
    if (methods.some((m: string) => m.includes('CARD') || m.includes('PAYSTACK'))) return '05'; // Card
    if (methods.some((m: string) => m.includes('BANK') || m.includes('TRANSFER'))) return '03'; // Bank transfer
    if (methods.some((m: string) => m.includes('CREDIT'))) return '02'; // Credit
    return '01'; // Cash
  }

  private async submitToEtims(sale: any, business: any): Promise<{ controlNumber: string; intrlData: string }> {
    const creds = this.decryptCredentials(business.etimsCredentialsEncrypted);
    const saleWithItems = await this.prisma.sale.findUnique({
      where: { id: sale.id },
      include: {
        items: { include: { item: true } },
        payments: true,
      },
    });

    const saleDateStr = new Date(sale.createdAt).toISOString().slice(0, 10).replace(/-/g, '');

    const itemList: EtimsInvoiceItem[] = (saleWithItems?.items ?? []).map((si, idx) => {
      const unitPrice = si.unitPriceCents / 100;
      const qty = si.quantity;
      const totalAmt = Math.round(si.totalCents) / 100;
      // Extract VAT from inclusive price (16/116)
      const taxblAmt = Math.round((totalAmt / 1.16) * 100) / 100;
      const taxAmt = Math.round((totalAmt - taxblAmt) * 100) / 100;
      // Use KRA item classification code stored on item, fall back to generic goods code
      const itemClsCd = (si.item as any)?.kraItemCode ?? '5020230602';

      return {
        itemSeq: idx + 1,
        itemCd: (si.item as any)?.barcode ?? (si.item as any)?.sku ?? `KA${String(idx + 1).padStart(5,'0')}`,
        itemClsCd,
        itemNm: si.item?.name ?? 'Item',
        bcd: (si.item as any)?.barcode ?? '',
        pkgUnitCd: 'NT',
        pkg: qty,
        qtyUnitCd: 'U',
        qty,
        prc: unitPrice,
        splyAmt: totalAmt,
        dcRt: (si as any).discountPercent ?? 0,
        dcAmt: (si as any).discountCents ? (si as any).discountCents / 100 : 0,
        taxblAmt,
        taxTyCd: 'B', // VAT 16%
        taxAmt,
        totAmt: totalAmt,
      };
    });

    const totalAmt = sale.totalCents / 100;
    const vatAmt = (sale.vatCents ?? 0) / 100;
    const taxblAmt = Math.round((totalAmt - vatAmt) * 100) / 100;
    const pmtTyCd = this.mapPaymentType(saleWithItems?.payments ?? []);

    const payload: EtimsInvoicePayload = {
      invoiceNo: sale.receiptNumber,
      tpin: creds.kraPin,
      branchId: creds.branchId ?? '00',
      tradeTerms: 'CSH',
      saleDate: saleDateStr,
      stockRlsDt: saleDateStr,
      pmtTyCd,
      rcptTyCd: 'S',
      salesSttsCd: '02',           // 02 = Approved/Confirmed
      totItemCnt: itemList.length,
      cfmDt: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      prchrAcptcYn: 'N',           // N = walk-in retail customer
      taxblAmtA: 0,
      taxblAmtB: taxblAmt,
      taxblAmtC: 0,
      taxblAmtD: 0,
      taxAmtA: 0,
      taxAmtB: vatAmt,
      taxAmtC: 0,
      taxAmtD: 0,
      totTaxblAmt: taxblAmt,
      totTaxAmt: vatAmt,
      totAmt: totalAmt,
      itemList,
    };

    const response = await this.callEtimsApiWithAuth(creds, '/api/trnsSales/saveTaxInvoice', payload);

    // KRA returns intrlData (the cryptographic receipt signature) — this is what goes in the QR code
    const controlNumber = response.controlNo ?? response.rcptNo ?? `ETM${Date.now()}`;
    const intrlData = response.intrlData ?? response.rcptSign ?? controlNumber;

    return { controlNumber, intrlData };
  }

  private async submitToEtimsAmendment(sale: any, business: any): Promise<void> {
    const creds = this.decryptCredentials(business.etimsCredentialsEncrypted);
    await this.callEtimsApiWithAuth(creds, '/api/trnsSales/saveTaxInvoice', {
      invoiceNo: `${sale.receiptNumber}-AMD`,
      tpin: creds.kraPin,
      branchId: creds.branchId ?? '00',
      orgInvcNo: sale.etimsControlNumber,
      rcptTyCd: 'A', // amendment
      saleDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
    });
  }

  private async submitEtimsVoid(sale: any, business: any, reason: string): Promise<string> {
    const creds = this.decryptCredentials(business.etimsCredentialsEncrypted);
    const response = await this.callEtimsApiWithAuth(creds, '/api/trnsSales/saveTaxInvoice', {
      invoiceNo: sale.receiptNumber,
      tpin: creds.kraPin,
      branchId: creds.branchId ?? '00',
      orgInvcNo: sale.etimsControlNumber,
      rcptTyCd: 'C', // cancellation
      cnclReqDt: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      cnclDate: new Date().toISOString().slice(0, 10).replace(/-/g, ''),
      rfdRsnCd: '01', // reason code 01 = wrong entry
      remark: reason,
    });
    return response.voidRef ?? `VOID_${Date.now()}`;
  }

  // ─── HTTP helpers ─────────────────────────────────────────────────────────

  private async callEtimsApi(path: string, body: any): Promise<any> {
    if (!this.isProductionEnv) {
      // Sandbox: return mock response
      return {
        deviceId: `DEV_${Date.now()}`,
        deviceKey: crypto.randomBytes(32).toString('hex'),
        status: 'APPROVED',
      };
    }

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`eTIMS API error ${response.status}: ${text}`);
    }

    const json = await response.json() as any;
    if (json.resultCd !== '000') {
      throw new Error(`eTIMS error ${json.resultCd}: ${json.resultMsg}`);
    }

    return json.data ?? json;
  }

  private async callEtimsApiWithAuth(creds: any, path: string, body: any): Promise<any> {
    if (!this.isProductionEnv) {
      return { controlNo: `ETM${Date.now()}`, status: 'APPROVED' };
    }

    const url = `${this.baseUrl}${path}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'tin': creds.kraPin ?? creds.tin,
        'bhfId': creds.branchId ?? creds.bhfId ?? '00',
        'dvcSrlNo': creds.dvcSrno ?? creds.deviceId ?? '',
      },
      body: JSON.stringify({
        ...body,
        tpin: creds.kraPin ?? creds.tin,
        bhfId: creds.branchId ?? creds.bhfId ?? '00',
        dvcSrlNo: creds.dvcSrno ?? creds.deviceId ?? '',
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`eTIMS API error ${response.status}: ${text}`);
    }

    const json = await response.json() as any;
    if (json.resultCd !== '000') {
      throw new Error(`eTIMS error ${json.resultCd}: ${json.resultMsg}`);
    }

    return json.data ?? json;
  }

  private async callItaxApi(credentials: any, data: any): Promise<any> {
    if (!this.isProductionEnv) {
      return { referenceNumber: `VAT_${Date.now()}`, status: 'SUBMITTED' };
    }

    const response = await fetch(`https://itax.kra.go.ke/api/vat/return`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(`${credentials.username}:${credentials.password}`).toString('base64')}`,
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      throw new Error(`iTax API error ${response.status}`);
    }

    return response.json();
  }

  private async validateItaxCredentials(credentials: any): Promise<boolean> {
    if (!this.isProductionEnv) {
      return !!(credentials.username && credentials.password && credentials.kraPin);
    }

    try {
      const response = await fetch('https://itax.kra.go.ke/api/auth/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: credentials.username, password: credentials.password }),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  // ─── Encryption helpers ───────────────────────────────────────────────────

  private encryptCredentials(credentials: any): string {
    const keyHex = process.env.ENCRYPTION_KEY ?? '0'.repeat(64);
    const key = Buffer.from(keyHex, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return `${iv.toString('hex')}:${encrypted}`;
  }

  private decryptCredentials(encryptedCredentials: string): any {
    const keyHex = process.env.ENCRYPTION_KEY ?? '0'.repeat(64);
    const key = Buffer.from(keyHex, 'hex');

    // Support both new IV:ciphertext format and legacy format
    if (encryptedCredentials.includes(':')) {
      const [ivHex, ciphertext] = encryptedCredentials.split(':');
      const iv = Buffer.from(ivHex, 'hex');
      const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
      let decrypted = decipher.update(ciphertext, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return JSON.parse(decrypted);
    }

    // Legacy: createCipher (no IV) — fallback for old records
    const decipher = crypto.createDecipher('aes-256-cbc', keyHex);
    let decrypted = decipher.update(encryptedCredentials, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class EtimsService {
  constructor(
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  private decrypt(encrypted: string): { bhfId: string; tin: string; cmcKey: string } {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '0'.repeat(64), 'hex');
    const parts = encrypted.split(':');
    const iv = Buffer.from(parts.shift(), 'hex');
    const encryptedText = Buffer.from(parts.join(':'), 'hex');
    const decipher = createDecipheriv(algorithm, key, iv);
    const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
    return JSON.parse(decrypted.toString());
  }

  async submitSale(saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: true,
        store: {
          include: { business: true },
        },
      },
    });

    if (!sale) {
      return { success: false, reason: 'sale not found' };
    }

    if (sale.etimsSubmitted) {
      return { success: false, reason: 'already submitted' };
    }

    if (!sale.store.business.etimsCredentialsEncrypted) {
      return { success: false, reason: 'credentials not configured' };
    }

    const credentials = this.decrypt(sale.store.business.etimsCredentialsEncrypted);

    const payload = {
      trdInvcNo: sale.receiptNumber,
      orgInvcNo: 0,
      custTin: null,
      custNm: null,
      salesTyCd: 'N',
      rcptTyCd: 'S',
      pmtTyCd: 'CASH',
      salesSttsCd: '02',
      cfmDt: sale.createdAt.toISOString().split('T')[0].replace(/-/g, ''),
      salesDt: sale.createdAt.toISOString().split('T')[0].replace(/-/g, ''),
      stockRlsDt: null,
      cnclReqDt: null,
      cnclDt: null,
      rfdDt: null,
      rfdRsnCd: null,
      totItemCnt: sale.items.length,
      taxblAmtA: sale.vatCents > 0 ? sale.subtotalCents / 100 : 0,
      taxblAmtB: 0,
      taxblAmtC: sale.totCents > 0 ? sale.totalCents / 100 : 0,
      taxblAmtD: 0,
      taxRtA: 16,
      taxRtB: 0,
      taxRtC: 3,
      taxRtD: 0,
      taxAmtA: sale.vatCents / 100,
      taxAmtB: 0,
      taxAmtC: sale.totCents / 100,
      taxAmtD: 0,
      totTaxblAmt: sale.subtotalCents / 100,
      totTaxAmt: (sale.vatCents + sale.totCents) / 100,
      totAmt: sale.totalCents / 100,
      prchrAcptcYn: 'N',
      remark: null,
      regrNm: sale.cashierId,
      regrId: sale.cashierId,
      modrNm: sale.cashierId,
      modrId: sale.cashierId,
      itemList: sale.items.map((item, idx) => ({
        itemSeq: idx + 1,
        itemCd: item.itemId,
        itemClsCd: '50101501',
        itemNm: item.name,
        bcd: null,
        pkgUnitCd: 'NT',
        pkg: item.quantity,
        qtyUnitCd: 'U',
        qty: item.quantity,
        prc: item.unitPriceCents / 100,
        splyAmt: item.totalCents / 100,
        dcRt: 0,
        dcAmt: 0,
        taxblAmt: item.totalCents / 100,
        taxTyCd: sale.vatCents > 0 ? 'A' : 'C',
        taxAmt: Math.round(item.totalCents * (sale.vatCents > 0 ? 0.16 : 0.03)) / 100,
        totAmt: item.totalCents / 100,
      })),
    };

    const response = await fetch('https://etims-api-sbx.kra.go.ke/etims-api/insertSalesData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'tin': credentials.tin,
        'bhfId': credentials.bhfId,
        'cmcKey': credentials.cmcKey,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (result.resultCd === '000') {
      await this.prisma.sale.update({
        where: { id: saleId },
        data: {
          etimsSubmitted: true,
          etimsControlNumber: result.data.rcptNo,
        },
      });

      return { success: true, controlNumber: result.data.rcptNo };
    }

    // Notify about eTIMS failure
    this.notifications.notifyEtimsFailure(
      sale.store.business.id,
      sale.receiptNumber ?? saleId,
      saleId,
    ).catch(() => {});
    throw new Error(`eTIMS submission failed: ${result.resultMsg}`);
  }

  async voidSale(saleId: string, reason: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        store: {
          include: { business: true },
        },
      },
    });

    if (!sale) {
      throw new Error('Sale not found');
    }

    if (!sale.etimsSubmitted) {
      throw new Error('Sale not submitted to eTIMS');
    }

    if (!sale.store.business.etimsCredentialsEncrypted) {
      throw new Error('eTIMS credentials not configured');
    }

    const credentials = this.decrypt(sale.store.business.etimsCredentialsEncrypted);

    const payload = {
      orgInvcNo: sale.etimsControlNumber,
      trdInvcNo: sale.receiptNumber,
      custTin: null,
      rfdRsnCd: '01',
      rfdDt: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      totAmt: sale.totalCents / 100,
    };

    const response = await fetch('https://etims-api-sbx.kra.go.ke/etims-api/updateSalesData', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'tin': credentials.tin,
        'bhfId': credentials.bhfId,
        'cmcKey': credentials.cmcKey,
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();

    if (result.resultCd === '000') {
      return { success: true };
    }

    throw new Error(`eTIMS void failed: ${result.resultMsg}`);
  }

  async getPendingCount(businessId: string): Promise<{ count: number }> {
    const count = await this.prisma.sale.count({
      where: { businessId, etimsSubmitted: false, status: 'PAID', type: 'NORMAL' },
    });
    return { count };
  }

  async batchSubmit(businessId: string): Promise<{ submitted: number; failed: number; errors: string[] }> {
    const pending = await this.prisma.sale.findMany({
      where: { businessId, etimsSubmitted: false, status: 'PAID', type: 'NORMAL' },
      select: { id: true, receiptNumber: true },
      take: 100,
    });
    let submitted = 0; let failed = 0; const errors: string[] = [];
    for (const sale of pending) {
      try { await this.submitSale(sale.id); submitted++; }
      catch (e) { failed++; errors.push(`${sale.receiptNumber ?? sale.id}: ${(e as Error).message}`); }
    }
    return { submitted, failed, errors };
  }

  async submitAmendment(saleId: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: true,
        store: {
          include: { business: true },
        },
      },
    });

    if (!sale) return { success: false, reason: 'Sale not found' };
    if (!sale.etimsControlNumber) return { success: false, reason: 'Original sale not submitted to KRA' };

    if (!sale.store.business.etimsCredentialsEncrypted) {
      return { success: false, reason: 'eTIMS not configured' };
    }

    const credentials = this.decrypt(sale.store.business.etimsCredentialsEncrypted);

    const payload = {
      trdInvcNo: sale.receiptNumber,
      orgInvcNo: sale.etimsControlNumber,
      custTin: null,
      salesTyCd: 'N',
      rcptTyCd: 'S',
      pmtTyCd: 'CASH',
      salesSttsCd: '02',
      cfmDt: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      salesDt: sale.createdAt.toISOString().split('T')[0].replace(/-/g, ''),
      totItemCnt: sale.items.length,
      taxblAmtA: sale.vatCents > 0 ? sale.subtotalCents / 100 : 0,
      taxblAmtC: sale.totCents > 0 ? sale.totalCents / 100 : 0,
      taxRtA: 16,
      taxRtC: 3,
      taxAmtA: sale.vatCents / 100,
      taxAmtC: sale.totCents / 100,
      totTaxblAmt: sale.subtotalCents / 100,
      totTaxAmt: (sale.vatCents + sale.totCents) / 100,
      totAmt: sale.totalCents / 100,
      remark: 'Amendment',
      regrNm: sale.cashierId,
      regrId: sale.cashierId,
      modrNm: sale.cashierId,
      modrId: sale.cashierId,
      itemList: sale.items.map((item, idx) => ({
        itemSeq: idx + 1,
        itemCd: item.itemId,
        itemClsCd: '50101501',
        itemNm: item.name,
        bcd: null,
        pkgUnitCd: 'NT',
        pkg: item.quantity,
        qtyUnitCd: 'U',
        qty: item.quantity,
        prc: item.unitPriceCents / 100,
        splyAmt: item.totalCents / 100,
        dcRt: 0,
        dcAmt: 0,
        taxblAmt: item.totalCents / 100,
        taxTyCd: sale.vatCents > 0 ? 'A' : 'C',
        taxAmt: Math.round(item.totalCents * (sale.vatCents > 0 ? 0.16 : 0.03)) / 100,
        totAmt: item.totalCents / 100,
      })),
    };

    try {
      const response = await fetch('https://etims-api-sbx.kra.go.ke/etims-api/updateSalesData', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'tin': credentials.tin,
          'bhfId': credentials.bhfId,
          'cmcKey': credentials.cmcKey,
        },
        body: JSON.stringify(payload),
      });

      const result = await response.json();

      if (result.resultCd === '000') {
        await this.prisma.sale.update({
          where: { id: saleId },
          data: { etimsSubmitted: true },
        });
        return { success: true };
      }

      return { success: false, reason: result.resultMsg };
    } catch (e) {
      return { success: false, reason: String(e) };
    }
  }

  async getStockStatus(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    const credentials = this.decrypt(business.etimsCredentialsEncrypted);

    const response = await fetch('https://etims-api-sbx.kra.go.ke/etims-api/selectStockMoveList', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'tin': credentials.tin,
        'bhfId': credentials.bhfId,
        'cmcKey': credentials.cmcKey,
      },
      body: JSON.stringify({
        lastReqDt: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      }),
    });

    return response.json();
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';

@Injectable()
export class EtimsService {
  constructor(private prisma: PrismaService) {}

  private decrypt(encrypted: string): { bhfId: string; tin: string; cmcKey: string } {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
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

    if (sale.etimsSubmitted) {
      throw new Error('Sale already submitted to eTIMS');
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
      taxblAmtA: sale.vatCents > 0 ? sale.subtotalCents : 0,
      taxblAmtB: 0,
      taxblAmtC: sale.totCents > 0 ? sale.totalCents : 0,
      taxblAmtD: 0,
      taxRtA: 16,
      taxRtB: 0,
      taxRtC: 3,
      taxRtD: 0,
      taxAmtA: sale.vatCents,
      taxAmtB: 0,
      taxAmtC: sale.totCents,
      taxAmtD: 0,
      totTaxblAmt: sale.subtotalCents,
      totTaxAmt: sale.vatCents + sale.totCents,
      totAmt: sale.totalCents,
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
        prc: item.unitPriceCents,
        splyAmt: item.totalCents,
        dcRt: 0,
        dcAmt: 0,
        taxblAmt: item.totalCents,
        taxTyCd: sale.vatCents > 0 ? 'A' : 'C',
        taxAmt: Math.round(item.totalCents * (sale.vatCents > 0 ? 0.16 : 0.03)),
        totAmt: item.totalCents,
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

    if (!sale.etimsSubmitted) {
      throw new Error('Sale not submitted to eTIMS');
    }

    const credentials = this.decrypt(sale.store.business.etimsCredentialsEncrypted);

    const payload = {
      orgInvcNo: sale.etimsControlNumber,
      trdInvcNo: sale.receiptNumber,
      custTin: null,
      rfdRsnCd: '01',
      rfdDt: new Date().toISOString().split('T')[0].replace(/-/g, ''),
      totAmt: sale.totalCents,
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

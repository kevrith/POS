import { Injectable, NotFoundException, BadRequestException, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksService } from '../webhooks/webhooks.service';
import { v4 as uuidv4 } from 'uuid';
import * as net from 'node:net';

/** Minimal SMTP client using node:net (no external packages). Supports AUTH LOGIN. */
async function sendSmtpEmail(opts: {
  host: string; port: number; user: string; pass: string;
  from: string; to: string; subject: string; text: string;
}): Promise<void> {
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(opts.port, opts.host);
    let step = 0;

    const enc = (s: string) => Buffer.from(s).toString('base64');
    const send = (cmd: string) => socket.write(cmd + '\r\n');

    socket.on('data', (chunk) => {
      const line = chunk.toString().trim();
      if (step === 0 && line.startsWith('220')) { send(`EHLO ${opts.host}`); step = 1; }
      else if (step === 1 && line.includes('250')) { send('AUTH LOGIN'); step = 2; }
      else if (step === 2 && line.startsWith('334')) { send(enc(opts.user)); step = 3; }
      else if (step === 3 && line.startsWith('334')) { send(enc(opts.pass)); step = 4; }
      else if (step === 4 && line.startsWith('235')) { send(`MAIL FROM:<${opts.from}>`); step = 5; }
      else if (step === 5 && line.startsWith('250')) { send(`RCPT TO:<${opts.to}>`); step = 6; }
      else if (step === 6 && line.startsWith('250')) { send('DATA'); step = 7; }
      else if (step === 7 && line.startsWith('354')) {
        const msg = [
          `From: ${opts.from}`,
          `To: ${opts.to}`,
          `Subject: ${opts.subject}`,
          `Content-Type: text/plain; charset=UTF-8`,
          '',
          opts.text,
          '.',
        ].join('\r\n');
        send(msg);
        step = 8;
      }
      else if (step === 8 && line.startsWith('250')) { send('QUIT'); step = 9; }
      else if (step === 9 && line.startsWith('221')) { socket.end(); resolve(); }
      else if (line.startsWith('5')) { socket.destroy(); reject(new Error(`SMTP error: ${line}`)); }
    });

    socket.on('error', reject);
    socket.setTimeout(10000, () => { socket.destroy(); reject(new Error('SMTP connection timed out')); });
  });
}

@Injectable()
export class SupplierService {
  private readonly logger = new Logger(SupplierService.name);

  constructor(
    private prisma: PrismaService,
    private webhooks: WebhooksService,
  ) {}

  async create(data: {
    businessId: string;
    name: string;
    contact?: string;
    address?: string;
    paymentTerms?: string;
    creditLimitCents?: number;
  }) {
    return this.prisma.supplier.create({ data });
  }

  async findAll(businessId: string) {
    return this.prisma.supplier.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
    });
  }

  async findOne(id: string) {
    return this.prisma.supplier.findUnique({
      where: { id },
      include: {
        purchaseOrders: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });
  }

  async update(id: string, data: Partial<{
    name: string;
    contact: string;
    address: string;
    paymentTerms: string;
    creditLimitCents: number;
  }>) {
    return this.prisma.supplier.update({
      where: { id },
      data,
    });
  }

  async getLedger(supplierId: string) {
    const supplier = await this.prisma.supplier.findUnique({
      where: { id: supplierId },
    });

    const pos = await this.prisma.purchaseOrder.findMany({
      where: { supplierId },
      include: {
        items: true,
        grns: {
          include: { items: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      supplier,
      purchaseOrders: pos,
      outstandingBalanceCents: supplier.outstandingBalanceCents,
    };
  }

  // ── Purchase Orders ──────────────────────────────────────────────────────────

  async createPO(data: {
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
    if (!data.items || data.items.length === 0) {
      throw new BadRequestException('Purchase order must have at least one item');
    }

    // Generate PO number
    const count = await this.prisma.purchaseOrder.count({
      where: { businessId: data.businessId },
    });
    const poNumber = `PO-${data.businessId.slice(0, 4).toUpperCase()}-${String(count + 1).padStart(5, '0')}`;

    const po = await this.prisma.purchaseOrder.create({
      data: {
        poNumber,
        businessId: data.businessId,
        supplierId: data.supplierId,
        expectedDelivery: data.expectedDelivery ? new Date(data.expectedDelivery) : undefined,
        notes: data.notes,
        items: {
          create: data.items.map((item) => ({
            itemId: item.itemId,
            quantityOrdered: item.quantityOrdered,
            agreedPriceCents: item.agreedPriceCents,
          })),
        },
      },
      include: {
        supplier: { select: { name: true } },
        items: true,
        grns: { include: { items: true } },
      },
    });

    this.webhooks.dispatch(data.businessId, 'purchase_order.created', {
      poId: po.id,
      poNumber: po.poNumber,
      supplierId: po.supplierId,
      supplierName: po.supplier.name,
      totalItems: po.items.length,
      expectedDelivery: po.expectedDelivery?.toISOString() ?? null,
    }).catch(() => {});

    return po;
  }

  async listPOs(businessId: string, options?: { supplierId?: string; status?: string }) {
    return this.prisma.purchaseOrder.findMany({
      where: {
        businessId,
        ...(options?.supplierId && { supplierId: options.supplierId }),
        ...(options?.status && options.status !== 'ALL' && { status: options.status }),
      },
      include: {
        supplier: { select: { name: true } },
        items: true,
        grns: { include: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getPO(id: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id },
      include: {
        supplier: { select: { name: true } },
        items: true,
        grns: { include: { items: true } },
      },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    return po;
  }

  async updatePOStatus(id: string, status: string) {
    const valid = ['DRAFT', 'SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CANCELLED'];
    if (!valid.includes(status)) {
      throw new BadRequestException(`Invalid status: ${status}`);
    }
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { status },
      include: {
        supplier: { select: { name: true } },
        items: true,
        grns: { include: { items: true } },
      },
    });
  }

  // ── Goods Received Notes ─────────────────────────────────────────────────────

  async createGRN(
    poId: string,
    storeId: string,
    items: Array<{
      poItemId: string;
      quantityReceived: number;
      batchLotNumber?: string;
      expiryDate?: string;
    }>,
  ) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { items: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');
    if (!['APPROVED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      throw new BadRequestException('PO must be Approved before recording receipt');
    }

    const grn = await this.prisma.$transaction(async (tx) => {
      // Create the GRN record
      const newGrn = await tx.gRN.create({
        data: {
          poId,
          items: {
            create: items.map((item) => ({
              poItemId: item.poItemId,
              quantityReceived: item.quantityReceived,
              batchLotNumber: item.batchLotNumber,
              expiryDate: item.expiryDate ? new Date(item.expiryDate) : undefined,
            })),
          },
        },
        include: { items: true },
      });

      // Create inventory movements for each received item
      for (const grnItem of items) {
        if (grnItem.quantityReceived <= 0) continue;
        const poItem = po.items.find((p) => p.id === grnItem.poItemId);
        if (!poItem) continue;

        await tx.inventoryMovement.create({
          data: {
            offlineId: uuidv4(),
            itemId: poItem.itemId,
            storeId,
            businessId: po.businessId,
            type: 'GRN_RECEIPT',
            quantity: grnItem.quantityReceived,
            grnId: newGrn.id,
            source: 'GRN',
          },
        });
      }

      // Determine new PO status based on all GRNs
      const allGrns = await tx.gRN.findMany({
        where: { poId },
        include: { items: true },
      });
      const totalOrdered = po.items.reduce((s, i) => s + i.quantityOrdered, 0);
      const totalReceived = allGrns.flatMap((g) => g.items).reduce((s, i) => s + i.quantityReceived, 0);
      const newStatus = totalReceived >= totalOrdered ? 'RECEIVED' : 'PARTIALLY_RECEIVED';

      await tx.purchaseOrder.update({
        where: { id: poId },
        data: { status: newStatus },
      });

      return newGrn;
    });

    return grn;
  }

  // ── Purchase Order Email ──────────────────────────────────────────────────────

  async emailPO(poId: string, recipientEmail: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { supplier: true, items: true },
    });
    if (!po) throw new NotFoundException('Purchase order not found');

    const [business, itemRecords] = await Promise.all([
      this.prisma.business.findUnique({ where: { id: po.businessId }, select: { name: true } }),
      this.prisma.item.findMany({ where: { id: { in: po.items.map((i) => i.itemId) } }, select: { id: true, name: true } }),
    ]);
    const itemNameMap = new Map(itemRecords.map((i) => [i.id, i.name]));

    const lineItems = po.items
      .map((i) => `  - ${itemNameMap.get(i.itemId) ?? i.itemId}  x${i.quantityOrdered}  @ KES ${(i.agreedPriceCents / 100).toFixed(2)}`)
      .join('\n');
    const total = po.items.reduce((s, i) => s + i.quantityOrdered * i.agreedPriceCents, 0);
    const body = [
      `Dear ${po.supplier.name},`,
      '',
      `Please find below our Purchase Order ${po.poNumber}.`,
      '',
      lineItems,
      '',
      `Total: KES ${(total / 100).toFixed(2)}`,
      ...(po.notes ? [`Notes: ${po.notes}`, ''] : []),
      `Issued by: ${business?.name ?? 'Universal POS'}`,
      `Date: ${new Date().toLocaleDateString('en-KE')}`,
      '',
      'Kindly confirm receipt of this order.',
      '',
      'Thank you.',
    ].join('\n');

    const smtpHost = process.env.SMTP_HOST;
    if (!smtpHost) {
      this.logger.warn(`[PO EMAIL - no SMTP configured]\nTo: ${recipientEmail}\nSubject: Purchase Order ${po.poNumber}\n\n${body}`);
      return {
        success: true,
        simulated: true,
        message: 'Email logged to server console (SMTP not configured). Set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS env vars to enable delivery.',
        preview: body,
      };
    }

    // Send via raw SMTP using node's built-in net module (no external packages required)
    try {
      await sendSmtpEmail({
        host: smtpHost,
        port: Number(process.env.SMTP_PORT ?? 587),
        user: process.env.SMTP_USER ?? '',
        pass: process.env.SMTP_PASS ?? '',
        from: process.env.SMTP_FROM ?? `noreply@${smtpHost}`,
        to: recipientEmail,
        subject: `Purchase Order ${po.poNumber} — ${business?.name ?? 'Universal POS'}`,
        text: body,
      });
      return { success: true, message: `PO emailed to ${recipientEmail}` };
    } catch (err: any) {
      this.logger.error(`PO email failed: ${err.message}`);
      throw new BadRequestException(`Email delivery failed: ${err.message}`);
    }
  }

  // ─── Supplier Credit Notes ─────────────────────────────────────────────────

  async createCreditNote(data: {
    businessId: string;
    supplierId: string;
    amountCents: number;
    reason: string;
  }) {
    const count = await this.prisma.supplierCreditNote.count({
      where: { businessId: data.businessId },
    });
    const creditNumber = `CN-${String(count + 1).padStart(4, '0')}`;
    return this.prisma.supplierCreditNote.create({
      data: { ...data, creditNumber },
      include: { supplier: true },
    });
  }

  async getCreditNotes(businessId: string, supplierId?: string) {
    return this.prisma.supplierCreditNote.findMany({
      where: { businessId, ...(supplierId && { supplierId }) },
      include: { supplier: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async applyCreditNote(id: string, poId: string) {
    return this.prisma.supplierCreditNote.update({
      where: { id },
      data: { status: 'APPLIED', appliedToPOId: poId },
    });
  }

  async voidCreditNote(id: string) {
    return this.prisma.supplierCreditNote.update({
      where: { id },
      data: { status: 'VOIDED' },
    });
  }

  async getOutstandingPOs(businessId: string) {
    return this.prisma.purchaseOrder.findMany({
      where: {
        businessId,
        status: { in: ['SUBMITTED', 'APPROVED', 'PARTIALLY_RECEIVED'] },
      },
      include: {
        supplier: { select: { name: true } },
        items: true,
        grns: { include: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async invoicePO(id: string, invoiceNumber: string) {
    return this.prisma.purchaseOrder.update({
      where: { id },
      data: { invoiceNumber, invoicedAt: new Date() },
      include: { supplier: true, items: true },
    });
  }

  // ── Print PO as plain text ────────────────────────────────────────────────────

  async generatePOText(poId: string): Promise<string> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { supplier: true, items: true },
    });
    if (!po) throw new NotFoundException('PO not found');

    const itemIds = po.items.map(i => i.itemId);
    const itemRecords = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, name: true },
    });
    const itemMap = new Map(itemRecords.map(i => [i.id, i]));

    const lines: string[] = [];
    lines.push('PURCHASE ORDER');
    lines.push('==============');
    lines.push(`PO Number:   ${po.poNumber}`);
    lines.push(`Date:        ${po.createdAt.toLocaleDateString('en-KE')}`);
    if (po.expectedDelivery) lines.push(`Expected:    ${new Date(po.expectedDelivery).toLocaleDateString('en-KE')}`);
    lines.push(`Supplier:    ${po.supplier.name}`);
    if ((po.supplier as any).contact) lines.push(`Contact:     ${(po.supplier as any).contact}`);
    if (po.notes) lines.push(`Notes:       ${po.notes}`);
    lines.push('');
    lines.push('ITEMS');
    lines.push('-----');
    let total = 0;
    for (const item of po.items) {
      const lineTotal = item.quantityOrdered * item.agreedPriceCents;
      total += lineTotal;
      const itemName = itemMap.get(item.itemId)?.name ?? item.itemId;
      lines.push(`${itemName}`);
      lines.push(`  Qty: ${item.quantityOrdered}  Unit: KES ${(item.agreedPriceCents / 100).toFixed(2)}  Total: KES ${(lineTotal / 100).toFixed(2)}`);
    }
    lines.push('');
    lines.push(`TOTAL: KES ${(total / 100).toFixed(2)}`);
    lines.push('');
    lines.push('Authorized Signature: ___________________');
    lines.push('Date: ___________________');
    return lines.join('\n');
  }

  // ── Force-close a partial PO ──────────────────────────────────────────────────

  async closePO(poId: string): Promise<void> {
    const po = await this.prisma.purchaseOrder.findUnique({ where: { id: poId } });
    if (!po) throw new NotFoundException('PO not found');
    await this.prisma.purchaseOrder.update({
      where: { id: poId },
      data: { status: 'RECEIVED' },
    });
  }

  // ── Supplier Returns ──────────────────────────────────────────────────────────

  async createSupplierReturn(businessId: string, data: {
    supplierId: string;
    purchaseOrderId?: string;
    reason: string;
    notes?: string;
    storeId: string;
    items: Array<{ itemId: string; quantity: number; unitCostCents: number; reason?: string }>;
  }) {
    const count = await this.prisma.supplierReturn.count({ where: { businessId } });
    const returnNumber = `RTS-${String(count + 1).padStart(4, '0')}`;
    const totalCents = data.items.reduce((s, i) => s + i.quantity * i.unitCostCents, 0);

    const supplierReturn = await this.prisma.supplierReturn.create({
      data: {
        businessId,
        supplierId: data.supplierId,
        purchaseOrderId: data.purchaseOrderId,
        returnNumber,
        reason: data.reason,
        notes: data.notes,
        totalCents,
        items: {
          create: data.items.map(i => ({
            itemId: i.itemId,
            quantity: i.quantity,
            unitCostCents: i.unitCostCents,
            totalCents: i.quantity * i.unitCostCents,
            reason: i.reason,
          })),
        },
      },
      include: { items: true },
    });

    // Reverse inventory
    for (const item of data.items) {
      await this.prisma.inventoryMovement.create({
        data: {
          businessId,
          storeId: data.storeId,
          itemId: item.itemId,
          type: 'ADJUSTMENT',
          quantity: -item.quantity,
          source: `Supplier Return ${returnNumber}: ${data.reason}`,
          offlineId: `rts-${supplierReturn.id}-${item.itemId}`,
        },
      });
    }
    return supplierReturn;
  }

  async getSupplierReturns(businessId: string, supplierId?: string) {
    return this.prisma.supplierReturn.findMany({
      where: { businessId, ...(supplierId ? { supplierId } : {}) },
      include: {
        items: true,
        supplier: { select: { name: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateReturnStatus(returnId: string, status: string) {
    return this.prisma.supplierReturn.update({ where: { id: returnId }, data: { status } });
  }

  // ── Supplier Invoices ──────────────────────────────────────────────────────────

  async createSupplierInvoice(businessId: string, data: {
    supplierId: string;
    purchaseOrderId?: string;
    invoiceNumber: string;
    invoiceDateStr: string;
    totalCents: number;
    notes?: string;
  }) {
    return this.prisma.supplierInvoice.create({ data: { businessId, ...data } });
  }

  async getSupplierInvoices(businessId: string, supplierId?: string) {
    return this.prisma.supplierInvoice.findMany({
      where: { businessId, ...(supplierId ? { supplierId } : {}) },
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async updateInvoiceStatus(invoiceId: string, status: string) {
    return this.prisma.supplierInvoice.update({ where: { id: invoiceId }, data: { status } });
  }

  async threeWayMatch(businessId: string, purchaseOrderId: string) {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: purchaseOrderId },
      include: { items: true },
    });
    if (!po) throw new NotFoundException('PO not found');

    // GRN items via GRN records linked to this PO
    const grns = await this.prisma.gRN.findMany({
      where: { poId: purchaseOrderId },
      include: { items: true },
    });
    const receivedQty = new Map<string, number>();
    for (const grn of grns) {
      for (const gi of grn.items) {
        // Find the poItem to get itemId
        const poItem = po.items.find(p => p.id === gi.poItemId);
        if (poItem) {
          receivedQty.set(poItem.itemId, (receivedQty.get(poItem.itemId) ?? 0) + gi.quantityReceived);
        }
      }
    }

    // Get item names
    const itemIds = po.items.map(p => p.itemId);
    const items = await this.prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true } });
    const itemMap = new Map(items.map(i => [i.id, i.name]));

    const invoice = await this.prisma.supplierInvoice.findFirst({
      where: { businessId, purchaseOrderId },
    });

    const lineMatches = po.items.map(poi => {
      const received = receivedQty.get(poi.itemId) ?? 0;
      const status = received === poi.quantityOrdered ? 'MATCHED' : received < poi.quantityOrdered ? 'SHORT' : 'EXCESS';
      return { itemId: poi.itemId, itemName: itemMap.get(poi.itemId) ?? poi.itemId, orderedQty: poi.quantityOrdered, receivedQty: received, status };
    });

    const poValueCents = po.items.reduce((s, i) => s + i.quantityOrdered * i.agreedPriceCents, 0);
    const invoiceValueCents = invoice?.totalCents ?? null;
    const valueMatch = invoiceValueCents !== null ? Math.abs(poValueCents - invoiceValueCents) < 100 : null;
    const overallStatus = lineMatches.every(l => l.status === 'MATCHED') && (valueMatch === true || valueMatch === null) ? 'MATCHED' : 'DISCREPANCY';

    if (invoice && overallStatus === 'MATCHED') {
      await this.prisma.supplierInvoice.update({ where: { id: invoice.id }, data: { status: 'MATCHED' } });
    }

    return { po: { id: po.id, orderNumber: po.poNumber, totalCents: poValueCents }, invoice, lineMatches, valueMatch, overallStatus };
  }

  // ── Supplier Price Agreements ─────────────────────────────────────────────

  async listPriceAgreements(supplierId: string, businessId: string) {
    return this.prisma.supplierPriceAgreement.findMany({
      where: { supplierId, businessId, isActive: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createPriceAgreement(supplierId: string, dto: {
    businessId: string;
    itemId: string;
    agreedPriceCents: number;
    minQuantity?: number;
    effectiveTo?: string;
    notes?: string;
  }) {
    return this.prisma.supplierPriceAgreement.create({
      data: {
        supplierId,
        businessId: dto.businessId,
        itemId: dto.itemId,
        agreedPriceCents: dto.agreedPriceCents,
        minQuantity: dto.minQuantity ?? 1,
        effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
        notes: dto.notes,
      },
    });
  }

  async deactivatePriceAgreement(id: string) {
    return this.prisma.supplierPriceAgreement.update({
      where: { id },
      data: { isActive: false },
    });
  }

  // ── Landed Cost Allocation ────────────────────────────────────────────────────

  async allocateLandedCost(
    grnId: string,
    totalFreightCents: number,
    method: 'PROPORTIONAL' | 'EQUAL' = 'PROPORTIONAL',
  ) {
    const grn = await this.prisma.gRN.findUnique({
      where: { id: grnId },
      include: {
        items: true,
        po: { include: { items: true } },
      },
    });
    if (!grn) throw new NotFoundException('GRN not found');

    // Map poItemId → agreedPriceCents for value-based allocation
    const poItemMap = new Map(grn.po.items.map(pi => [pi.id, pi.agreedPriceCents]));

    const totalValue = grn.items.reduce((s, i) => {
      const unitCost = poItemMap.get(i.poItemId) ?? 0;
      return s + i.quantityReceived * unitCost;
    }, 0);

    for (const item of grn.items) {
      let landedCostCents: number;
      if (method === 'PROPORTIONAL' && totalValue > 0) {
        const unitCost = poItemMap.get(item.poItemId) ?? 0;
        const itemValue = item.quantityReceived * unitCost;
        landedCostCents = Math.round(totalFreightCents * itemValue / totalValue);
      } else {
        landedCostCents = Math.round(totalFreightCents / grn.items.length);
      }
      await this.prisma.gRNItem.update({
        where: { id: item.id },
        data: { landedCostCents },
      });
    }

    await this.prisma.gRN.update({
      where: { id: grnId },
      data: { landedCostAllocated: true, freightCents: totalFreightCents },
    });

    return { success: true, grnId, totalFreightCents, method, itemsUpdated: grn.items.length };
  }

  // ── Price Agreements (cross-business view) ────────────────────────────────────

  async getPriceAgreements(businessId: string, supplierId?: string) {
    return this.prisma.supplierPriceAgreement.findMany({
      where: { businessId, ...(supplierId ? { supplierId } : {}) },
      include: { supplier: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  async deletePriceAgreement(id: string) {
    return this.prisma.supplierPriceAgreement.delete({ where: { id } });
  }

  // ── Auto-reorder PO from reorder points ────────────────────────────────────

  async autoReorderCheck(businessId: string, storeId: string, supplierId?: string) {
    // Find items at or below reorder level with positive reorderQty
    const items = await this.prisma.item.findMany({
      where: {
        businessId,
        storeId,
        deletedAt: null,
        isActive: true,
        trackStock: true,
        reorderLevel: { gt: 0 },
        reorderQty: { gt: 0 },
      },
    });

    const triggered: Array<{ itemId: string; name: string; reorderQty: number; currentStock: number; reorderLevel: number }> = [];

    for (const item of items) {
      const agg = await this.prisma.inventoryMovement.aggregate({
        where: { itemId: item.id, storeId },
        _sum: { quantity: true },
      });
      const stock = agg._sum.quantity ?? 0;
      if (stock <= (item.reorderLevel ?? 0)) {
        triggered.push({
          itemId: item.id,
          name: item.name,
          reorderQty: item.reorderQty,
          currentStock: stock,
          reorderLevel: item.reorderLevel ?? 0,
        });
      }
    }

    if (triggered.length === 0) {
      return { message: 'No items below reorder point', posCreated: null };
    }

    // Resolve default supplier
    let resolvedSupplierId = supplierId;
    if (!resolvedSupplierId) {
      const defaultSupplier = await this.prisma.supplier.findFirst({ where: { businessId } });
      if (!defaultSupplier) {
        return { message: 'Items need reordering but no supplier found', triggered, posCreated: null };
      }
      resolvedSupplierId = defaultSupplier.id;
    }

    // Create a PO for all triggered items
    const poNumber = `AUTO-${Date.now()}`;
    const po = await this.prisma.purchaseOrder.create({
      data: {
        businessId,
        supplierId: resolvedSupplierId,
        poNumber,
        status: 'DRAFT',
        expectedDelivery: new Date(Date.now() + 7 * 86400000),
        items: {
          create: triggered.map((t) => ({
            itemId: t.itemId,
            quantityOrdered: t.reorderQty,
            agreedPriceCents: 0,
          })),
        },
      },
      include: { items: true },
    });

    this.logger.log(`Auto-reorder PO ${poNumber} created for ${triggered.length} items (${businessId})`);
    return { message: `Auto-reorder PO created: ${poNumber}`, triggered, posCreated: po };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PdfService {
  constructor(private prisma: PrismaService) {}

  private htmlWrapper(title: string, content: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>${title}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 20px; font-size: 12px; color: #333; }
    h1 { font-size: 18px; color: #1a1a1a; border-bottom: 2px solid #333; padding-bottom: 8px; }
    h2 { font-size: 14px; color: #444; margin-top: 20px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th { background: #f0f0f0; padding: 8px; text-align: left; border: 1px solid #ddd; font-size: 11px; text-transform: uppercase; }
    td { padding: 6px 8px; border: 1px solid #ddd; }
    tr:nth-child(even) { background: #f9f9f9; }
    .total-row { font-weight: bold; background: #e8e8e8 !important; }
    .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
    .business-name { font-size: 20px; font-weight: bold; }
    .meta { color: #666; font-size: 11px; }
    .amount { text-align: right; font-family: monospace; }
    @media print { button { display: none; } }
    .print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; z-index: 10; }
    /* The Print button is fixed at the top-right, exactly where document headers put
       the invoice/receipt number. Reserve room for it on screen only. */
    @media screen { body { padding-top: 44px; } }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  ${content}
</body>
</html>`;
  }

  async generateSaleReceipt(saleId: string): Promise<string> {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: {
        items: true,
        payments: true,
        cashier: { select: { name: true } },
        store: { select: { name: true, storeCode: true } },
      },
    });
    if (!sale) throw new Error('Sale not found');

    const business = await this.prisma.business.findUnique({ where: { id: sale.businessId } });

    const fmt = (c: number) => `KES ${(c / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const isProforma = sale.type === 'PROFORMA';
    const isVoided = sale.status === 'VOIDED';

    // POS pricing is VAT-inclusive: totalCents = (subtotal − discount) + serviceCharge, and
    // vatCents is *extracted* from that base rather than added on top. So the tax lines are a
    // breakdown of the total, never an addition to it — printing them as an addition would
    // overstate the bill and disagree with what the customer actually paid.
    const taxBase = sale.subtotalCents - sale.discountCents;
    const taxCents = sale.vatCents + sale.totCents;
    const netCents = taxBase - taxCents;
    const taxLabel = sale.totCents > 0 ? 'Turnover Tax' : 'VAT';
    const taxRate = netCents > 0 ? Math.round((taxCents / netCents) * 100) : 0;

    const itemRows = sale.items
      .map((i, idx) => `
        <tr>
          <td class="c muted num">${idx + 1}</td>
          <td>${this.esc(i.name)}</td>
          <td class="c num">${i.quantity}</td>
          <td class="r num">${fmt(i.unitPriceCents)}</td>
          <td class="r num">${fmt(i.totalCents)}</td>
        </tr>`).join('');

    const totals = this.docTotals([
      { label: 'Subtotal', value: fmt(sale.subtotalCents) },
      ...(sale.discountCents > 0 ? [{ label: 'Discount', value: `− ${fmt(sale.discountCents)}`, tone: 'muted' as const }] : []),
      ...(sale.serviceChargeCents > 0 ? [{ label: 'Service Charge', value: fmt(sale.serviceChargeCents), tone: 'muted' as const }] : []),
      { label: isProforma ? 'Total' : 'Total Paid', value: fmt(sale.totalCents), tone: 'grand' as const },
      // Only ever show tax that was actually charged.
      ...(taxCents > 0
        ? [
            { label: `Taxable amount (excl. ${taxLabel})`, value: fmt(netCents), tone: 'muted' as const },
            { label: `${taxLabel} (${taxRate}%) included`, value: fmt(taxCents), tone: 'muted' as const },
          ]
        : []),
    ]);

    const paymentLines = sale.payments.length
      ? sale.payments.map((p) => `${this.esc(p.method)} &middot; <strong>${fmt(p.amountCents)}</strong>${p.reference ? `<div class="muted" style="font-size:9.5px">Ref ${this.esc(p.reference)}</div>` : ''}`)
      : ['<span class="muted">No payment recorded</span>'];

    const body = `
      <table class="items">
        <thead>
          <tr>
            <th class="c" style="width:34px">#</th>
            <th>Item</th>
            <th class="c" style="width:52px">Qty</th>
            <th class="r" style="width:112px">Unit Price</th>
            <th class="r" style="width:112px">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows || '<tr><td colspan="5" class="c muted" style="padding:18px">No items on this sale.</td></tr>'}</tbody>
      </table>

      <div class="sum">
        <div class="sum-l">
          <div class="words">
            <span class="lbl">Amount in Words</span>
            <div class="val">${this.esc(this.amountInWords(sale.totalCents))}</div>
          </div>
        </div>
        <div class="sum-r">${totals}</div>
      </div>

      ${isProforma ? `
      <div class="nb" style="margin-top:20px">
        <span class="lbl">Validity</span>
        <div style="margin-top:2px">${sale.proformaValidUntil
          ? `This quotation is valid until <strong>${new Date(sale.proformaValidUntil).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' })}</strong>.`
          : 'This is a quotation, not a demand for payment. Goods are not reserved until the order is confirmed.'}</div>
      </div>` : ''}
    `;

    return this.docShell({
      title: `${isProforma ? 'Proforma' : 'Receipt'} ${sale.receiptNumber ?? saleId}`,
      docType: isProforma ? 'Proforma Invoice' : 'Sales Receipt',
      businessName: business?.name ?? 'Business',
      addressLines: [
        ...(business?.receiptHeader ?? '').split('\n').map((l) => l.trim()),
        sale.store ? `${sale.store.name} (${sale.store.storeCode})` : null,
      ],
      stamp: isVoided
        ? { label: 'Void', tone: 'bad' }
        : isProforma
          ? { label: 'Quotation', tone: 'info' }
          : { label: sale.status === 'CREDIT' ? 'On Credit' : 'Paid', tone: sale.status === 'CREDIT' ? 'warn' : 'ok' },
      meta: [
        { label: isProforma ? 'Quotation No.' : 'Receipt No.', value: this.esc(sale.receiptNumber ?? '—') },
        { label: 'Date', value: new Date(sale.createdAt).toLocaleString('en-KE', { day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }) },
        ...(sale.cashier?.name ? [{ label: 'Served By', value: this.esc(sale.cashier.name) }] : []),
        ...(sale.etimsControlNumber ? [{ label: 'eTIMS Control No.', value: this.esc(sale.etimsControlNumber) }] : []),
      ],
      parties: [
        {
          label: 'Customer',
          lines: [
            this.esc(sale.customerName ?? 'Walk-in customer'),
            sale.customerPhone ? this.esc(sale.customerPhone) : null,
          ],
        },
        { label: isProforma ? 'Terms' : 'Payment', lines: paymentLines },
      ],
      body,
      notes: sale.notes,
      footNote: business?.receiptFooter ? this.esc(business.receiptFooter) : 'Thank you for your business.',
      legalNote: `KRA eTIMS: ${sale.etimsSubmitted ? 'Submitted' : 'Pending submission'}${
        sale.etimsControlNumber ? ` · Control No. ${sale.etimsControlNumber}` : ''
      } · Computer-generated document.`,
    });
  }


  async generateVATReport(businessId: string, startDate: string, endDate: string): Promise<string> {
    const sales = await this.prisma.sale.findMany({
      where: {
        businessId,
        status: { in: ['PAID', 'AMENDED'] },
        createdAt: { gte: new Date(startDate), lte: new Date(endDate) },
      },
      select: { receiptNumber: true, totalCents: true, vatCents: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const business = await this.prisma.business.findUnique({ where: { id: businessId } });
    const totalVAT = sales.reduce((s, x) => s + x.vatCents, 0);
    const totalRevenue = sales.reduce((s, x) => s + x.totalCents, 0);

    const rows = sales
      .map(
        (s) => `
      <tr>
        <td>${s.receiptNumber ?? '—'}</td>
        <td>${new Date(s.createdAt).toLocaleDateString('en-KE')}</td>
        <td class="amount">KES ${((s.totalCents - s.vatCents) / 100).toFixed(2)}</td>
        <td class="amount">KES ${(s.vatCents / 100).toFixed(2)}</td>
        <td class="amount">KES ${(s.totalCents / 100).toFixed(2)}</td>
      </tr>
    `,
      )
      .join('');

    const content = `
      <div class="header">
        <div><div class="business-name">${business?.name ?? 'Business'}</div></div>
        <div class="meta">VAT Report: ${startDate} to ${endDate}</div>
      </div>
      <table>
        <thead><tr><th>Receipt</th><th>Date</th><th>Net Amount</th><th>VAT</th><th>Gross</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td colspan="2"><strong>TOTAL</strong></td>
            <td class="amount"><strong>KES ${((totalRevenue - totalVAT) / 100).toFixed(2)}</strong></td>
            <td class="amount"><strong>KES ${(totalVAT / 100).toFixed(2)}</strong></td>
            <td class="amount"><strong>KES ${(totalRevenue / 100).toFixed(2)}</strong></td>
          </tr>
        </tbody>
      </table>
      <p class="meta">Total transactions: ${sales.length}</p>
    `;
    return this.htmlWrapper('VAT Report', content);
  }

  async generatePurchaseOrder(poId: string): Promise<string> {
    const po = await this.prisma.purchaseOrder.findUnique({
      where: { id: poId },
      include: { supplier: true, items: true },
    });
    if (!po) throw new Error('PO not found');

    const itemIds = po.items.map((i) => i.itemId);
    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds } },
      select: { id: true, name: true },
    });
    const itemMap = new Map(items.map((i) => [i.id, i]));

    let total = 0;
    const rows = po.items
      .map((item) => {
        const lineTotal = item.quantityOrdered * item.agreedPriceCents;
        total += lineTotal;
        return `<tr>
        <td>${itemMap.get(item.itemId)?.name ?? item.itemId}</td>
        <td class="amount">${item.quantityOrdered}</td>
        <td class="amount">KES ${(item.agreedPriceCents / 100).toFixed(2)}</td>
        <td class="amount">KES ${(lineTotal / 100).toFixed(2)}</td>
      </tr>`;
      })
      .join('');

    const content = `
      <div class="header">
        <div><div class="business-name">PURCHASE ORDER</div><div class="meta">PO#: ${po.poNumber}</div></div>
        <div class="meta" style="text-align:right">
          <div>Supplier: ${po.supplier.name}</div>
          <div>Date: ${new Date(po.createdAt).toLocaleDateString('en-KE')}</div>
          ${po.expectedDelivery ? `<div>Expected: ${new Date(po.expectedDelivery).toLocaleDateString('en-KE')}</div>` : ''}
        </div>
      </div>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="total-row"><td colspan="3"><strong>TOTAL</strong></td><td class="amount"><strong>KES ${(total / 100).toFixed(2)}</strong></td></tr>
        </tbody>
      </table>
      <div style="margin-top:40px;display:flex;gap:80px">
        <div>Authorized By: ___________________<br><small>Date: ___________</small></div>
        <div>Received By: ___________________<br><small>Date: ___________</small></div>
      </div>
    `;
    return this.htmlWrapper(`PO ${po.poNumber}`, content);
  }

  async generatePayslip(employeeId: string, month: number, year: number): Promise<string> {
    try {
      const payslip = await (this.prisma as any).payslip
        .findFirst({
          where: { employeeId },
          include: { payrollRun: true },
          orderBy: { createdAt: 'desc' },
        })
        .catch(() => null);

      if (!payslip) {
        const emp = await this.prisma.employee.findUnique({
          where: { id: employeeId },
          include: { user: true },
        });
        if (!emp) throw new Error('Employee not found');
        const content = `<h1>Payslip — ${month}/${year}</h1><p>Employee: ${(emp as any).user?.name ?? employeeId}</p><p>No payroll run found for this period.</p>`;
        return this.htmlWrapper('Payslip', content);
      }

      const content = `
        <h1>PAYSLIP — ${payslip.payrollRun.month}/${payslip.payrollRun.year}</h1>
        <div class="header">
          <div><strong>Employee:</strong> ${payslip.employeeName}</div>
          <div class="meta">Status: ${payslip.status}</div>
        </div>
        <table>
          <thead><tr><th>Description</th><th class="amount">Amount (KES)</th></tr></thead>
          <tbody>
            <tr><td>Basic Salary</td><td class="amount">${(payslip.basicSalary / 100).toFixed(2)}</td></tr>
            <tr><td>Housing Allowance</td><td class="amount">${(payslip.housingAllowance / 100).toFixed(2)}</td></tr>
            <tr><td>Transport Allowance</td><td class="amount">${(payslip.transportAllowance / 100).toFixed(2)}</td></tr>
            <tr><td>Commission</td><td class="amount">${(payslip.commissionCents / 100).toFixed(2)}</td></tr>
            <tr class="total-row"><td><strong>GROSS PAY</strong></td><td class="amount"><strong>${(payslip.grossPay / 100).toFixed(2)}</strong></td></tr>
            <tr><td style="color:red">PAYE (Income Tax)</td><td class="amount" style="color:red">-${(payslip.payeAmount / 100).toFixed(2)}</td></tr>
            <tr><td style="color:red">SHIF</td><td class="amount" style="color:red">-${(payslip.shifAmount / 100).toFixed(2)}</td></tr>
            <tr><td style="color:red">NSSF Tier 1</td><td class="amount" style="color:red">-${(payslip.nssf1Amount / 100).toFixed(2)}</td></tr>
            <tr><td style="color:red">NSSF Tier 2</td><td class="amount" style="color:red">-${(payslip.nssf2Amount / 100).toFixed(2)}</td></tr>
            <tr><td style="color:red">Housing Levy (1.5%)</td><td class="amount" style="color:red">-${(payslip.housingLevyAmount / 100).toFixed(2)}</td></tr>
            <tr class="total-row"><td><strong>NET PAY</strong></td><td class="amount"><strong>${(payslip.netPay / 100).toFixed(2)}</strong></td></tr>
          </tbody>
        </table>
      `;
      return this.htmlWrapper('Payslip', content);
    } catch {
      const content = `<h1>Payslip — ${month}/${year}</h1><p>Unable to generate payslip for this employee/period.</p>`;
      return this.htmlWrapper('Payslip', content);
    }
  }

  /**
   * A4 Delivery Receipt with signature block.
   * Professional format for driver delivery confirmation.
   */
  async generateDeliveryReceipt(deliveryId: string): Promise<string> {
    const delivery = await this.prisma.deliveryOrder.findUnique({
      where: { id: deliveryId },
      include: {
        sale: { include: { items: true, payments: true } },
        customer: true,
        business: true,
      },
    });
    if (!delivery) throw new Error('Delivery not found');

    const business = delivery.business;
    const sale = delivery.sale;
    const fmt = (c: number) => `KES ${(c / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const asDate = (d: Date) => d.toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' });
    const asDateTime = (d: Date) => d.toLocaleString('en-KE', {
      day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const delivered = delivery.status === 'DELIVERED';
    const grandTotalCents = (sale?.totalCents ?? 0) + delivery.deliveryFeeCents;

    const itemRows = (sale?.items ?? [])
      .map((i, idx) => `
        <tr>
          <td class="c muted num">${idx + 1}</td>
          <td>${this.esc(i.name)}</td>
          <td class="c num">${i.quantity}</td>
          <td class="r num">${fmt(i.unitPriceCents)}</td>
          <td class="r num">${fmt(i.totalCents)}</td>
        </tr>`).join('');

    // As with the POS receipt, sale tax is extracted from a VAT-inclusive total, so it is
    // shown as a breakdown of the amount due rather than a line added to it.
    const saleTaxCents = (sale?.vatCents ?? 0) + (sale?.totCents ?? 0);
    const totals = sale
      ? this.docTotals([
          { label: 'Goods', value: fmt(sale.totalCents) },
          ...(delivery.deliveryFeeCents > 0
            ? [{ label: 'Delivery Fee', value: fmt(delivery.deliveryFeeCents), tone: 'muted' as const }]
            : []),
          { label: 'Total', value: fmt(grandTotalCents), tone: 'grand' as const },
          ...(saleTaxCents > 0
            ? [{ label: `${sale.totCents > 0 ? 'Turnover Tax' : 'VAT'} included`, value: fmt(saleTaxCents), tone: 'muted' as const }]
            : []),
        ])
      : '';

    const body = `
      ${sale ? `
      <table class="items">
        <thead>
          <tr>
            <th class="c" style="width:34px">#</th>
            <th>Item</th>
            <th class="c" style="width:52px">Qty</th>
            <th class="r" style="width:112px">Unit Price</th>
            <th class="r" style="width:112px">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
      </table>

      <div class="sum">
        <div class="sum-l">
          <div class="words">
            <span class="lbl">Amount in Words</span>
            <div class="val">${this.esc(this.amountInWords(grandTotalCents))}</div>
          </div>
        </div>
        <div class="sum-r">${totals}</div>
      </div>` : ''}

      <div style="margin-top:24px;padding:14px 16px;border:1px solid var(--accent);border-radius:4px;page-break-inside:avoid">
        <div style="font-size:9px;font-weight:bold;letter-spacing:.1em;text-transform:uppercase;color:var(--accent)">Delivery Confirmation</div>
        ${this.docSignatures([
          { caption: 'Delivered by — driver name & signature' },
          { caption: 'Received by — name & signature', value: delivery.receivedBy },
        ])}
        ${this.docSignatures([
          { caption: 'Date & time received', value: delivery.deliveredAt ? asDateTime(new Date(delivery.deliveredAt)) : null },
          { caption: 'ID number (optional)' },
        ])}
      </div>
    `;

    return this.docShell({
      title: `Delivery Receipt ${delivery.orderNumber}`,
      docType: 'Delivery Receipt',
      businessName: business?.name ?? 'Business',
      addressLines: (business?.receiptHeader ?? '').split('\n').map((l) => l.trim()),
      stamp: delivered
        ? { label: 'Delivered', tone: 'ok' }
        : delivery.status === 'CANCELLED'
          ? { label: 'Cancelled', tone: 'bad' }
          : { label: delivery.status, tone: 'warn' },
      meta: [
        { label: 'Order No.', value: this.esc(delivery.orderNumber) },
        { label: 'Date', value: asDate(new Date(delivery.createdAt)) },
        ...(sale?.receiptNumber ? [{ label: 'Receipt No.', value: this.esc(sale.receiptNumber) }] : []),
        ...(delivery.deliveredAt
          ? [{ label: 'Delivered', value: asDateTime(new Date(delivery.deliveredAt)) }]
          : []),
      ],
      parties: [
        {
          label: 'Deliver To',
          lines: [
            this.esc(delivery.customerName),
            delivery.customerPhone ? this.esc(delivery.customerPhone) : null,
            `<span class="muted">${this.esc(delivery.deliveryAddress)}</span>`,
          ],
        },
        {
          label: 'Delivery',
          lines: [
            this.esc(delivery.status),
            delivery.scheduledAt ? `<span class="muted">Scheduled</span> ${asDateTime(new Date(delivery.scheduledAt))}` : null,
            delivery.receivedBy ? `<span class="muted">Received by</span> <strong>${this.esc(delivery.receivedBy)}</strong>` : null,
          ],
        },
      ],
      body,
      notes: delivery.notes,
      footNote: business?.receiptFooter ? this.esc(business.receiptFooter) : '',
      legalNote: 'Computer-generated delivery receipt. Please check goods on receipt — shortages must be reported within 24 hours.',
    });
  }

  async generateCustomerStatement(customerId: string, startDate: Date, endDate: Date): Promise<string> {
    const customer = await this.prisma.customer.findUnique({ where: { id: customerId } });
    if (!customer) throw new Error('Customer not found');

    const business = await this.prisma.business.findUnique({ where: { id: customer.businessId } });

    const sales = await this.prisma.sale.findMany({
      where: {
        customerId,
        status: { in: ['PAID', 'AMENDED'] },
        createdAt: { gte: startDate, lte: endDate },
      },
      include: { payments: true },
      orderBy: { createdAt: 'asc' },
    });

    let runningBalance = 0;
    const rows = sales
      .map((sale) => {
        runningBalance += sale.totalCents;
        const paymentMethod =
          sale.payments.length > 0
            ? sale.payments.map((p) => p.method).join(', ')
            : '—';
        return `<tr>
          <td>${new Date(sale.createdAt).toLocaleDateString('en-KE')}</td>
          <td>${sale.receiptNumber ?? '—'}</td>
          <td class="amount">KES ${(sale.totalCents / 100).toFixed(2)}</td>
          <td>${paymentMethod}</td>
          <td class="amount">KES ${(runningBalance / 100).toFixed(2)}</td>
        </tr>`;
      })
      .join('');

    const startStr = startDate.toLocaleDateString('en-KE');
    const endStr = endDate.toLocaleDateString('en-KE');

    const content = `
      <div class="header">
        <div>
          <div class="business-name">${business?.name ?? 'Business'}</div>
          <div class="meta">Customer Statement</div>
          <div class="meta">Period: ${startStr} — ${endStr}</div>
        </div>
        <div class="meta" style="text-align:right">
          <div>Generated: ${new Date().toLocaleDateString('en-KE')}</div>
        </div>
      </div>

      <div style="border:1px solid #ddd;padding:12px;margin-bottom:16px;border-radius:4px;background:#f9f9f9">
        <strong>Customer:</strong> ${customer.name}<br/>
        ${customer.phone ? `<strong>Phone:</strong> ${customer.phone}<br/>` : ''}
        ${customer.email ? `<strong>Email:</strong> ${customer.email}<br/>` : ''}
        <strong>Loyalty Points:</strong> ${customer.loyaltyPoints.toLocaleString()} pts
      </div>

      ${
        sales.length === 0
          ? '<p style="color:#666">No sales found for this period.</p>'
          : `<table>
        <thead>
          <tr>
            <th>Date</th>
            <th>Receipt #</th>
            <th>Total</th>
            <th>Payment Method</th>
            <th>Balance</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>`
      }

      <div style="margin-top:20px;padding:12px;border-top:2px solid #333">
        <strong>Current Outstanding Balance:</strong>
        <span style="font-size:16px;font-weight:bold;color:${customer.balanceCents < 0 ? 'red' : 'green'}">
          KES ${Math.abs(customer.balanceCents / 100).toFixed(2)}
          ${customer.balanceCents < 0 ? ' (owed)' : customer.balanceCents > 0 ? ' (credit)' : ''}
        </span>
      </div>
    `;

    return this.htmlWrapper(`Customer Statement — ${customer.name}`, content);
  }

  async generateP9(employeeId: string, year: number): Promise<string> {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

    // Fetch employee info
    const emp = await this.prisma.employee.findUnique({
      where: { id: employeeId },
      include: { user: true },
    });
    if (!emp) throw new Error('Employee not found');

    const business = await this.prisma.business.findUnique({ where: { id: (emp as any).businessId } });

    // Fetch all payslips for this employee in the year
    const payslips: any[] = await (this.prisma as any).payslip.findMany({
      where: { employeeId },
      include: { payrollRun: { where: { year } } },
      orderBy: { createdAt: 'asc' },
    }).catch(() => []);

    // Filter to the requested year only
    const yearPayslips = payslips.filter((p: any) => p.payrollRun?.year === year);

    // Build monthly rows (all 12 months, empty if no data)
    let totalGross = 0, totalPaye = 0, totalShif = 0, totalNssf = 0;
    let totalHousingLevy = 0, totalNetPay = 0, totalPersonalRelief = 0;

    const rows = MONTHS.map((m, i) => {
      const month = i + 1;
      const p = yearPayslips.find((x: any) => x.payrollRun?.month === month);
      if (!p) {
        return `<tr>
          <td>${m}</td>
          <td class="amount">—</td><td class="amount">—</td><td class="amount">—</td>
          <td class="amount">—</td><td class="amount">—</td><td class="amount">—</td>
          <td class="amount">—</td><td class="amount">—</td>
        </tr>`;
      }
      const personalRelief = 240000; // KES 2,400 in cents
      totalGross += p.grossPay ?? 0;
      totalPaye += p.payeAmount ?? 0;
      totalShif += p.shifAmount ?? 0;
      totalNssf += (p.nssf1Amount ?? 0) + (p.nssf2Amount ?? 0);
      totalHousingLevy += p.housingLevyAmount ?? 0;
      totalNetPay += p.netPay ?? 0;
      totalPersonalRelief += personalRelief;

      const fmt = (c: number) => (c / 100).toFixed(2);
      return `<tr>
        <td>${m}</td>
        <td class="amount">${fmt(p.grossPay ?? 0)}</td>
        <td class="amount">${fmt((p.nssf1Amount ?? 0) + (p.nssf2Amount ?? 0))}</td>
        <td class="amount">${fmt(Math.max(0, (p.grossPay ?? 0) - (p.nssf1Amount ?? 0) - (p.nssf2Amount ?? 0)))}</td>
        <td class="amount">${fmt(p.payeAmount ?? 0)}</td>
        <td class="amount">${fmt(personalRelief)}</td>
        <td class="amount">${fmt(p.shifAmount ?? 0)}</td>
        <td class="amount">${fmt(p.housingLevyAmount ?? 0)}</td>
        <td class="amount">${fmt(p.netPay ?? 0)}</td>
      </tr>`;
    }).join('');

    const fmt = (c: number) => (c / 100).toFixed(2);
    const empName = (emp as any).user?.name ?? employeeId;

    const content = `
      <div style="border: 2px solid #333; padding: 20px; margin-bottom: 20px;">
        <div style="text-align: center; margin-bottom: 16px;">
          <h1 style="font-size: 16px; margin: 0;">KENYA REVENUE AUTHORITY</h1>
          <h2 style="font-size: 14px; margin: 4px 0;">P9A FORM — PAY AS YOU EARN</h2>
          <p style="margin: 0; font-size: 12px;">Tax Year: ${year}</p>
        </div>

        <table style="width: 100%; margin-bottom: 16px; border-collapse: collapse;">
          <tr>
            <td style="padding: 4px 8px; width: 50%;"><strong>Employer Name:</strong> ${business?.name ?? '—'}</td>
            <td style="padding: 4px 8px;"><strong>Employee Name:</strong> ${empName}</td>
          </tr>
          <tr>
            <td style="padding: 4px 8px;"><strong>Employer KRA PIN:</strong> _______________</td>
            <td style="padding: 4px 8px;"><strong>Employee KRA PIN:</strong> _______________</td>
          </tr>
          <tr>
            <td style="padding: 4px 8px;"><strong>Period:</strong> January ${year} — December ${year}</td>
            <td style="padding: 4px 8px;"><strong>Employee ID:</strong> ${(emp as any).employeeNumber ?? employeeId}</td>
          </tr>
        </table>
      </div>

      <table>
        <thead>
          <tr>
            <th>Month</th>
            <th class="amount">Gross Pay<br/>(KES)</th>
            <th class="amount">NSSF<br/>(KES)</th>
            <th class="amount">Taxable Pay<br/>(KES)</th>
            <th class="amount">Tax Charged<br/>(KES)</th>
            <th class="amount">Personal Relief<br/>(KES)</th>
            <th class="amount">SHIF<br/>(KES)</th>
            <th class="amount">Housing Levy<br/>(KES)</th>
            <th class="amount">Net Pay<br/>(KES)</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
          <tr class="total-row">
            <td><strong>TOTAL</strong></td>
            <td class="amount"><strong>${fmt(totalGross)}</strong></td>
            <td class="amount"><strong>${fmt(totalNssf)}</strong></td>
            <td class="amount"><strong>${fmt(Math.max(0, totalGross - totalNssf))}</strong></td>
            <td class="amount"><strong>${fmt(totalPaye)}</strong></td>
            <td class="amount"><strong>${fmt(totalPersonalRelief)}</strong></td>
            <td class="amount"><strong>${fmt(totalShif)}</strong></td>
            <td class="amount"><strong>${fmt(totalHousingLevy)}</strong></td>
            <td class="amount"><strong>${fmt(totalNetPay)}</strong></td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top: 40px; display: flex; gap: 80px; font-size: 12px;">
        <div>
          Employer Signature: ___________________<br/>
          <small>Date: ___________</small>
        </div>
        <div>
          Employee Signature: ___________________<br/>
          <small>Date: ___________</small>
        </div>
      </div>
      <p style="margin-top: 20px; font-size: 10px; color: #666;">
        This P9A form is computer-generated. Verify all figures before submission to KRA.
        File by 31st January ${year + 1}.
      </p>
    `;
    return this.htmlWrapper(`P9A — ${empName} — ${year}`, content);
  }

  async generateDebitNote(returnId: string): Promise<string> {
    const ret = await this.prisma.supplierReturn.findUnique({
      where: { id: returnId },
      include: {
        items: { include: { item: { select: { name: true, barcode: true } } } },
        supplier: true,
      },
    });
    if (!ret) throw new Error('Return not found');
    const business = await this.prisma.business.findUnique({ where: { id: ret.businessId } });

    const rows = (ret as any).items.map((i: any) => `<tr>
      <td>${i.item.name}</td><td>${i.item.barcode ?? '—'}</td>
      <td style="text-align:center">${i.quantity}</td>
      <td class="amount">KES ${(i.unitCostCents / 100).toFixed(2)}</td>
      <td class="amount">KES ${(i.totalCents / 100).toFixed(2)}</td>
      <td>${i.reason ?? '—'}</td>
    </tr>`).join('');

    const content = `
      <div class="header">
        <div>
          <div class="business-name">${business?.name ?? 'Business'}</div>
          <div class="meta">DEBIT NOTE — ${ret.returnNumber}</div>
          <div class="meta">Date: ${new Date(ret.createdAt).toLocaleDateString('en-KE')}</div>
        </div>
        <div class="meta" style="text-align:right">
          <strong>Supplier:</strong> ${(ret as any).supplier?.name ?? ret.supplierId}<br/>
          <strong>Status:</strong> ${ret.status}
        </div>
      </div>
      <div style="padding:10px;background:#fff3cd;border:1px solid #ffc107;border-radius:4px;margin-bottom:16px">
        <strong>Reason:</strong> ${ret.reason}${ret.notes ? `<br/><strong>Notes:</strong> ${ret.notes}` : ''}
      </div>
      <table>
        <thead><tr><th>Item</th><th>SKU</th><th>Qty</th><th>Unit Cost</th><th>Total</th><th>Reason</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
      <div style="margin-top:20px;text-align:right;font-size:16px;font-weight:bold">
        Total Debit: KES ${(ret.totalCents / 100).toFixed(2)}
      </div>
    `;
    return this.htmlWrapper(`Debit Note — ${ret.returnNumber}`, content);
  }

  async generateExpenseReport(employeeId: string, month: string): Promise<string> {
    const [year, m] = month.split('-').map(Number);
    const start = new Date(year, m - 1, 1);
    const end = new Date(year, m, 0, 23, 59, 59);

    const expenses = await this.prisma.expense.findMany({
      where: { submittedBy: employeeId, createdAt: { gte: start, lte: end } },
      orderBy: { createdAt: 'asc' },
    });

    const total = expenses.reduce((s, e) => s + e.amountCents, 0);
    const vatBase = expenses.filter(e => e.vatReclaimable).reduce((s, e) => s + e.amountCents, 0);
    const vatAmount = Math.round(vatBase * 16 / 116);

    const rows = expenses.map(e => {
      const dateStr = new Date(e.createdAt).toISOString().slice(0, 10);
      const statusBg = e.approvalStatus === 'APPROVED' ? '#d1fae5' : e.approvalStatus === 'REJECTED' ? '#fee2e2' : '#fef3c7';
      const statusColor = e.approvalStatus === 'APPROVED' ? '#065f46' : e.approvalStatus === 'REJECTED' ? '#991b1b' : '#92400e';
      return `<tr>
        <td>${dateStr}</td>
        <td>${e.category}</td>
        <td>${(e.description ?? '').replace(/</g, '&lt;')}</td>
        <td class="amount">KES ${(e.amountCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</td>
        <td><span style="padding:2px 6px;border-radius:4px;font-size:10px;background:${statusBg};color:${statusColor}">${e.approvalStatus}</span></td>
        <td style="text-align:center">${e.vatReclaimable ? '&#10003;' : ''}</td>
      </tr>`;
    }).join('');

    const content = `
      <div class="header">
        <div>
          <div class="business-name">Expense Report</div>
          <div class="meta">Employee: ${employeeId}</div>
          <div class="meta">Period: ${month}</div>
        </div>
        <div class="meta" style="text-align:right">
          <div>Generated: ${new Date().toLocaleDateString('en-KE')}</div>
          <div>${expenses.length} expense(s)</div>
        </div>
      </div>
      <table>
        <thead>
          <tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th>Status</th><th>VAT</th></tr>
        </thead>
        <tbody>
          ${rows || '<tr><td colspan="6" style="text-align:center;color:#999">No expenses found for this period</td></tr>'}
          <tr class="total-row">
            <td colspan="3"><strong>TOTAL</strong></td>
            <td class="amount"><strong>KES ${(total / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</strong></td>
            <td></td><td></td>
          </tr>
        </tbody>
      </table>
      ${vatAmount > 0 ? `
      <div style="margin-top:16px;padding:12px;background:#f0fdf4;border:1px solid #86efac;border-radius:6px;font-size:12px">
        <strong>VAT Reclaim Summary</strong><br/>
        Reclaimable total: KES ${(vatBase / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })} |
        Estimated input VAT (16/116): <strong>KES ${(vatAmount / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</strong>
      </div>` : ''}
      <div style="margin-top:40px;display:flex;gap:80px;font-size:12px">
        <div>Employee Signature: ___________________<br/><small>Date: ___________</small></div>
        <div>Manager Approval: ___________________<br/><small>Date: ___________</small></div>
      </div>
    `;
    return this.htmlWrapper(`Expense Report — ${month}`, content);
  }

  /**
   * KRA P10A Form — Monthly PAYE Return.
   * Lists all employees' earnings and PAYE for a given month.
   */
  async generateP10(businessId: string, month: number, year: number): Promise<string> {
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const monthName = MONTHS[(month - 1) % 12];

    const business = await this.prisma.business.findUnique({ where: { id: businessId } });

    const run: any = await (this.prisma as any).payrollRun.findFirst({
      where: { businessId, month, year },
      include: {
        payslips: true,
      },
    }).catch(() => null);

    const fmt = (c: number) => (c / 100).toFixed(2);
    const businessPin = (business as any)?.kraPin ?? (business as any)?.kraCredentials ?? 'N/A';

    let totalGross = 0, totalPaye = 0, totalRelief = 0, totalTaxable = 0;
    const PERSONAL_RELIEF_CENTS = 240000; // KES 2,400/month

    const payslips: any[] = run?.payslips ?? [];

    const tableRows = payslips.map((p: any) => {
      const gross = p.grossPay ?? 0;
      const nssf = (p.nssf1Amount ?? 0) + (p.nssf2Amount ?? 0);
      const taxable = Math.max(0, gross - nssf);
      const relief = PERSONAL_RELIEF_CENTS;
      const paye = p.payeAmount ?? 0;
      totalGross += gross;
      totalPaye += paye;
      totalRelief += relief;
      totalTaxable += taxable;
      return `<tr>
        <td>${(p.employeeName ?? '').replace(/</g, '&lt;')}</td>
        <td>N/A</td>
        <td class="amount">${fmt(gross)}</td>
        <td class="amount">${fmt(relief)}</td>
        <td class="amount">${fmt(taxable)}</td>
        <td class="amount">${fmt(paye)}</td>
      </tr>`;
    }).join('');

    const content = `
      <div style="border: 2px solid #333; padding: 20px; margin-bottom: 20px;">
        <div style="text-align: center; margin-bottom: 16px;">
          <h1 style="font-size: 16px; margin: 0;">KENYA REVENUE AUTHORITY</h1>
          <h2 style="font-size: 14px; margin: 4px 0;">P10A FORM — EMPLOYER'S MONTHLY PAYE RETURN</h2>
          <p style="margin: 0; font-size: 12px;">Month: ${monthName} ${year}</p>
        </div>
        <table style="width:100%;margin-bottom:16px;border-collapse:collapse;">
          <tr>
            <td style="padding:4px 8px;width:50%;"><strong>Employer Name:</strong> ${business?.name ?? '—'}</td>
            <td style="padding:4px 8px;"><strong>Employer KRA PIN:</strong> ${businessPin}</td>
          </tr>
          <tr>
            <td style="padding:4px 8px;"><strong>Month/Year:</strong> ${monthName} ${year}</td>
            <td style="padding:4px 8px;"><strong>Payroll Status:</strong> ${run?.status ?? 'N/A'}</td>
          </tr>
        </table>
      </div>

      <table>
        <thead>
          <tr>
            <th>Employee Name</th>
            <th>Employee KRA PIN</th>
            <th class="amount">Gross Pay (KES)</th>
            <th class="amount">Tax Relief (KES)</th>
            <th class="amount">Taxable Pay (KES)</th>
            <th class="amount">PAYE (KES)</th>
          </tr>
        </thead>
        <tbody>
          ${tableRows || '<tr><td colspan="6" style="text-align:center;color:#999;">No payslips found for this period</td></tr>'}
          <tr class="total-row">
            <td colspan="2"><strong>TOTALS</strong></td>
            <td class="amount"><strong>${fmt(totalGross)}</strong></td>
            <td class="amount"><strong>${fmt(totalRelief)}</strong></td>
            <td class="amount"><strong>${fmt(totalTaxable)}</strong></td>
            <td class="amount"><strong>${fmt(totalPaye)}</strong></td>
          </tr>
        </tbody>
      </table>

      <div style="margin-top:24px;padding:12px;background:#fff8e1;border-left:4px solid #f59e0b;font-size:11px;">
        <strong>Note:</strong> File this return on iTax by the 9th of ${MONTHS[month % 12]} ${month === 12 ? year + 1 : year}.
        Total PAYE remittable: <strong>KES ${fmt(totalPaye)}</strong>
      </div>

      <div style="margin-top: 40px; display: flex; gap: 80px; font-size: 12px;">
        <div>Authorized Signature: ___________________<br/><small>Date: ___________</small></div>
        <div>Designation: ___________________<br/><small>Official Stamp:</small></div>
      </div>
    `;

    return this.htmlWrapper(`P10A — ${monthName} ${year} — ${business?.name ?? businessId}`, content);
  }

  // ─── B2B Field-Order Invoice ──────────────────────────────────────────────

  /** Escape untrusted values (customer names, notes) before interpolating into HTML. */
  private esc(value: unknown): string {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Shared shell for customer-facing documents (invoices, receipts, delivery notes).
   *
   * Deliberately print-safe: Chrome's print dialog ships with "Background graphics"
   * OFF, so nothing here depends on a background fill to be readable. Emphasis comes
   * from rules, weight and letter-spacing, which survive a monochrome print — a solid
   * navy band with white text would come out white-on-white.
   */
  private docShell(opts: {
    title: string;
    docType: string;
    businessName: string;
    addressLines?: (string | null | undefined)[];
    meta?: { label: string; value: string }[];
    stamp?: { label: string; tone: 'ok' | 'warn' | 'bad' | 'info' };
    parties?: { label: string; lines: (string | null | undefined)[] }[];
    body: string;
    notes?: string | null;
    signatures?: string;
    legalNote?: string | null;
    footNote?: string | null;
  }): string {
    const TONES = { ok: '#15803d', warn: '#b45309', bad: '#b91c1c', info: '#1e3a5f' };

    const address = (opts.addressLines ?? [])
      .filter(Boolean)
      .map((l) => `<div>${this.esc(l)}</div>`)
      .join('');

    const meta = (opts.meta ?? [])
      .map((m) => `<tr><td class="mk">${this.esc(m.label)}</td><td class="mv">${m.value}</td></tr>`)
      .join('');

    const stamp = opts.stamp
      ? `<div class="stamp" style="color:${TONES[opts.stamp.tone]}">${this.esc(opts.stamp.label)}</div>`
      : '';

    const parties = (opts.parties ?? []).length
      ? `<div class="cards">${(opts.parties ?? [])
          .map((p) => `
            <div class="card">
              <div class="lbl">${this.esc(p.label)}</div>
              ${p.lines.filter(Boolean).map((l) => `<div class="cl">${l}</div>`).join('')}
            </div>`).join('')}</div>`
      : '';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${this.esc(opts.title)}</title>
  <style>
    :root { --accent: #1e3a5f; --line: #e2e8f0; --ink: #111827; --mute: #6b7280; }
    *, *::before, *::after { box-sizing: border-box; }
    html { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body {
      margin: 0; color: var(--ink); background: #eef1f5;
      font-family: "Helvetica Neue", Helvetica, Arial, sans-serif;
      font-size: 11.5px; line-height: 1.45;
      -webkit-font-smoothing: antialiased;
    }
    .num { font-variant-numeric: tabular-nums; }
    .r { text-align: right; } .c { text-align: center; }
    .muted { color: var(--mute); }
    .sheet { max-width: 200mm; margin: 0 auto; background: #fff; padding: 16mm 15mm; }

    /* Masthead */
    .hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 26px; }
    .biz { font-size: 21px; font-weight: bold; color: var(--accent); letter-spacing: -.2px; }
    .addr { margin-top: 3px; font-size: 10.5px; color: var(--mute); }
    .hd-r { text-align: right; flex: 0 0 auto; min-width: 210px; }
    .dt { font-size: 17px; font-weight: bold; color: var(--accent); letter-spacing: .14em; text-transform: uppercase; }
    .stamp { display: inline-block; margin-top: 6px; padding: 2px 9px; border: 1.5px solid currentColor;
             border-radius: 3px; font-size: 9.5px; font-weight: bold; letter-spacing: .1em; text-transform: uppercase; }
    .meta { margin-top: 9px; margin-left: auto; border-collapse: collapse; font-size: 10.5px; }
    .meta .mk { padding: 1px 10px 1px 0; text-align: right; color: var(--mute); white-space: nowrap; }
    .meta .mv { padding: 1px 0; text-align: right; font-weight: bold; white-space: nowrap; }
    .rule { margin-top: 12px; border-top: 2px solid var(--accent); }

    /* Party cards */
    .cards { display: flex; gap: 14px; margin-top: 18px; }
    .card { flex: 1 1 0; min-width: 0; border: 1px solid var(--line); border-radius: 4px; padding: 10px 12px; background: #fbfcfd; }
    .card .lbl { font-size: 9px; font-weight: bold; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); }
    .card .cl { margin-top: 2px; }
    .card .cl:first-of-type { margin-top: 4px; font-size: 13px; font-weight: bold; }

    /* Line items — header is a light fill plus a hard rule, legible with or without
       background graphics enabled in the print dialog. */
    table.items { width: 100%; border-collapse: collapse; margin-top: 20px; }
    table.items thead { display: table-header-group; }
    table.items th { background: #f1f4f8; color: var(--accent); font-size: 9px; font-weight: bold;
                     letter-spacing: .1em; text-transform: uppercase; text-align: left;
                     padding: 8px 10px; border-bottom: 2px solid var(--accent); }
    table.items td { padding: 8px 10px; border-bottom: 1px solid #eceff3; vertical-align: top; }
    table.items tbody tr { page-break-inside: avoid; }
    table.items tbody tr:last-child td { border-bottom: 1.5px solid #b9c3d0; }
    .sku { margin-top: 2px; font-size: 9.5px; color: #9ca3af; }
    .tag { display: inline-block; margin-left: 5px; padding: 0 5px; border: 1px solid #b45309;
           border-radius: 3px; font-size: 8.5px; font-weight: bold; letter-spacing: .06em; color: #b45309; }

    /* Summary — accounting-style double rule instead of a colour block */
    .sum { display: flex; gap: 26px; margin-top: 18px; page-break-inside: avoid; }
    .sum-l { flex: 1 1 auto; min-width: 0; }
    .sum-r { flex: 0 0 268px; }
    table.totals { width: 100%; border-collapse: collapse; }
    table.totals td { padding: 5px 0; }
    table.totals tr.grand td { padding: 8px 0; font-size: 13.5px; font-weight: bold; color: var(--accent);
                               border-top: 1.5px solid var(--accent); border-bottom: 3px double var(--accent); }
    table.totals tr.bal td { padding-top: 7px; font-weight: bold; color: #b45309; }
    .words .lbl, .nb .lbl { font-size: 9px; font-weight: bold; letter-spacing: .1em; text-transform: uppercase; color: var(--accent); }
    .words .val { margin-top: 3px; font-style: italic; }
    .nb { margin-top: 14px; padding: 9px 11px; border-left: 3px solid var(--accent); background: #fbfcfd; font-size: 10.5px; }

    /* Signatures */
    .sigs { display: flex; gap: 44px; margin-top: 34px; page-break-inside: avoid; }
    .sig { flex: 1 1 0; }
    .sig .fill { min-height: 20px; font-weight: bold; }
    .sig .line { border-bottom: 1px solid #9ca3af; }
    .sig .cap { margin-top: 4px; font-size: 9.5px; letter-spacing: .06em; text-transform: uppercase; color: var(--mute); }

    /* Footer */
    .ft { margin-top: 26px; padding-top: 10px; border-top: 1px solid var(--line);
          text-align: center; font-size: 10px; color: var(--mute); }
    .ft .fine { margin-top: 3px; font-size: 9px; color: #9ca3af; }

    .print-btn { position: fixed; top: 18px; right: 18px; z-index: 20; padding: 9px 18px; background: #2563eb;
                 color: #fff; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600;
                 box-shadow: 0 1px 3px rgba(0,0,0,.2); }
    @media screen {
      body { padding: 26px 16px 60px; }
      .sheet { box-shadow: 0 1px 2px rgba(16,24,40,.1), 0 10px 30px rgba(16,24,40,.08); border-radius: 3px; }
    }
    @media print {
      @page { size: A4; margin: 13mm; }
      body { background: #fff; padding: 0; font-size: 10.5px; }
      .sheet { max-width: none; padding: 0; box-shadow: none; }
      .print-btn { display: none; }
    }
  </style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">Print / Save as PDF</button>
  <div class="sheet">
    <div class="hd">
      <div>
        <div class="biz">${this.esc(opts.businessName)}</div>
        ${address ? `<div class="addr">${address}</div>` : ''}
      </div>
      <div class="hd-r">
        <div class="dt">${this.esc(opts.docType)}</div>
        ${stamp}
        ${meta ? `<table class="meta"><tbody>${meta}</tbody></table>` : ''}
      </div>
    </div>
    <div class="rule"></div>
    ${parties}
    ${opts.body}
    ${opts.notes ? `<div class="nb"><span class="lbl">Notes</span><div style="margin-top:2px">${this.esc(opts.notes)}</div></div>` : ''}
    ${opts.signatures ?? ''}
    <div class="ft">
      ${opts.footNote ?? ''}
      ${opts.legalNote ? `<div class="fine">${this.esc(opts.legalNote)}</div>` : ''}
    </div>
  </div>
</body>
</html>`;
  }

  /** Right-hand totals block. `tone: 'grand'` gets the double rule, `'bal'` the balance styling. */
  private docTotals(rows: { label: string; value: string; tone?: 'grand' | 'bal' | 'muted' }[]): string {
    return `<table class="totals"><tbody>${rows
      .map((r) => `
        <tr class="${r.tone === 'grand' ? 'grand' : r.tone === 'bal' ? 'bal' : ''}">
          <td class="r ${r.tone === 'muted' ? 'muted' : ''}">${this.esc(r.label)}</td>
          <td class="r num ${r.tone === 'muted' ? 'muted' : ''}" style="width:118px">${this.esc(r.value)}</td>
        </tr>`).join('')}</tbody></table>`;
  }

  /** Signature strip. `value` pre-fills a captured name instead of leaving a blank rule. */
  private docSignatures(blocks: { caption: string; value?: string | null }[]): string {
    return `<div class="sigs">${blocks
      .map((b) => `
        <div class="sig">
          <div class="fill">${b.value ? this.esc(b.value) : '&nbsp;'}</div>
          <div class="line"></div>
          <div class="cap">${this.esc(b.caption)}</div>
        </div>`).join('')}</div>`;
  }


  /**
   * Amount in words, Kenyan invoice convention. Printed tax invoices are
   * conventionally expected to state the total in words as well as figures.
   */
  private amountInWords(cents: number): string {
    const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
      'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
    const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

    const chunk = (n: number): string => {
      if (n === 0) return '';
      if (n < 20) return ONES[n];
      if (n < 100) return `${TENS[Math.floor(n / 10)]}${n % 10 ? `-${ONES[n % 10]}` : ''}`;
      return `${ONES[Math.floor(n / 100)]} Hundred${n % 100 ? ` ${chunk(n % 100)}` : ''}`;
    };

    const SCALES: Array<[number, string]> = [[1e9, 'Billion'], [1e6, 'Million'], [1e3, 'Thousand']];
    let shillings = Math.floor(Math.abs(cents) / 100);
    const fractional = Math.abs(cents) % 100;

    let words = '';
    for (const [value, name] of SCALES) {
      if (shillings >= value) {
        words += `${chunk(Math.floor(shillings / value))} ${name} `;
        shillings %= value;
      }
    }
    words += chunk(shillings);

    return `${(words.trim() || 'Zero')} Shillings and ${String(fractional).padStart(2, '0')}/100 Only`;
  }

  async generateFieldOrderInvoice(orderId: string): Promise<string> {
    const order = await (this.prisma as any).fieldOrder.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        customer: true,
        agent: { select: { name: true, phone: true } },
        route: { select: { name: true } },
      },
    });
    if (!order) throw new Error('Field order not found');

    const business = await this.prisma.business.findUnique({
      where: { id: order.businessId },
      select: {
        name: true, taxType: true, receiptHeader: true, receiptFooter: true,
        bankName: true, bankAccountNumber: true, bankAccountName: true, bankBranch: true, shortCode: true,
      },
    });

    const fmt = (c: number) => `KES ${(c / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const asDate = (d: Date) => d.toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' });

    // Anchor to when the invoice was actually raised, never to "now" — otherwise every
    // reprint re-dates the document and silently extends its payment terms.
    const invoiceDate = order.invoicedAt ? new Date(order.invoicedAt) : new Date(order.createdAt);
    const dueDate = new Date(invoiceDate.getTime() + 30 * 86400000);

    const invoiceNumber = order.invoiceNumber ?? `INV-${orderId.slice(-6).toUpperCase()}`;
    const billedItems = order.items.filter((i: any) => !i.isSample);

    // subtotalCents is stored ex-VAT already (see FieldSalesService.createOrder), so it is
    // printed as-is; vatCents sits on top of it and the two sum to totalCents.
    const subtotalCents: number = order.subtotalCents;
    const vatCents: number = order.vatCents;
    const vatRate = subtotalCents > 0 ? Math.round((vatCents / subtotalCents) * 100) : 0;
    const taxLabel = business?.taxType === 'TOT' ? 'Turnover Tax' : 'VAT';

    const paidCents: number = order.paidAmountCents ?? 0;
    const balanceCents = Math.max(0, order.totalCents - paidCents);
    const stamp: { label: string; tone: 'ok' | 'warn' | 'bad' } =
      paidCents >= order.totalCents ? { label: 'Paid', tone: 'ok' }
      : paidCents > 0 ? { label: 'Part Paid', tone: 'warn' }
      : { label: 'Unpaid', tone: 'bad' };

    const itemRows = billedItems
      .map((i: any, idx: number) => `
        <tr>
          <td class="c muted num">${idx + 1}</td>
          <td>
            <div>${this.esc(i.itemName)}</div>
            ${i.itemSku ? `<div class="sku">SKU ${this.esc(i.itemSku)}</div>` : ''}
          </td>
          <td class="c num">${i.quantity}</td>
          <td class="r num">${fmt(i.unitPriceCents)}</td>
          <td class="r num">${fmt(i.totalCents)}</td>
        </tr>`).join('');

    const totals = this.docTotals([
      { label: `Subtotal (excl. ${taxLabel})`, value: fmt(subtotalCents) },
      ...(vatCents > 0 ? [{ label: `${taxLabel} (${vatRate}%)`, value: fmt(vatCents), tone: 'muted' as const }] : []),
      { label: 'Total Due', value: fmt(order.totalCents), tone: 'grand' as const },
      ...(paidCents > 0
        ? [
            { label: 'Amount Paid', value: `− ${fmt(paidCents)}`, tone: 'muted' as const },
            { label: 'Balance Due', value: fmt(balanceCents), tone: 'bal' as const },
          ]
        : []),
    ]);

    const hasBank = business?.bankName || business?.bankAccountNumber || business?.shortCode;
    const bankLine = (label: string, value?: string | null) =>
      value ? `<div><span class="muted">${label}</span> <strong>${this.esc(value)}</strong></div>` : '';

    const body = `
      <table class="items">
        <thead>
          <tr>
            <th class="c" style="width:34px">#</th>
            <th>Description</th>
            <th class="c" style="width:52px">Qty</th>
            <th class="r" style="width:112px">Unit Price</th>
            <th class="r" style="width:112px">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows || '<tr><td colspan="5" class="c muted" style="padding:18px">No billable items on this order.</td></tr>'}</tbody>
      </table>

      <div class="sum">
        <div class="sum-l">
          <div class="words">
            <span class="lbl">Amount in Words</span>
            <div class="val">${this.esc(this.amountInWords(order.totalCents))}</div>
          </div>
          ${hasBank ? `
          <div class="nb" style="border-left-color:#15803d">
            <span class="lbl" style="color:#15803d">Payment Details</span>
            <div style="margin-top:3px;display:flex;gap:26px">
              <div>
                ${bankLine('Bank', business?.bankName)}
                ${bankLine('Account No.', business?.bankAccountNumber)}
                ${bankLine('Branch', business?.bankBranch)}
              </div>
              <div>
                ${bankLine('Account Name', business?.bankAccountName)}
                ${bankLine('Paybill / Till', business?.shortCode)}
              </div>
            </div>
            <div class="muted" style="margin-top:5px;font-size:9.5px">Quote invoice <strong>${this.esc(invoiceNumber)}</strong> as the payment reference.</div>
          </div>` : ''}
        </div>
        <div class="sum-r">${totals}</div>
      </div>

    `;

    return this.docShell({
      title: `Invoice ${invoiceNumber} — ${business?.name ?? ''}`,
      docType: 'Tax Invoice',
      businessName: business?.name ?? 'Business',
      addressLines: (business?.receiptHeader ?? '').split('\n').map((l) => l.trim()),
      stamp,
      meta: [
        { label: 'Invoice No.', value: this.esc(invoiceNumber) },
        { label: 'Order No.', value: this.esc(order.orderNumber ?? orderId) },
        { label: 'Invoice Date', value: asDate(invoiceDate) },
        { label: 'Due Date', value: asDate(dueDate) },
      ],
      parties: [
        {
          label: 'Bill To',
          lines: [
            this.esc(order.customer?.name ?? '—'),
            order.customer?.phone ? this.esc(order.customer.phone) : null,
            order.customer?.kraPin ? `<span class="muted">KRA PIN</span> <strong>${this.esc(order.customer.kraPin)}</strong>` : null,
            order.customer?.address ? `<span class="muted">${this.esc(order.customer.address)}</span>` : null,
            order.customer?.shopCode ? `<span class="muted">Shop code ${this.esc(order.customer.shopCode)}</span>` : null,
          ],
        },
        {
          label: 'Served By',
          lines: [
            this.esc(order.agent?.name ?? '—'),
            order.agent?.phone ? this.esc(order.agent.phone) : null,
            order.route?.name ? `<span class="muted">Route</span> ${this.esc(order.route.name)}` : null,
            order.expectedDeliveryDate ? `<span class="muted">Delivery</span> ${asDate(new Date(order.expectedDeliveryDate))}` : null,
          ],
        },
      ],
      body,
      notes: order.notes,
      signatures: this.docSignatures([
        { caption: 'Authorised signature & stamp' },
        { caption: 'Received by — name & signature' },
      ]),
      footNote: `Payment is due by <strong>${asDate(dueDate)}</strong>. Late payments attract interest at 2% per month.${
        business?.receiptFooter ? `<div style="margin-top:3px">${this.esc(business.receiptFooter)}</div>` : ''
      }`,
      legalNote: 'This is a computer-generated tax invoice.',
    });
  }


  /**
   * Delivery note for a field order — quantities only, no prices, with a
   * signature block for the receiving shop and any captured proof of delivery.
   */
  async generateFieldOrderDeliveryNote(orderId: string): Promise<string> {
    const order = await (this.prisma as any).fieldOrder.findUnique({
      where: { id: orderId },
      include: {
        items: true,
        customer: true,
        agent: { select: { name: true, phone: true } },
        route: { select: { name: true } },
        proof: true,
        deliveryRunOrders: {
          include: { deliveryRun: { include: { driver: { select: { name: true, phone: true } } } } },
        },
      },
    });
    if (!order) throw new Error('Field order not found');

    const business = await this.prisma.business.findUnique({
      where: { id: order.businessId },
      select: { name: true, receiptHeader: true, receiptFooter: true },
    });

    const asDate = (d: Date) => d.toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' });
    const dispatchDate = new Date(order.dispatchedAt ?? order.createdAt);
    const run = order.deliveryRunOrders?.[0]?.deliveryRun;
    const proof = Array.isArray(order.proof) ? order.proof[0] : order.proof;

    const totalOrdered = order.items.reduce((s: number, i: any) => s + i.quantity, 0);
    const totalDelivered = order.items.reduce((s: number, i: any) => s + (i.deliveredQuantity ?? 0), 0);
    const totalBackOrder = order.items.reduce((s: number, i: any) => s + (i.backOrderQuantity ?? 0), 0);

    const stamp: { label: string; tone: 'ok' | 'warn' | 'info' } =
      order.status === 'DELIVERED' || order.status === 'INVOICED' ? { label: 'Delivered', tone: 'ok' }
      : order.status === 'DISPATCHED' ? { label: 'In Transit', tone: 'warn' }
      : { label: order.status, tone: 'info' };

    const itemRows = order.items
      .map((i: any, idx: number) => `
        <tr>
          <td class="c muted num">${idx + 1}</td>
          <td>
            <div>${this.esc(i.itemName)}${i.isSample ? '<span class="tag">Sample</span>' : ''}</div>
            ${i.itemSku ? `<div class="sku">SKU ${this.esc(i.itemSku)}</div>` : ''}
          </td>
          <td class="c num">${i.quantity}</td>
          <td class="c num">${i.deliveredQuantity ?? ''}</td>
          <td class="c num">${(i.backOrderQuantity ?? 0) > 0 ? i.backOrderQuantity : ''}</td>
        </tr>`).join('');

    const body = `
      <table class="items">
        <thead>
          <tr>
            <th class="c" style="width:34px">#</th>
            <th>Description</th>
            <th class="c" style="width:74px">Ordered</th>
            <th class="c" style="width:74px">Delivered</th>
            <th class="c" style="width:96px;white-space:nowrap">Back-order</th>
          </tr>
        </thead>
        <tbody>${itemRows || '<tr><td colspan="5" class="c muted" style="padding:18px">No items on this order.</td></tr>'}</tbody>
        <tfoot>
          <tr>
            <td colspan="2" class="r" style="padding:8px 10px;font-weight:bold">Total units</td>
            <td class="c num" style="padding:8px 10px;font-weight:bold">${totalOrdered}</td>
            <td class="c num" style="padding:8px 10px;font-weight:bold">${totalDelivered || ''}</td>
            <td class="c num" style="padding:8px 10px;font-weight:bold">${totalBackOrder || ''}</td>
          </tr>
        </tfoot>
      </table>

      <div class="muted" style="margin-top:10px;font-size:10px">
        Goods only — this delivery note carries no prices and is not a tax invoice.
      </div>

      ${proof ? `
      <div class="nb" style="margin-top:20px;border-left-color:#15803d">
        <span class="lbl" style="color:#15803d">Proof of Delivery</span>
        ${proof.receivedByName ? `<div style="margin-top:3px"><span class="muted">Received by</span> <strong>${this.esc(proof.receivedByName)}</strong></div>` : ''}
        ${proof.notes ? `<div class="muted">${this.esc(proof.notes)}</div>` : ''}
        ${proof.latitude ? `<div class="muted" style="font-size:9.5px">GPS ${this.esc(proof.latitude)}, ${this.esc(proof.longitude)}</div>` : ''}
        ${proof.signatureBase64 ? `<img src="${this.esc(proof.signatureBase64)}" alt="Signature" style="max-height:70px;margin-top:6px;background:#fff;border:1px solid var(--line)" />` : ''}
      </div>` : ''}
    `;

    return this.docShell({
      title: `Delivery Note ${order.orderNumber ?? orderId} — ${business?.name ?? ''}`,
      docType: 'Delivery Note',
      businessName: business?.name ?? 'Business',
      addressLines: (business?.receiptHeader ?? '').split('\n').map((l) => l.trim()),
      stamp,
      meta: [
        { label: 'Order No.', value: this.esc(order.orderNumber ?? orderId) },
        { label: 'Dispatch Date', value: asDate(dispatchDate) },
        ...(order.deliveredAt ? [{ label: 'Delivered', value: asDate(new Date(order.deliveredAt)) }] : []),
      ],
      parties: [
        {
          label: 'Deliver To',
          lines: [
            this.esc(order.customer?.name ?? '—'),
            order.customer?.phone ? this.esc(order.customer.phone) : null,
            order.customer?.address ? `<span class="muted">${this.esc(order.customer.address)}</span>` : null,
            order.customer?.shopCode ? `<span class="muted">Shop code ${this.esc(order.customer.shopCode)}</span>` : null,
          ],
        },
        {
          label: 'Dispatch',
          lines: [
            run?.driver?.name ? this.esc(run.driver.name) : this.esc(order.agent?.name ?? '—'),
            run?.driver?.phone ? this.esc(run.driver.phone) : null,
            order.route?.name ? `<span class="muted">Route</span> ${this.esc(order.route.name)}` : null,
            order.agent?.name ? `<span class="muted">Agent</span> ${this.esc(order.agent.name)}` : null,
          ],
        },
      ],
      body,
      notes: order.notes,
      // A captured digital proof-of-delivery replaces the hand-signature strip.
      signatures: proof
        ? ''
        : this.docSignatures([
            { caption: 'Delivered by — name & signature', value: run?.driver?.name ?? null },
            { caption: 'Received by — name & signature' },
          ]),
      footNote: business?.receiptFooter ? this.esc(business.receiptFooter) : '',
      legalNote: 'Please check goods on receipt. Shortages must be reported within 24 hours.',
    });
  }
}

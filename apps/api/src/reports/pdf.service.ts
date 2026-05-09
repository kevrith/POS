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
    .print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 20px; background: #2563eb; color: white; border: none; border-radius: 6px; cursor: pointer; font-size: 14px; }
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
      },
    });
    if (!sale) throw new Error('Sale not found');

    const business = await this.prisma.business.findUnique({ where: { id: sale.businessId } });

    const itemRows = sale.items
      .map(
        (item) => `
      <tr>
        <td>${item.name}</td>
        <td class="amount">${item.quantity}</td>
        <td class="amount">KES ${(item.unitPriceCents / 100).toFixed(2)}</td>
        <td class="amount">KES ${(item.totalCents / 100).toFixed(2)}</td>
      </tr>
    `,
      )
      .join('');

    const content = `
      <div class="header">
        <div>
          <div class="business-name">${business?.name ?? 'Business'}</div>
          <div class="meta">Receipt #${sale.receiptNumber ?? '—'}</div>
          <div class="meta">${new Date(sale.createdAt).toLocaleString('en-KE')}</div>
        </div>
        <div class="meta" style="text-align:right">
          <div>Status: ${sale.status}</div>
          <div>Cashier: ${sale.cashierId ?? '—'}</div>
        </div>
      </div>
      <table>
        <thead><tr><th>Item</th><th>Qty</th><th>Unit Price</th><th>Total</th></tr></thead>
        <tbody>
          ${itemRows}
          <tr class="total-row"><td colspan="3">Subtotal</td><td class="amount">KES ${((sale.totalCents - sale.vatCents) / 100).toFixed(2)}</td></tr>
          <tr class="total-row"><td colspan="3">VAT (16%)</td><td class="amount">KES ${(sale.vatCents / 100).toFixed(2)}</td></tr>
          <tr class="total-row"><td colspan="3"><strong>TOTAL</strong></td><td class="amount"><strong>KES ${(sale.totalCents / 100).toFixed(2)}</strong></td></tr>
        </tbody>
      </table>
      <p style="margin-top:20px;color:#666;font-size:11px">KRA eTIMS: ${sale.etimsSubmitted ? 'SUBMITTED' : 'PENDING'} | Receipt: ${sale.receiptNumber ?? '—'}</p>
    `;
    return this.htmlWrapper(`Receipt ${sale.receiptNumber ?? saleId}`, content);
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
            <tr><td style="color:red">NHIF</td><td class="amount" style="color:red">-${(payslip.nhifAmount / 100).toFixed(2)}</td></tr>
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
    const fmt = (c: number) => `KES ${(c / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
    const date = new Date(delivery.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' });

    const itemRows = sale?.items
      .map((item, idx) => `
        <tr>
          <td style="text-align:center">${idx + 1}</td>
          <td>${item.name}</td>
          <td style="text-align:center">${item.quantity}</td>
          <td style="text-align:right">${fmt(item.unitPriceCents)}</td>
          <td style="text-align:right">${fmt(item.totalCents)}</td>
        </tr>
      `).join('') ?? '';

    const content = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
        <div>
          <div style="font-size:26px;font-weight:bold;color:#1e3a5f">${business?.name ?? 'Business'}</div>
          ${business?.receiptHeader ? `<div style="color:#555;margin-top:4px">${business.receiptHeader}</div>` : ''}
        </div>
        <div style="text-align:right">
          <div style="font-size:22px;font-weight:bold;color:#1e3a5f;letter-spacing:1px">DELIVERY RECEIPT</div>
          <div style="color:#555;margin-top:6px">Order #: <strong>${delivery.orderNumber}</strong></div>
          <div style="color:#555">Date: <strong>${date}</strong></div>
          ${delivery.deliveredAt ? `<div style="color:#16a34a;font-weight:bold">Delivered: ${new Date(delivery.deliveredAt).toLocaleString('en-KE')}</div>` : ''}
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;margin-bottom:24px;gap:24px">
        <div style="flex:1;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
          <p style="font-weight:bold;margin:0 0 6px;color:#1e3a5f">Deliver To</p>
          <div style="font-size:14px;font-weight:bold">${delivery.customerName}</div>
          ${delivery.customerPhone ? `<div style="color:#555">${delivery.customerPhone}</div>` : ''}
          <div style="color:#555;margin-top:4px">${delivery.deliveryAddress}</div>
        </div>
        <div style="flex:1;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
          <p style="font-weight:bold;margin:0 0 6px;color:#1e3a5f">Delivery Status</p>
          <div style="font-weight:bold;color:${delivery.status === 'DELIVERED' ? '#16a34a' : '#f59e0b'}">${delivery.status}</div>
          ${delivery.receivedBy ? `<div style="color:#555">Received by: ${delivery.receivedBy}</div>` : ''}
          ${delivery.notes ? `<div style="color:#555;font-size:12px;margin-top:4px">${delivery.notes}</div>` : ''}
        </div>
      </div>

      ${sale ? `
      <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
        <thead>
          <tr style="background:#1e3a5f;color:white">
            <th style="padding:10px;text-align:center;width:40px">#</th>
            <th style="padding:10px;text-align:left">Description</th>
            <th style="padding:10px;text-align:center;width:60px">Qty</th>
            <th style="padding:10px;text-align:right;width:120px">Unit Price</th>
            <th style="padding:10px;text-align:right;width:120px">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="border-top:2px solid #1e3a5f">
            <td colspan="4" style="padding:8px 10px;text-align:right;font-weight:bold">Subtotal</td>
            <td style="padding:8px 10px;text-align:right;font-weight:bold">${fmt(sale.subtotalCents)}</td>
          </tr>
          ${sale.vatCents > 0 ? `
          <tr>
            <td colspan="4" style="padding:6px 10px;text-align:right;color:#555">VAT (16%)</td>
            <td style="padding:6px 10px;text-align:right;color:#555">${fmt(sale.vatCents)}</td>
          </tr>` : ''}
          ${delivery.deliveryFeeCents > 0 ? `
          <tr>
            <td colspan="4" style="padding:6px 10px;text-align:right;color:#555">Delivery Fee</td>
            <td style="padding:6px 10px;text-align:right;color:#555">${fmt(delivery.deliveryFeeCents)}</td>
          </tr>` : ''}
          <tr style="background:#1e3a5f;color:white">
            <td colspan="4" style="padding:10px;text-align:right;font-size:15px;font-weight:bold">TOTAL</td>
            <td style="padding:10px;text-align:right;font-size:15px;font-weight:bold">${fmt(sale.totalCents + delivery.deliveryFeeCents)}</td>
          </tr>
        </tfoot>
      </table>` : ''}

      <div style="margin-top:40px;padding:20px;border:2px solid #1e3a5f;border-radius:8px;background:#f8fafc">
        <p style="font-weight:bold;margin:0 0 16px;color:#1e3a5f;font-size:14px">DELIVERY CONFIRMATION</p>
        <div style="display:flex;gap:60px;margin-bottom:20px">
          <div style="flex:1">
            <div style="margin-bottom:8px;color:#555;font-size:12px">Delivered By (Driver)</div>
            <div style="border-bottom:2px solid #333;padding-bottom:4px;min-height:24px"></div>
            <div style="margin-top:4px;color:#888;font-size:11px">Name & Signature</div>
          </div>
          <div style="flex:1">
            <div style="margin-bottom:8px;color:#555;font-size:12px">Received By (Customer)</div>
            <div style="border-bottom:2px solid #333;padding-bottom:4px;min-height:24px">${delivery.receivedBy ?? ''}</div>
            <div style="margin-top:4px;color:#888;font-size:11px">Name & Signature</div>
          </div>
        </div>
        <div style="display:flex;gap:60px">
          <div style="flex:1">
            <div style="margin-bottom:8px;color:#555;font-size:12px">Date & Time</div>
            <div style="border-bottom:2px solid #333;padding-bottom:4px;min-height:24px">${delivery.deliveredAt ? new Date(delivery.deliveredAt).toLocaleString('en-KE') : '_______________'}</div>
          </div>
          <div style="flex:1">
            <div style="margin-bottom:8px;color:#555;font-size:12px">ID Number (Optional)</div>
            <div style="border-bottom:2px solid #333;padding-bottom:4px;min-height:24px"></div>
          </div>
        </div>
      </div>

      ${business?.receiptFooter ? `
      <div style="margin-top:24px;text-align:center;font-size:11px;color:#888;border-top:1px solid #e2e8f0;padding-top:12px">
        ${business.receiptFooter}
      </div>` : ''}

      <div style="margin-top:16px;text-align:center;font-size:10px;color:#aaa">
        This is a computer-generated delivery receipt. Goods once delivered are not returnable.
      </div>
    `;

    return this.htmlWrapper(`Delivery Receipt ${delivery.orderNumber}`, content);
  }
}

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
    let totalGross = 0, totalPaye = 0, totalNhif = 0, totalNssf = 0;
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
      totalNhif += p.nhifAmount ?? 0;
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
        <td class="amount">${fmt(p.nhifAmount ?? 0)}</td>
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
            <th class="amount">NHIF<br/>(KES)</th>
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
            <td class="amount"><strong>${fmt(totalNhif)}</strong></td>
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
      select: { name: true, bankName: true, bankAccountNumber: true, bankAccountName: true, bankBranch: true, shortCode: true },
    });

    const fmt = (c: number) => `KES ${(c / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
    const date = new Date().toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' });
    const dueDate = new Date(Date.now() + 30 * 86400000).toLocaleDateString('en-KE', { day: '2-digit', month: 'long', year: 'numeric' });

    const itemRows = order.items
      .filter((i: any) => !i.isSample)
      .map((i: any, idx: number) => `
        <tr>
          <td style="text-align:center">${idx + 1}</td>
          <td>${i.itemName}${i.itemSku ? ` <span style="color:#888;font-size:10px">[${i.itemSku}]</span>` : ''}</td>
          <td style="text-align:center">${i.quantity}</td>
          <td style="text-align:right">${fmt(i.unitPriceCents)}</td>
          <td style="text-align:right">${fmt(i.totalCents)}</td>
        </tr>
      `).join('');

    const hasBankDetails = business?.bankName || business?.bankAccountNumber;
    const bankInfo = hasBankDetails
      ? `<div style="margin-top:24px;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px;">
           <p style="font-weight:bold;margin:0 0 6px">Payment Details</p>
           ${business?.bankName ? `<div style="font-size:12px">Bank: <strong>${business.bankName}</strong></div>` : ''}
           ${business?.bankAccountNumber ? `<div style="font-size:12px">Account No: <strong>${business.bankAccountNumber}</strong></div>` : ''}
           ${business?.bankAccountName ? `<div style="font-size:12px">Account Name: <strong>${business.bankAccountName}</strong></div>` : ''}
           ${business?.bankBranch ? `<div style="font-size:12px">Branch: ${business.bankBranch}</div>` : ''}
           ${business?.shortCode ? `<div style="font-size:12px">Paybill/Till: <strong>${business.shortCode}</strong></div>` : ''}
         </div>`
      : '';

    const content = `
      <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px">
        <div>
          <div style="font-size:26px;font-weight:bold;color:#1e3a5f">${business?.name ?? 'Business'}</div>
        </div>
        <div style="text-align:right">
          <div style="font-size:22px;font-weight:bold;color:#1e3a5f;letter-spacing:1px">TAX INVOICE</div>
          <div style="color:#555;margin-top:6px">Invoice #: <strong>${order.invoiceNumber ?? `INV-${orderId.slice(-6).toUpperCase()}`}</strong></div>
          <div style="color:#555">Order #: <strong>${order.orderNumber ?? orderId}</strong></div>
          <div style="color:#555">Date: <strong>${date}</strong></div>
          <div style="color:#555">Due Date: <strong>${dueDate}</strong></div>
        </div>
      </div>

      <div style="display:flex;justify-content:space-between;margin-bottom:24px;gap:24px">
        <div style="flex:1;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
          <p style="font-weight:bold;margin:0 0 6px;color:#1e3a5f">Bill To</p>
          <div style="font-size:14px;font-weight:bold">${order.customer?.name ?? '—'}</div>
          ${order.customer?.phone ? `<div style="color:#555">${order.customer.phone}</div>` : ''}
          ${order.customer?.kraPin ? `<div style="color:#555">KRA PIN: ${order.customer.kraPin}</div>` : ''}
          ${order.customer?.shopCode ? `<div style="color:#888;font-size:11px">Code: ${order.customer.shopCode}</div>` : ''}
        </div>
        <div style="flex:1;padding:14px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:6px">
          <p style="font-weight:bold;margin:0 0 6px;color:#1e3a5f">Sales Agent</p>
          <div style="font-weight:bold">${order.agent?.name ?? '—'}</div>
          ${order.agent?.phone ? `<div style="color:#555">${order.agent.phone}</div>` : ''}
          ${order.route?.name ? `<div style="color:#555">Route: ${order.route.name}</div>` : ''}
        </div>
      </div>

      <table style="width:100%;border-collapse:collapse">
        <thead>
          <tr style="background:#1e3a5f;color:white">
            <th style="padding:10px;text-align:center;width:40px">#</th>
            <th style="padding:10px;text-align:left">Description</th>
            <th style="padding:10px;text-align:center;width:60px">Qty</th>
            <th style="padding:10px;text-align:right;width:120px">Unit Price</th>
            <th style="padding:10px;text-align:right;width:120px">Amount</th>
          </tr>
        </thead>
        <tbody>${itemRows}</tbody>
        <tfoot>
          <tr style="border-top:2px solid #1e3a5f">
            <td colspan="4" style="padding:8px 10px;text-align:right;font-weight:bold">Subtotal (ex-VAT)</td>
            <td style="padding:8px 10px;text-align:right;font-weight:bold">${fmt(order.subtotalCents - order.vatCents)}</td>
          </tr>
          <tr>
            <td colspan="4" style="padding:6px 10px;text-align:right;color:#555">VAT (16%)</td>
            <td style="padding:6px 10px;text-align:right;color:#555">${fmt(order.vatCents)}</td>
          </tr>
          <tr style="background:#1e3a5f;color:white">
            <td colspan="4" style="padding:10px;text-align:right;font-size:15px;font-weight:bold">TOTAL DUE</td>
            <td style="padding:10px;text-align:right;font-size:15px;font-weight:bold">${fmt(order.totalCents)}</td>
          </tr>
          ${order.paidAmountCents > 0 ? `
          <tr style="color:#16a34a">
            <td colspan="4" style="padding:6px 10px;text-align:right">Amount Paid</td>
            <td style="padding:6px 10px;text-align:right">− ${fmt(order.paidAmountCents)}</td>
          </tr>
          <tr style="background:#fef3c7">
            <td colspan="4" style="padding:8px 10px;text-align:right;font-weight:bold;color:#92400e">Balance Due</td>
            <td style="padding:8px 10px;text-align:right;font-weight:bold;color:#92400e">${fmt(Math.max(0, order.totalCents - order.paidAmountCents))}</td>
          </tr>` : ''}
        </tfoot>
      </table>

      ${bankInfo}

      ${order.notes ? `<div style="margin-top:20px;padding:12px;background:#f8fafc;border-left:4px solid #1e3a5f;font-size:12px"><strong>Notes:</strong> ${order.notes}</div>` : ''}

      <div style="margin-top:40px;display:flex;gap:80px;font-size:12px;color:#555">
        <div>Authorized Signature: ___________________<br/><small>Date: ___________</small></div>
        <div>Received By: ___________________<br/><small>Date: ___________</small></div>
      </div>

      <div style="margin-top:24px;text-align:center;font-size:11px;color:#888;border-top:1px solid #e2e8f0;padding-top:12px">
        Payment is due within 30 days. Late payments attract interest at 2% per month.
        Thank you for your business!
      </div>
    `;

    return this.htmlWrapper(`Invoice ${order.invoiceNumber ?? orderId} — ${business?.name ?? ''}`, content);
  }
}

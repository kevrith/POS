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
}

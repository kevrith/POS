import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../email/email.service';
import { ReportsService } from '../reports/reports.service';
import { ReportSchedulesService } from './report-schedules.service';
import { formatKES } from '@pos/shared';

@Injectable()
export class ReportCronService {
  private readonly logger = new Logger(ReportCronService.name);

  constructor(
    private prisma: PrismaService,
    private email: EmailService,
    private reports: ReportsService,
    private schedules: ReportSchedulesService,
  ) {}

  /** Run once daily at 08:00 EAT — send trial expiry nudge emails */
  @Cron('0 5 * * *') // 08:00 EAT = 05:00 UTC
  async sendTrialNudges() {
    const NUDGE_DAYS = [14, 7, 1];
    const now = new Date();

    for (const daysLeft of NUDGE_DAYS) {
      const windowStart = new Date(now);
      windowStart.setDate(windowStart.getDate() + daysLeft);
      windowStart.setHours(0, 0, 0, 0);
      const windowEnd = new Date(windowStart);
      windowEnd.setHours(23, 59, 59, 999);

      const businesses = await this.prisma.business.findMany({
        where: {
          subscriptionStatus: 'TRIAL',
          trialEndsAt: { gte: windowStart, lte: windowEnd },
        },
        include: { users: { where: { role: 'OWNER' }, take: 1 } },
      });

      for (const biz of businesses) {
        const ownerEmail = biz.users[0]?.email;
        if (!ownerEmail) continue;
        try {
          await this.email.sendTrialExpiryWarning({
            to: ownerEmail,
            businessName: biz.name,
            daysLeft,
          });
          this.logger.log(`Trial nudge (${daysLeft}d) sent to ${ownerEmail} for ${biz.name}`);
        } catch (err: any) {
          this.logger.error(`Failed to send trial nudge to ${ownerEmail}: ${err.message}`);
        }
      }
    }
  }

  /** Run every hour at minute 0 — check which schedules are due */
  @Cron(CronExpression.EVERY_HOUR)
  async runDueSchedules() {
    const now = new Date();
    const currentHour = now.getHours();
    const currentDayOfWeek = now.getDay();   // 0=Sun
    const currentDayOfMonth = now.getDate(); // 1-31

    const dueSchedules = await this.prisma.reportSchedule.findMany({
      where: { isActive: true, hour: currentHour },
      include: { business: { include: { users: { where: { role: 'OWNER' }, take: 1 } } } },
    });

    for (const schedule of dueSchedules) {
      // Check frequency gating
      if (schedule.frequency === 'WEEKLY' && schedule.dayOfWeek !== null && schedule.dayOfWeek !== currentDayOfWeek) {
        continue;
      }
      if (schedule.frequency === 'MONTHLY' && schedule.dayOfMonth !== null && schedule.dayOfMonth !== currentDayOfMonth) {
        continue;
      }

      // Avoid double-sending if already sent in this hour
      if (schedule.lastSentAt) {
        const lastSent = new Date(schedule.lastSentAt);
        if (
          lastSent.getFullYear() === now.getFullYear() &&
          lastSent.getMonth() === now.getMonth() &&
          lastSent.getDate() === now.getDate() &&
          lastSent.getHours() === currentHour
        ) {
          continue;
        }
      }

      try {
        await this.sendScheduledReport(schedule, now);
        await this.schedules.markSent(schedule.id);
        this.logger.log(`Report schedule ${schedule.id} sent (${schedule.reportType})`);
      } catch (err: any) {
        this.logger.error(`Failed to send report schedule ${schedule.id}: ${err.message}`);
      }
    }
  }

  private async sendScheduledReport(schedule: any, now: Date) {
    const recipients: string[] = JSON.parse(schedule.recipients ?? '[]');
    if (!recipients.length) return;

    const { startDate, endDate, periodLabel } = this.getPeriodRange(schedule.frequency, now);
    const businessId = schedule.businessId;

    let reportHtml = '';
    let reportType = schedule.reportType;

    switch (schedule.reportType) {
      case 'SALES': {
        const data = await this.reports.salesReport(businessId, undefined, startDate, endDate);
        reportHtml = this.buildSalesHtml(data.summary);
        break;
      }
      case 'PL': {
        const data = await this.reports.profitAndLoss(businessId, startDate, endDate);
        reportHtml = this.buildPLHtml(data);
        break;
      }
      case 'STOCK': {
        const data = await this.reports.stockValuation(businessId);
        reportHtml = this.buildStockHtml(data);
        break;
      }
      case 'LOW_STOCK': {
        const data = await this.reports.stockValuation(businessId);
        const lowItems = data.items.filter((i: any) => i.quantity <= (i.reorderLevel ?? 5));
        reportHtml = this.buildLowStockHtml(lowItems);
        reportType = 'Low Stock Alert';
        break;
      }
      default: {
        // ALL — send a combined summary
        const [sales, pl] = await Promise.all([
          this.reports.salesReport(businessId, undefined, startDate, endDate),
          this.reports.profitAndLoss(businessId, startDate, endDate),
        ]);
        reportHtml = this.buildSalesHtml(sales.summary) + '<br/>' + this.buildPLHtml(pl);
        reportType = 'Full Business Report';
      }
    }

    await this.email.sendScheduledReport({
      to: recipients,
      businessName: schedule.business?.name ?? businessId,
      reportType,
      reportHtml,
      period: periodLabel,
    });
  }

  private getPeriodRange(frequency: string, now: Date): { startDate: Date; endDate: Date; periodLabel: string } {
    const endDate = new Date(now);
    let startDate: Date;
    let periodLabel: string;

    if (frequency === 'DAILY') {
      startDate = new Date(now);
      startDate.setHours(0, 0, 0, 0);
      endDate.setHours(23, 59, 59, 999);
      periodLabel = now.toLocaleDateString('en-KE', { dateStyle: 'full' });
    } else if (frequency === 'WEEKLY') {
      startDate = new Date(now);
      startDate.setDate(now.getDate() - 7);
      startDate.setHours(0, 0, 0, 0);
      periodLabel = `${startDate.toLocaleDateString('en-KE')} – ${now.toLocaleDateString('en-KE')}`;
    } else {
      // MONTHLY
      startDate = new Date(now.getFullYear(), now.getMonth(), 1);
      const monthNames = ['January','February','March','April','May','June','July','August','September','October','November','December'];
      periodLabel = `${monthNames[now.getMonth()]} ${now.getFullYear()}`;
    }

    return { startDate, endDate, periodLabel };
  }

  private buildSalesHtml(summary: any): string {
    return `
      <h3>Sales Summary</h3>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border:1px solid #e5e7eb">Total Transactions</td><td style="padding:8px;border:1px solid #e5e7eb"><strong>${summary.totalSales}</strong></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb">Total Revenue</td><td style="padding:8px;border:1px solid #e5e7eb"><strong>${formatKES(summary.totalRevenueCents)}</strong></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb">VAT Collected</td><td style="padding:8px;border:1px solid #e5e7eb">${formatKES(summary.totalVatCents)}</td></tr>
      </table>`;
  }

  private buildPLHtml(data: any): string {
    return `
      <h3>Profit & Loss</h3>
      <table style="border-collapse:collapse;width:100%">
        <tr><td style="padding:8px;border:1px solid #e5e7eb">Revenue</td><td style="padding:8px;border:1px solid #e5e7eb"><strong>${formatKES(data.revenueCents)}</strong></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb">Expenses</td><td style="padding:8px;border:1px solid #e5e7eb">${formatKES(data.expensesCents)}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb">Net Profit</td><td style="padding:8px;border:1px solid #e5e7eb"><strong style="color:${data.netProfitCents >= 0 ? '#16a34a' : '#dc2626'}">${formatKES(data.netProfitCents)}</strong></td></tr>
      </table>`;
  }

  private buildStockHtml(data: any): string {
    const rows = data.items.slice(0, 20).map((item: any) =>
      `<tr><td style="padding:8px;border:1px solid #e5e7eb">${item.name}</td><td style="padding:8px;border:1px solid #e5e7eb">${item.quantity}</td><td style="padding:8px;border:1px solid #e5e7eb">${formatKES(item.retailPriceCents * item.quantity)}</td></tr>`,
    ).join('');
    return `
      <h3>Stock Valuation (top 20)</h3>
      <table style="border-collapse:collapse;width:100%">
        <tr style="background:#f3f4f6"><th style="padding:8px;border:1px solid #e5e7eb">Item</th><th style="padding:8px;border:1px solid #e5e7eb">Qty</th><th style="padding:8px;border:1px solid #e5e7eb">Value</th></tr>
        ${rows}
      </table>`;
  }

  private buildLowStockHtml(items: any[]): string {
    if (!items.length) return '<p>✅ No items below reorder level.</p>';
    const rows = items.map((item: any) =>
      `<tr><td style="padding:8px;border:1px solid #e5e7eb;color:#dc2626">${item.name}</td><td style="padding:8px;border:1px solid #e5e7eb">${item.quantity}</td><td style="padding:8px;border:1px solid #e5e7eb">${item.reorderLevel ?? 5}</td></tr>`,
    ).join('');
    return `
      <h3>⚠️ Low Stock Alert — ${items.length} item${items.length !== 1 ? 's' : ''}</h3>
      <table style="border-collapse:collapse;width:100%">
        <tr style="background:#fef2f2"><th style="padding:8px;border:1px solid #e5e7eb">Item</th><th style="padding:8px;border:1px solid #e5e7eb">Current Qty</th><th style="padding:8px;border:1px solid #e5e7eb">Reorder Level</th></tr>
        ${rows}
      </table>`;
  }
}

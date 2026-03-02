import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface ParsedEntry {
  date: Date;
  description: string;
  creditCents: number;
  debitCents: number;
  balance: number;
  reference: string;
}

@Injectable()
export class ReconciliationService {
  constructor(private prisma: PrismaService) {}

  // ─── CSV Parser ──────────────────────────────────────────────────────────────
  private parseCSV(csvContent: string): ParsedEntry[] {
    const lines = csvContent.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length < 2) return [];

    // Detect header row — look for Date, Description, Debit, Credit
    const headerLine = lines[0].toLowerCase();
    const isHeader = headerLine.includes('date') || headerLine.includes('description');
    const dataLines = isHeader ? lines.slice(1) : lines;

    const entries: ParsedEntry[] = [];

    for (const line of dataLines) {
      // Handle quoted CSV fields
      const cols: string[] = [];
      let inQuote = false;
      let current = '';
      for (const ch of line) {
        if (ch === '"') { inQuote = !inQuote; }
        else if (ch === ',' && !inQuote) { cols.push(current.trim()); current = ''; }
        else { current += ch; }
      }
      cols.push(current.trim());

      if (cols.length < 3) continue;

      // Try to parse date (supports DD/MM/YYYY, MM/DD/YYYY, YYYY-MM-DD)
      const rawDate = cols[0].replace(/"/g, '').trim();
      let parsedDate: Date;
      if (/^\d{4}-\d{2}-\d{2}/.test(rawDate)) {
        parsedDate = new Date(rawDate);
      } else if (/^\d{2}\/\d{2}\/\d{4}$/.test(rawDate)) {
        // Try DD/MM/YYYY
        const [dd, mm, yyyy] = rawDate.split('/');
        parsedDate = new Date(`${yyyy}-${mm}-${dd}`);
      } else {
        parsedDate = new Date(rawDate);
      }
      if (isNaN(parsedDate.getTime())) continue;

      const description = (cols[1] || '').replace(/"/g, '').trim();
      // KCB format: Date, Description, Debit, Credit, Balance, Reference
      // Equity format: Date, Description, Credit, Debit, Balance
      const col2 = this.parseMoney(cols[2]);
      const col3 = this.parseMoney(cols[3] || '0');
      const col4 = this.parseMoney(cols[4] || '0');
      const reference = (cols[5] || cols[4] || '').replace(/"/g, '').trim();

      // Heuristic: if col2 looks like a debit and col3 a credit
      // Most Kenyan bank CSVs: Debit, Credit order
      let debitCents = 0;
      let creditCents = 0;
      let balance = 0;

      if (headerLine.includes('credit') && headerLine.includes('debit')) {
        const creditIdx = headerLine.split(',').findIndex((h) => h.includes('credit'));
        const debitIdx = headerLine.split(',').findIndex((h) => h.includes('debit'));
        creditCents = this.parseMoney(cols[creditIdx] || '0');
        debitCents = this.parseMoney(cols[debitIdx] || '0');
        balance = col4;
      } else {
        debitCents = col2;
        creditCents = col3;
        balance = col4;
      }

      entries.push({ date: parsedDate, description, creditCents, debitCents, balance, reference });
    }

    return entries;
  }

  private parseMoney(str: string): number {
    const cleaned = str.replace(/[^0-9.]/g, '');
    const amount = parseFloat(cleaned) || 0;
    return Math.round(amount * 100);
  }

  // ─── Upload & Auto-match ──────────────────────────────────────────────────────
  async uploadStatement(
    businessId: string,
    fileName: string,
    csvContent: string,
    storeId?: string,
  ) {
    const entries = this.parseCSV(csvContent);
    if (entries.length === 0) throw new Error('No valid entries found in CSV');

    const dates = entries.map((e) => e.date);
    const periodStart = new Date(Math.min(...dates.map((d) => d.getTime())));
    const periodEnd = new Date(Math.max(...dates.map((d) => d.getTime())));
    const totalCredits = entries.reduce((s, e) => s + e.creditCents, 0);
    const totalDebits = entries.reduce((s, e) => s + e.debitCents, 0);

    const statement = await this.prisma.bankStatement.create({
      data: {
        businessId,
        storeId: storeId ?? null,
        fileName,
        periodStart,
        periodEnd,
        totalCredits,
        totalDebits,
        entries: {
          create: entries.map((e) => ({
            date: e.date,
            description: e.description,
            creditCents: e.creditCents,
            debitCents: e.debitCents,
            balance: e.balance,
            reference: e.reference || null,
            matchStatus: 'UNMATCHED',
          })),
        },
      },
      include: { entries: true },
    });

    // Auto-match credit entries to sales
    await this.autoMatch(statement.id, businessId);

    return this.prisma.bankStatement.findUnique({
      where: { id: statement.id },
      include: { entries: { orderBy: { date: 'asc' } } },
    });
  }

  async autoMatch(statementId: string, businessId: string) {
    const entries = await this.prisma.bankStatementEntry.findMany({
      where: { statementId, matchStatus: 'UNMATCHED', creditCents: { gt: 0 } },
    });

    for (const entry of entries) {
      // 1. Match by amount + date proximity (±2 days)
      const dateMin = new Date(entry.date.getTime() - 2 * 86400000);
      const dateMax = new Date(entry.date.getTime() + 2 * 86400000);

      let matchedSaleId: string | null = null;

      // Try amount match
      const amountMatches = await this.prisma.sale.findMany({
        where: {
          businessId,
          totalCents: entry.creditCents,
          createdAt: { gte: dateMin, lte: dateMax },
          status: { in: ['PAID', 'COMPLETED'] },
        },
        select: { id: true, receiptNumber: true },
        take: 1,
      });

      if (amountMatches.length > 0) {
        matchedSaleId = amountMatches[0].id;
      } else if (entry.reference) {
        // Try reference match
        const refMatch = await this.prisma.sale.findFirst({
          where: {
            businessId,
            receiptNumber: { contains: entry.reference },
          },
          select: { id: true },
        });
        if (refMatch) matchedSaleId = refMatch.id;
      }

      if (matchedSaleId) {
        await this.prisma.bankStatementEntry.update({
          where: { id: entry.id },
          data: { matchedSaleId, matchStatus: 'MATCHED' },
        });
      }
    }
  }

  // ─── Queries ──────────────────────────────────────────────────────────────────
  async getStatements(businessId: string) {
    const statements = await this.prisma.bankStatement.findMany({
      where: { businessId },
      include: { entries: { select: { matchStatus: true } } },
      orderBy: { uploadedAt: 'desc' },
    });

    return statements.map((s) => ({
      ...s,
      matchedCount: s.entries.filter((e) => e.matchStatus === 'MATCHED').length,
      unmatchedCount: s.entries.filter((e) => e.matchStatus === 'UNMATCHED').length,
      totalEntries: s.entries.length,
      entries: undefined,
    }));
  }

  async getEntries(statementId: string, matchStatus?: string) {
    const statement = await this.prisma.bankStatement.findUnique({ where: { id: statementId } });
    if (!statement) throw new NotFoundException('Statement not found');

    return this.prisma.bankStatementEntry.findMany({
      where: {
        statementId,
        ...(matchStatus ? { matchStatus } : {}),
      },
      orderBy: { date: 'asc' },
    });
  }

  async manualMatch(entryId: string, saleId: string) {
    const entry = await this.prisma.bankStatementEntry.findUnique({ where: { id: entryId } });
    if (!entry) throw new NotFoundException('Entry not found');

    return this.prisma.bankStatementEntry.update({
      where: { id: entryId },
      data: { matchedSaleId: saleId, matchStatus: 'MANUAL' },
    });
  }

  async getSummary(businessId: string, startDate: string, endDate: string) {
    const start = new Date(startDate);
    const end = new Date(endDate);

    const [salesAgg, matchedEntries] = await Promise.all([
      this.prisma.sale.aggregate({
        where: {
          businessId,
          status: { in: ['PAID', 'COMPLETED'] },
          createdAt: { gte: start, lte: end },
        },
        _sum: { totalCents: true },
        _count: { id: true },
      }),
      this.prisma.bankStatementEntry.findMany({
        where: {
          statement: { businessId },
          date: { gte: start, lte: end },
          matchStatus: { in: ['MATCHED', 'MANUAL'] },
          creditCents: { gt: 0 },
        },
        select: { creditCents: true },
      }),
    ]);

    const totalSalesCents = salesAgg._sum.totalCents ?? 0;
    const totalBankCreditsCents = matchedEntries.reduce((s, e) => s + e.creditCents, 0);
    const varianceCents = totalSalesCents - totalBankCreditsCents;

    return {
      totalSalesCents,
      totalBankCreditsCents,
      varianceCents,
      salesCount: salesAgg._count.id,
      matchedEntriesCount: matchedEntries.length,
      period: { start, end },
    };
  }

  async deleteStatement(statementId: string) {
    await this.prisma.bankStatement.delete({ where: { id: statementId } });
    return { deleted: true };
  }
}

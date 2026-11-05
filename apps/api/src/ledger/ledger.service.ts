import { Injectable, BadRequestException } from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

const MAX_NUMBER_ATTEMPTS = 8;

@Injectable()
export class LedgerService {
  constructor(private prisma: PrismaService) {}

  /**
   * JE-<business tag>-<n>. `entryNumber` is unique across the whole table, so the number has to carry the business:
   * a bare per-business count gave every business's first entry the same number, and the second business's entries
   * were refused (and, being posted in the background, silently lost). The sequence continues from the highest number
   * the business has used, not from a count, which a deletion or a second entry at the same moment would repeat.
   */
  private async nextEntryNumber(businessId: string): Promise<string> {
    const prefix = `JE-${createHash('sha256').update(businessId).digest('hex').slice(0, 5).toUpperCase()}-`;
    const last = await this.prisma.journalEntry.findFirst({
      where: { businessId, entryNumber: { startsWith: prefix } },
      orderBy: { entryNumber: 'desc' },
      select: { entryNumber: true },
    });
    const lastSeq = last ? parseInt(last.entryNumber.slice(prefix.length), 10) : 0;
    return `${prefix}${String((Number.isFinite(lastSeq) ? lastSeq : 0) + 1).padStart(6, '0')}`;
  }

  /** Write an entry under the next number. Two entries at the same moment read the same "last number"; the unique index stops the second, which takes the next one. */
  private async createNumbered<T>(businessId: string, write: (entryNumber: string) => Promise<T>): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await write(await this.nextEntryNumber(businessId));
      } catch (err) {
        const clash = (err as { code?: string })?.code === 'P2002';
        if (!clash || attempt >= MAX_NUMBER_ATTEMPTS) throw err;
        await new Promise((r) => setTimeout(r, Math.floor(Math.random() * 25 * attempt)));
      }
    }
  }

  async list(businessId: string, startDate?: string, endDate?: string, status?: string) {
    return this.prisma.journalEntry.findMany({
      where: {
        businessId,
        ...(status ? { status } : {}),
        ...(startDate || endDate ? {
          date: {
            ...(startDate ? { gte: new Date(startDate) } : {}),
            ...(endDate ? { lte: new Date(endDate) } : {}),
          }
        } : {}),
      },
      include: { lines: true },
      orderBy: { date: 'desc' },
    });
  }

  async create(dto: {
    businessId: string;
    storeId?: string;
    date: string;
    description: string;
    reference?: string;
    sourceType?: string;
    lines: Array<{ accountCode: string; accountName: string; debitCents: number; creditCents: number; description?: string }>;
  }) {
    return this.createNumbered(dto.businessId, (entryNumber) => this.prisma.journalEntry.create({
      data: {
        entryNumber,
        businessId: dto.businessId,
        storeId: dto.storeId,
        date: new Date(dto.date),
        description: dto.description,
        reference: dto.reference,
        sourceType: dto.sourceType,
        lines: { create: dto.lines },
      },
      include: { lines: true },
    }));
  }

  async post(id: string, postedBy: string) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
    if (!entry) throw new BadRequestException('Entry not found');
    const totalDebits = entry.lines.reduce((s, l) => s + l.debitCents, 0);
    const totalCredits = entry.lines.reduce((s, l) => s + l.creditCents, 0);
    if (totalDebits !== totalCredits) throw new BadRequestException('Debits must equal credits');
    return this.prisma.journalEntry.update({
      where: { id },
      data: { status: 'POSTED', postedBy, postedAt: new Date() },
    });
  }

  async reverse(id: string, reversedBy: string) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
    if (!entry) throw new BadRequestException('Entry not found');
    const reversal = await this.createNumbered(entry.businessId, (entryNumber) => this.prisma.journalEntry.create({
      data: {
        entryNumber,
        businessId: entry.businessId,
        storeId: entry.storeId ?? undefined,
        date: new Date(),
        description: `Reversal of ${entry.entryNumber}: ${entry.description}`,
        sourceType: 'MANUAL',
        status: 'POSTED',
        postedBy: reversedBy,
        postedAt: new Date(),
        reversalOf: entry.id,
        lines: {
          create: entry.lines.map(l => ({
            accountCode: l.accountCode,
            accountName: l.accountName,
            debitCents: l.creditCents,
            creditCents: l.debitCents,
            description: `Reversal: ${l.description ?? ''}`,
          })),
        },
      },
      include: { lines: true },
    }));
    await this.prisma.journalEntry.update({ where: { id }, data: { status: 'REVERSED' } });
    return reversal;
  }

  async trialBalance(businessId: string, asOfDate?: string) {
    const lines = await this.prisma.journalLine.findMany({
      where: {
        entry: {
          businessId,
          status: 'POSTED',
          ...(asOfDate ? { date: { lte: new Date(asOfDate) } } : {}),
        },
      },
    });
    const accounts: Record<string, { accountCode: string; accountName: string; debitCents: number; creditCents: number }> = {};
    for (const l of lines) {
      if (!accounts[l.accountCode]) {
        accounts[l.accountCode] = { accountCode: l.accountCode, accountName: l.accountName, debitCents: 0, creditCents: 0 };
      }
      accounts[l.accountCode].debitCents += l.debitCents;
      accounts[l.accountCode].creditCents += l.creditCents;
    }
    return Object.values(accounts).sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  }

  async autoPost(dto: {
    businessId: string;
    storeId?: string;
    description: string;
    reference: string;
    sourceType: string;
    lines: Array<{ accountCode: string; accountName: string; debitCents: number; creditCents: number }>;
  }) {
    try {
      await this.createNumbered(dto.businessId, (entryNumber) => this.prisma.journalEntry.create({
        data: {
          entryNumber,
          businessId: dto.businessId,
          storeId: dto.storeId,
          date: new Date(),
          description: dto.description,
          reference: dto.reference,
          sourceType: dto.sourceType,
          status: 'POSTED',
          postedAt: new Date(),
          lines: { create: dto.lines },
        },
      }));
    } catch (e) {
      // fire-and-forget, don't break parent operation
      console.error('AutoPost journal error:', (e as Error).message);
    }
  }
}

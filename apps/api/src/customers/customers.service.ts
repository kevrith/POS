import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreateCustomerDto {
  name: string;
  phone?: string;
  email?: string;
  kraPin?: string;
  creditLimitCents?: number;
}

interface UpdateCustomerDto {
  name?: string;
  phone?: string;
  email?: string;
  kraPin?: string;
  creditLimitCents?: number;
}

@Injectable()
export class CustomersService {
  constructor(private prisma: PrismaService) {}

  async create(businessId: string, dto: CreateCustomerDto) {
    return this.prisma.customer.create({
      data: {
        businessId,
        name: dto.name,
        phone: dto.phone,
        email: dto.email,
        kraPin: dto.kraPin,
        creditLimitCents: dto.creditLimitCents ?? 0,
      },
    });
  }

  async update(id: string, businessId: string, dto: UpdateCustomerDto) {
    const customer = await this.prisma.customer.findFirst({ where: { id, businessId } });
    if (!customer) throw new NotFoundException('Customer not found');
    return this.prisma.customer.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.email !== undefined && { email: dto.email }),
        ...(dto.kraPin !== undefined && { kraPin: dto.kraPin }),
        ...(dto.creditLimitCents !== undefined && { creditLimitCents: dto.creditLimitCents }),
      },
    });
  }

  async findAll(businessId: string, search?: string) {
    const where: { businessId: string; OR?: unknown[] } = { businessId };

    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search } },
      ];
    }

    return this.prisma.customer.findMany({
      where,
      orderBy: { name: 'asc' },
      take: 50,
    });
  }

  async findOne(id: string, businessId: string) {
    return this.prisma.customer.findFirst({
      where: { id, businessId },
      include: { sales: { take: 10, orderBy: { createdAt: 'desc' } } },
    });
  }

  async getCustomerSegmentation(businessId: string) {
    const customers = await this.prisma.customer.findMany({
      where: { businessId },
      include: {
        sales: {
          where: { status: { in: ['PAID', 'AMENDED'] } },
          orderBy: { createdAt: 'desc' },
          select: { totalCents: true, createdAt: true },
        },
      },
    });

    const now = new Date();
    const withSales = customers.filter(c => c.sales.length > 0).map(c => {
      const lastSale = c.sales[0];
      const recencyDays = Math.floor((now.getTime() - new Date(lastSale.createdAt).getTime()) / 86400000);
      const frequency = c.sales.length;
      const monetaryCents = c.sales.reduce((s, s2) => s + s2.totalCents, 0);
      return { id: c.id, name: c.name, phone: c.phone, loyaltyPoints: c.loyaltyPoints, recencyDays, frequency, monetaryCents, lastPurchaseDate: lastSale.createdAt };
    });

    if (withSales.length === 0) return { segments: [], customers: [] };

    const sortedR = [...withSales].sort((a, b) => a.recencyDays - b.recencyDays).map(c => c.recencyDays);
    const sortedF = [...withSales].sort((a, b) => a.frequency - b.frequency).map(c => c.frequency);
    const sortedM = [...withSales].sort((a, b) => a.monetaryCents - b.monetaryCents).map(c => c.monetaryCents);
    const pct = (arr: number[], val: number) => Math.max(1, Math.ceil((arr.filter(v => v <= val).length / arr.length) * 5));

    const scored = withSales.map(c => {
      const rScore = 6 - pct(sortedR, c.recencyDays);
      const fScore = pct(sortedF, c.frequency);
      const mScore = pct(sortedM, c.monetaryCents);
      let segment = 'PROMISING';
      if (rScore >= 4 && fScore >= 4 && mScore >= 4) segment = 'CHAMPIONS';
      else if (rScore >= 3 && fScore >= 3) segment = 'LOYAL';
      else if (rScore >= 4 && fScore <= 2) segment = 'NEW';
      else if (rScore >= 3 && mScore >= 4) segment = 'HIGH_VALUE';
      else if (rScore <= 2 && fScore >= 3) segment = 'AT_RISK';
      else if (rScore <= 1) segment = 'LOST';
      return { ...c, rScore, fScore, mScore, segment };
    });

    const segCounts = new Map<string, number>();
    for (const c of scored) segCounts.set(c.segment, (segCounts.get(c.segment) ?? 0) + 1);
    const segLabels: Record<string, string> = { CHAMPIONS: 'Champions', LOYAL: 'Loyal', NEW: 'New', HIGH_VALUE: 'High Value', AT_RISK: 'At Risk', LOST: 'Lost', PROMISING: 'Promising' };
    const segments = Array.from(segCounts.entries()).map(([k, count]) => ({ key: k, label: segLabels[k] ?? k, count })).sort((a, b) => b.count - a.count);

    return { segments, customers: scored.sort((a, b) => (b.rScore * 100 + b.fScore * 10 + b.mScore) - (a.rScore * 100 + a.fScore * 10 + a.mScore)) };
  }

  async findDuplicates(businessId: string) {
    const customers = await this.prisma.customer.findMany({ where: { businessId }, orderBy: { name: 'asc' } });
    const groups: Array<{ type: string; customers: typeof customers }> = [];

    const byPhone = new Map<string, typeof customers>();
    for (const c of customers) {
      if (!c.phone) continue;
      const key = c.phone.replace(/\D/g, '');
      if (!byPhone.has(key)) byPhone.set(key, []);
      byPhone.get(key)!.push(c);
    }
    for (const [, g] of byPhone) if (g.length > 1) groups.push({ type: 'SAME_PHONE', customers: g });

    return groups;
  }

  async mergeCustomers(primaryId: string, secondaryId: string, businessId: string) {
    const [primary, secondary] = await Promise.all([
      this.prisma.customer.findFirst({ where: { id: primaryId, businessId } }),
      this.prisma.customer.findFirst({ where: { id: secondaryId, businessId } }),
    ]);
    if (!primary || !secondary) throw new Error('Customer not found');
    if (primaryId === secondaryId) throw new Error('Cannot merge with self');

    await this.prisma.sale.updateMany({ where: { customerId: secondaryId }, data: { customerId: primaryId } });
    await this.prisma.customer.update({
      where: { id: primaryId },
      data: { loyaltyPoints: { increment: secondary.loyaltyPoints }, balanceCents: { increment: secondary.balanceCents } },
    });
    await this.prisma.customer.delete({ where: { id: secondaryId } });
    return this.prisma.customer.findUnique({ where: { id: primaryId } });
  }

  /** Manager/owner: directly set the credit limit (increase or decrease, no approval needed) */
  async setCreditLimit(id: string, businessId: string, newLimitCents: number) {
    const customer = await this.prisma.customer.findFirst({ where: { id, businessId } });
    if (!customer) throw new NotFoundException('Customer not found');
    if (newLimitCents < 0) throw new BadRequestException('Credit limit cannot be negative');
    return this.prisma.customer.update({
      where: { id },
      data: {
        creditLimitCents: newLimitCents,
        creditLimitPendingCents: 0,
        creditApprovalStatus: 'NONE',
      },
    });
  }

  async requestCreditIncrease(id: string, requestedLimitCents: number) {
    return this.prisma.customer.update({
      where: { id },
      data: { creditLimitPendingCents: requestedLimitCents, creditApprovalStatus: 'PENDING' },
    });
  }

  async approveCredit(id: string) {
    const customer = await this.prisma.customer.findUnique({ where: { id } });
    return this.prisma.customer.update({
      where: { id },
      data: {
        creditLimitCents: customer!.creditLimitPendingCents,
        creditLimitPendingCents: 0,
        creditApprovalStatus: 'APPROVED',
      },
    });
  }

  async rejectCredit(id: string) {
    return this.prisma.customer.update({
      where: { id },
      data: { creditLimitPendingCents: 0, creditApprovalStatus: 'REJECTED' },
    });
  }

  async importFromCsv(
    businessId: string,
    rows: Array<{
      name: string;
      phone?: string;
      email?: string;
      creditLimit?: number;
    }>,
  ): Promise<{ created: number; skipped: number; errors: string[] }> {
    let created = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (!row.name || !row.name.trim()) {
          errors.push(`Row ${i + 1}: name is required`);
          continue;
        }

        // Skip if phone already exists for this business
        if (row.phone) {
          const existing = await this.prisma.customer.findFirst({
            where: { businessId, phone: row.phone },
          });
          if (existing) {
            skipped++;
            continue;
          }
        }

        await this.prisma.customer.create({
          data: {
            businessId,
            name: row.name.trim(),
            phone: row.phone?.trim() || undefined,
            email: row.email?.trim() || undefined,
            creditLimitCents: row.creditLimit ? Math.round(row.creditLimit * 100) : 0,
          },
        });
        created++;
      } catch (err) {
        errors.push(`Row ${i + 1}: ${(err as Error).message}`);
      }
    }

    return { created, skipped, errors };
  }

  async recordPayment(id: string, businessId: string, amountCents: number, notes?: string) {
    const customer = await this.prisma.customer.findFirst({ where: { id, businessId } });
    if (!customer) throw new NotFoundException('Customer not found');

    const outstanding = Math.max(0, -customer.balanceCents);
    if (outstanding === 0) throw new BadRequestException('This customer has no outstanding debt');
    if (amountCents <= 0) throw new BadRequestException('Payment amount must be greater than zero');

    // Cap payment at outstanding amount
    const applied = Math.min(amountCents, outstanding);

    // Increment balanceCents (moves toward zero / settles debt)
    const updated = await this.prisma.customer.update({
      where: { id },
      data: { balanceCents: { increment: applied } },
    });

    return {
      customerId: id,
      amountApplied: applied,
      previousBalanceCents: customer.balanceCents,
      newBalanceCents: updated.balanceCents,
      outstandingBefore: outstanding,
      outstandingAfter: Math.max(0, -updated.balanceCents),
      fullySettled: updated.balanceCents >= 0,
    };
  }

  async getPaymentHistory(id: string, businessId: string) {
    const customer = await this.prisma.customer.findFirst({
      where: { id, businessId },
      include: {
        sales: {
          where: { status: { in: ['CREDIT', 'PAID'] } },
          orderBy: { createdAt: 'desc' },
          take: 20,
          select: {
            id: true, receiptNumber: true, totalCents: true,
            status: true, createdAt: true, type: true,
          },
        },
      },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }
}

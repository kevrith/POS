import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface CreateCustomerDto {
  name: string;
  phone?: string;
  email?: string;
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
        creditLimitCents: dto.creditLimitCents ?? 0,
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
}

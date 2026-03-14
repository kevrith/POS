import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChequeService {
  constructor(private prisma: PrismaService) {}

  async list(businessId: string, status?: string, type?: string) {
    return this.prisma.chequePayment.findMany({
      where: { businessId, ...(status ? { status } : {}), ...(type ? { type } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(dto: any) {
    return this.prisma.chequePayment.create({
      data: { ...dto, issueDate: new Date(dto.issueDate) },
    });
  }

  async updateStatus(id: string, status: string, clearanceDate?: string) {
    return this.prisma.chequePayment.update({
      where: { id },
      data: { status, clearanceDate: clearanceDate ? new Date(clearanceDate) : undefined },
    });
  }

  async delete(id: string) {
    return this.prisma.chequePayment.delete({ where: { id } });
  }
}

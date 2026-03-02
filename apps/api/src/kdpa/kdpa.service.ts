import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class KdpaService {
  constructor(private prisma: PrismaService) {}

  async createRequest(data: {
    businessId: string;
    requestedBy: string;
    customerId?: string;
    reason?: string;
  }) {
    return this.prisma.dataDeletionRequest.create({ data });
  }

  async getRequests(businessId: string, status?: string) {
    return this.prisma.dataDeletionRequest.findMany({
      where: { businessId, ...(status && { status }) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async reviewRequest(
    id: string,
    action: 'APPROVED' | 'REJECTED',
    reviewedBy: string,
    reviewNotes?: string,
  ) {
    const req = await this.prisma.dataDeletionRequest.findUnique({ where: { id } });
    if (!req) throw new NotFoundException('Request not found');

    if (action === 'APPROVED' && req.customerId) {
      // Anonymise PII
      await this.prisma.customer.update({
        where: { id: req.customerId },
        data: {
          name: '[DELETED]',
          phone: null,
          email: null,
        },
      });
    }

    return this.prisma.dataDeletionRequest.update({
      where: { id },
      data: {
        status: action === 'APPROVED' ? 'COMPLETED' : 'REJECTED',
        reviewedBy,
        reviewNotes,
        ...(action === 'APPROVED' && { completedAt: new Date() }),
      },
    });
  }
}

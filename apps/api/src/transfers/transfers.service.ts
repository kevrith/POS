import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

import { roundQty } from '../common/quantity';
@Injectable()
export class TransfersService {
  constructor(private prisma: PrismaService) {}

  async createTransfer(data: {
    offlineId: string;
    businessId: string;
    fromStoreId: string;
    toStoreId: string;
    initiatedBy: string;
    items: Array<{ itemId: string; quantity: number }>;
    notes?: string;
  }) {
    const transfer = await this.prisma.storeTransfer.create({
      data: {
        offlineId: data.offlineId,
        businessId: data.businessId,
        fromStoreId: data.fromStoreId,
        toStoreId: data.toStoreId,
        initiatedBy: data.initiatedBy,
        notes: data.notes,
        status: 'PENDING',
      },
    });

    await Promise.all(
      data.items.map(item =>
        this.prisma.transferItem.create({
          data: {
            transferId: transfer.id,
            itemId: item.itemId,
            quantity: item.quantity,
          },
        })
      )
    );

    for (const item of data.items) {
      await this.prisma.inventoryMovement.create({
        data: {
          offlineId: `${data.offlineId}-${item.itemId}`,
          businessId: data.businessId,
          itemId: item.itemId,
          storeId: data.fromStoreId,
          type: 'TRANSFER',
          quantity: -item.quantity,
          source: 'TRANSFER_OUT',
        },
      });
    }

    return this.getTransferDetails(transfer.id);
  }

  async receiveTransfer(transferId: string, receivedBy: string) {
    const transfer = await this.prisma.storeTransfer.findUnique({
      where: { id: transferId },
      include: { items: true },
    });

    await this.prisma.storeTransfer.update({
      where: { id: transferId },
      data: {
        status: 'COMPLETED',
        receivedBy,
      },
    });

    for (const item of transfer.items) {
      await this.prisma.inventoryMovement.create({
        data: {
          offlineId: `${transfer.offlineId}-rcv-${item.itemId}`,
          businessId: transfer.businessId,
          itemId: item.itemId,
          storeId: transfer.toStoreId,
          type: 'TRANSFER',
          quantity: item.quantity,
          source: 'TRANSFER_IN',
        },
      });
    }

    return this.getTransferDetails(transferId);
  }

  async cancelTransfer(transferId: string) {
    const transfer = await this.prisma.storeTransfer.findUnique({
      where: { id: transferId },
      include: { items: true },
    });

    await this.prisma.storeTransfer.update({
      where: { id: transferId },
      data: { status: 'CANCELLED' },
    });

    for (const item of transfer.items) {
      await this.prisma.inventoryMovement.create({
        data: {
          offlineId: `${transfer.offlineId}-cancel-${item.itemId}`,
          businessId: transfer.businessId,
          itemId: item.itemId,
          storeId: transfer.fromStoreId,
          type: 'TRANSFER',
          quantity: item.quantity,
          source: 'TRANSFER_CANCELLED',
        },
      });
    }

    return this.getTransferDetails(transferId);
  }

  async approveTransfer(transferId: string, approvedBy: string) {
    return this.prisma.storeTransfer.update({
      where: { id: transferId },
      data: { status: 'APPROVED', approvedBy },
    });
  }

  async rejectTransfer(transferId: string) {
    const transfer = await this.prisma.storeTransfer.findUnique({
      where: { id: transferId },
      include: { items: true },
    });

    await this.prisma.storeTransfer.update({
      where: { id: transferId },
      data: { status: 'REJECTED' },
    });

    for (const item of transfer.items) {
      await this.prisma.inventoryMovement.create({
        data: {
          offlineId: `${transfer.offlineId}-reject-${item.itemId}`,
          businessId: transfer.businessId,
          itemId: item.itemId,
          storeId: transfer.fromStoreId,
          type: 'TRANSFER',
          quantity: item.quantity,
          source: 'TRANSFER_REJECTED',
        },
      });
    }

    return this.getTransferDetails(transferId);
  }

  async getTransferDetails(transferId: string) {
    return this.prisma.storeTransfer.findUnique({
      where: { id: transferId },
      include: { items: true },
    });
  }

  async getTransfers(businessId: string, storeId?: string, status?: string) {
    return this.prisma.storeTransfer.findMany({
      where: {
        businessId,
        ...(storeId && {
          OR: [{ fromStoreId: storeId }, { toStoreId: storeId }],
        }),
        ...(status && { status }),
      },
      include: { items: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getConsolidatedInventory(businessId: string, itemId?: string) {
    const movements = await this.prisma.inventoryMovement.groupBy({
      by: ['itemId', 'storeId'],
      where: {
        item: { businessId },
        ...(itemId && { itemId }),
      },
      _sum: { quantity: true },
    });

    return movements.map(m => ({
      itemId: m.itemId,
      storeId: m.storeId,
      quantity: roundQty(m._sum.quantity || 0),
    }));
  }
}

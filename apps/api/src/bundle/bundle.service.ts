import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryMovementType } from '@pos/shared';
import { v4 as uuidv4 } from 'uuid';

interface CreateBundleDto {
  bundleItemId: string;
  components: Array<{ itemId: string; quantity: number }>;
}

@Injectable()
export class BundleService {
  constructor(private prisma: PrismaService) {}

  async findAll(businessId: string) {
    return this.prisma.item.findMany({
      where: { businessId, type: 'BUNDLE' },
      include: {
        bundleComponents: {
          include: {
            componentItem: { select: { id: true, name: true, retailPriceCents: true, costPriceCents: true } },
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  }

  async replaceComponents(bundleItemId: string, businessId: string, components: Array<{ itemId: string; quantity: number }>) {
    const bundle = await this.prisma.item.findFirst({
      where: { id: bundleItemId, businessId, type: 'BUNDLE' },
    });
    if (!bundle) throw new BadRequestException('Bundle item not found');

    await this.prisma.bundleComponent.deleteMany({ where: { bundleItemId } });
    if (components.length > 0) {
      await this.prisma.bundleComponent.createMany({
        data: components.map(c => ({
          bundleItemId,
          componentItemId: c.itemId,
          quantity: c.quantity,
        })),
      });
    }
    return { success: true };
  }

  async create(businessId: string, dto: CreateBundleDto) {
    const bundle = await this.prisma.item.findFirst({
      where: { id: dto.bundleItemId, businessId, type: 'BUNDLE' },
    });

    if (!bundle) throw new BadRequestException('Bundle item not found');

    await this.prisma.bundleComponent.createMany({
      data: dto.components.map(c => ({
        bundleItemId: dto.bundleItemId,
        componentItemId: c.itemId,
        quantity: c.quantity,
      })),
    });

    return { success: true };
  }

  async deductComponents(bundleItemId: string, quantitySold: number, saleId: string, storeId: string, businessId: string) {
    const bundle = await this.prisma.item.findUnique({
      where: { id: bundleItemId },
      include: { bundleComponents: true },
    });

    if (!bundle || bundle.type !== 'BUNDLE') return;

    for (const component of bundle.bundleComponents) {
      await this.prisma.inventoryMovement.create({
        data: {
          offlineId: uuidv4(),
          businessId,
          itemId: component.componentItemId,
          storeId,
          type: InventoryMovementType.BUNDLE_SALE,
          quantity: -(component.quantity * quantitySold),
          saleId,
          bundleItemId,
          source: 'POS',
        },
      });
    }
  }

  async getAvailableStock(bundleItemId: string) {
    const bundle = await this.prisma.item.findUnique({
      where: { id: bundleItemId },
      include: { bundleComponents: true },
    });

    if (!bundle) return 0;

    const stocks = await Promise.all(
      bundle.bundleComponents.map(async (c) => {
        const movements = await this.prisma.inventoryMovement.findMany({
          where: { itemId: c.componentItemId },
        });
        const stock = movements.reduce((sum, m) => sum + m.quantity, 0);
        return Math.floor(stock / c.quantity);
      })
    );

    return Math.min(...stocks);
  }
}

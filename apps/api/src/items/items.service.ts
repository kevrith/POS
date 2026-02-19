import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InventoryService } from '../inventory/inventory.service';
import { ItemType, InventoryMovementType } from '@pos/shared';
import { v4 as uuidv4 } from 'uuid';

interface CreateItemDto {
  name: string;
  type: ItemType;
  barcode?: string;
  categoryId?: string;
  retailPriceCents: number;
  wholesalePriceCents?: number;
  vipPriceCents?: number;
  costPriceCents?: number;
  trackStock: boolean;
  trackSerials?: boolean;
  trackBatches?: boolean;
  trackExpiry?: boolean;
  defaultExpiryDays?: number;
  vatApplicable?: boolean;
  totApplicable?: boolean;
  storeId: string;
  businessId: string;
  initialStock?: number;
}

interface UpdateItemDto extends Partial<Omit<CreateItemDto, 'businessId' | 'storeId'>> {}

@Injectable()
export class ItemsService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  async findAll(businessId: string, storeId: string, search?: string) {
    const items = await this.prisma.item.findMany({
      where: {
        businessId,
        storeId,
        deletedAt: null,
        ...(search && {
          OR: [
            { name: { contains: search } },
            { barcode: { contains: search } },
          ],
        }),
      },
      orderBy: { name: 'asc' },
    });

    const stockMap = await this.inventory.getStockLevels(
      items.map((i) => i.id),
      storeId,
    );

    return items.map((item) => ({
      ...item,
      currentStock: stockMap.get(item.id) ?? 0,
    }));
  }

  async findOne(id: string, businessId: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, businessId, deletedAt: null },
      include: {
        bundleComponents: { include: { componentItem: true } },
        recipeIngredients: { include: { ingredientItem: true } },
      },
    });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  async create(dto: CreateItemDto) {
    const item = await this.prisma.item.create({
      data: {
        offlineId: uuidv4(),
        name: dto.name,
        type: dto.type,
        barcode: dto.barcode,
        category: dto.categoryId,
        retailPriceCents: dto.retailPriceCents,
        wholesalePriceCents: dto.wholesalePriceCents,
        vipPriceCents: dto.vipPriceCents,
        costPriceCents: dto.costPriceCents,
        trackStock: dto.trackStock,
        trackSerials: dto.trackSerials ?? false,
        trackBatches: dto.trackBatches ?? false,
        trackExpiry: dto.trackExpiry ?? false,
        defaultExpiryDays: dto.defaultExpiryDays,
        vatApplicable: dto.vatApplicable ?? true,
        totApplicable: dto.totApplicable ?? false,
        storeId: dto.storeId,
        businessId: dto.businessId,
      },
    });

    if (dto.initialStock && dto.initialStock > 0 && dto.trackStock) {
      await this.inventory.createMovement({
        itemId: item.id,
        storeId: dto.storeId,
        businessId: dto.businessId,
        type: InventoryMovementType.INITIAL,
        quantity: dto.initialStock,
        source: 'IMPORT',
      });
    }

    return item;
  }

  async update(id: string, businessId: string, dto: UpdateItemDto) {
    const item = await this.prisma.item.findFirst({ where: { id, businessId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');

    return this.prisma.item.update({
      where: { id },
      data: {
        name: dto.name,
        barcode: dto.barcode,
        category: dto.categoryId,
        retailPriceCents: dto.retailPriceCents,
        wholesalePriceCents: dto.wholesalePriceCents,
        vipPriceCents: dto.vipPriceCents,
        costPriceCents: dto.costPriceCents,
        trackStock: dto.trackStock,
        vatApplicable: dto.vatApplicable,
        totApplicable: dto.totApplicable,
      },
    });
  }

  async softDelete(id: string, businessId: string) {
    const item = await this.prisma.item.findFirst({ where: { id, businessId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    return this.prisma.item.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async getCategories(businessId: string) {
    const items = await this.prisma.item.findMany({
      where: { businessId, deletedAt: null, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
    });
    return items.map((i, idx) => ({ id: String(idx), name: i.category as string }));
  }

  async createCategory(businessId: string, name: string, _color?: string) {
    // Categories are stored as strings on items; return stub
    return { id: name, businessId, name };
  }

  async importBulk(businessId: string, storeId: string, rows: CreateItemDto[]) {
    const created: string[] = [];
    for (const row of rows) {
      const item = await this.create({ ...row, businessId, storeId });
      created.push(item.id);
    }
    return { created: created.length };
  }
}

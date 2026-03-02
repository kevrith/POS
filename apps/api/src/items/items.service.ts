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

interface CreateVariantDto {
  name: string;
  sku?: string;
  barcode?: string;
  retailPriceCents: number;
  wholesalePriceCents?: number;
  vipPriceCents?: number;
  costPriceCents?: number;
  attributes: Record<string, string>;
}

@Injectable()
export class ItemsService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  async findAll(businessId: string, storeId?: string, search?: string) {
    const items = await this.prisma.item.findMany({
      where: {
        businessId,
        ...(storeId ? { storeId } : {}),
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

    const stockMap = storeId
      ? await this.inventory.getStockLevels(items.map((i) => i.id), storeId)
      : new Map<string, number>();

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
      orderBy: { category: 'asc' },
    });
    // Use the category name itself as the id — it is the unique key (no Category table)
    return items.map((i) => ({ id: i.category as string, name: i.category as string }));
  }

  async createCategory(businessId: string, name: string, _color?: string) {
    // Categories are stored as strings on items; return stub
    return { id: name, businessId, name };
  }

  async listVariants(itemId: string, businessId: string) {
    const item = await this.prisma.item.findFirst({ where: { id: itemId, businessId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    return this.prisma.itemVariant.findMany({ where: { itemId }, orderBy: { name: 'asc' } });
  }

  async createVariant(itemId: string, businessId: string, dto: CreateVariantDto) {
    const item = await this.prisma.item.findFirst({ where: { id: itemId, businessId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    return this.prisma.itemVariant.create({
      data: {
        itemId,
        name: dto.name,
        sku: dto.sku,
        barcode: dto.barcode,
        retailPriceCents: dto.retailPriceCents,
        wholesalePriceCents: dto.wholesalePriceCents,
        vipPriceCents: dto.vipPriceCents,
        costPriceCents: dto.costPriceCents,
        attributes: JSON.stringify(dto.attributes ?? {}),
      },
    });
  }

  async updateVariant(itemId: string, variantId: string, businessId: string, dto: Partial<CreateVariantDto>) {
    const item = await this.prisma.item.findFirst({ where: { id: itemId, businessId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    const variant = await this.prisma.itemVariant.findFirst({ where: { id: variantId, itemId } });
    if (!variant) throw new NotFoundException('Variant not found');
    return this.prisma.itemVariant.update({
      where: { id: variantId },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.sku !== undefined && { sku: dto.sku }),
        ...(dto.barcode !== undefined && { barcode: dto.barcode }),
        ...(dto.retailPriceCents !== undefined && { retailPriceCents: dto.retailPriceCents }),
        ...(dto.wholesalePriceCents !== undefined && { wholesalePriceCents: dto.wholesalePriceCents }),
        ...(dto.vipPriceCents !== undefined && { vipPriceCents: dto.vipPriceCents }),
        ...(dto.costPriceCents !== undefined && { costPriceCents: dto.costPriceCents }),
        ...(dto.attributes !== undefined && { attributes: JSON.stringify(dto.attributes) }),
      },
    });
  }

  async deleteVariant(itemId: string, variantId: string, businessId: string) {
    const item = await this.prisma.item.findFirst({ where: { id: itemId, businessId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    const variant = await this.prisma.itemVariant.findFirst({ where: { id: variantId, itemId } });
    if (!variant) throw new NotFoundException('Variant not found');
    await this.prisma.itemVariant.delete({ where: { id: variantId } });
  }

  async importBulk(businessId: string, storeId: string, rows: CreateItemDto[]) {
    const created: string[] = [];
    for (const row of rows) {
      const item = await this.create({ ...row, businessId, storeId });
      created.push(item.id);
    }
    return { created: created.length };
  }

  async importFromCsv(businessId: string, storeId: string, rows: Array<{
    name: string;
    category?: string;
    retailPrice: number;
    costPrice?: number;
    barcode?: string;
    currentStock?: number;
    expiryDate?: string;
    lotNumber?: string;
  }>) {
    const results: Array<{ success: boolean; name: string; id?: string; error?: string }> = [];
    for (const row of rows) {
      try {
        const item = await this.prisma.item.create({
          data: {
            offlineId: uuidv4(),
            businessId,
            storeId,
            name: row.name,
            category: row.category,
            retailPriceCents: Math.round((row.retailPrice ?? 0) * 100),
            costPriceCents: row.costPrice ? Math.round(row.costPrice * 100) : undefined,
            barcode: row.barcode || undefined,
            type: 'PRODUCT',
            trackStock: true,
          },
        });
        // If initial stock provided, create movement
        if (row.currentStock && row.currentStock > 0) {
          await this.prisma.inventoryMovement.create({
            data: {
              offlineId: uuidv4(),
              businessId,
              itemId: item.id,
              storeId,
              type: 'INITIAL',
              quantity: row.currentStock,
              source: 'IMPORT',
            },
          });
        }
        // If batch/expiry data provided, create batch
        if (row.expiryDate || row.lotNumber) {
          await this.prisma.batch.create({
            data: {
              offlineId: uuidv4(),
              itemId: item.id,
              storeId,
              lotNumber: row.lotNumber ?? `LOT-${Date.now()}`,
              expiryDate: row.expiryDate ? new Date(row.expiryDate) : undefined,
              quantityReceived: row.currentStock ?? 0,
              quantityRemaining: row.currentStock ?? 0,
            },
          });
        }
        results.push({ success: true, name: row.name, id: item.id });
      } catch (e) {
        results.push({ success: false, name: row.name, error: (e as Error).message });
      }
    }
    return {
      imported: results.filter(r => r.success).length,
      failed: results.filter(r => !r.success).length,
      results,
    };
  }

  // ── Expiry check for cart items ──────────────────────────────────────────

  async checkCartExpiry(itemIds: string[], storeId: string, businessId: string) {
    const now = new Date();
    // Use business expiryAlertDays, fall back to 7
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { expiryAlertDays: true },
    });
    const alertDays = business?.expiryAlertDays ?? 7;
    const warnThreshold = new Date(now.getTime() + alertDays * 24 * 60 * 60 * 1000);

    const items = await this.prisma.item.findMany({
      where: { id: { in: itemIds }, businessId, trackExpiry: true },
      include: {
        batches: {
          where: { storeId, quantityRemaining: { gt: 0 }, status: 'ACTIVE' },
          orderBy: { expiryDate: 'asc' }, // FEFO — earliest expiry first
          take: 1,
        },
      },
    });

    const results = items.map((item) => {
      const earliest = item.batches[0];
      if (!earliest?.expiryDate) return { itemId: item.id, name: item.name, status: 'OK' as const };

      const expiry = earliest.expiryDate;
      if (expiry <= now) {
        return { itemId: item.id, name: item.name, status: 'EXPIRED' as const, expiryDate: expiry.toISOString(), daysLeft: 0, lotNumber: earliest.lotNumber };
      }
      const daysLeft = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      if (expiry <= warnThreshold) {
        return { itemId: item.id, name: item.name, status: 'EXPIRING_SOON' as const, expiryDate: expiry.toISOString(), daysLeft, lotNumber: earliest.lotNumber };
      }
      return { itemId: item.id, name: item.name, status: 'OK' as const, expiryDate: expiry.toISOString(), daysLeft, lotNumber: earliest.lotNumber };
    });

    return results;
  }

  /** FEFO: return all batches for given items sorted by expiry date for POS suggestion */
  async getFEFOSuggestions(itemIds: string[], storeId: string) {
    const batches = await this.prisma.batch.findMany({
      where: {
        itemId: { in: itemIds },
        storeId,
        quantityRemaining: { gt: 0 },
        status: 'ACTIVE',
        expiryDate: { not: null },
      },
      include: { item: { select: { name: true } } },
      orderBy: { expiryDate: 'asc' },
    });

    const now = new Date();
    return batches.map((b) => {
      const daysLeft = b.expiryDate ? Math.ceil((b.expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) : null;
      return {
        itemId: b.itemId,
        itemName: b.item.name,
        batchId: b.id,
        lotNumber: b.lotNumber,
        expiryDate: b.expiryDate?.toISOString() ?? null,
        daysLeft,
        qtyRemaining: b.quantityRemaining,
        status: daysLeft !== null && daysLeft <= 0 ? 'EXPIRED' : daysLeft !== null && daysLeft <= 30 ? 'EXPIRING_SOON' : 'OK',
      };
    });
  }

  /** Get items at or below their reorder level */
  async getLowStock(businessId: string, storeId: string) {
    const items = await this.prisma.item.findMany({
      where: { businessId, storeId, deletedAt: null, trackStock: true, reorderLevel: { gt: 0 } },
      orderBy: { name: 'asc' },
    });
    const stockMap = await this.inventory.getStockLevels(items.map((i) => i.id), storeId);
    return items
      .map((item) => ({ ...item, currentStock: stockMap.get(item.id) ?? 0 }))
      .filter((item) => item.currentStock <= (item.reorderLevel ?? 0));
  }

  /** Get items expiring within threshold days for inventory badge display */
  async getExpiringItems(businessId: string, storeId: string, thresholdDays?: number) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { expiryAlertDays: true },
    });
    const days = thresholdDays ?? business?.expiryAlertDays ?? 30;
    const threshold = new Date(Date.now() + days * 24 * 60 * 60 * 1000);

    return this.prisma.batch.findMany({
      where: {
        storeId,
        quantityRemaining: { gt: 0 },
        status: 'ACTIVE',
        expiryDate: { lte: threshold },
      },
      include: { item: { select: { name: true, category: true } } },
      orderBy: { expiryDate: 'asc' },
    });
  }
}

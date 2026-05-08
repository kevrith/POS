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
  categoryName?: string;
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
  imageUrl?: string;
  allergens?: string[];
  reorderQty?: number;
}

interface UpdateItemDto extends Partial<Omit<CreateItemDto, 'businessId' | 'storeId'>> {
  soldOut?: boolean;
  isFractional?: boolean;
  unitLabel?: string;
  availableFrom?: string;
  availableTo?: string;
  availableDays?: string;
  categoryName?: string;
}

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

interface CreateUOMDto {
  unitName: string;
  unitAbbrev: string;
  conversionFactor: number;
  isBaseUnit?: boolean;
  priceCents?: number;
  barcode?: string;
}

@Injectable()
export class ItemsService {
  constructor(
    private prisma: PrismaService,
    private inventory: InventoryService,
  ) {}

  async findAll(businessId: string, storeId?: string, search?: string, activeOnly = false) {
    const items = await this.prisma.item.findMany({
      where: {
        businessId,
        ...(storeId ? { storeId } : {}),
        deletedAt: null,
        ...(activeOnly && { isActive: true }),
        ...(search && {
          OR: [
            { name: { contains: search, mode: 'insensitive' } },
            { barcode: { contains: search, mode: 'insensitive' } },
          ],
        }),
      },
      include: {
        itemCategory: true,
        uoms: { orderBy: { conversionFactor: 'asc' } },
      },
      orderBy: { name: 'asc' },
    });

    const itemIds = items.map((i) => i.id);
    const stockMap = storeId
      ? await this.inventory.getStockLevels(itemIds, storeId, businessId)
      : await this.inventory.getStockLevelsByBusiness(itemIds, businessId);

    // Bulk expiry check: get earliest non-null expiry batch per item
    const now = new Date();
    const batches = await this.prisma.batch.findMany({
      where: {
        itemId: { in: itemIds },
        expiryDate: { not: null },
        quantityRemaining: { gt: 0 },
      },
      select: { itemId: true, expiryDate: true },
      orderBy: { expiryDate: 'asc' },
    });
    // Keep only the earliest batch per item
    const expiryMap = new Map<string, Date>();
    for (const b of batches) {
      if (b.expiryDate && !expiryMap.has(b.itemId)) {
        expiryMap.set(b.itemId, b.expiryDate);
      }
    }

    return items.map((item) => {
      const baseStock = stockMap.get(item.id) ?? 0;
      const earliestExpiry = expiryMap.get(item.id);
      const batchExpired = item.trackExpiry && !!earliestExpiry && earliestExpiry <= now;
      const batchExpiringSoon = item.trackExpiry && !!earliestExpiry && !batchExpired &&
        Math.ceil((earliestExpiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)) <= 30;
      // Build category object: prefer the FK-linked category, fall back to legacy string
      const categoryObj = item.itemCategory
        ? { id: item.itemCategory.id, name: item.itemCategory.name, color: item.itemCategory.color }
        : item.category
        ? { id: item.category, name: item.category, color: '#6B7280' }
        : null;

      // Build stock breakdown by UOM
      const stockBreakdown = item.uoms.map((uom) => ({
        unitName: uom.unitName,
        unitAbbrev: uom.unitAbbrev,
        conversionFactor: uom.conversionFactor,
        isBaseUnit: uom.isBaseUnit,
        quantity: uom.isBaseUnit ? baseStock : Math.floor(baseStock / uom.conversionFactor),
        remainder: uom.isBaseUnit ? 0 : baseStock % uom.conversionFactor,
        priceCents: uom.priceCents,
        barcode: uom.barcode,
        id: uom.id,
      }));

      return {
        ...item,
        category: categoryObj,
        categoryId: item.categoryId,
        currentStock: baseStock,
        stockBreakdown,
        uoms: item.uoms,
        batchExpired,
        batchExpiringSoon,
      };
    });
  }

  async findOne(id: string, businessId: string) {
    const item = await this.prisma.item.findFirst({
      where: { id, businessId, deletedAt: null },
      include: {
        bundleComponents: { include: { componentItem: true } },
        recipeIngredients: { include: { ingredientItem: true } },
        itemCategory: true,
        uoms: { orderBy: { conversionFactor: 'asc' } },
      },
    });
    if (!item) throw new NotFoundException('Item not found');
    return item;
  }

  // ─── Category CRUD ──────────────────────────────────────────────────────────

  async getCategories(businessId: string) {
    const cats = await this.prisma.category.findMany({
      where: { businessId },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
    if (cats.length > 0) return cats;

    // Fallback: derive categories from existing items (legacy data migration)
    const items = await this.prisma.item.findMany({
      where: { businessId, deletedAt: null, category: { not: null } },
      select: { category: true },
      distinct: ['category'],
      orderBy: { category: 'asc' },
    });
    return items.map((i) => ({ id: i.category as string, name: i.category as string, color: '#6B7280', sortOrder: 0 }));
  }

  async createCategory(businessId: string, name: string, color?: string) {
    if (!name?.trim()) throw new BadRequestException('Category name is required');
    const existing = await this.prisma.category.findFirst({
      where: { businessId, name: { equals: name.trim(), mode: 'insensitive' } },
    });
    if (existing) return existing; // idempotent
    return this.prisma.category.create({
      data: { id: uuidv4(), businessId, name: name.trim(), color: color ?? '#6B7280' },
    });
  }

  async updateCategory(id: string, businessId: string, data: { name?: string; color?: string; sortOrder?: number }) {
    const cat = await this.prisma.category.findFirst({ where: { id, businessId } });
    if (!cat) throw new NotFoundException('Category not found');
    if (data.name?.trim()) {
      const conflict = await this.prisma.category.findFirst({
        where: { businessId, name: { equals: data.name.trim(), mode: 'insensitive' }, id: { not: id } },
      });
      if (conflict) throw new BadRequestException('A category with this name already exists');
    }
    return this.prisma.category.update({
      where: { id },
      data: {
        ...(data.name?.trim() && { name: data.name.trim() }),
        ...(data.color && { color: data.color }),
        ...(data.sortOrder !== undefined && { sortOrder: data.sortOrder }),
      },
    });
  }

  async deleteCategory(id: string, businessId: string) {
    const cat = await this.prisma.category.findFirst({ where: { id, businessId } });
    if (!cat) throw new NotFoundException('Category not found');
    // Unlink items from this category
    await this.prisma.item.updateMany({ where: { businessId, categoryId: id }, data: { categoryId: null } });
    await this.prisma.category.delete({ where: { id } });
    return { ok: true };
  }

  // ─── Item UOM CRUD ──────────────────────────────────────────────────────────

  async getUOMs(itemId: string, businessId: string) {
    const item = await this.prisma.item.findFirst({ where: { id: itemId, businessId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    return this.prisma.itemUOM.findMany({ where: { itemId }, orderBy: { conversionFactor: 'asc' } });
  }

  async createUOM(itemId: string, businessId: string, dto: CreateUOMDto) {
    const item = await this.prisma.item.findFirst({ where: { id: itemId, businessId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    if (dto.conversionFactor <= 0) throw new BadRequestException('Conversion factor must be > 0');

    // If setting as base unit, clear previous base unit
    if (dto.isBaseUnit) {
      await this.prisma.itemUOM.updateMany({ where: { itemId }, data: { isBaseUnit: false } });
    }
    return this.prisma.itemUOM.create({
      data: {
        id: uuidv4(),
        itemId,
        unitName: dto.unitName,
        unitAbbrev: dto.unitAbbrev,
        conversionFactor: dto.conversionFactor,
        isBaseUnit: dto.isBaseUnit ?? dto.conversionFactor === 1,
        priceCents: dto.priceCents ?? null,
        barcode: dto.barcode ?? null,
      },
    });
  }

  async updateUOM(itemId: string, uomId: string, businessId: string, dto: Partial<CreateUOMDto>) {
    const item = await this.prisma.item.findFirst({ where: { id: itemId, businessId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    const uom = await this.prisma.itemUOM.findFirst({ where: { id: uomId, itemId } });
    if (!uom) throw new NotFoundException('UOM not found');

    if (dto.isBaseUnit) {
      await this.prisma.itemUOM.updateMany({ where: { itemId, id: { not: uomId } }, data: { isBaseUnit: false } });
    }
    return this.prisma.itemUOM.update({
      where: { id: uomId },
      data: {
        ...(dto.unitName && { unitName: dto.unitName }),
        ...(dto.unitAbbrev && { unitAbbrev: dto.unitAbbrev }),
        ...(dto.conversionFactor !== undefined && { conversionFactor: dto.conversionFactor }),
        ...(dto.isBaseUnit !== undefined && { isBaseUnit: dto.isBaseUnit }),
        ...(dto.priceCents !== undefined && { priceCents: dto.priceCents }),
        ...(dto.barcode !== undefined && { barcode: dto.barcode }),
      },
    });
  }

  async deleteUOM(uomId: string, itemId: string, businessId: string) {
    const item = await this.prisma.item.findFirst({ where: { id: itemId, businessId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    const uom = await this.prisma.itemUOM.findFirst({ where: { id: uomId, itemId } });
    if (!uom) throw new NotFoundException('UOM not found');
    await this.prisma.itemUOM.delete({ where: { id: uomId } });
    return { ok: true };
  }

  // ─── Item CRUD ──────────────────────────────────────────────────────────────

  async create(dto: CreateItemDto) {
    // Resolve storeId — owners have no storeId in JWT, fall back to first store
    let storeId = dto.storeId;
    if (!storeId) {
      const store = await this.prisma.store.findFirst({
        where: { businessId: dto.businessId },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      if (!store) throw new BadRequestException('No store found for this business');
      storeId = store.id;
    }

    // Resolve categoryId from name if needed
    let resolvedCategoryId = dto.categoryId ?? null;
    if (!resolvedCategoryId && dto.categoryName?.trim()) {
      const cat = await this.createCategory(dto.businessId, dto.categoryName.trim());
      resolvedCategoryId = cat.id;
    }

    const item = await this.prisma.item.create({
      data: {
        offlineId: uuidv4(),
        name: dto.name,
        type: dto.type,
        barcode: dto.barcode,
        category: dto.categoryName?.trim() || null,
        categoryId: resolvedCategoryId,
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
        negativeStockPolicy: (dto as any).negativeStockPolicy ?? 'ALLOW',
        storeId,
        businessId: dto.businessId,
      },
    });

    if (dto.initialStock && dto.initialStock > 0 && dto.trackStock) {
      await this.inventory.createMovement({
        itemId: item.id,
        storeId,
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

    // Resolve categoryId from name if needed
    let resolvedCategoryId: string | null | undefined = dto.categoryId ?? undefined;
    if (resolvedCategoryId === undefined && dto.categoryName !== undefined) {
      if (dto.categoryName.trim()) {
        const cat = await this.createCategory(businessId, dto.categoryName.trim());
        resolvedCategoryId = cat.id;
      } else {
        resolvedCategoryId = null;
      }
    }

    return this.prisma.item.update({
      where: { id },
      data: {
        name: dto.name,
        barcode: dto.barcode,
        category: dto.categoryName?.trim() ?? undefined,
        ...(resolvedCategoryId !== undefined && { categoryId: resolvedCategoryId }),
        retailPriceCents: dto.retailPriceCents,
        wholesalePriceCents: dto.wholesalePriceCents,
        vipPriceCents: dto.vipPriceCents,
        costPriceCents: dto.costPriceCents,
        trackStock: dto.trackStock,
        vatApplicable: dto.vatApplicable,
        totApplicable: dto.totApplicable,
        ...(dto.imageUrl !== undefined && { imageUrl: dto.imageUrl }),
        ...(dto.allergens !== undefined && { allergens: JSON.stringify(dto.allergens) }),
        ...(dto.reorderQty !== undefined && { reorderQty: dto.reorderQty }),
        ...(dto.soldOut !== undefined && { soldOut: dto.soldOut }),
        ...(dto.isFractional !== undefined && { isFractional: dto.isFractional }),
        ...(dto.unitLabel !== undefined && { unitLabel: dto.unitLabel }),
        ...(dto.availableFrom !== undefined && { availableFrom: dto.availableFrom }),
        ...(dto.availableTo !== undefined && { availableTo: dto.availableTo }),
        ...(dto.availableDays !== undefined && { availableDays: Array.isArray(dto.availableDays) ? JSON.stringify(dto.availableDays) : dto.availableDays }),
        ...((dto as any).negativeStockPolicy !== undefined && { negativeStockPolicy: (dto as any).negativeStockPolicy }),
      },
    });
  }

  async toggleActive(id: string, businessId: string) {
    const item = await this.prisma.item.findFirst({ where: { id, businessId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    return this.prisma.item.update({ where: { id }, data: { isActive: !item.isActive } });
  }

  async toggle86(id: string, businessId: string) {
    const item = await this.prisma.item.findFirst({ where: { id, businessId } });
    if (!item) throw new NotFoundException('Item not found');
    return this.prisma.item.update({ where: { id }, data: { soldOut: !item.soldOut } });
  }

  async softDelete(id: string, businessId: string) {
    const item = await this.prisma.item.findFirst({ where: { id, businessId, deletedAt: null } });
    if (!item) throw new NotFoundException('Item not found');
    return this.prisma.item.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async getLowStock(businessId: string, storeId?: string) {
    const items = await this.prisma.item.findMany({
      where: {
        businessId,
        ...(storeId ? { storeId } : {}),
        deletedAt: null,
        trackStock: true,
      },
      include: { itemCategory: true },
      orderBy: { name: 'asc' },
    });
    const itemIds = items.map((i) => i.id);
    const stockMap = storeId
      ? await this.inventory.getStockLevels(itemIds, storeId, businessId)
      : await this.inventory.getStockLevelsByBusiness(itemIds, businessId);
    return items
      .map((item) => ({
        ...item,
        category: item.itemCategory
          ? { id: item.itemCategory.id, name: item.itemCategory.name, color: item.itemCategory.color }
          : item.category ? { id: item.category, name: item.category, color: '#6B7280' } : null,
        currentStock: stockMap.get(item.id) ?? 0,
      }))
      .filter((item) => {
        const stock = item.currentStock;
        const reorder = (item as any).reorderLevel ?? 0;
        return stock === 0 || (reorder > 0 && stock <= reorder);
      });
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

  decodeGS1Barcode(barcode: string): { itemBarcode?: string; weightGrams?: number; priceCents?: number; raw: string } {
    // GS1-128: Application Identifiers (AI)
    // AI 01 = GTIN (14 digits)
    // AI 3100-3105 = net weight in kg (6 digits, implied decimal)
    // AI 3200-3205 = net weight in g (6 digits)
    // AI 3960-3969 = price (6 digits)
    const result: any = { raw: barcode };

    // Remove parentheses if human-readable format: (01)12345... → 0112345...
    const stripped = barcode.replace(/[()]/g, '');

    let pos = 0;
    while (pos < stripped.length) {
      const ai2 = stripped.substring(pos, pos + 2);
      const ai3 = stripped.substring(pos, pos + 3);
      const ai4 = stripped.substring(pos, pos + 4);

      if (ai2 === '01') {
        result.itemBarcode = stripped.substring(pos + 2, pos + 16);
        pos += 16;
      } else if (ai4 >= '3100' && ai4 <= '3105') {
        const decimals = parseInt(ai4[3]);
        const raw = parseInt(stripped.substring(pos + 4, pos + 10));
        result.weightGrams = Math.round(raw * Math.pow(10, -decimals) * 1000);
        pos += 10;
      } else if (ai4 >= '3200' && ai4 <= '3205') {
        const decimals = parseInt(ai4[3]);
        const raw = parseInt(stripped.substring(pos + 4, pos + 10));
        result.weightGrams = Math.round(raw * Math.pow(10, -decimals));
        pos += 10;
      } else if (ai4 >= '3960' && ai4 <= '3969') {
        const decimals = parseInt(ai4[3]);
        const raw = parseInt(stripped.substring(pos + 4, pos + 10));
        result.priceCents = Math.round(raw * Math.pow(10, -decimals) * 100);
        pos += 10;
      } else {
        // Unknown AI, stop
        break;
      }
      // Suppress unused variable warnings
      void ai3;
    }

    return result;
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

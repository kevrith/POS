import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

interface WeeklySales {
  weekIndex: number;
  qty: number;
}

export interface ForecastItem {
  itemId: string;
  itemName: string;
  currentStock: number;
  weeklyAvgSales: number;
  trend: number;
  forecastedDemand: number;
  isLowStock: boolean;
  suggestedOrderQty: number;
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface TopMover {
  itemId: string;
  itemName: string;
  totalQty: number;
  totalRevenueCents: number;
}

export interface HourlyPattern {
  hour: number;
  avgSales: number;
  avgRevenueCents: number;
}

export interface DailyPattern {
  dayOfWeek: number;
  dayName: string;
  avgSales: number;
  avgRevenueCents: number;
}

interface RawSaleItemRow {
  itemId: string | null;
  itemName: string;
  weekIndex: number;
  totalQty: number;
  totalRevenueCents: number;
}

interface RawStockRow {
  itemId: string;
  netStock: number | bigint;
}

interface RawHourlyRow {
  hour: number | bigint;
  saleCount: number | bigint;
  totalRevenueCents: number | bigint;
  dayCount: number | bigint;
}

interface RawDailyRow {
  dayOfWeek: number | bigint;
  saleCount: number | bigint;
  totalRevenueCents: number | bigint;
  weekCount: number | bigint;
}

interface RawTopMoverRow {
  itemId: string | null;
  itemName: string;
  totalQty: number | bigint;
  totalRevenueCents: number | bigint;
}

@Injectable()
export class ForecastingService {
  constructor(private prisma: PrismaService) {}

  // ─── Linear regression slope ─────────────────────────────────────────────
  private linearRegressionSlope(values: number[]): number {
    const n = values.length;
    if (n < 2) return 0;
    const xMean = (n - 1) / 2;
    const yMean = values.reduce((a, b) => a + b, 0) / n;
    let numerator = 0;
    let denominator = 0;
    for (let i = 0; i < n; i++) {
      numerator += (i - xMean) * (values[i] - yMean);
      denominator += (i - xMean) ** 2;
    }
    return denominator === 0 ? 0 : numerator / denominator;
  }

  // ─── Standard deviation ───────────────────────────────────────────────────
  private stdDev(values: number[]): number {
    if (values.length === 0) return 0;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance =
      values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
    return Math.sqrt(variance);
  }

  private toNum(v: number | bigint | null | undefined): number {
    if (v == null) return 0;
    return typeof v === 'bigint' ? Number(v) : v;
  }

  // ─── Main forecast ────────────────────────────────────────────────────────
  async getForecast(
    businessId: string,
    storeId?: string,
    days = 30,
  ): Promise<{ items: ForecastItem[] }> {
    const now = new Date();
    const since90 = new Date(now.getTime() - 90 * 24 * 3600 * 1000);
    const sinceStr = since90.toISOString();
    const storeFilter = storeId ? `AND s."storeId" = '${storeId}'` : '';

    // ── 1) Weekly sales per item for last 90 days ──────────────────────────
    // SQLite doesn't have date_trunc, so we compute week index manually.
    // Epoch in seconds / (7*86400) gives a week bucket.
    const rawRows = await this.prisma.$queryRawUnsafe<RawSaleItemRow[]>(`
      SELECT
        si."itemId",
        si."name" AS "itemName",
        CAST((strftime('%s', s."createdAt") / (7 * 86400)) AS INTEGER) AS "weekIndex",
        SUM(si."quantity") AS "totalQty",
        SUM(si."totalCents") AS "totalRevenueCents"
      FROM "SaleItem" si
      JOIN "Sale" s ON s."id" = si."saleId"
      WHERE s."businessId" = '${businessId}'
        AND s."status" IN ('PAID', 'COMPLETED', 'AMENDED')
        AND s."createdAt" >= '${sinceStr}'
        ${storeFilter}
        AND si."itemId" IS NOT NULL
      GROUP BY si."itemId", si."name", CAST((strftime('%s', s."createdAt") / (7 * 86400)) AS INTEGER)
      ORDER BY si."itemId", "weekIndex"
    `);

    // ── 2) Current stock per item via InventoryMovement ───────────────────
    const stockRows = await this.prisma.$queryRawUnsafe<RawStockRow[]>(`
      SELECT
        im."itemId",
        SUM(
          CASE
            WHEN im."type" IN ('RECEIVE','RETURN','ADJUST_UP','TRANSFER_IN') THEN im."quantity"
            ELSE -im."quantity"
          END
        ) AS "netStock"
      FROM "InventoryMovement" im
      JOIN "Item" it ON it."id" = im."itemId"
      WHERE it."businessId" = '${businessId}'
        ${storeId ? `AND im."storeId" = '${storeId}'` : ''}
      GROUP BY im."itemId"
    `);

    const stockMap = new Map<string, number>();
    for (const row of stockRows) {
      stockMap.set(row.itemId, Math.max(0, this.toNum(row.netStock)));
    }

    // ── 3) Aggregate weekly data per item ─────────────────────────────────
    const itemMap = new Map<
      string,
      { name: string; weeks: Map<number, number> }
    >();

    for (const row of rawRows) {
      if (!row.itemId) continue;
      if (!itemMap.has(row.itemId)) {
        itemMap.set(row.itemId, {
          name: row.itemName,
          weeks: new Map(),
        });
      }
      const entry = itemMap.get(row.itemId)!;
      const existing = entry.weeks.get(row.weekIndex) ?? 0;
      entry.weeks.set(row.weekIndex, existing + this.toNum(row.totalQty));
    }

    // Current week bucket
    const currentWeekBucket = Math.floor(now.getTime() / 1000 / (7 * 86400));

    const results: ForecastItem[] = [];

    for (const [itemId, data] of itemMap.entries()) {
      // Get the 4 most recent week buckets
      const sortedWeeks = Array.from(data.weeks.entries()).sort(
        (a, b) => a[0] - b[0],
      );

      // Fill missing weeks with 0 for last 12 weeks
      const last12Weeks: WeeklySales[] = [];
      for (let i = 11; i >= 0; i--) {
        const bucket = currentWeekBucket - i;
        const qty = data.weeks.get(bucket) ?? 0;
        last12Weeks.push({ weekIndex: bucket, qty });
      }

      const last4Qtys = last12Weeks.slice(-4).map((w) => w.qty);
      const all12Qtys = last12Weeks.map((w) => w.qty);

      const weeklyAvgSales =
        last4Qtys.reduce((a, b) => a + b, 0) / Math.max(last4Qtys.length, 1);

      const sd = this.stdDev(all12Qtys.filter((q) => q > 0));
      const avg =
        all12Qtys.reduce((a, b) => a + b, 0) /
        Math.max(all12Qtys.filter((q) => q > 0).length, 1);

      // Trend: linear regression slope on last 8 weeks, normalised by avg
      const last8Qtys = last12Weeks.slice(-8).map((w) => w.qty);
      const rawSlope = this.linearRegressionSlope(last8Qtys);
      const trend = avg > 0 ? rawSlope / avg : 0;

      // Forecast: weeklyAvgSales/7 * days * (1 + trend)
      const forecastedDemand = Math.max(
        0,
        Math.round((weeklyAvgSales / 7) * days * (1 + trend)),
      );

      const currentStock = stockMap.get(itemId) ?? 0;
      const isLowStock = currentStock < forecastedDemand * 1.5;
      const suggestedOrderQty = isLowStock
        ? Math.max(0, Math.round(forecastedDemand * 2 - currentStock))
        : 0;

      // Confidence based on coefficient of variation
      const nonZeroQtys = all12Qtys.filter((q) => q > 0);
      const cv =
        nonZeroQtys.length > 0 && avg > 0
          ? this.stdDev(nonZeroQtys) / avg
          : 1;
      const confidence: 'HIGH' | 'MEDIUM' | 'LOW' =
        cv < 0.3 ? 'HIGH' : cv < 0.6 ? 'MEDIUM' : 'LOW';

      results.push({
        itemId,
        itemName: data.name,
        currentStock,
        weeklyAvgSales: Math.round(weeklyAvgSales * 100) / 100,
        trend: Math.round(trend * 1000) / 1000,
        forecastedDemand,
        isLowStock,
        suggestedOrderQty,
        confidence,
      });

      // Suppress unused variable warning
      void sortedWeeks;
      void sd;
    }

    // Sort: low stock first, then by suggestedOrderQty desc
    results.sort((a, b) => {
      if (a.isLowStock !== b.isLowStock) return a.isLowStock ? -1 : 1;
      return b.suggestedOrderQty - a.suggestedOrderQty;
    });

    return { items: results };
  }

  // ─── Top / slow movers ────────────────────────────────────────────────────
  async getTopMovers(
    businessId: string,
    storeId?: string,
    period = '7d',
  ): Promise<{ fastMovers: TopMover[]; slowMovers: TopMover[] }> {
    const days = period === '30d' ? 30 : period === '14d' ? 14 : 7;
    const since = new Date(Date.now() - days * 24 * 3600 * 1000);
    const sinceStr = since.toISOString();
    const storeFilter = storeId ? `AND s."storeId" = '${storeId}'` : '';

    const rows = await this.prisma.$queryRawUnsafe<RawTopMoverRow[]>(`
      SELECT
        si."itemId",
        si."name" AS "itemName",
        SUM(si."quantity") AS "totalQty",
        SUM(si."totalCents") AS "totalRevenueCents"
      FROM "SaleItem" si
      JOIN "Sale" s ON s."id" = si."saleId"
      WHERE s."businessId" = '${businessId}'
        AND s."status" IN ('PAID', 'COMPLETED', 'AMENDED')
        AND s."createdAt" >= '${sinceStr}'
        ${storeFilter}
        AND si."itemId" IS NOT NULL
      GROUP BY si."itemId", si."name"
      ORDER BY SUM(si."quantity") DESC
    `);

    const mapped: TopMover[] = rows.map((r) => ({
      itemId: r.itemId ?? '',
      itemName: r.itemName,
      totalQty: this.toNum(r.totalQty),
      totalRevenueCents: this.toNum(r.totalRevenueCents),
    }));

    const fastMovers = mapped.slice(0, 10);
    const slowMovers = [...mapped].reverse().slice(0, 10);

    return { fastMovers, slowMovers };
  }

  // ─── Seasonal trends ──────────────────────────────────────────────────────
  async getSeasonalTrends(
    businessId: string,
    storeId?: string,
  ): Promise<{ hourly: HourlyPattern[]; daily: DailyPattern[] }> {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
    const sinceStr = since.toISOString();
    const storeFilter = storeId ? `AND "storeId" = '${storeId}'` : '';

    // SQLite: strftime('%H') = hour string 00-23, strftime('%w') = day of week 0=Sunday
    const hourlyRaw = await this.prisma.$queryRawUnsafe<RawHourlyRow[]>(`
      SELECT
        CAST(strftime('%H', "createdAt") AS INTEGER) AS "hour",
        COUNT(*) AS "saleCount",
        SUM("totalCents") AS "totalRevenueCents",
        COUNT(DISTINCT date("createdAt")) AS "dayCount"
      FROM "Sale"
      WHERE "businessId" = '${businessId}'
        AND "status" IN ('PAID', 'COMPLETED', 'AMENDED')
        AND "createdAt" >= '${sinceStr}'
        ${storeFilter}
      GROUP BY CAST(strftime('%H', "createdAt") AS INTEGER)
      ORDER BY "hour"
    `);

    const dailyRaw = await this.prisma.$queryRawUnsafe<RawDailyRow[]>(`
      SELECT
        CAST(strftime('%w', "createdAt") AS INTEGER) AS "dayOfWeek",
        COUNT(*) AS "saleCount",
        SUM("totalCents") AS "totalRevenueCents",
        COUNT(DISTINCT strftime('%Y-%W', "createdAt")) AS "weekCount"
      FROM "Sale"
      WHERE "businessId" = '${businessId}'
        AND "status" IN ('PAID', 'COMPLETED', 'AMENDED')
        AND "createdAt" >= '${sinceStr}'
        ${storeFilter}
      GROUP BY CAST(strftime('%w', "createdAt") AS INTEGER)
      ORDER BY "dayOfWeek"
    `);

    const dayNames = [
      'Sunday',
      'Monday',
      'Tuesday',
      'Wednesday',
      'Thursday',
      'Friday',
      'Saturday',
    ];

    // Build hourly: fill all 24 hours
    const hourlyMap = new Map<number, { sales: number; revenue: number; days: number }>();
    for (const row of hourlyRaw) {
      const h = this.toNum(row.hour);
      hourlyMap.set(h, {
        sales: this.toNum(row.saleCount),
        revenue: this.toNum(row.totalRevenueCents),
        days: Math.max(1, this.toNum(row.dayCount)),
      });
    }

    const hourly: HourlyPattern[] = [];
    for (let h = 0; h < 24; h++) {
      const data = hourlyMap.get(h);
      if (data) {
        hourly.push({
          hour: h,
          avgSales: Math.round((data.sales / data.days) * 100) / 100,
          avgRevenueCents: Math.round(data.revenue / data.days),
        });
      } else {
        hourly.push({ hour: h, avgSales: 0, avgRevenueCents: 0 });
      }
    }

    const daily: DailyPattern[] = dailyRaw.map((row) => {
      const dow = this.toNum(row.dayOfWeek);
      const weeks = Math.max(1, this.toNum(row.weekCount));
      return {
        dayOfWeek: dow,
        dayName: dayNames[dow] ?? 'Unknown',
        avgSales: Math.round((this.toNum(row.saleCount) / weeks) * 100) / 100,
        avgRevenueCents: Math.round(this.toNum(row.totalRevenueCents) / weeks),
      };
    });

    return { hourly, daily };
  }
}

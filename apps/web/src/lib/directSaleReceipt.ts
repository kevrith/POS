import type { ReceiptData } from './printer';

/** What the server returns for a vertical's takings recorded as a sale (fuel, a stay, a prescription fill). */
export interface DirectSaleResponse {
  invoice?: {
    id: string;
    receiptNumber: string;
    createdAt?: string;
    customerName?: string | null;
    buyerKraPin?: string | null;
    items?: Array<{ name: string; quantity: number; unitPriceCents: number; totalCents: number }>;
    payments?: Array<{ method: string; amountCents: number }>;
    subtotalCents: number;
    vatCents: number;
    totCents: number;
    totalCents: number;
    status: string;
    notes?: string | null;
  };
  etims?: { success?: boolean; controlNumber?: string; intrlData?: string; qrUrl?: string; testMode?: boolean } | null;
}

/** The receipt for a sale the server made on a vertical's behalf, in the shape the printers take. */
export function buildDirectSaleReceipt(
  res: DirectSaleResponse,
  ctx: { businessName?: string; cashierName?: string; receiptHeader?: string | null; receiptFooter?: string | null; fallbackName: string },
): ReceiptData | null {
  const inv = res.invoice;
  if (!inv) return null;
  const etims = res.etims;
  return {
    receiptNumber: inv.receiptNumber,
    businessName: ctx.businessName ?? ctx.fallbackName,
    storeName: ctx.businessName ?? ctx.fallbackName,
    date: inv.createdAt ?? new Date().toISOString(),
    cashierName: ctx.cashierName ?? 'Staff',
    customerName: inv.customerName ?? undefined,
    customerKraPin: inv.buyerKraPin ?? undefined,
    items: (inv.items ?? []).map((i) => ({ name: i.name, quantity: i.quantity, unitPriceCents: i.unitPriceCents, totalCents: i.totalCents })),
    subtotalCents: inv.subtotalCents,
    vatCents: inv.vatCents,
    ...(inv.totCents > 0 && { totCents: inv.totCents }),
    totalCents: inv.totalCents,
    payments: (inv.payments ?? []).map((p) => ({ method: p.method, amountCents: p.amountCents })),
    isCreditSale: inv.status === 'CREDIT',
    notes: inv.notes ?? undefined,
    saleId: inv.id,
    etimsSubmitted: !!etims?.success,
    kraQRCode: etims?.qrUrl ?? etims?.intrlData ?? etims?.controlNumber,
    etimsControlNumber: etims?.controlNumber,
    etimsTestMode: etims?.testMode === true,
    receiptHeader: ctx.receiptHeader ?? undefined,
    receiptFooter: ctx.receiptFooter ?? undefined,
  };
}

/**
 * Receipt data shared by every print path (OS print sheet, Bluetooth, LAN).
 * Pure TypeScript: no React Native imports, so it is unit-testable under Node.
 *
 * This is the shape the mobile screens build. Printing converts it to the shared
 * ReceiptDocument (@pos/print-core), so the web and mobile apps print the same layout,
 * including the KRA eTIMS section, void/credit/pending/copy banners and the QR code.
 */
import type { ReceiptDocument } from '@pos/print-core';

export interface ReceiptLine {
  name: string;
  quantity: number;
  unitPriceCents: number;
}

export interface PrintableReceipt {
  businessName: string;
  receiptNumber: string;
  dateISO: string;
  lines: ReceiptLine[];
  subtotalCents: number;
  taxLabel?: string;
  taxCents?: number;
  totalCents: number;
  paymentMethod?: string;
  changeCents?: number;
  footer?: string;
  cashierName?: string;
  storeName?: string;
  customerName?: string;
  /** false while the sale has not reached KRA: the receipt prints a PENDING banner. */
  etimsSubmitted?: boolean;
  etimsControlNumber?: string;
  /** The sale was not registered with KRA (sandbox / no live credentials): prints TEST MODE, not VERIFIED. */
  etimsTestMode?: boolean;
  /** Verification URL or internal data KRA returned; printed as a QR code. */
  kraQRCode?: string;
  voided?: boolean;
  /** 0 or undefined: the original. 1 or more: the Nth reprint. */
  copyNumber?: number;
}

/**
 * The shared document. `subtotalCents` here is BEFORE tax (the screens add the tax line on top),
 * while the shared document's subtotal includes tax, so the tax is added back.
 */
export function toReceiptDocument(r: PrintableReceipt): ReceiptDocument {
  const tax = r.taxCents ?? 0;
  const isTot = /tot/i.test(r.taxLabel ?? '');
  return {
    receiptNumber: r.receiptNumber,
    businessName: r.businessName,
    storeName: r.storeName ?? '',
    date: r.dateISO,
    cashierName: r.cashierName ?? '',
    customerName: r.customerName,
    items: r.lines.map((l) => ({
      name: l.name,
      quantity: l.quantity,
      unitPriceCents: l.unitPriceCents,
      totalCents: l.quantity * l.unitPriceCents,
    })),
    subtotalCents: r.subtotalCents + tax,
    ...(tax > 0 && (isTot ? { totCents: tax } : { vatCents: tax })),
    totalCents: r.totalCents,
    payments: r.paymentMethod ? [{ method: r.paymentMethod, amountCents: r.totalCents }] : [],
    changeCents: r.changeCents,
    etimsSubmitted: r.voided ? undefined : r.etimsSubmitted,
    etimsControlNumber: r.etimsControlNumber,
    etimsTestMode: r.etimsTestMode,
    kraQRCode: r.kraQRCode,
    voided: r.voided,
    copyNumber: r.copyNumber,
    receiptFooter: r.footer,
  };
}

/** Roll width of the printer. Small Bluetooth printers are 58 mm; counter/LAN thermal printers are 80 mm. */
export type PaperWidth = 58 | 80;

export function kes(cents: number): string {
  return (cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** A harmless receipt for the Settings "Print test receipt" button. */
export function buildTestReceipt(businessName = 'Printer test'): PrintableReceipt {
  return {
    businessName,
    receiptNumber: 'TEST-0001',
    dateISO: new Date().toISOString(),
    lines: [
      { name: 'Test item', quantity: 2, unitPriceCents: 15000 },
      { name: 'Long item name that has to wrap across more than one line', quantity: 1, unitPriceCents: 4550 },
    ],
    subtotalCents: 29868,
    taxLabel: 'VAT (16%)',
    taxCents: 4682,
    totalCents: 34550,
    paymentMethod: 'CASH',
    changeCents: 5450,
    footer: 'If you can read this, the printer is set up correctly.',
  };
}

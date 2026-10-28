/**
 * Receipt data shared by every print path (OS print sheet, Bluetooth, LAN).
 * Pure TypeScript: no React Native imports, so it is unit-testable under Node.
 */

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

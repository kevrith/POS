/** Roll width of the thermal printer. Small Bluetooth printers use 58 mm; counter printers use 80 mm. */
export type PaperWidth = 58 | 80;

/** Characters per line in the standard font. */
export const PAPER_COLUMNS: Record<PaperWidth, number> = { 58: 32, 80: 48 };

export interface ReceiptItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
  discountPercent?: number;
}

export interface ReceiptPayment {
  method: string;
  amountCents: number;
  reference?: string;
}

/**
 * Everything a printed receipt can show. Every output format (ESC/POS, HTML, Star,
 * Epson) is generated from this one document through the same layout, so a fiscal
 * banner or a tax line can never appear on one printer and be missing on another.
 */
export interface ReceiptDocument {
  receiptNumber: string;
  businessName: string;
  storeName: string;
  storeAddress?: string;
  storePhone?: string;
  /** ISO timestamp. */
  date: string;
  cashierName: string;
  customerName?: string;
  customerPhone?: string;
  customerKraPin?: string;
  items: ReceiptItem[];
  /** Subtotal as the business prices it: INCLUDES vat/tot when prices are tax-inclusive. */
  subtotalCents: number;
  serviceChargeCents?: number;
  vatCents?: number;
  totCents?: number;
  totalCents: number;
  payments: ReceiptPayment[];
  changeCents?: number;
  tipCents?: number;
  /** intrlData from KRA, encoded in the QR code. */
  kraQRCode?: string;
  /** Legacy name for the control number. */
  kraControlNumber?: string;
  /** Human-readable KRA control/receipt number. */
  etimsControlNumber?: string;
  etimsSubmitted?: boolean;
  /** The sale was NOT registered with KRA (sandbox / no live credentials): the receipt must not read as a tax invoice. */
  etimsTestMode?: boolean;
  voided?: boolean;
  isCreditSale?: boolean;
  /** Customer's debt BEFORE this sale. */
  previousBalanceCents?: number;
  /** Customer's total debt AFTER this sale. */
  newBalanceCents?: number;
  notes?: string;
  saleId?: string;
  receiptHeader?: string;
  receiptFooter?: string;
  pointsEarned?: number;
  loyaltyBalance?: number;
  /** Rung up with no connection: the receipt number is provisional and the sale is not yet recorded or sent to KRA. */
  offlineSale?: boolean;
  /** 0 or undefined: the original receipt. 1 or more: the Nth reprint, printed with a COPY banner. */
  copyNumber?: number;
}

export interface KotItem {
  name: string;
  quantity: number;
  specialInstructions?: string | null;
  modifiers?: string[];
  /** Item category, used for printer routing. */
  category?: string;
  /** Explicit station set on the item's category, e.g. KOT_DRINKS. Wins over any guess from the name. */
  station?: string;
}

export interface KotDocument {
  kotNumber?: string;
  tableNumber: string;
  /** VOID = a slip telling the kitchen to stop making the listed items (they were already sent). */
  orderType: 'NEW_ORDER' | 'ADDITION' | 'VOID';
  items: KotItem[];
  createdAt: string;
  waiterName?: string;
}

export interface BillDocument {
  tableNumber: string;
  businessName: string;
  waiterName?: string;
  items: Array<{ name: string; quantity: number; unitPriceCents: number; totalCents: number }>;
  subtotalCents: number;
  totalCents: number;
  date: string;
  footer?: string;
  /** Tax included in the total, as charged by this business. Omit both for a business with tax off. */
  vatCents?: number;
  totCents?: number;
}

export interface RenderOptions {
  paperWidth: PaperWidth;
  /** Prepend the cash drawer pulse (ESC/POS only). */
  openDrawer?: boolean;
}

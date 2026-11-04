import { renderEpsonXml } from './epson';
import { DRAWER_PULSE, renderEscPos } from './escpos';
import { renderHtml } from './html';
import { hasCashPayment, layoutBill, layoutKot, layoutReceipt } from './layout';
import type { BillDocument, KotDocument, PaperWidth, ReceiptDocument } from './model';
import { renderStarXml } from './star';
import { layoutDiagnostic } from './diagnostic';

export * from './model';
export * from './text';
export * from './kotRouting';
export { groupPayments, hasCashPayment, layoutBill, layoutKot, layoutReceipt } from './layout';
export type { Block, BannerTone, Size, Align, PaymentGroup } from './layout';
export { DRAWER_PULSE, renderEscPos } from './escpos';
export { renderHtml } from './html';
export { renderEpsonXml } from './epson';
export { renderStarXml } from './star';
export { qrMatrix, qrSvg } from './qr';
export { columnRuler, layoutDiagnostic } from './diagnostic';

export interface PrintOptions {
  paperWidth: PaperWidth;
  /** The terminal has a cash drawer on the printer. It only opens for a cash sale, never on a reprint or void. */
  enableCashDrawer?: boolean;
}

/** Whether printing this receipt pops the cash drawer: enabled, paid in cash, an original and not voided. */
export function receiptOpensDrawer(doc: ReceiptDocument, enabled: boolean | undefined): boolean {
  return !!enabled && hasCashPayment(doc) && !doc.voided && !((doc.copyNumber ?? 0) > 0);
}

// ─── Receipt ──────────────────────────────────────────────────────────────────

export const receiptEscPos = (doc: ReceiptDocument, o: PrintOptions): Uint8Array =>
  renderEscPos(layoutReceipt(doc), { paperWidth: o.paperWidth, openDrawer: receiptOpensDrawer(doc, o.enableCashDrawer) });

export const receiptHtml = (doc: ReceiptDocument, o: PrintOptions): string =>
  renderHtml(layoutReceipt(doc), { paperWidth: o.paperWidth, title: `Receipt ${doc.receiptNumber}` });

export const receiptEpsonXml = (doc: ReceiptDocument, o: PrintOptions): string =>
  renderEpsonXml(layoutReceipt(doc), { paperWidth: o.paperWidth, openDrawer: receiptOpensDrawer(doc, o.enableCashDrawer) });

export const receiptStarXml = (doc: ReceiptDocument, o: PrintOptions): string =>
  renderStarXml(layoutReceipt(doc), { paperWidth: o.paperWidth });

// ─── Kitchen order ticket ─────────────────────────────────────────────────────

export const kotEscPos = (kot: KotDocument, o: PrintOptions): Uint8Array =>
  renderEscPos(layoutKot(kot), { paperWidth: o.paperWidth });

export const kotHtml = (kot: KotDocument, o: PrintOptions): string =>
  renderHtml(layoutKot(kot), { paperWidth: o.paperWidth, title: `KOT T${kot.tableNumber}` });

export const kotEpsonXml = (kot: KotDocument, o: PrintOptions): string =>
  renderEpsonXml(layoutKot(kot), { paperWidth: o.paperWidth });

export const kotStarXml = (kot: KotDocument, o: PrintOptions): string =>
  renderStarXml(layoutKot(kot), { paperWidth: o.paperWidth });

// ─── Table bill ───────────────────────────────────────────────────────────────

export const billEscPos = (bill: BillDocument, o: PrintOptions): Uint8Array =>
  renderEscPos(layoutBill(bill), { paperWidth: o.paperWidth });

export const billHtml = (bill: BillDocument, o: PrintOptions): string =>
  renderHtml(layoutBill(bill), { paperWidth: o.paperWidth, title: `Bill - Table ${bill.tableNumber}` });

/** The cash drawer pulse on its own, for the "open drawer" button. */
export const drawerPulseBytes = (): Uint8Array => DRAWER_PULSE.slice();

// ─── Printer diagnostic page ──────────────────────────────────────────────────

export const diagnosticEscPos = (o: PrintOptions): Uint8Array =>
  renderEscPos(layoutDiagnostic(o.paperWidth), { paperWidth: o.paperWidth });

export const diagnosticHtml = (o: PrintOptions): string =>
  renderHtml(layoutDiagnostic(o.paperWidth), { paperWidth: o.paperWidth, title: 'Printer test' });

export const diagnosticEpsonXml = (o: PrintOptions): string =>
  renderEpsonXml(layoutDiagnostic(o.paperWidth), { paperWidth: o.paperWidth });

export const diagnosticStarXml = (o: PrintOptions): string =>
  renderStarXml(layoutDiagnostic(o.paperWidth), { paperWidth: o.paperWidth });

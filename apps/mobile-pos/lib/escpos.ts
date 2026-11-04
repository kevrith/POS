/**
 * ESC/POS receipt bytes for thermal printers (Bluetooth and LAN).
 *
 * The layout lives in @pos/print-core and is shared with the web app; this file only
 * converts the screens' receipt shape to it. Output is raw bytes, never a JS string run
 * through UTF-8, and all text is reduced to printable ASCII first.
 */
import { PAPER_COLUMNS, asciiSafe, bytesToBase64, receiptEscPos, row, wrapText } from '@pos/print-core';
import { toReceiptDocument, type PaperWidth, type PrintableReceipt } from './receiptModel';

export { PAPER_COLUMNS, asciiSafe, bytesToBase64, row, wrapText };

export function buildReceiptBytes(r: PrintableReceipt, paperWidth: PaperWidth): Uint8Array {
  return receiptEscPos(toReceiptDocument(r), { paperWidth });
}

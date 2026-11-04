/** Receipt HTML for the OS print sheet (expo-print), sized to the chosen paper roll. */
import { receiptHtml as renderReceiptHtml } from '@pos/print-core';
import { toReceiptDocument, type PaperWidth, type PrintableReceipt } from './receiptModel';

export function receiptHtml(r: PrintableReceipt, paperWidth: PaperWidth = 58): string {
  return renderReceiptHtml(toReceiptDocument(r), { paperWidth });
}

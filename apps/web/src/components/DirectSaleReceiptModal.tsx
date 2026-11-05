import { formatKES } from '@pos/shared';
import { toast } from 'sonner';
import { printToBrowser, type ReceiptData } from '../lib/printer';
import { printWithPreferredPrinter, printErrorMessage } from '../lib/receiptPrint';

/** The receipt of a sale a vertical just recorded, with the KRA status and a Print button. */
export default function DirectSaleReceiptModal({
  receipt,
  onClose,
  title = 'Sale recorded',
  quantityLabel = (q: number) => String(q),
  children,
}: {
  receipt: ReceiptData;
  onClose: () => void;
  title?: string;
  /** How a line's quantity reads (litres for fuel, units for medicine). */
  quantityLabel?: (quantity: number) => string;
  /** Extra lines under the total (an insurer's share, change due). */
  children?: React.ReactNode;
}) {
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl w-full max-w-sm shadow-2xl">
        <div className="p-4 border-b">
          <h2 className="font-bold text-lg">{title}</h2>
          <p className="text-sm text-gray-500 font-mono">{receipt.receiptNumber}</p>
        </div>
        <div className="p-4 space-y-2 text-sm">
          {receipt.items.map((i, idx) => (
            <div key={idx} className="flex justify-between">
              <span>{i.name} x {quantityLabel(i.quantity)}</span>
              <span className="font-medium">{formatKES(i.totalCents)}</span>
            </div>
          ))}
          {(receipt.vatCents ?? 0) > 0 && (
            <div className="flex justify-between text-gray-500"><span>VAT included</span><span>{formatKES(receipt.vatCents ?? 0)}</span></div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-bold"><span>Total</span><span>{formatKES(receipt.totalCents)}</span></div>
          {receipt.isCreditSale && <p className="text-amber-700">On account: {receipt.customerName ?? 'customer'} owes this amount.</p>}
          {children}
          <p className={`text-xs ${receipt.etimsSubmitted ? 'text-green-700' : 'text-amber-700'}`}>
            {receipt.etimsSubmitted
              ? (receipt.etimsTestMode ? 'eTIMS: test mode, not registered with KRA' : `eTIMS: submitted${receipt.etimsControlNumber ? ` (${receipt.etimsControlNumber})` : ''}`)
              : 'eTIMS: pending. It will be sent to KRA automatically, or retry it from Sales.'}
          </p>
        </div>
        <div className="p-4 border-t grid grid-cols-2 gap-3">
          <button onClick={onClose} className="py-2 border rounded-lg text-sm font-medium text-gray-700">Close</button>
          <button
            onClick={() => {
              void printWithPreferredPrinter(receipt, false)
                .then((printed) => { if (!printed) return printToBrowser(receipt); })
                .catch((err) => toast.error(`Print failed: ${printErrorMessage(err)}`));
            }}
            className="py-2 bg-orange-600 text-white rounded-lg text-sm font-medium"
          >
            Print
          </button>
        </div>
      </div>
    </div>
  );
}

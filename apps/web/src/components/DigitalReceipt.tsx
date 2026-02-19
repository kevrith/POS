import { X, Printer, Download, Share2 } from 'lucide-react';

interface ReceiptItem {
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

interface ReceiptPayment {
  method: string;
  amountCents: number;
  reference?: string;
}

interface ReceiptData {
  receiptNumber: string;
  businessName: string;
  storeName: string;
  storeAddress?: string;
  date: string;
  cashierName: string;
  customerName?: string;
  items: ReceiptItem[];
  subtotalCents: number;
  serviceChargeCents?: number;
  vatCents?: number;
  totCents?: number;
  totalCents: number;
  payments: ReceiptPayment[];
  changeCents?: number;
}

interface DigitalReceiptProps {
  receipt: ReceiptData;
  onClose: () => void;
}

function formatKES(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function DigitalReceipt({ receipt, onClose }: DigitalReceiptProps) {
  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    // TODO: Generate PDF
    alert('PDF download coming soon');
  };

  const handleShare = () => {
    // TODO: Share via WhatsApp/Email
    alert('Share coming soon');
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b print:hidden">
          <h2 className="text-lg font-bold text-gray-800">Receipt</h2>
          <div className="flex gap-2">
            <button
              onClick={handlePrint}
              className="p-2 rounded-lg hover:bg-gray-100"
              title="Print"
            >
              <Printer className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg hover:bg-gray-100"
              title="Download PDF"
            >
              <Download className="w-5 h-5 text-gray-600" />
            </button>
            <button
              onClick={handleShare}
              className="p-2 rounded-lg hover:bg-gray-100"
              title="Share"
            >
              <Share2 className="w-5 h-5 text-gray-600" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div className="max-w-sm mx-auto font-mono text-sm">
            {/* Header */}
            <div className="text-center mb-4">
              <div className="text-lg font-bold">{receipt.businessName}</div>
              <div className="text-xs text-gray-600">{receipt.storeName}</div>
              {receipt.storeAddress && (
                <div className="text-xs text-gray-600">{receipt.storeAddress}</div>
              )}
            </div>

            <div className="border-t border-b border-dashed py-2 mb-3 text-xs space-y-1">
              <div className="flex justify-between">
                <span>Receipt:</span>
                <span className="font-bold">{receipt.receiptNumber}</span>
              </div>
              <div className="flex justify-between">
                <span>Date:</span>
                <span>{new Date(receipt.date).toLocaleString('en-KE')}</span>
              </div>
              <div className="flex justify-between">
                <span>Cashier:</span>
                <span>{receipt.cashierName}</span>
              </div>
              {receipt.customerName && (
                <div className="flex justify-between">
                  <span>Customer:</span>
                  <span>{receipt.customerName}</span>
                </div>
              )}
            </div>

            {/* Items */}
            <div className="mb-3">
              {receipt.items.map((item, idx) => (
                <div key={idx} className="mb-2">
                  <div className="flex justify-between">
                    <span className="flex-1">{item.name}</span>
                    <span className="ml-2">{formatKES(item.totalCents)}</span>
                  </div>
                  <div className="text-xs text-gray-500">
                    {item.quantity} × {formatKES(item.unitPriceCents)}
                  </div>
                </div>
              ))}
            </div>

            {/* Totals */}
            <div className="border-t border-dashed pt-2 space-y-1">
              <div className="flex justify-between">
                <span>Subtotal:</span>
                <span>{formatKES(receipt.subtotalCents)}</span>
              </div>
              {receipt.serviceChargeCents && receipt.serviceChargeCents > 0 && (
                <div className="flex justify-between text-xs">
                  <span>Service Charge (10%):</span>
                  <span>{formatKES(receipt.serviceChargeCents)}</span>
                </div>
              )}
              {receipt.vatCents && receipt.vatCents > 0 && (
                <div className="flex justify-between text-xs">
                  <span>VAT (16%):</span>
                  <span>{formatKES(receipt.vatCents)}</span>
                </div>
              )}
              {receipt.totCents && receipt.totCents > 0 && (
                <div className="flex justify-between text-xs">
                  <span>TOT (3%):</span>
                  <span>{formatKES(receipt.totCents)}</span>
                </div>
              )}
              <div className="flex justify-between font-bold text-base border-t pt-1">
                <span>TOTAL:</span>
                <span>{formatKES(receipt.totalCents)}</span>
              </div>
            </div>

            {/* Payments */}
            <div className="border-t border-dashed mt-2 pt-2 space-y-1 text-xs">
              {receipt.payments.map((payment, idx) => (
                <div key={idx} className="flex justify-between">
                  <span>
                    {payment.method}
                    {payment.reference && ` (${payment.reference})`}:
                  </span>
                  <span>{formatKES(payment.amountCents)}</span>
                </div>
              ))}
              {receipt.changeCents && receipt.changeCents > 0 && (
                <div className="flex justify-between font-bold">
                  <span>Change:</span>
                  <span>{formatKES(receipt.changeCents)}</span>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="text-center mt-4 pt-3 border-t border-dashed text-xs text-gray-600">
              <div>Thank you for your business!</div>
              <div className="mt-2">Powered by Universal POS</div>
            </div>
          </div>
        </div>

        <div className="p-4 border-t print:hidden">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-lg"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

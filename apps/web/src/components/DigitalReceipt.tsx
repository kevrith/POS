import { useRef } from 'react';
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
  receiptHeader?: string;
  receiptFooter?: string;
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
  const receiptRef = useRef<HTMLDivElement>(null);

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    const content = receiptRef.current;
    if (!content) return;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Receipt ${receipt.receiptNumber}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Courier New', monospace; font-size: 13px; color: #000; background: #fff; padding: 20px; }
    .receipt { max-width: 320px; margin: 0 auto; }
    .center { text-align: center; }
    .bold { font-weight: bold; }
    .large { font-size: 16px; }
    .small { font-size: 11px; color: #555; }
    .row { display: flex; justify-content: space-between; margin: 3px 0; }
    .dashed { border-top: 1px dashed #000; margin: 8px 0; padding-top: 8px; }
    .total-row { font-size: 15px; font-weight: bold; border-top: 1px dashed #000; padding-top: 6px; margin-top: 4px; display: flex; justify-content: space-between; }
    .muted { color: #666; font-size: 11px; }
  </style>
</head>
<body>
<div class="receipt">
  <div class="center" style="margin-bottom:12px">
    <div class="bold large">${receipt.businessName}</div>
    <div class="small">${receipt.storeName}</div>
    ${receipt.storeAddress ? `<div class="small">${receipt.storeAddress}</div>` : ''}
  </div>
  <div class="dashed">
    <div class="row"><span>Receipt:</span><span class="bold">${receipt.receiptNumber}</span></div>
    <div class="row"><span>Date:</span><span>${new Date(receipt.date).toLocaleString('en-KE')}</span></div>
    <div class="row"><span>Cashier:</span><span>${receipt.cashierName}</span></div>
    ${receipt.customerName ? `<div class="row"><span>Customer:</span><span>${receipt.customerName}</span></div>` : ''}
  </div>
  <div class="dashed">
    ${receipt.items.map(item => `
      <div style="margin-bottom:6px">
        <div class="row"><span>${item.name}</span><span>${formatKES(item.totalCents)}</span></div>
        <div class="muted">${item.quantity} × ${formatKES(item.unitPriceCents)}</div>
      </div>`).join('')}
  </div>
  <div class="dashed">
    <div class="row"><span>Subtotal:</span><span>${formatKES(receipt.subtotalCents)}</span></div>
    ${receipt.serviceChargeCents && receipt.serviceChargeCents > 0 ? `<div class="row small"><span>Service Charge (10%):</span><span>${formatKES(receipt.serviceChargeCents)}</span></div>` : ''}
    ${receipt.vatCents && receipt.vatCents > 0 ? `<div class="row small"><span>VAT (16%):</span><span>${formatKES(receipt.vatCents)}</span></div>` : ''}
    ${receipt.totCents && receipt.totCents > 0 ? `<div class="row small"><span>TOT (3%):</span><span>${formatKES(receipt.totCents)}</span></div>` : ''}
    <div class="total-row"><span>TOTAL:</span><span>${formatKES(receipt.totalCents)}</span></div>
  </div>
  <div class="dashed">
    ${receipt.payments.map(p => `
      <div class="row small"><span>${p.method}${p.reference ? ` (${p.reference})` : ''}:</span><span>${formatKES(p.amountCents)}</span></div>`).join('')}
    ${receipt.changeCents && receipt.changeCents > 0 ? `<div class="row bold"><span>Change:</span><span>${formatKES(receipt.changeCents)}</span></div>` : ''}
  </div>
  <div class="center" style="margin-top:16px">
    ${receipt.receiptHeader ? `<div class="bold" style="margin-bottom:4px">${receipt.receiptHeader}</div>` : ''}
    <div>Thank you for your business!</div>
    ${receipt.receiptFooter ? `<div style="margin-top:4px">${receipt.receiptFooter}</div>` : ''}
    <div class="muted" style="margin-top:8px">Powered by: Kastra Systems</div>
  </div>
</div>
<script>window.onload = function(){ window.print(); window.onafterprint = function(){ window.close(); }; }</script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=420,height=700');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  const handleShare = () => {
    const text = [
      `*${receipt.businessName} — ${receipt.storeName}*`,
      `Receipt: ${receipt.receiptNumber}`,
      `Date: ${new Date(receipt.date).toLocaleString('en-KE')}`,
      `Cashier: ${receipt.cashierName}`,
      receipt.customerName ? `Customer: ${receipt.customerName}` : '',
      '',
      receipt.items.map(i => `${i.name} × ${i.quantity}  ${formatKES(i.totalCents)}`).join('\n'),
      '',
      `Subtotal: ${formatKES(receipt.subtotalCents)}`,
      receipt.vatCents && receipt.vatCents > 0 ? `VAT (16%): ${formatKES(receipt.vatCents)}` : '',
      `*TOTAL: ${formatKES(receipt.totalCents)}*`,
      '',
      'Thank you for your business!',
    ].filter(Boolean).join('\n');

    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank');
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
              title="Share via WhatsApp"
            >
              <Share2 className="w-5 h-5 text-gray-600" />
            </button>
            <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          <div ref={receiptRef} className="max-w-sm mx-auto font-mono text-sm">
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
              {receipt.receiptHeader && <div className="mb-1 font-medium">{receipt.receiptHeader}</div>}
              <div>Thank you for your business!</div>
              {receipt.receiptFooter && <div className="mt-1">{receipt.receiptFooter}</div>}
              <div className="mt-2 text-gray-400">Powered by: Kastra Systems</div>
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

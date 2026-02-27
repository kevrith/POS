import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Ban, Eye, RotateCcw, Printer, MessageSquare } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import VoidModal from '../components/VoidModal';
import ReturnModal from '../components/ReturnModal';
import PrintModal from '../components/PrintModal';
import type { ReceiptData } from '../lib/printer';

interface Sale {
  id: string;
  receiptNumber: string;
  status: string;
  totalCents: number;
  createdAt: string;
  cashier: { name: string };
  customer?: { id: string; name: string; phone?: string };
  etimsSubmitted?: boolean;
  etimsControlNumber?: string;
}

interface SaleDetail extends Sale {
  items: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
  payments: Array<{
    method: string;
    amountCents: number;
    reference?: string;
  }>;
  subtotalCents: number;
  serviceChargeCents: number;
  vatCents: number;
  totCents: number;
}

export default function SalesListPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [reprintData, setReprintData] = useState<ReceiptData | null>(null);
  const [reprintLoading, setReprintLoading] = useState<string | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';

  const { data: sales = [], isLoading } = useQuery<Sale[]>({
    queryKey: ['sales', businessId, storeId],
    queryFn: () =>
      api.get<{ data: Sale[] }>(
        `/sales?businessId=${businessId}&storeId=${storeId}&limit=50`,
      ).then(r => r.data),
    enabled: !!businessId && !!storeId,
  });

  const formatKES = (cents: number) =>
    `KES ${(cents / 100).toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const STATUS_COLORS: Record<string, string> = {
    PAID: 'bg-green-100 text-green-800',
    VOIDED: 'bg-red-100 text-red-800',
    AMENDED: 'bg-yellow-100 text-yellow-800',
    CREDIT: 'bg-blue-100 text-blue-800',
  };

  const handleReprint = async (sale: Sale) => {
    setReprintLoading(sale.id);
    try {
      const detail = await api.get<SaleDetail>(`/sales/${sale.id}?businessId=${businessId}`);
      const receipt: ReceiptData = {
        receiptNumber: detail.receiptNumber,
        businessName: user?.name ? `${user.name}'s Business` : 'Universal POS',
        storeName: 'Main Store',
        date: detail.createdAt,
        cashierName: detail.cashier?.name ?? 'Cashier',
        customerName: detail.customer?.name,
        customerPhone: detail.customer?.phone,
        items: detail.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
        })),
        subtotalCents: detail.subtotalCents,
        serviceChargeCents: detail.serviceChargeCents,
        vatCents: detail.vatCents,
        totCents: detail.totCents,
        totalCents: detail.totalCents,
        payments: detail.payments,
        kraControlNumber: detail.etimsControlNumber,
        etimsSubmitted: detail.etimsSubmitted,
        saleId: detail.id,
      };
      setReprintData(receipt);
      setShowPrintModal(true);
    } catch (err) {
      console.error('Failed to load sale for reprint:', err);
    } finally {
      setReprintLoading(null);
    }
  };

  const handleSendWhatsApp = async (sale: Sale) => {
    if (!sale.customer?.phone) return;
    setSendingWhatsApp(sale.id);
    try {
      await api.post('/notifications/send-receipt', {
        businessId,
        phone: sale.customer.phone,
        receiptNumber: sale.receiptNumber,
        totalCents: sale.totalCents,
        channel: 'whatsapp',
      });
    } catch (err) {
      console.error('WhatsApp send failed:', err);
    } finally {
      setSendingWhatsApp(null);
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-800 dark:text-white">Sales History</h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Recent transactions</p>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : sales.length === 0 ? (
          <div className="text-center py-16">
            <Receipt className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500">No sales yet</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700 border-b dark:border-gray-600">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Receipt
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Cashier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-gray-700">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-gray-700">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 dark:text-white">
                      <div>{sale.receiptNumber}</div>
                      {sale.etimsSubmitted === false && (
                        <span className="text-xs text-red-600 font-normal">⚠ Pending KRA</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {new Date(sale.createdAt).toLocaleString('en-KE', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {sale.cashier?.name ?? 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400">
                      {sale.customer?.name ?? '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900 dark:text-white">
                      {formatKES(sale.totalCents)}
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                          STATUS_COLORS[sale.status] ?? 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {sale.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right space-x-1">
                      <button
                        onClick={() => setSelectedSale(sale)}
                        className="inline-flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                        title="View"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                      {sale.status === 'PAID' && (
                        <>
                          <button
                            onClick={() => void handleReprint(sale)}
                            disabled={reprintLoading === sale.id}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded disabled:opacity-50"
                            title="Reprint receipt"
                          >
                            <Printer className="w-3 h-3" />
                            {reprintLoading === sale.id ? '...' : 'Print'}
                          </button>
                          {sale.customer?.phone && (
                            <button
                              onClick={() => void handleSendWhatsApp(sale)}
                              disabled={sendingWhatsApp === sale.id}
                              className="inline-flex items-center gap-1 px-2 py-1 text-xs text-teal-600 hover:bg-teal-50 rounded disabled:opacity-50"
                              title="Send WhatsApp receipt"
                            >
                              <MessageSquare className="w-3 h-3" />
                              {sendingWhatsApp === sale.id ? '...' : 'WhatsApp'}
                            </button>
                          )}
                          <button
                            onClick={() => {
                              setSelectedSale(sale);
                              setShowReturnModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-orange-600 hover:bg-orange-50 rounded"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Return
                          </button>
                          <button
                            onClick={() => {
                              setSelectedSale(sale);
                              setShowVoidModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
                          >
                            <Ban className="w-3 h-3" />
                            Void
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showVoidModal && selectedSale && (
        <VoidModal
          saleId={selectedSale.id}
          receiptNumber={selectedSale.receiptNumber}
          totalCents={selectedSale.totalCents}
          businessId={businessId}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ['sales'] });
          }}
          onClose={() => {
            setShowVoidModal(false);
            setSelectedSale(null);
          }}
        />
      )}

      {showReturnModal && selectedSale && (
        <ReturnModal
          saleId={selectedSale.id}
          receiptNumber={selectedSale.receiptNumber}
          totalCents={selectedSale.totalCents}
          customerId={selectedSale.customer?.id}
          businessId={businessId}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ['sales'] });
          }}
          onClose={() => {
            setShowReturnModal(false);
            setSelectedSale(null);
          }}
        />
      )}

      {showPrintModal && reprintData && (
        <PrintModal
          receipt={reprintData}
          onClose={() => {
            setShowPrintModal(false);
            setReprintData(null);
          }}
        />
      )}
    </div>
  );
}

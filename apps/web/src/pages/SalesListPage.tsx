import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Ban, Eye, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import VoidModal from '../components/VoidModal';
import ReturnModal from '../components/ReturnModal';

interface Sale {
  id: string;
  receiptNumber: string;
  status: string;
  totalCents: number;
  createdAt: string;
  cashier: { name: string };
  customer?: { id: string; name: string };
}

export default function SalesListPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);

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

  return (
    <div className="h-full flex flex-col bg-gray-50">
      <div className="bg-white border-b px-6 py-4">
        <h1 className="text-2xl font-bold text-gray-800">Sales History</h1>
        <p className="text-sm text-gray-500 mt-1">Recent transactions</p>
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
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Receipt
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Cashier
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Customer
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Amount
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">
                      {sale.receiptNumber}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {new Date(sale.createdAt).toLocaleString('en-KE', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {sale.cashier?.name ?? 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {sale.customer?.name ?? '-'}
                    </td>
                    <td className="px-6 py-4 text-sm font-semibold text-gray-900">
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
                    <td className="px-6 py-4 text-right space-x-2">
                      <button
                        onClick={() => setSelectedSale(sale)}
                        className="inline-flex items-center gap-1 px-3 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded"
                      >
                        <Eye className="w-3 h-3" />
                        View
                      </button>
                      {sale.status === 'PAID' && (
                        <>
                          <button
                            onClick={() => {
                              setSelectedSale(sale);
                              setShowReturnModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs text-orange-600 hover:bg-orange-50 rounded"
                          >
                            <RotateCcw className="w-3 h-3" />
                            Return
                          </button>
                          <button
                            onClick={() => {
                              setSelectedSale(sale);
                              setShowVoidModal(true);
                            }}
                            className="inline-flex items-center gap-1 px-3 py-1 text-xs text-red-600 hover:bg-red-50 rounded"
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
    </div>
  );
}

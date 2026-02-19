import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { X } from 'lucide-react';

interface Proforma {
  id: string;
  receiptNumber: string;
  customerName?: string;
  customerPhone?: string;
  status: string;
  totalCents: number;
  proformaValidUntil?: string;
  createdAt: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
}

export default function ProformaPage() {
  const [selectedProforma, setSelectedProforma] = useState<Proforma | null>(null);
  const queryClient = useQueryClient();

  const { data: proformas = [], isLoading } = useQuery({
    queryKey: ['proformas'],
    queryFn: () => api.get<Proforma[]>('/sales?type=PROFORMA'),
  });

  const convertMutation = useMutation({
    mutationFn: (proformaId: string) => api.post(`/sales/${proformaId}/convert`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proformas'] });
      setSelectedProforma(null);
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (proformaId: string) => api.patch(`/sales/${proformaId}`, { status: 'CANCELLED' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proformas'] });
      setSelectedProforma(null);
    },
  });

  const formatKES = (cents: number) => `KES ${(cents / 100).toFixed(2)}`;
  const formatDate = (date: string) => new Date(date).toLocaleDateString();

  const activeProformas = proformas.filter((p) => p.status === 'PROFORMA');
  const expiredProformas = activeProformas.filter(
    (p) => p.proformaValidUntil && new Date(p.proformaValidUntil) < new Date()
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Proforma / Quotations</h1>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded">
          <p className="text-sm text-blue-600 font-medium">Active Proformas</p>
          <p className="text-2xl font-bold">{activeProformas.length}</p>
        </div>
        <div className="bg-yellow-50 p-4 rounded">
          <p className="text-sm text-yellow-600 font-medium">Expired</p>
          <p className="text-2xl font-bold">{expiredProformas.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded">
          <p className="text-sm text-green-600 font-medium">Total Value</p>
          <p className="text-2xl font-bold">
            {formatKES(activeProformas.reduce((sum, p) => sum + p.totalCents, 0))}
          </p>
        </div>
      </div>

      <div className="bg-white rounded shadow">
        <div className="p-4 border-b">
          <h2 className="font-bold">Active Quotations</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">Loading...</div>
        ) : activeProformas.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No proformas found. Create one from the POS screen.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4">Proforma #</th>
                <th className="text-left p-4">Customer</th>
                <th className="text-left p-4">Date</th>
                <th className="text-left p-4">Valid Until</th>
                <th className="text-right p-4">Total</th>
                <th className="text-center p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeProformas.map((proforma) => {
                const isExpired =
                  proforma.proformaValidUntil && new Date(proforma.proformaValidUntil) < new Date();
                return (
                  <tr key={proforma.id} className="border-t hover:bg-gray-50">
                    <td className="p-4 font-mono font-medium">{proforma.receiptNumber}</td>
                    <td className="p-4">
                      <div className="font-medium">{proforma.customerName || 'Walk-in'}</div>
                      <div className="text-sm text-gray-500">{proforma.customerPhone}</div>
                    </td>
                    <td className="p-4">{formatDate(proforma.createdAt)}</td>
                    <td className="p-4">
                      {proforma.proformaValidUntil ? (
                        <span className={isExpired ? 'text-red-600 font-medium' : ''}>
                          {formatDate(proforma.proformaValidUntil)}
                          {isExpired && ' (Expired)'}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-4 text-right font-bold">{formatKES(proforma.totalCents)}</td>
                    <td className="p-4">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => setSelectedProforma(proforma)}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
                        >
                          View
                        </button>
                        <button
                          onClick={() => convertMutation.mutate(proforma.id)}
                          disabled={convertMutation.isPending}
                          className="bg-green-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                        >
                          Convert
                        </button>
                        <button
                          onClick={() => cancelMutation.mutate(proforma.id)}
                          disabled={cancelMutation.isPending}
                          className="bg-red-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedProforma && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-lg max-w-2xl w-full max-h-[80vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">Proforma {selectedProforma.receiptNumber}</h2>
                <p className="text-gray-600">{selectedProforma.customerName || 'Walk-in Customer'}</p>
              </div>
              <button onClick={() => setSelectedProforma(null)} className="text-gray-500">
                <X size={24} />
              </button>
            </div>

            <div className="border-t border-b py-4 mb-4">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-600">
                    <th className="pb-2">Item</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Price</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedProforma.items.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="py-2">{item.name}</td>
                      <td className="py-2 text-right">{item.quantity}</td>
                      <td className="py-2 text-right">{formatKES(item.unitPriceCents)}</td>
                      <td className="py-2 text-right font-medium">{formatKES(item.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="flex justify-between items-center mb-4">
              <span className="text-lg font-medium">Total</span>
              <span className="text-2xl font-bold">{formatKES(selectedProforma.totalCents)}</span>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => convertMutation.mutate(selectedProforma.id)}
                disabled={convertMutation.isPending}
                className="flex-1 bg-green-600 text-white py-2 rounded font-medium disabled:opacity-50"
              >
                {convertMutation.isPending ? 'Converting...' : 'Convert to Sale'}
              </button>
              <button
                onClick={() => setSelectedProforma(null)}
                className="flex-1 bg-gray-300 py-2 rounded font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

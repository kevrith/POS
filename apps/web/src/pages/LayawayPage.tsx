import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

interface Layaway {
  id: string;
  customer: { name: string; phone?: string };
  status: string;
  totalCents: number;
  paidCents: number;
  remainingCents: number;
  createdAt: string;
}

export default function LayawayPage() {
  const [selectedLayaway, setSelectedLayaway] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const queryClient = useQueryClient();
  const businessId = useAuthStore((s) => s.user?.businessId ?? '');

  const { data: layaways = [], isLoading } = useQuery({
    queryKey: ['layaways', businessId],
    queryFn: () => api.get<Layaway[]>(`/businesses/${businessId}/layaway`),
    enabled: !!businessId,
  });

  const paymentMutation = useMutation({
    mutationFn: ({ layawayId, amountCents }: { layawayId: string; amountCents: number }) =>
      api.post(`/businesses/${businessId}/layaway/${layawayId}/payment`, { amountCents, method: 'CASH' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['layaways', businessId] });
      setSelectedLayaway(null);
      setPaymentAmount('');
    },
  });

  const formatKES = (cents: number) => `KES ${(cents / 100).toFixed(2)}`;
  const formatDate = (date: string) => new Date(date).toLocaleDateString();

  const activeLayaways = layaways.filter((l) => l.status === 'ACTIVE');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Layaway Management</h1>

      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded">
          <p className="text-sm text-blue-600 font-medium">Active Layaways</p>
          <p className="text-2xl font-bold">{activeLayaways.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded">
          <p className="text-sm text-green-600 font-medium">Total Value</p>
          <p className="text-2xl font-bold">
            {formatKES(activeLayaways.reduce((sum, l) => sum + l.totalCents, 0))}
          </p>
        </div>
        <div className="bg-yellow-50 p-4 rounded">
          <p className="text-sm text-yellow-600 font-medium">Outstanding</p>
          <p className="text-2xl font-bold">
            {formatKES(activeLayaways.reduce((sum, l) => sum + l.remainingCents, 0))}
          </p>
        </div>
      </div>

      <div className="bg-white rounded shadow">
        <div className="p-4 border-b">
          <h2 className="font-bold">Active Layaways</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">Loading...</div>
        ) : activeLayaways.length === 0 ? (
          <div className="p-8 text-center text-gray-500">No active layaways</div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4">Customer</th>
                <th className="text-left p-4">Date</th>
                <th className="text-right p-4">Total</th>
                <th className="text-right p-4">Paid</th>
                <th className="text-right p-4">Remaining</th>
                <th className="text-center p-4">Progress</th>
                <th className="text-center p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeLayaways.map((layaway) => {
                const progress = (layaway.paidCents / layaway.totalCents) * 100;
                return (
                  <tr key={layaway.id} className="border-t hover:bg-gray-50">
                    <td className="p-4">
                      <div className="font-medium">{layaway.customer.name}</div>
                      <div className="text-sm text-gray-500">{layaway.customer.phone}</div>
                    </td>
                    <td className="p-4">{formatDate(layaway.createdAt)}</td>
                    <td className="p-4 text-right font-medium">{formatKES(layaway.totalCents)}</td>
                    <td className="p-4 text-right text-green-600">{formatKES(layaway.paidCents)}</td>
                    <td className="p-4 text-right text-red-600 font-medium">
                      {formatKES(layaway.remainingCents)}
                    </td>
                    <td className="p-4">
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: `${progress}%` }}
                          />
                        </div>
                        <span className="text-sm font-medium">{progress.toFixed(0)}%</span>
                      </div>
                    </td>
                    <td className="p-4">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => setSelectedLayaway(layaway.id)}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
                        >
                          Pay
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

      {selectedLayaway && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white p-6 rounded shadow-lg max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Record Payment</h2>
            <div className="mb-4">
              <label className="block text-sm font-medium mb-2">Payment Amount (KES)</label>
              <input
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                className="w-full border p-3 rounded text-lg"
                autoFocus
              />
            </div>
            <div className="flex gap-2">
              <button
                onClick={() =>
                  paymentMutation.mutate({
                    layawayId: selectedLayaway,
                    amountCents: Number(paymentAmount) * 100,
                  })
                }
                disabled={!paymentAmount || paymentMutation.isPending}
                className="flex-1 bg-green-600 text-white py-2 rounded disabled:opacity-50"
              >
                {paymentMutation.isPending ? 'Processing...' : 'Confirm'}
              </button>
              <button
                onClick={() => {
                  setSelectedLayaway(null);
                  setPaymentAmount('');
                }}
                className="flex-1 bg-gray-300 py-2 rounded"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

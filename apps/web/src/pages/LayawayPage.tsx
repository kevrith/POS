import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { Layers, Wallet, Clock } from 'lucide-react';
import { AnimatedValue, Button, Card, CardHeader, EmptyState, Input, PageHeader, StatTile } from '../components/ui';

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

  const totalValue = activeLayaways.reduce((sum, l) => sum + l.totalCents, 0);
  const outstanding = activeLayaways.reduce((sum, l) => sum + l.remainingCents, 0);

  return (
    <div className="p-3 sm:p-6 space-y-5">
      <PageHeader title="Layaway Management" subtitle="Items held for customers who pay in instalments" icon={<Layers className="w-5 h-5" />} />

      <div className="stagger grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatTile label="Active Layaways" value={<AnimatedValue value={activeLayaways.length} />} icon={<Layers className="w-4 h-4" />} />
        <StatTile label="Total Value" value={<AnimatedValue value={totalValue} format={formatKES} />} icon={<Wallet className="w-4 h-4" />} />
        <StatTile label="Outstanding" value={<AnimatedValue value={outstanding} format={formatKES} />} note="Still to be paid" icon={<Clock className="w-4 h-4" />} />
      </div>

      <Card className="overflow-hidden">
        <CardHeader title="Active Layaways" subtitle={activeLayaways.length > 0 ? `${activeLayaways.length} open` : undefined} />

        {isLoading ? (
          <div className="p-5 space-y-3" aria-busy="true" aria-label="Loading layaways">
            {[0, 1, 2].map((i) => <div key={i} className="skeleton h-12 w-full" />)}
          </div>
        ) : activeLayaways.length === 0 ? (
          <EmptyState icon={<Layers className="w-6 h-6" />} title="No active layaways" description="When a customer puts an item on layaway it will show here with its payment progress." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-600">
                <tr>
                  <th className="text-left px-5 py-3 font-semibold">Customer</th>
                  <th className="text-left px-5 py-3 font-semibold">Date</th>
                  <th className="text-right px-5 py-3 font-semibold">Total</th>
                  <th className="text-right px-5 py-3 font-semibold">Paid</th>
                  <th className="text-right px-5 py-3 font-semibold">Remaining</th>
                  <th className="text-left px-5 py-3 font-semibold min-w-[160px]">Progress</th>
                  <th className="px-5 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="stagger">
                {activeLayaways.map((layaway) => {
                  const progress = layaway.totalCents > 0 ? Math.min(100, (layaway.paidCents / layaway.totalCents) * 100) : 0;
                  return (
                    <tr key={layaway.id} className="group border-t border-gray-100 transition-colors duration-150 hover:bg-brand-50">
                      <td className="px-5 py-4">
                        <div className="font-semibold text-gray-900">{layaway.customer.name}</div>
                        <div className="text-xs text-gray-600">{layaway.customer.phone}</div>
                      </td>
                      <td className="px-5 py-4 text-gray-700 whitespace-nowrap">{formatDate(layaway.createdAt)}</td>
                      <td className="px-5 py-4 text-right font-medium whitespace-nowrap tabular-nums">{formatKES(layaway.totalCents)}</td>
                      <td className="px-5 py-4 text-right text-green-600 whitespace-nowrap tabular-nums">{formatKES(layaway.paidCents)}</td>
                      <td className="px-5 py-4 text-right text-red-600 font-semibold whitespace-nowrap tabular-nums">{formatKES(layaway.remainingCents)}</td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 bg-gray-200 rounded-full h-2 overflow-hidden" role="progressbar" aria-valuenow={Math.round(progress)} aria-valuemin={0} aria-valuemax={100}>
                            <div className="bar-fill bg-green-600 h-2 rounded-full" style={{ width: `${progress}%` }} />
                          </div>
                          <span className="text-xs font-semibold text-gray-700 w-9 text-right tabular-nums">{progress.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-5 py-4 text-right">
                        <Button size="sm" onClick={() => setSelectedLayaway(layaway.id)}>Pay</Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {selectedLayaway && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Record payment">
          <div className="modal-panel max-w-md">
            <div className="modal-header"><h2 className="modal-title">Record Payment</h2></div>
            <div className="modal-body">
              <Input
                label="Payment amount (KES)"
                type="number"
                step="0.01"
                value={paymentAmount}
                onChange={(e) => setPaymentAmount(e.target.value)}
                placeholder="0.00"
                inputClassName="text-lg h-12"
                autoFocus
              />
            </div>
            <div className="modal-footer">
              <Button variant="secondary" onClick={() => { setSelectedLayaway(null); setPaymentAmount(''); }}>Cancel</Button>
              <Button
                variant="success"
                loading={paymentMutation.isPending}
                disabled={!paymentAmount}
                onClick={() => paymentMutation.mutate({ layawayId: selectedLayaway, amountCents: Math.round(Number(paymentAmount) * 100) })}
              >
                Confirm payment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

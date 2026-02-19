import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { Plus, Search, CreditCard, ChevronRight, X, DollarSign } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  creditLimitCents: number;
  balanceCents: number;
  loyaltyPoints: number;
  sales?: Array<{
    id: string;
    receiptNumber: string;
    totalCents: number;
    status: string;
    createdAt: string;
  }>;
}

const blankForm = { name: '', phone: '', email: '', creditLimitCents: 0 };

function formatKES(cents: number) {
  return `KES ${(cents / 100).toFixed(2)}`;
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

export default function CustomersPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(blankForm);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const qc = useQueryClient();

  // ── List ──────────────────────────────────────────────────────────────────
  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers', businessId, search],
    queryFn: () =>
      api.get<Customer[]>(
        `/businesses/${businessId}/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`,
      ),
    enabled: !!businessId,
  });

  // ── Detail ────────────────────────────────────────────────────────────────
  const { data: detail } = useQuery({
    queryKey: ['customer-detail', businessId, selected?.id],
    queryFn: () => api.get<Customer>(`/businesses/${businessId}/customers/${selected!.id}`),
    enabled: !!selected,
  });

  // ── Create ────────────────────────────────────────────────────────────────
  const createMutation = useMutation({
    mutationFn: (data: typeof formData) =>
      api.post(`/businesses/${businessId}/customers`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', businessId] });
      setShowForm(false);
      setFormData(blankForm);
    },
  });

  // ── Record payment against credit balance ─────────────────────────────────
  const payMutation = useMutation({
    mutationFn: ({ customerId, amountCents }: { customerId: string; amountCents: number }) =>
      api.post(`/businesses/${businessId}/customers/${customerId}/payment`, { amountCents }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', businessId] });
      qc.invalidateQueries({ queryKey: ['customer-detail', businessId, selected?.id] });
      setPayAmount('');
    },
  });

  const creditSales =
    detail?.sales?.filter((s) => s.status === 'CREDIT') ?? [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Customers</h1>
        <button
          onClick={() => { setShowForm(!showForm); setSelected(null); }}
          className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2"
        >
          <Plus size={20} /> Add Customer
        </button>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded">
          <p className="text-sm text-blue-600 font-medium">Total Customers</p>
          <p className="text-2xl font-bold">{customers.length}</p>
        </div>
        <div className="bg-yellow-50 p-4 rounded">
          <p className="text-sm text-yellow-600 font-medium">With Outstanding Credit</p>
          <p className="text-2xl font-bold">
            {customers.filter((c) => c.balanceCents < 0).length}
          </p>
        </div>
        <div className="bg-green-50 p-4 rounded">
          <p className="text-sm text-green-600 font-medium">Total Loyalty Points</p>
          <p className="text-2xl font-bold">
            {customers.reduce((s, c) => s + c.loyaltyPoints, 0).toLocaleString()}
          </p>
        </div>
      </div>

      {/* New customer form */}
      {showForm && (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="font-bold mb-4">New Customer</h2>
          <div className="grid grid-cols-2 gap-4">
            <input
              placeholder="Full Name *"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="border p-2 rounded"
            />
            <input
              placeholder="Phone (07xxxxxxxx)"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
              className="border p-2 rounded"
            />
            <input
              placeholder="Email"
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              className="border p-2 rounded"
            />
            <div className="flex items-center border rounded overflow-hidden">
              <span className="px-3 bg-gray-50 text-gray-500 border-r py-2">KES</span>
              <input
                type="number"
                placeholder="Credit Limit"
                min={0}
                value={formData.creditLimitCents / 100 || ''}
                onChange={(e) =>
                  setFormData({ ...formData, creditLimitCents: Math.round(Number(e.target.value) * 100) })
                }
                className="flex-1 p-2 outline-none"
              />
            </div>
          </div>
          <div className="flex gap-2 mt-4">
            <button
              onClick={() => createMutation.mutate(formData)}
              disabled={!formData.name || createMutation.isPending}
              className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {createMutation.isPending ? 'Saving…' : 'Save Customer'}
            </button>
            <button onClick={() => setShowForm(false)} className="bg-gray-300 px-4 py-2 rounded">
              Cancel
            </button>
          </div>
          {createMutation.isError && (
            <p className="text-red-600 mt-2 text-sm">{(createMutation.error as Error).message}</p>
          )}
        </div>
      )}

      <div className="flex gap-6">
        {/* Customer list */}
        <div className="flex-1 bg-white rounded shadow overflow-hidden">
          <div className="p-4 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 text-gray-400" size={20} />
              <input
                placeholder="Search by name or phone…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-10 pr-4 py-2 border rounded"
              />
            </div>
          </div>

          {isLoading ? (
            <div className="p-8 text-center text-gray-400">Loading…</div>
          ) : customers.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No customers found</div>
          ) : (
            <table className="w-full">
              <thead className="bg-gray-50 text-sm">
                <tr>
                  <th className="text-left p-3">Name</th>
                  <th className="text-left p-3">Phone</th>
                  <th className="text-right p-3">Credit Limit</th>
                  <th className="text-right p-3">Balance</th>
                  <th className="text-right p-3">Points</th>
                  <th className="p-3"></th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr
                    key={c.id}
                    className={`border-t cursor-pointer hover:bg-gray-50 ${selected?.id === c.id ? 'bg-blue-50' : ''}`}
                    onClick={() => { setSelected(c); setShowForm(false); }}
                  >
                    <td className="p-3 font-medium">{c.name}</td>
                    <td className="p-3 text-gray-600">{c.phone || '—'}</td>
                    <td className="p-3 text-right text-sm">{formatKES(c.creditLimitCents)}</td>
                    <td className="p-3 text-right">
                      <span className={c.balanceCents < 0 ? 'text-red-600 font-medium' : c.balanceCents > 0 ? 'text-green-600 font-medium' : ''}>
                        {formatKES(Math.abs(c.balanceCents))}
                        {c.balanceCents < 0 && <span className="ml-1 text-xs">(owed)</span>}
                        {c.balanceCents > 0 && <span className="ml-1 text-xs">(credit)</span>}
                      </span>
                    </td>
                    <td className="p-3 text-right">
                      <span className="flex items-center justify-end gap-1">
                        <CreditCard size={14} className="text-yellow-500" />
                        {c.loyaltyPoints.toLocaleString()}
                      </span>
                    </td>
                    <td className="p-3 text-gray-400">
                      <ChevronRight size={16} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Customer detail panel */}
        {selected && (
          <div className="w-96 bg-white rounded shadow flex flex-col">
            <div className="p-4 border-b flex justify-between items-start">
              <div>
                <h2 className="font-bold text-lg">{selected.name}</h2>
                <p className="text-gray-500 text-sm">{selected.phone}</p>
                {selected.email && <p className="text-gray-400 text-xs">{selected.email}</p>}
              </div>
              <button onClick={() => setSelected(null)} className="text-gray-400 hover:text-gray-600">
                <X size={20} />
              </button>
            </div>

            {/* Balance summary */}
            <div className="p-4 grid grid-cols-2 gap-3 border-b">
              <div className="bg-gray-50 rounded p-3 text-center">
                <p className="text-xs text-gray-500">Credit Limit</p>
                <p className="font-bold">{formatKES(selected.creditLimitCents)}</p>
              </div>
              <div className={`rounded p-3 text-center ${(detail?.balanceCents ?? selected.balanceCents) < 0 ? 'bg-red-50' : 'bg-green-50'}`}>
                <p className="text-xs text-gray-500">Balance</p>
                <p className={`font-bold ${(detail?.balanceCents ?? selected.balanceCents) < 0 ? 'text-red-600' : 'text-green-600'}`}>
                  {formatKES(Math.abs(detail?.balanceCents ?? selected.balanceCents))}
                </p>
              </div>
              <div className="bg-yellow-50 rounded p-3 text-center col-span-2">
                <p className="text-xs text-yellow-700">Loyalty Points</p>
                <p className="font-bold text-yellow-700">
                  {(detail?.loyaltyPoints ?? selected.loyaltyPoints).toLocaleString()} pts
                </p>
              </div>
            </div>

            {/* Record payment */}
            {(detail?.balanceCents ?? selected.balanceCents) < 0 && (
              <div className="p-4 border-b">
                <p className="font-medium text-sm mb-2">Record Credit Payment</p>
                <div className="flex gap-2">
                  <div className="flex items-center border rounded overflow-hidden flex-1">
                    <span className="px-2 bg-gray-50 text-gray-500 text-sm border-r py-2">KES</span>
                    <input
                      type="number"
                      placeholder="Amount"
                      min={0}
                      value={payAmount}
                      onChange={(e) => setPayAmount(e.target.value)}
                      className="flex-1 p-2 text-sm outline-none"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const cents = Math.round(Number(payAmount) * 100);
                      if (cents > 0) payMutation.mutate({ customerId: selected.id, amountCents: cents });
                    }}
                    disabled={!payAmount || payMutation.isPending}
                    className="bg-green-600 text-white px-3 py-2 rounded text-sm flex items-center gap-1 disabled:opacity-50"
                  >
                    <DollarSign size={14} />
                    Pay
                  </button>
                </div>
              </div>
            )}

            {/* Credit sale history */}
            <div className="flex-1 overflow-y-auto p-4">
              <p className="font-medium text-sm mb-3">
                Credit Sales ({creditSales.length})
              </p>
              {creditSales.length === 0 ? (
                <p className="text-gray-400 text-sm text-center py-4">No outstanding credit</p>
              ) : (
                <div className="space-y-2">
                  {creditSales.map((sale) => (
                    <div key={sale.id} className="border rounded p-3">
                      <div className="flex justify-between items-start">
                        <span className="font-mono text-sm font-medium">{sale.receiptNumber}</span>
                        <span className="font-bold text-red-600">{formatKES(sale.totalCents)}</span>
                      </div>
                      <div className="text-xs text-gray-400 mt-1">{formatDate(sale.createdAt)}</div>
                    </div>
                  ))}
                </div>
              )}

              {/* All recent sales */}
              {(detail?.sales?.length ?? 0) > 0 && (
                <>
                  <p className="font-medium text-sm mb-3 mt-4">Recent Sales</p>
                  <div className="space-y-2">
                    {detail!.sales!.filter((s) => s.status !== 'CREDIT').map((sale) => (
                      <div key={sale.id} className="border rounded p-3">
                        <div className="flex justify-between items-start">
                          <span className="font-mono text-sm">{sale.receiptNumber}</span>
                          <span className="font-semibold">{formatKES(sale.totalCents)}</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-400 mt-1">
                          <span>{formatDate(sale.createdAt)}</span>
                          <span className={`px-1.5 py-0.5 rounded ${sale.status === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-gray-100'}`}>
                            {sale.status}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

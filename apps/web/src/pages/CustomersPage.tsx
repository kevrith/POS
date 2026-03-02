import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { Plus, Search, CreditCard, ChevronRight, X, DollarSign, Users, AlertTriangle, Star } from 'lucide-react';

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

  const totalLoyaltyPoints = customers.reduce((s, c) => s + c.loyaltyPoints, 0);
  const withCreditCount = customers.filter((c) => c.balanceCents < 0).length;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-5">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 flex items-center justify-center">
              <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Customers</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{customers.length} registered customers</p>
            </div>
          </div>
          <button
            onClick={() => { setShowForm(!showForm); setSelected(null); }}
            className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Customer
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-6 gap-5">
        {/* Summary stat cards */}
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Customers</p>
              <Users className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            </div>
            <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">{customers.length}</p>
          </div>
          <div className="bg-amber-50 dark:bg-amber-900/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Outstanding Credit</p>
              <AlertTriangle className="w-4 h-4 text-amber-500 dark:text-amber-400" />
            </div>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{withCreditCount}</p>
          </div>
          <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Loyalty Pts</p>
              <Star className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
            </div>
            <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{totalLoyaltyPoints.toLocaleString()}</p>
          </div>
        </div>

        {/* New customer form */}
        {showForm && (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 dark:text-white">New Customer</h2>
              <button
                onClick={() => setShowForm(false)}
                className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <input
                placeholder="Full Name *"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
              <input
                placeholder="Phone (07xxxxxxxx)"
                value={formData.phone}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
              <input
                placeholder="Email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
              />
              <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden bg-white dark:bg-gray-700">
                <span className="px-3 bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-300 border-r border-gray-300 dark:border-gray-600 py-2.5 text-sm">KES</span>
                <input
                  type="number"
                  placeholder="Credit Limit"
                  min={0}
                  value={formData.creditLimitCents / 100 || ''}
                  onChange={(e) =>
                    setFormData({ ...formData, creditLimitCents: Math.round(Number(e.target.value) * 100) })
                  }
                  className="flex-1 p-2.5 outline-none bg-transparent text-gray-900 dark:text-white text-sm"
                />
              </div>
            </div>
            <div className="flex gap-2 mt-4">
              <button
                onClick={() => createMutation.mutate(formData)}
                disabled={!formData.name || createMutation.isPending}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? 'Saving...' : 'Save Customer'}
              </button>
              <button
                onClick={() => setShowForm(false)}
                className="px-5 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
              >
                Cancel
              </button>
            </div>
            {createMutation.isError && (
              <p className="text-red-600 dark:text-red-400 mt-2 text-sm">{(createMutation.error as Error).message}</p>
            )}
          </div>
        )}

        <div className="flex gap-5 flex-1 min-h-0">
          {/* Customer list */}
          <div className="flex-1 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
            <div className="p-4 border-b border-gray-100 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-2.5 text-gray-400 dark:text-gray-500 w-4 h-4" />
                <input
                  placeholder="Search by name or phone..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none"
                />
              </div>
            </div>

            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-7 h-7 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  <p className="text-sm text-gray-400 dark:text-gray-500">Loading customers...</p>
                </div>
              </div>
            ) : customers.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center py-12">
                <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3">
                  <Users className="w-7 h-7 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-gray-600 dark:text-gray-300 font-semibold">No customers found</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">
                  {search ? 'Try a different search term' : 'Add your first customer above'}
                </p>
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 sticky top-0">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Phone</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Credit Limit</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Balance</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Points</th>
                      <th className="px-4 py-3 w-8"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {customers.map((c) => (
                      <tr
                        key={c.id}
                        className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${
                          selected?.id === c.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''
                        }`}
                        onClick={() => { setSelected(c); setShowForm(false); }}
                      >
                        <td className="px-4 py-3">
                          <p className="text-sm font-semibold text-gray-900 dark:text-white">{c.name}</p>
                          {c.email && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{c.email}</p>}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden sm:table-cell">
                          {c.phone || <span className="text-gray-400 dark:text-gray-500">—</span>}
                        </td>
                        <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">
                          {formatKES(c.creditLimitCents)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className={`text-sm font-semibold ${
                            c.balanceCents < 0
                              ? 'text-red-600 dark:text-red-400'
                              : c.balanceCents > 0
                              ? 'text-green-600 dark:text-green-400'
                              : 'text-gray-500 dark:text-gray-400'
                          }`}>
                            {formatKES(Math.abs(c.balanceCents))}
                            {c.balanceCents < 0 && <span className="ml-1 text-xs font-normal opacity-70">(owed)</span>}
                            {c.balanceCents > 0 && <span className="ml-1 text-xs font-normal opacity-70">(credit)</span>}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <span className="inline-flex items-center gap-1 text-sm font-medium text-yellow-600 dark:text-yellow-400">
                            <CreditCard className="w-3.5 h-3.5" />
                            {c.loyaltyPoints.toLocaleString()}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-400 dark:text-gray-500">
                          <ChevronRight className="w-4 h-4" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Customer detail panel */}
          {selected && (
            <div className="w-80 xl:w-96 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col overflow-hidden">
              {/* Detail header */}
              <div className="p-5 border-b border-gray-100 dark:border-gray-700">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                      <span className="text-indigo-700 dark:text-indigo-300 font-bold text-sm">
                        {selected.name.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div>
                      <h2 className="font-bold text-gray-900 dark:text-white">{selected.name}</h2>
                      {selected.phone && <p className="text-sm text-gray-500 dark:text-gray-400">{selected.phone}</p>}
                      {selected.email && <p className="text-xs text-gray-400 dark:text-gray-500">{selected.email}</p>}
                    </div>
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Balance summary */}
              <div className="p-4 grid grid-cols-2 gap-3 border-b border-gray-100 dark:border-gray-700">
                <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Credit Limit</p>
                  <p className="font-bold text-gray-900 dark:text-white text-sm">{formatKES(selected.creditLimitCents)}</p>
                </div>
                <div className={`rounded-xl p-3 text-center ${
                  (detail?.balanceCents ?? selected.balanceCents) < 0
                    ? 'bg-red-50 dark:bg-red-900/20'
                    : 'bg-green-50 dark:bg-green-900/20'
                }`}>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Balance</p>
                  <p className={`font-bold text-sm ${
                    (detail?.balanceCents ?? selected.balanceCents) < 0
                      ? 'text-red-600 dark:text-red-400'
                      : 'text-green-600 dark:text-green-400'
                  }`}>
                    {formatKES(Math.abs(detail?.balanceCents ?? selected.balanceCents))}
                  </p>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-3 text-center col-span-2">
                  <p className="text-xs text-yellow-700 dark:text-yellow-400 mb-1">Loyalty Points</p>
                  <p className="font-bold text-yellow-700 dark:text-yellow-400 text-sm">
                    {(detail?.loyaltyPoints ?? selected.loyaltyPoints).toLocaleString()} pts
                  </p>
                </div>
              </div>

              {/* Record payment */}
              {(detail?.balanceCents ?? selected.balanceCents) < 0 && (
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2">Record Credit Payment</p>
                  <div className="flex gap-2">
                    <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden flex-1 bg-gray-50 dark:bg-gray-700">
                      <span className="px-2.5 bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300 text-xs border-r border-gray-200 dark:border-gray-600 py-2">KES</span>
                      <input
                        type="number"
                        placeholder="Amount"
                        min={0}
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                        className="flex-1 p-2 text-sm outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                      />
                    </div>
                    <button
                      onClick={() => {
                        const cents = Math.round(Number(payAmount) * 100);
                        if (cents > 0) payMutation.mutate({ customerId: selected.id, amountCents: cents });
                      }}
                      disabled={!payAmount || payMutation.isPending}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-sm flex items-center gap-1.5 disabled:opacity-50 font-semibold transition-colors"
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      Pay
                    </button>
                  </div>
                </div>
              )}

              {/* Credit sale history */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4">
                {creditSales.length > 0 && (
                  <div>
                    <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2">
                      Credit Sales ({creditSales.length})
                    </p>
                    <div className="space-y-2">
                      {creditSales.map((sale) => (
                        <div key={sale.id} className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-xl p-3">
                          <div className="flex justify-between items-start">
                            <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">{sale.receiptNumber}</span>
                            <span className="font-bold text-red-600 dark:text-red-400 text-sm">{formatKES(sale.totalCents)}</span>
                          </div>
                          <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">{formatDate(sale.createdAt)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* All recent sales */}
                {(detail?.sales?.filter((s) => s.status !== 'CREDIT').length ?? 0) > 0 && (
                  <div>
                    <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2">Recent Sales</p>
                    <div className="space-y-2">
                      {detail!.sales!.filter((s) => s.status !== 'CREDIT').map((sale) => (
                        <div key={sale.id} className="bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                          <div className="flex justify-between items-start">
                            <span className="font-mono text-xs text-gray-700 dark:text-gray-300">{sale.receiptNumber}</span>
                            <span className="font-semibold text-sm text-gray-900 dark:text-white">{formatKES(sale.totalCents)}</span>
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(sale.createdAt)}</span>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                              sale.status === 'PAID'
                                ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                                : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'
                            }`}>
                              {sale.status}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {creditSales.length === 0 && (detail?.sales?.length ?? 0) === 0 && (
                  <div className="text-center py-8">
                    <p className="text-sm text-gray-400 dark:text-gray-500">No sales history</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

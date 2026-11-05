import { useState } from 'react';
import { useDialog } from '../components/Dialog';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import {
  Tag,
  Plus,
  X,
  AlertCircle,
  ToggleLeft,
  ToggleRight,
  Percent,
  Calendar,
  Trash2,
} from 'lucide-react';
import { formatKES } from '@pos/shared';

interface Promotion {
  id: string;
  name: string;
  type: string;
  discountType: 'PERCENTAGE' | 'FIXED';
  discountValue: number;
  minPurchaseCents: number | null;
  maxDiscountCents: number | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  applicableItems: string;
}

const PROMO_TYPES = [
  { value: 'SALE', label: 'Sale / General Discount' },
  { value: 'BUNDLE', label: 'Bundle Deal' },
  { value: 'LOYALTY', label: 'Loyalty Reward' },
  { value: 'FLASH', label: 'Flash Sale' },
  { value: 'SEASONAL', label: 'Seasonal Promotion' },
];

function AddPromoModal({
  businessId,
  onClose,
}: {
  businessId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const today = new Date().toISOString().split('T')[0];
  const nextMonth = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];

  const [form, setForm] = useState({
    name: '',
    type: 'SALE',
    discountType: 'PERCENTAGE' as 'PERCENTAGE' | 'FIXED',
    discountValue: 10,
    minPurchaseCents: '',
    maxDiscountCents: '',
    startDate: today,
    endDate: nextMonth,
  });

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/promotions', {
        businessId,
        name: form.name,
        type: form.type,
        discountType: form.discountType,
        discountValue: form.discountValue,
        minPurchaseCents: form.minPurchaseCents
          ? Math.round(Number(form.minPurchaseCents) * 100)
          : undefined,
        maxDiscountCents: form.maxDiscountCents
          ? Math.round(Number(form.maxDiscountCents) * 100)
          : undefined,
        startDate: form.startDate,
        endDate: form.endDate,
        applicableItems: [],
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['promotions'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">Create Promotion</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Promotion Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Black Friday 20% Off"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm((f) => ({ ...f, type: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
              {PROMO_TYPES.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Discount Type</label>
              <select
                value={form.discountType}
                onChange={(e) =>
                  setForm((f) => ({
                    ...f,
                    discountType: e.target.value as 'PERCENTAGE' | 'FIXED',
                  }))
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500">
                <option value="PERCENTAGE">Percentage (%)</option>
                <option value="FIXED">Fixed Amount (KES)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Discount Value {form.discountType === 'PERCENTAGE' ? '(%)' : '(KES)'}
              </label>
              <input
                type="number"
                min={0}
                max={form.discountType === 'PERCENTAGE' ? 100 : undefined}
                step={form.discountType === 'PERCENTAGE' ? 1 : 0.5}
                value={form.discountValue}
                onChange={(e) =>
                  setForm((f) => ({ ...f, discountValue: Number(e.target.value) }))
                }
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Min Purchase (KES) — optional
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.minPurchaseCents}
                onChange={(e) => setForm((f) => ({ ...f, minPurchaseCents: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 1000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Max Discount (KES) — optional
              </label>
              <input
                type="number"
                min={0}
                step={0.5}
                value={form.maxDiscountCents}
                onChange={(e) => setForm((f) => ({ ...f, maxDiscountCents: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. 500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" aria-label="Start date" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={form.endDate}
                onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500" aria-label="End date" />
            </div>
          </div>

          {mutation.isError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              Failed to create promotion
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t">
          <button
            onClick={onClose}
            className="flex-1 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!form.name || mutation.isPending}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create Promotion'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function PromotionsPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const queryClient = useQueryClient();
  const { confirm } = useDialog();
  const [showAdd, setShowAdd] = useState(false);
  const [filter, setFilter] = useState<'all' | 'active' | 'inactive'>('all');

  const { data: promotions = [], isLoading } = useQuery<Promotion[]>({
    queryKey: ['promotions', businessId],
    queryFn: () => api.get(`/promotions?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/promotions/${id}`, { isActive }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['promotions'] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/promotions/${id}`),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['promotions'] }),
  });

  const now = new Date();
  const filtered = promotions.filter((p) => {
    if (filter === 'active') return p.isActive;
    if (filter === 'inactive') return !p.isActive;
    return true;
  });

  const isExpired = (p: Promotion) => new Date(p.endDate) < now;
  const isUpcoming = (p: Promotion) => new Date(p.startDate) > now;

  const getStatus = (p: Promotion) => {
    if (!p.isActive) return { label: 'Inactive', color: 'bg-gray-100 text-gray-600' };
    if (isExpired(p)) return { label: 'Expired', color: 'bg-red-100 text-red-600' };
    if (isUpcoming(p)) return { label: 'Upcoming', color: 'bg-blue-100 text-blue-600' };
    return { label: 'Active', color: 'bg-green-100 text-green-700' };
  };

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Promotions</h1>
          <p className="text-sm text-gray-500 mt-1">
            Create and manage discounts, sales, and special offers
          </p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          New Promotion
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        {[
          {
            label: 'Total Promotions',
            value: promotions.length,
            color: 'text-gray-900',
            bg: 'bg-white',
          },
          {
            label: 'Active Now',
            value: promotions.filter(
              (p) => p.isActive && !isExpired(p) && !isUpcoming(p),
            ).length,
            color: 'text-green-700',
            bg: 'bg-green-50',
          },
          {
            label: 'Expired',
            value: promotions.filter((p) => isExpired(p)).length,
            color: 'text-red-600',
            bg: 'bg-red-50',
          },
        ].map((stat) => (
          <div key={stat.label} className={`${stat.bg} rounded-xl border p-4`}>
            <p className="text-sm text-gray-500">{stat.label}</p>
            <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        {(['all', 'active', 'inactive'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
              filter === f
                ? 'bg-blue-100 text-blue-700'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading promotions...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <Tag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No promotions found</p>
          <p className="text-gray-400 text-sm mt-1">
            Create your first promotion to attract more customers
          </p>
          <button
            onClick={() => setShowAdd(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Create Promotion
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((promo) => {
            const status = getStatus(promo);
            return (
              <div
                key={promo.id}
                className="bg-white rounded-xl border p-4 flex items-center gap-4"
              >
                {/* Icon */}
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <Percent className="w-5 h-5 text-blue-600" />
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="font-semibold text-sm">{promo.name}</p>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.color}`}
                    >
                      {status.label}
                    </span>
                    <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                      {PROMO_TYPES.find((t) => t.value === promo.type)?.label ?? promo.type}
                    </span>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-gray-500">
                    <span>
                      {promo.discountType === 'PERCENTAGE'
                        ? `${promo.discountValue}% off`
                        : `KES ${promo.discountValue} off`}
                    </span>
                    {promo.minPurchaseCents && (
                      <span>Min: {formatKES(promo.minPurchaseCents)}</span>
                    )}
                    {promo.maxDiscountCents && (
                      <span>Max: {formatKES(promo.maxDiscountCents)}</span>
                    )}
                    <span className="flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {new Date(promo.startDate).toLocaleDateString('en-KE')} —{' '}
                      {new Date(promo.endDate).toLocaleDateString('en-KE')}
                    </span>
                  </div>
                </div>

                {/* Toggle */}
                <button
                  onClick={() =>
                    toggleMutation.mutate({ id: promo.id, isActive: !promo.isActive })
                  }
                  disabled={toggleMutation.isPending}
                  className="flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-gray-700 disabled:opacity-50"
                >
                  {promo.isActive ? (
                    <ToggleRight className="w-6 h-6 text-green-500" />
                  ) : (
                    <ToggleLeft className="w-6 h-6 text-gray-400" />
                  )}
                  {promo.isActive ? 'Active' : 'Off'}
                </button>
                {/* Delete */}
                <button
                  onClick={async () => {
                    const ok = await confirm({ title: 'Delete Promotion', message: `Delete "${promo.name}"? This cannot be undone.`, variant: 'danger', confirmLabel: 'Delete' });
                    if (ok) deleteMutation.mutate(promo.id);
                  }}
                  disabled={deleteMutation.isPending}
                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                  title="Delete promotion"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {showAdd && <AddPromoModal businessId={businessId} onClose={() => setShowAdd(false)} />}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { Save, Store, CreditCard, AlertCircle, CheckCircle } from 'lucide-react';

interface BusinessSettings {
  id: string;
  name: string;
  taxType: 'VAT' | 'TOT';
  serviceChargeRate: number;
  negativePolicyDefault: 'BLOCK' | 'WARN' | 'ALLOW';
  posMode: string;
  expiredItemPolicy: string;
  expenseApprovalThresholdCents: number;
  subscriptionTier: string;
  subscriptionStatus: string;
  trialEndsAt?: string;
  stores: Array<{ id: string; name: string; storeCode: string }>;
}

interface StoreInfo {
  id: string;
  name: string;
  storeCode: string;
}

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'stores' | 'subscription'>('general');
  const [newStore, setNewStore] = useState({ name: '', storeCode: '' });

  const { data: settings, isLoading } = useQuery<BusinessSettings>({
    queryKey: ['business-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
  });

  const { data: subscription } = useQuery<{
    subscriptionTier: string;
    subscriptionStatus: string;
    isTrialExpired?: boolean;
    daysRemaining?: number;
  }>({
    queryKey: ['subscription', businessId],
    queryFn: () => api.get(`/business/${businessId}/subscription`),
    enabled: !!businessId,
  });

  const [form, setForm] = useState({
    name: '',
    taxType: 'VAT' as 'VAT' | 'TOT',
    serviceChargeRate: 10,
    negativePolicyDefault: 'BLOCK' as 'BLOCK' | 'WARN' | 'ALLOW',
    expenseApprovalThresholdCents: 500000,
  });

  // Sync form when settings load
  if (settings && form.name === '' && settings.name) {
    setForm({
      name: settings.name,
      taxType: settings.taxType,
      serviceChargeRate: settings.serviceChargeRate,
      negativePolicyDefault: settings.negativePolicyDefault,
      expenseApprovalThresholdCents: settings.expenseApprovalThresholdCents,
    });
  }

  const updateMutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.patch(`/business/${businessId}/settings`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['business-settings'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    },
  });

  const createStoreMutation = useMutation({
    mutationFn: (dto: { name: string; storeCode: string }) =>
      api.post(`/business/${businessId}/stores`, dto),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['business-settings'] });
      setNewStore({ name: '', storeCode: '' });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 flex items-center justify-center h-64">
        <div className="text-gray-500">Loading settings...</div>
      </div>
    );
  }

  const tabs = [
    { id: 'general' as const, label: 'General', icon: Save },
    { id: 'stores' as const, label: 'Stores', icon: Store },
    { id: 'subscription' as const, label: 'Subscription', icon: CreditCard },
  ];

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex border-b mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* General Settings */}
      {activeTab === 'general' && (
        <div className="bg-white rounded-xl shadow p-6 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Business Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tax Type</label>
            <select
              value={form.taxType}
              onChange={(e) => setForm((f) => ({ ...f, taxType: e.target.value as 'VAT' | 'TOT' }))}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="VAT">VAT (16%) — Standard businesses</option>
              <option value="TOT">TOT (3%) — Turnover tax for small businesses</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Service Charge Rate (%)
            </label>
            <input
              type="number"
              min={0}
              max={100}
              step={0.5}
              value={form.serviceChargeRate}
              onChange={(e) =>
                setForm((f) => ({ ...f, serviceChargeRate: Number(e.target.value) }))
              }
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Service charge is NOT included in the tax base (KRA compliance)
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Negative Stock Policy
            </label>
            <select
              value={form.negativePolicyDefault}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  negativePolicyDefault: e.target.value as 'BLOCK' | 'WARN' | 'ALLOW',
                }))
              }
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="BLOCK">Block — Prevent selling out-of-stock items</option>
              <option value="WARN">Warn — Show warning but allow sale</option>
              <option value="ALLOW">Allow — Silent negative stock</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Expense Approval Threshold (KES)
            </label>
            <input
              type="number"
              min={0}
              step={100}
              value={form.expenseApprovalThresholdCents / 100}
              onChange={(e) =>
                setForm((f) => ({
                  ...f,
                  expenseApprovalThresholdCents: Math.round(Number(e.target.value) * 100),
                }))
              }
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            />
            <p className="text-xs text-gray-400 mt-1">
              Expenses above this amount require manager approval
            </p>
          </div>

          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={() => updateMutation.mutate(form)}
              disabled={updateMutation.isPending}
              className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {updateMutation.isPending ? 'Saving...' : 'Save Settings'}
            </button>

            {saved && (
              <div className="flex items-center gap-1.5 text-green-600 text-sm">
                <CheckCircle className="w-4 h-4" />
                Saved successfully
              </div>
            )}

            {updateMutation.isError && (
              <div className="flex items-center gap-1.5 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" />
                Failed to save
              </div>
            )}
          </div>
        </div>
      )}

      {/* Stores Tab */}
      {activeTab === 'stores' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow divide-y">
            {(settings?.stores ?? []).map((store: StoreInfo) => (
              <div key={store.id} className="p-4 flex items-center justify-between">
                <div>
                  <p className="font-medium">{store.name}</p>
                  <p className="text-sm text-gray-500">Code: {store.storeCode}</p>
                </div>
              </div>
            ))}
            {(settings?.stores ?? []).length === 0 && (
              <div className="p-8 text-center text-gray-400">No stores configured</div>
            )}
          </div>

          <div className="bg-white rounded-xl shadow p-6">
            <h3 className="font-semibold mb-4">Add New Store</h3>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Store Name</label>
                <input
                  type="text"
                  value={newStore.name}
                  onChange={(e) => setNewStore((s) => ({ ...s, name: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Main Branch"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Store Code</label>
                <input
                  type="text"
                  value={newStore.storeCode}
                  onChange={(e) =>
                    setNewStore((s) => ({ ...s, storeCode: e.target.value.toUpperCase() }))
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="MAIN"
                  maxLength={8}
                />
              </div>
            </div>
            <button
              onClick={() => createStoreMutation.mutate(newStore)}
              disabled={!newStore.name || !newStore.storeCode || createStoreMutation.isPending}
              className="px-5 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {createStoreMutation.isPending ? 'Creating...' : 'Create Store'}
            </button>
          </div>
        </div>
      )}

      {/* Subscription Tab */}
      {activeTab === 'subscription' && (
        <div className="bg-white rounded-xl shadow p-6">
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="font-semibold text-lg">Current Plan</span>
              <span
                className={`px-3 py-1 rounded-full text-sm font-medium ${
                  subscription?.subscriptionStatus === 'ACTIVE'
                    ? 'bg-green-100 text-green-700'
                    : subscription?.subscriptionStatus === 'TRIAL'
                    ? 'bg-blue-100 text-blue-700'
                    : 'bg-red-100 text-red-700'
                }`}
              >
                {subscription?.subscriptionStatus ?? 'TRIAL'}
              </span>
            </div>
            <p className="text-2xl font-bold text-gray-900">
              {subscription?.subscriptionTier ?? 'Trial'}
            </p>
          </div>

          {subscription?.subscriptionStatus === 'TRIAL' && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-6">
              <p className="text-blue-700 font-medium">
                {subscription?.isTrialExpired
                  ? 'Your trial has expired'
                  : `${subscription?.daysRemaining ?? 0} days remaining in trial`}
              </p>
              <p className="text-blue-600 text-sm mt-1">
                Upgrade to continue using all features after trial ends
              </p>
            </div>
          )}

          <div className="grid grid-cols-3 gap-4">
            {[
              {
                tier: 'STARTER',
                price: 'KES 2,500/mo',
                features: ['1 store', '3 users', 'Basic POS', 'Reports'],
              },
              {
                tier: 'PROFESSIONAL',
                price: 'KES 5,500/mo',
                features: ['3 stores', '10 users', 'All features', 'eTIMS', 'M-Pesa'],
              },
              {
                tier: 'ENTERPRISE',
                price: 'KES 12,000/mo',
                features: ['Unlimited stores', 'Unlimited users', 'API access', 'Priority support'],
              },
            ].map((plan) => (
              <div
                key={plan.tier}
                className={`border rounded-xl p-4 ${
                  subscription?.subscriptionTier === plan.tier
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200'
                }`}
              >
                <h4 className="font-bold mb-1">{plan.tier}</h4>
                <p className="text-blue-600 font-semibold mb-3">{plan.price}</p>
                <ul className="space-y-1">
                  {plan.features.map((f) => (
                    <li key={f} className="text-sm text-gray-600 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5 text-green-500 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>
                <button className="mt-4 w-full py-2 text-sm font-medium rounded-lg border border-blue-600 text-blue-600 hover:bg-blue-600 hover:text-white transition-colors">
                  {subscription?.subscriptionTier === plan.tier ? 'Current Plan' : 'Upgrade'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

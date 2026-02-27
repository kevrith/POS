import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import {
  Save,
  Store,
  CreditCard,
  AlertCircle,
  CheckCircle,
  Users,
  Plus,
  Trash2,
  Edit2,
  Shield,
  Smartphone,
  X,
  Eye,
  EyeOff,
  MessageSquare,
  Star,
  Printer,
  RefreshCw,
} from 'lucide-react';
import { UserRole } from '@pos/shared';

// ─── Types ─────────────────────────────────────────────────────────────────────

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
  hasEtimsCredentials: boolean;
  hasMpesaCredentials: boolean;
  hasAtCredentials: boolean;
  stores: Array<{ id: string; name: string; storeCode: string }>;
}

interface StaffUser {
  id: string;
  name: string;
  email: string | null;
  role: string;
  createdAt: string;
}

const ROLE_LABELS: Record<string, string> = {
  OWNER: 'Owner',
  MANAGER: 'Manager',
  ACCOUNTANT: 'Accountant',
  CASHIER: 'Cashier',
  WAITER: 'Waiter',
  KITCHEN: 'Kitchen Staff',
};

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-700',
  MANAGER: 'bg-blue-100 text-blue-700',
  ACCOUNTANT: 'bg-green-100 text-green-700',
  CASHIER: 'bg-yellow-100 text-yellow-700',
  WAITER: 'bg-orange-100 text-orange-700',
  KITCHEN: 'bg-gray-100 text-gray-700',
};

// ─── Sub-components ────────────────────────────────────────────────────────────

function AddUserModal({
  businessId,
  onClose,
}: {
  businessId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    email: '',
    role: UserRole.CASHIER as string,
    pin: '',
    password: '',
  });
  const [showPin, setShowPin] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: typeof form) =>
      api.post(`/business/${businessId}/users`, {
        name: data.name,
        email: data.email || undefined,
        role: data.role,
        pin: data.pin || undefined,
        password: data.password || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['business-users', businessId] });
      onClose();
    },
  });

  const needsPassword = ['OWNER', 'MANAGER', 'ACCOUNTANT'].includes(form.role);
  const needsPin = ['CASHIER', 'WAITER', 'KITCHEN'].includes(form.role);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">Add Staff Member</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Full Name *</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="e.g. Jane Wanjiku"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Role *</label>
            <select
              value={form.role}
              onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="MANAGER">Manager — Full store access</option>
              <option value="ACCOUNTANT">Accountant — Reports only</option>
              <option value="CASHIER">Cashier — POS + PIN login</option>
              <option value="WAITER">Waiter — Hospitality + PIN login</option>
              <option value="KITCHEN">Kitchen Staff — KDS only + PIN</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email {needsPassword ? '*' : '(optional)'}
            </label>
            <input
              type="email"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="staff@business.co.ke"
            />
          </div>

          {needsPin && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">PIN (4–6 digits)</label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={form.pin}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                    setForm((f) => ({ ...f, pin: val }));
                  }}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 pr-10"
                  placeholder="e.g. 1234"
                  maxLength={6}
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-2.5 text-gray-400"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-400 mt-1">
                Used for quick PIN login at the POS terminal
              </p>
            </div>
          )}

          {needsPassword && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Password *</label>
              <div className="relative">
                <input
                  type={showPin ? 'text' : 'password'}
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 pr-10"
                  placeholder="Minimum 8 characters"
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-3 top-2.5 text-gray-400"
                >
                  {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          )}

          {mutation.isError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {(mutation.error as Error)?.message ?? 'Failed to create user'}
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
            onClick={() => mutation.mutate(form)}
            disabled={!form.name || mutation.isPending}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditUserModal({
  user,
  businessId,
  onClose,
}: {
  user: StaffUser;
  businessId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [pin, setPin] = useState('');
  const [showPin, setShowPin] = useState(false);

  const mutation = useMutation({
    mutationFn: (data: { pin?: string }) =>
      api.patch(`/business/${businessId}/users/${user.id}`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['business-users', businessId] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">Update PIN — {user.name}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">New PIN (4–6 digits)</label>
            <div className="relative">
              <input
                type={showPin ? 'text' : 'password'}
                value={pin}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, '').slice(0, 6);
                  setPin(val);
                }}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 pr-10"
                placeholder="New PIN"
                maxLength={6}
              />
              <button
                type="button"
                onClick={() => setShowPin(!showPin)}
                className="absolute right-3 top-2.5 text-gray-400"
              >
                {showPin ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </div>
        <div className="flex gap-3 p-5 border-t">
          <button
            onClick={onClose}
            className="flex-1 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate({ pin })}
            disabled={pin.length < 4 || mutation.isPending}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Updating...' : 'Update PIN'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Component ────────────────────────────────────────────────────────────

export default function SettingsPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const queryClient = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState<
    'general' | 'users' | 'stores' | 'etims' | 'mpesa' | 'subscription' | 'messaging' | 'loyalty' | 'printers'
  >('general');

  // ─── General form state ────────────────────────────────────────────────────
  const [form, setForm] = useState({
    name: '',
    taxType: 'VAT' as 'VAT' | 'TOT',
    serviceChargeRate: 10,
    negativePolicyDefault: 'BLOCK' as 'BLOCK' | 'WARN' | 'ALLOW',
    expenseApprovalThresholdCents: 500000,
    posMode: 'RETAIL',
    expiredItemPolicy: 'BLOCK',
  });

  // ─── eTIMS credentials ─────────────────────────────────────────────────────
  const [etimsForm, setEtimsForm] = useState({ bhfId: '', tin: '', cmcKey: '' });
  const [etimsSaved, setEtimsSaved] = useState(false);

  // ─── M-Pesa credentials ────────────────────────────────────────────────────
  const [mpesaForm, setMpesaForm] = useState({
    consumerKey: '',
    consumerSecret: '',
    shortcode: '',
    passkey: '',
    callbackUrl: '',
  });
  const [mpesaSaved, setMpesaSaved] = useState(false);

  // ─── Africa's Talking credentials ──────────────────────────────────────────
  const [atForm, setAtForm] = useState({ apiKey: '', username: '', senderId: '' });
  const [atSaved, setAtSaved] = useState(false);

  // ─── Loyalty program form ──────────────────────────────────────────────────
  const [loyaltyForm, setLoyaltyForm] = useState({
    name: 'Customer Loyalty',
    pointsPerCent: 0.01,
    redemptionRate: 10,
    minRedemption: 100,
  });
  const [loyaltySaved, setLoyaltySaved] = useState(false);

  // ─── Printers ──────────────────────────────────────────────────────────────
  const [showAddPrinter, setShowAddPrinter] = useState(false);
  const [printerForm, setPrinterForm] = useState({
    name: '',
    connectionType: 'USB',
    connectionDetails: '',
    isDefault: false,
    handles: ['RECEIPT'] as string[],
  });

  // ─── User management ───────────────────────────────────────────────────────
  const [showAddUser, setShowAddUser] = useState(false);
  const [editingUser, setEditingUser] = useState<StaffUser | null>(null);
  const [newStore, setNewStore] = useState({ name: '', storeCode: '' });

  // ─── Queries ───────────────────────────────────────────────────────────────
  const { data: settings, isLoading } = useQuery<BusinessSettings>({
    queryKey: ['business-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
  });

  const { data: users = [] } = useQuery<StaffUser[]>({
    queryKey: ['business-users', businessId],
    queryFn: () => api.get(`/business/${businessId}/users`),
    enabled: !!businessId && activeTab === 'users',
  });

  const { data: subscription } = useQuery<{
    subscriptionTier: string;
    subscriptionStatus: string;
    isTrialExpired?: boolean;
    daysRemaining?: number;
  }>({
    queryKey: ['subscription', businessId],
    queryFn: () => api.get(`/business/${businessId}/subscription`),
    enabled: !!businessId && activeTab === 'subscription',
  });

  const { data: loyaltyProgram } = useQuery<{
    id: string; name: string; pointsPerCent: number; redemptionRate: number; minRedemption: number;
  } | null>({
    queryKey: ['loyalty-program-settings', businessId],
    queryFn: () => api.get(`/loyalty/program?businessId=${businessId}`).catch(() => null),
    enabled: !!businessId && activeTab === 'loyalty',
  });

  const storeId = user?.storeId ?? '';
  const { data: printers = [], refetch: refetchPrinters } = useQuery<Array<{
    id: string; name: string; connectionType: string; connectionDetails: string;
    isDefault: boolean; handles: string;
  }>>({
    queryKey: ['printers', storeId],
    queryFn: () => api.get(`/printers?storeId=${storeId}`),
    enabled: !!storeId && activeTab === 'printers',
  });

  const { data: etimsPendingSales } = useQuery<{ data: Array<{
    id: string; receiptNumber: string; totalCents: number; createdAt: string;
  }>; total: number }>({
    queryKey: ['etims-pending', businessId],
    queryFn: () => api.get(`/sales?businessId=${businessId}&etimsSubmitted=false&status=PAID&limit=20`),
    enabled: !!businessId && activeTab === 'etims',
  });

  // Sync form when settings load
  useEffect(() => {
    if (settings && !form.name && settings.name) {
      setForm({
        name: settings.name,
        taxType: settings.taxType,
        serviceChargeRate: settings.serviceChargeRate,
        negativePolicyDefault: settings.negativePolicyDefault,
        expenseApprovalThresholdCents: settings.expenseApprovalThresholdCents,
        posMode: settings.posMode,
        expiredItemPolicy: settings.expiredItemPolicy,
      });
    }
  }, [settings]);

  // ─── Mutations ─────────────────────────────────────────────────────────────
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

  const deleteUserMutation = useMutation({
    mutationFn: (userId: string) =>
      api.delete(`/business/${businessId}/users/${userId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['business-users'] });
    },
  });

  const saveEtimsMutation = useMutation({
    mutationFn: (data: typeof etimsForm) =>
      api.patch(`/business/${businessId}/etims-credentials`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['business-settings'] });
      setEtimsSaved(true);
      setTimeout(() => setEtimsSaved(false), 3000);
      setEtimsForm({ bhfId: '', tin: '', cmcKey: '' });
    },
  });

  const saveMpesaMutation = useMutation({
    mutationFn: (data: typeof mpesaForm) =>
      api.patch(`/business/${businessId}/mpesa-credentials`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['business-settings'] });
      setMpesaSaved(true);
      setTimeout(() => setMpesaSaved(false), 3000);
      setMpesaForm({ consumerKey: '', consumerSecret: '', shortcode: '', passkey: '', callbackUrl: '' });
    },
  });

  const saveAtMutation = useMutation({
    mutationFn: (data: typeof atForm) =>
      api.patch(`/business/${businessId}/at-credentials`, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['business-settings'] });
      setAtSaved(true);
      setTimeout(() => setAtSaved(false), 3000);
      setAtForm({ apiKey: '', username: '', senderId: '' });
    },
  });

  const saveLoyaltyMutation = useMutation({
    mutationFn: (data: typeof loyaltyForm) =>
      api.post(`/loyalty/program`, { businessId, ...data }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['loyalty-program-settings'] });
      setLoyaltySaved(true);
      setTimeout(() => setLoyaltySaved(false), 3000);
    },
  });

  const createPrinterMutation = useMutation({
    mutationFn: (data: typeof printerForm) =>
      api.post(`/printers`, { storeId: user?.storeId, ...data }),
    onSuccess: () => {
      void refetchPrinters();
      setShowAddPrinter(false);
      setPrinterForm({ name: '', connectionType: 'USB', connectionDetails: '', isDefault: false, handles: ['RECEIPT'] });
    },
  });

  const deletePrinterMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/printers/${id}`),
    onSuccess: () => void refetchPrinters(),
  });

  const submitEtimsManual = useMutation({
    mutationFn: (saleId: string) => api.post(`/etims/submit/${saleId}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['etims-pending'] });
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
    { id: 'users' as const, label: 'Users', icon: Users },
    { id: 'stores' as const, label: 'Stores', icon: Store },
    { id: 'etims' as const, label: 'KRA eTIMS', icon: Shield },
    { id: 'mpesa' as const, label: 'M-Pesa', icon: Smartphone },
    { id: 'messaging' as const, label: 'Messaging', icon: MessageSquare },
    { id: 'loyalty' as const, label: 'Loyalty', icon: Star },
    { id: 'printers' as const, label: 'Printers', icon: Printer },
    { id: 'subscription' as const, label: 'Subscription', icon: CreditCard },
  ];

  return (
    <div className="p-6 max-w-3xl">
      <h1 className="text-2xl font-bold mb-6">Settings</h1>

      {/* Tabs */}
      <div className="flex flex-wrap border-b mb-6 gap-0">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-px ${
              activeTab === tab.id
                ? 'text-blue-600 border-blue-600'
                : 'text-gray-500 border-transparent hover:text-gray-700'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── General Settings ──────────────────────────────────────────────── */}
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
            <label className="block text-sm font-medium text-gray-700 mb-1">POS Mode</label>
            <select
              value={form.posMode}
              onChange={(e) => setForm((f) => ({ ...f, posMode: e.target.value }))}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="RETAIL">Retail — Standard product sales</option>
              <option value="HOSPITALITY">Hospitality — Tables, orders, KOT</option>
              <option value="FAST_FOOD">Fast Food — Counter service with KOT</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Tax Type</label>
            <select
              value={form.taxType}
              onChange={(e) =>
                setForm((f) => ({ ...f, taxType: e.target.value as 'VAT' | 'TOT' }))
              }
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
              Expired Item Policy
            </label>
            <select
              value={form.expiredItemPolicy}
              onChange={(e) => setForm((f) => ({ ...f, expiredItemPolicy: e.target.value }))}
              className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="BLOCK">Block — Cannot sell expired items</option>
              <option value="WARN">Warn — Alert but allow sale</option>
              <option value="ALLOW">Allow — No restriction on expired items</option>
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
              <span className="flex items-center gap-1.5 text-green-600 text-sm">
                <CheckCircle className="w-4 h-4" /> Saved
              </span>
            )}
            {updateMutation.isError && (
              <span className="flex items-center gap-1.5 text-red-600 text-sm">
                <AlertCircle className="w-4 h-4" /> Failed to save
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Users Tab ─────────────────────────────────────────────────────── */}
      {activeTab === 'users' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{users.length} staff member(s)</p>
            <button
              onClick={() => setShowAddUser(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Add Staff
            </button>
          </div>

          <div className="bg-white rounded-xl shadow divide-y">
            {users.map((u) => (
              <div key={u.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-gray-100 flex items-center justify-center text-sm font-semibold text-gray-600">
                    {u.name.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-medium text-sm">{u.name}</p>
                    <p className="text-xs text-gray-400">{u.email ?? 'No email (PIN only)'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-medium px-2.5 py-1 rounded-full ${
                      ROLE_COLORS[u.role] ?? 'bg-gray-100 text-gray-600'
                    }`}
                  >
                    {ROLE_LABELS[u.role] ?? u.role}
                  </span>
                  {u.role !== 'OWNER' && (
                    <>
                      <button
                        onClick={() => setEditingUser(u)}
                        className="text-gray-400 hover:text-blue-600 p-1"
                        title="Update PIN"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete ${u.name}? This cannot be undone.`)) {
                            deleteUserMutation.mutate(u.id);
                          }
                        }}
                        className="text-gray-400 hover:text-red-600 p-1"
                        title="Delete user"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </>
                  )}
                </div>
              </div>
            ))}
            {users.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                <Users className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No staff members yet
              </div>
            )}
          </div>

          <div className="bg-blue-50 border border-blue-100 rounded-lg p-4 text-sm text-blue-700">
            <strong>Tip:</strong> Cashiers, Waiters, and Kitchen Staff log in with a PIN at the
            POS terminal. Managers and Accountants use email + password.
          </div>
        </div>
      )}

      {/* ── Stores Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'stores' && (
        <div className="space-y-4">
          <div className="bg-white rounded-xl shadow divide-y">
            {(settings?.stores ?? []).map((store) => (
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
                  placeholder="NRB01"
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

      {/* ── KRA eTIMS Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'etims' && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-lg border ${
              settings?.hasEtimsCredentials
                ? 'bg-green-50 border-green-200'
                : 'bg-yellow-50 border-yellow-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {settings?.hasEtimsCredentials ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-700">eTIMS credentials configured</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <span className="font-medium text-yellow-700">eTIMS not configured</span>
                </>
              )}
            </div>
            <p className="text-sm mt-1 text-gray-600">
              {settings?.hasEtimsCredentials
                ? 'Your KRA eTIMS credentials are saved. Re-enter below to update them.'
                : 'Enter your KRA eTIMS credentials to enable automatic fiscal receipt submission.'}
            </p>
          </div>

          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <h3 className="font-semibold">KRA eTIMS Credentials</h3>
            <p className="text-sm text-gray-500">
              Obtain these from the KRA eTIMS portal at{' '}
              <span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">
                etims.kra.go.ke
              </span>
            </p>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Branch ID (BhfId)
              </label>
              <input
                type="text"
                value={etimsForm.bhfId}
                onChange={(e) => setEtimsForm((f) => ({ ...f, bhfId: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="e.g. 00"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tax Identification Number (TIN)
              </label>
              <input
                type="text"
                value={etimsForm.tin}
                onChange={(e) => setEtimsForm((f) => ({ ...f, tin: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="e.g. P000000000M"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">CMC Key</label>
              <input
                type="password"
                value={etimsForm.cmcKey}
                onChange={(e) => setEtimsForm((f) => ({ ...f, cmcKey: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                placeholder="Your eTIMS CMC key"
              />
              <p className="text-xs text-gray-400 mt-1">
                Credentials are encrypted with AES-256 before storage
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => saveEtimsMutation.mutate(etimsForm)}
                disabled={
                  !etimsForm.bhfId ||
                  !etimsForm.tin ||
                  !etimsForm.cmcKey ||
                  saveEtimsMutation.isPending
                }
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <Shield className="w-4 h-4" />
                {saveEtimsMutation.isPending ? 'Saving...' : 'Save eTIMS Credentials'}
              </button>
              {etimsSaved && (
                <span className="flex items-center gap-1.5 text-green-600 text-sm">
                  <CheckCircle className="w-4 h-4" /> Saved securely
                </span>
              )}
            </div>
          </div>

          {/* eTIMS Pending Queue */}
          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Pending KRA Submissions</h3>
              {etimsPendingSales && (
                <span className={`text-sm font-medium px-2.5 py-1 rounded-full ${
                  (etimsPendingSales.total ?? 0) > 0
                    ? 'bg-red-100 text-red-700'
                    : 'bg-green-100 text-green-700'
                }`}>
                  {etimsPendingSales.total ?? 0} pending
                </span>
              )}
            </div>
            {!etimsPendingSales?.data?.length ? (
              <div className="text-center py-6 text-gray-400">
                <CheckCircle className="w-8 h-8 mx-auto mb-2 text-green-400" />
                <p className="text-sm">All sales submitted to KRA</p>
              </div>
            ) : (
              <div className="divide-y border rounded-lg overflow-hidden">
                {etimsPendingSales.data.map((sale) => (
                  <div key={sale.id} className="flex items-center justify-between px-4 py-3">
                    <div>
                      <div className="font-medium text-sm">{sale.receiptNumber}</div>
                      <div className="text-xs text-gray-400">
                        {new Date(sale.createdAt).toLocaleString('en-KE')} · KES {(sale.totalCents / 100).toFixed(2)}
                      </div>
                    </div>
                    <button
                      onClick={() => submitEtimsManual.mutate(sale.id)}
                      disabled={submitEtimsManual.isPending}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                    >
                      <RefreshCw className={`w-3 h-3 ${submitEtimsManual.isPending ? 'animate-spin' : ''}`} />
                      Submit to KRA
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── M-Pesa Tab ────────────────────────────────────────────────────── */}
      {activeTab === 'mpesa' && (
        <div className="space-y-4">
          <div
            className={`p-4 rounded-lg border ${
              settings?.hasMpesaCredentials
                ? 'bg-green-50 border-green-200'
                : 'bg-yellow-50 border-yellow-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {settings?.hasMpesaCredentials ? (
                <>
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="font-medium text-green-700">M-Pesa credentials configured</span>
                </>
              ) : (
                <>
                  <AlertCircle className="w-5 h-5 text-yellow-600" />
                  <span className="font-medium text-yellow-700">M-Pesa not configured</span>
                </>
              )}
            </div>
          </div>

          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <h3 className="font-semibold">Safaricom Daraja API Credentials</h3>
            <p className="text-sm text-gray-500">
              Obtain from the Safaricom Daraja portal. Required for M-Pesa STK Push payments.
            </p>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Consumer Key
                </label>
                <input
                  type="password"
                  value={mpesaForm.consumerKey}
                  onChange={(e) => setMpesaForm((f) => ({ ...f, consumerKey: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="Daraja consumer key"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Consumer Secret
                </label>
                <input
                  type="password"
                  value={mpesaForm.consumerSecret}
                  onChange={(e) =>
                    setMpesaForm((f) => ({ ...f, consumerSecret: e.target.value }))
                  }
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="Daraja consumer secret"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Shortcode (Till/Paybill)
                </label>
                <input
                  type="text"
                  value={mpesaForm.shortcode}
                  onChange={(e) => setMpesaForm((f) => ({ ...f, shortcode: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                  placeholder="e.g. 174379"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Lipa na M-Pesa Passkey
                </label>
                <input
                  type="password"
                  value={mpesaForm.passkey}
                  onChange={(e) => setMpesaForm((f) => ({ ...f, passkey: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                  placeholder="Your LNM passkey"
                />
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Callback URL
              </label>
              <input
                type="url"
                value={mpesaForm.callbackUrl}
                onChange={(e) => setMpesaForm((f) => ({ ...f, callbackUrl: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="https://your-api.com/api/payments/mpesa/callback"
              />
              <p className="text-xs text-gray-400 mt-1">
                Must be a publicly accessible HTTPS URL
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => saveMpesaMutation.mutate(mpesaForm)}
                disabled={
                  !mpesaForm.consumerKey ||
                  !mpesaForm.shortcode ||
                  saveMpesaMutation.isPending
                }
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 disabled:opacity-50"
              >
                <Smartphone className="w-4 h-4" />
                {saveMpesaMutation.isPending ? 'Saving...' : 'Save M-Pesa Credentials'}
              </button>
              {mpesaSaved && (
                <span className="flex items-center gap-1.5 text-green-600 text-sm">
                  <CheckCircle className="w-4 h-4" /> Saved securely
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Subscription Tab ──────────────────────────────────────────────── */}
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

      {/* ── Messaging Tab (Africa's Talking) ────────────────────────────── */}
      {activeTab === 'messaging' && (
        <div className="space-y-4">
          <div className={`p-4 rounded-lg border ${
            settings?.hasAtCredentials ? 'bg-green-50 border-green-200' : 'bg-yellow-50 border-yellow-200'
          }`}>
            <div className="flex items-center gap-2">
              {settings?.hasAtCredentials ? (
                <><CheckCircle className="w-5 h-5 text-green-600" /><span className="font-medium text-green-700">Africa's Talking configured</span></>
              ) : (
                <><AlertCircle className="w-5 h-5 text-yellow-600" /><span className="font-medium text-yellow-700">Messaging not configured</span></>
              )}
            </div>
            <p className="text-sm mt-1 text-gray-600">
              Configure Africa's Talking to send WhatsApp and SMS receipts to customers.
              Get credentials at{' '}<span className="font-mono text-xs bg-gray-100 px-1 py-0.5 rounded">africastalking.com</span>
            </p>
          </div>

          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <h3 className="font-semibold">Africa's Talking API Credentials</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">API Key</label>
              <input
                type="password"
                value={atForm.apiKey}
                onChange={(e) => setAtForm((f) => ({ ...f, apiKey: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="Your AT API key"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                value={atForm.username}
                onChange={(e) => setAtForm((f) => ({ ...f, username: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                placeholder="sandbox or your AT username"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Sender ID <span className="text-gray-400 font-normal">(optional)</span></label>
              <input
                type="text"
                value={atForm.senderId}
                onChange={(e) => setAtForm((f) => ({ ...f, senderId: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. POSKENYA (alphanumeric, max 11 chars)"
                maxLength={11}
              />
              <p className="text-xs text-gray-400 mt-1">Custom sender name on SMS. Leave blank to use shortcode.</p>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => saveAtMutation.mutate(atForm)}
                disabled={!atForm.apiKey || !atForm.username || saveAtMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50"
              >
                <MessageSquare className="w-4 h-4" />
                {saveAtMutation.isPending ? 'Saving...' : 'Save Messaging Credentials'}
              </button>
              {atSaved && (
                <span className="flex items-center gap-1.5 text-green-600 text-sm">
                  <CheckCircle className="w-4 h-4" /> Saved securely
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Loyalty Tab ──────────────────────────────────────────────────── */}
      {activeTab === 'loyalty' && (
        <div className="space-y-4">
          {loyaltyProgram && (
            <div className="p-4 rounded-lg border bg-green-50 border-green-200">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-green-600" />
                <span className="font-medium text-green-700">Loyalty program active: {loyaltyProgram.name}</span>
              </div>
              <p className="text-sm text-gray-600 mt-1">
                {loyaltyProgram.pointsPerCent} pts per KES 1 · KES {(loyaltyProgram.redemptionRate / 100).toFixed(2)} per point · Min {loyaltyProgram.minRedemption} pts to redeem
              </p>
            </div>
          )}

          <div className="bg-white rounded-xl shadow p-6 space-y-4">
            <h3 className="font-semibold">{loyaltyProgram ? 'Update' : 'Create'} Loyalty Program</h3>
            <p className="text-sm text-gray-500">
              Customers earn points on purchases and can redeem them for discounts at checkout.
            </p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Program Name</label>
              <input
                type="text"
                value={loyaltyForm.name}
                onChange={(e) => setLoyaltyForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                placeholder="e.g. Customer Loyalty"
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Points per KES 1</label>
                <input
                  type="number"
                  min={0.001}
                  max={1}
                  step={0.001}
                  value={loyaltyForm.pointsPerCent}
                  onChange={(e) => setLoyaltyForm((f) => ({ ...f, pointsPerCent: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">e.g. 0.01 = 1 pt per KES 100</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Value per point (KES cents)</label>
                <input
                  type="number"
                  min={1}
                  step={1}
                  value={loyaltyForm.redemptionRate}
                  onChange={(e) => setLoyaltyForm((f) => ({ ...f, redemptionRate: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
                <p className="text-xs text-gray-400 mt-1">e.g. 10 = 1 pt worth KES 0.10</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Min points to redeem</label>
                <input
                  type="number"
                  min={1}
                  step={10}
                  value={loyaltyForm.minRedemption}
                  onChange={(e) => setLoyaltyForm((f) => ({ ...f, minRedemption: Number(e.target.value) }))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <button
                onClick={() => saveLoyaltyMutation.mutate(loyaltyForm)}
                disabled={!loyaltyForm.name || saveLoyaltyMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-yellow-500 text-white rounded-lg font-medium hover:bg-yellow-600 disabled:opacity-50"
              >
                <Star className="w-4 h-4" />
                {saveLoyaltyMutation.isPending ? 'Saving...' : 'Save Loyalty Program'}
              </button>
              {loyaltySaved && (
                <span className="flex items-center gap-1.5 text-green-600 text-sm">
                  <CheckCircle className="w-4 h-4" /> Saved
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Printers Tab ─────────────────────────────────────────────────── */}
      {activeTab === 'printers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">{printers.length} printer(s) configured</p>
            <button
              onClick={() => setShowAddPrinter(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
            >
              <Plus className="w-4 h-4" />
              Add Printer
            </button>
          </div>

          <div className="bg-white rounded-xl shadow divide-y">
            {printers.map((p) => {
              const handles: string[] = (() => { try { return JSON.parse(p.handles); } catch { return [p.handles]; } })();
              return (
                <div key={p.id} className="p-4 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <Printer className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-medium text-sm">{p.name}</p>
                        {p.isDefault && <span className="text-xs bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">Default</span>}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-gray-500">{p.connectionType}</span>
                        {p.connectionDetails && <span className="text-xs text-gray-400">{p.connectionDetails}</span>}
                      </div>
                      <div className="flex gap-1 mt-1">
                        {handles.map((h) => (
                          <span key={h} className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{h}</span>
                        ))}
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      if (confirm(`Delete "${p.name}"?`)) deletePrinterMutation.mutate(p.id);
                    }}
                    className="text-gray-400 hover:text-red-600 p-1"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
            })}
            {printers.length === 0 && (
              <div className="p-8 text-center text-gray-400">
                <Printer className="w-8 h-8 mx-auto mb-2 opacity-40" />
                No printers configured
              </div>
            )}
          </div>

          {showAddPrinter && (
            <div className="bg-white rounded-xl shadow p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">Add Printer</h3>
                <button onClick={() => setShowAddPrinter(false)}><X className="w-4 h-4 text-gray-400" /></button>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                  <input
                    type="text"
                    value={printerForm.name}
                    onChange={(e) => setPrinterForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="e.g. Receipt Printer"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Connection Type</label>
                  <select
                    value={printerForm.connectionType}
                    onChange={(e) => setPrinterForm((f) => ({ ...f, connectionType: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="USB">USB (WebUSB)</option>
                    <option value="BLUETOOTH">Bluetooth</option>
                    <option value="NETWORK">Network (IP)</option>
                  </select>
                </div>
              </div>
              {printerForm.connectionType === 'NETWORK' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">IP Address:Port</label>
                  <input
                    type="text"
                    value={printerForm.connectionDetails}
                    onChange={(e) => setPrinterForm((f) => ({ ...f, connectionDetails: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono"
                    placeholder="192.168.1.100:9100"
                  />
                </div>
              )}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Handles</label>
                <div className="flex gap-3">
                  {['RECEIPT', 'KOT', 'LABEL', 'INVOICE'].map((h) => (
                    <label key={h} className="flex items-center gap-1.5 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={printerForm.handles.includes(h)}
                        onChange={(e) => {
                          setPrinterForm((f) => ({
                            ...f,
                            handles: e.target.checked
                              ? [...f.handles, h]
                              : f.handles.filter((x) => x !== h),
                          }));
                        }}
                        className="rounded"
                      />
                      {h}
                    </label>
                  ))}
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={printerForm.isDefault}
                  onChange={(e) => setPrinterForm((f) => ({ ...f, isDefault: e.target.checked }))}
                  className="rounded"
                />
                Set as default printer
              </label>
              <button
                onClick={() => createPrinterMutation.mutate(printerForm)}
                disabled={!printerForm.name || printerForm.handles.length === 0 || createPrinterMutation.isPending}
                className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                <Printer className="w-4 h-4" />
                {createPrinterMutation.isPending ? 'Adding...' : 'Add Printer'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Modals */}
      {showAddUser && (
        <AddUserModal businessId={businessId} onClose={() => setShowAddUser(false)} />
      )}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          businessId={businessId}
          onClose={() => setEditingUser(null)}
        />
      )}
    </div>
  );
}

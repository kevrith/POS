import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, DollarSign, CheckCircle, XCircle, Clock, Filter,
  X, Loader2, AlertCircle, TrendingDown, RefreshCw, Target, Trash2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Expense {
  id: string;
  offlineId: string;
  amountCents: number;
  category: string;
  description: string;
  paidBy: string;
  approvalStatus: 'PENDING' | 'APPROVED' | 'REJECTED';
  submittedBy: string;
  approvedBy?: string;
  isRecurring?: boolean;
  receiptPhotoUrl?: string;
  createdAt: string;
}

interface CategorySummary {
  category: string;
  totalCents: number;
  count: number;
}

interface BudgetRow {
  id: string;
  category: string;
  amountCents: number;
  month: number;
  year: number;
  actualCents?: number;
  varianceCents?: number;
  pctUsed?: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (cents: number) =>
  `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const CATEGORIES = [
  'Rent', 'Utilities', 'Salaries', 'Supplies', 'Transport',
  'Marketing', 'Equipment', 'Maintenance', 'Insurance', 'Other',
];

const PAYMENT_METHODS = ['CASH', 'MPESA', 'BANK', 'CHEQUE'];

const STATUS_STYLES: Record<Expense['approvalStatus'], string> = {
  PENDING: 'bg-yellow-100 text-yellow-800',
  APPROVED: 'bg-green-100 text-green-800',
  REJECTED: 'bg-red-100 text-red-800',
};

const CATEGORY_COLORS = [
  'bg-blue-500', 'bg-green-500', 'bg-yellow-500', 'bg-purple-500', 'bg-red-500',
  'bg-orange-500', 'bg-teal-500', 'bg-pink-500', 'bg-indigo-500', 'bg-gray-500',
];

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

function uuid() { return crypto.randomUUID(); }

function dateRangeForPeriod(period: string): { start: string; end: string } {
  const now = new Date();
  const end = now.toISOString().split('T')[0];
  if (period === 'today') return { start: end, end };
  if (period === 'week') {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    return { start: d.toISOString().split('T')[0], end };
  }
  if (period === 'month') {
    return { start: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`, end };
  }
  return { start: `${now.getFullYear()}-01-01`, end };
}

// ─── Add Expense Modal ────────────────────────────────────────────────────────

interface AddExpenseModalProps {
  businessId: string;
  storeId: string;
  userId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function AddExpenseModal({ businessId, storeId, userId, onClose, onSuccess }: AddExpenseModalProps) {
  const [form, setForm] = useState({
    amountStr: '',
    category: 'Other',
    description: '',
    paidBy: 'CASH',
    isRecurring: false,
    recurringDay: 1,
  });
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/expenses', {
        offlineId: uuid(),
        businessId,
        storeId,
        amountCents: Math.round(parseFloat(form.amountStr || '0') * 100),
        category: form.category,
        description: form.description,
        paidBy: form.paidBy,
        submittedBy: userId,
        isRecurring: form.isRecurring,
        recurringDay: form.isRecurring ? form.recurringDay : undefined,
      }),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save expense'),
  });

  const amountCents = Math.round(parseFloat(form.amountStr || '0') * 100);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Add Expense</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount (KES) *</label>
            <input
              type="number" min={0} step={0.01} value={form.amountStr}
              onChange={(e) => setForm({ ...form, amountStr: e.target.value })}
              placeholder="0.00"
              className="w-full border rounded-xl px-4 py-3 text-xl font-bold focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payment Method *</label>
              <select value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Description *</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What was this expense for?" rows={2}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 resize-none" />
          </div>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.isRecurring}
              onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            <span className="text-sm font-medium text-gray-700">This is a recurring expense</span>
          </label>

          {form.isRecurring && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Recurring Day of Month</label>
              <input type="number" min={1} max={28} value={form.recurringDay}
                onChange={(e) => setForm({ ...form, recurringDay: parseInt(e.target.value) || 1 })}
                className="w-32 border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          )}
        </div>

        <div className="border-t px-6 py-4 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">
            Cancel
          </button>
          <button onClick={() => create.mutate()}
            disabled={!form.amountStr || amountCents <= 0 || !form.description || create.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2">
            {create.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            Add Expense
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Set Budget Modal ─────────────────────────────────────────────────────────

interface SetBudgetModalProps {
  businessId: string;
  month: number;
  year: number;
  existing?: BudgetRow;
  onClose: () => void;
  onSuccess: () => void;
}

function SetBudgetModal({ businessId, month, year, existing, onClose, onSuccess }: SetBudgetModalProps) {
  const [form, setForm] = useState({
    category: existing?.category ?? 'Rent',
    amountStr: existing ? String(existing.amountCents / 100) : '',
  });
  const [error, setError] = useState('');

  const upsert = useMutation({
    mutationFn: () =>
      api.post('/budgets', {
        businessId,
        category: form.category,
        amountCents: Math.round(parseFloat(form.amountStr || '0') * 100),
        month,
        year,
      }),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">
            {existing ? 'Edit' : 'Set'} Budget
          </h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <p className="text-sm text-gray-500 font-medium">
            {MONTH_NAMES[month]} {year}
          </p>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category *</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              disabled={!!existing}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 disabled:bg-gray-50">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Budget Amount (KES) *</label>
            <input
              type="number" min={0} step={0.01} value={form.amountStr}
              onChange={(e) => setForm({ ...form, amountStr: e.target.value })}
              placeholder="0.00"
              className="w-full border rounded-xl px-4 py-3 text-xl font-bold focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>
        </div>
        <div className="border-t px-6 py-4 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">
            Cancel
          </button>
          <button onClick={() => upsert.mutate()}
            disabled={!form.amountStr || parseFloat(form.amountStr) <= 0 || upsert.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2">
            {upsert.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
            Save Budget
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type MainTab = 'expenses' | 'budgets';

export default function ExpensesPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [mainTab, setMainTab] = useState<MainTab>('expenses');
  const [showAdd, setShowAdd] = useState(false);
  const [period, setPeriod] = useState<'today' | 'week' | 'month' | 'year'>('month');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [showBudgetModal, setShowBudgetModal] = useState(false);
  const [editBudget, setEditBudget] = useState<BudgetRow | undefined>();

  const now = new Date();
  const [budgetMonth, setBudgetMonth] = useState(now.getMonth() + 1);
  const [budgetYear, setBudgetYear] = useState(now.getFullYear());

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';
  const userId = user?.id ?? '';
  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const { start, end } = dateRangeForPeriod(period);

  const { data: expenses = [], isLoading, refetch } = useQuery<Expense[]>({
    queryKey: ['expenses', businessId, start, end, categoryFilter, statusFilter],
    queryFn: () => {
      let url = `/expenses?businessId=${businessId}&startDate=${start}&endDate=${end}`;
      if (categoryFilter !== 'ALL') url += `&category=${categoryFilter}`;
      if (statusFilter !== 'ALL') url += `&approvalStatus=${statusFilter}`;
      return api.get<Expense[]>(url);
    },
    enabled: !!businessId,
  });

  const { data: categorySummary = [] } = useQuery<CategorySummary[]>({
    queryKey: ['expenses-by-category', businessId, start, end],
    queryFn: () =>
      api.get<CategorySummary[]>(
        `/expenses/summary/by-category?businessId=${businessId}&startDate=${start}&endDate=${end}`,
      ),
    enabled: !!businessId,
  });

  const { data: budgetVsActual = [], refetch: refetchBudgets } = useQuery<BudgetRow[]>({
    queryKey: ['budgets-vs-actual', businessId, budgetYear, budgetMonth],
    queryFn: () =>
      api.get<BudgetRow[]>(
        `/budgets/vs-actual?businessId=${businessId}&year=${budgetYear}&month=${budgetMonth}`,
      ),
    enabled: !!businessId && mainTab === 'budgets',
  });

  const deleteBudget = useMutation({
    mutationFn: (id: string) => api.delete(`/budgets/${id}?businessId=${businessId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['budgets-vs-actual'] }),
  });

  const approve = useMutation({
    mutationFn: (id: string) => api.patch(`/expenses/${id}/approve`, { approvedBy: userId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const reject = useMutation({
    mutationFn: (id: string) => api.patch(`/expenses/${id}/reject`, { approvedBy: userId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const totalCents = expenses.reduce((s, e) => s + e.amountCents, 0);
  const approvedCents = expenses.filter((e) => e.approvalStatus === 'APPROVED').reduce((s, e) => s + e.amountCents, 0);
  const pendingCount = expenses.filter((e) => e.approvalStatus === 'PENDING').length;
  const maxCategory = categorySummary.length > 0 ? Math.max(...categorySummary.map((c) => c.totalCents)) : 0;
  const categoriesWithoutBudget = CATEGORIES.filter((c) => !budgetVsActual.some((b) => b.category === c));

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Expenses</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {expenses.length} records • {fmt(totalCents)} total
              {pendingCount > 0 && (
                <span className="ml-2 bg-yellow-100 text-yellow-700 text-xs font-semibold px-2 py-0.5 rounded-full">
                  {pendingCount} pending approval
                </span>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void refetch()}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
              <RefreshCw className="w-5 h-5" />
            </button>
            {mainTab === 'expenses' && (
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                <Plus className="w-4 h-4" />
                Add Expense
              </button>
            )}
            {mainTab === 'budgets' && (
              <button onClick={() => { setEditBudget(undefined); setShowBudgetModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium">
                <Plus className="w-4 h-4" />
                Set Budget
              </button>
            )}
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex gap-1 mt-3">
          <button onClick={() => setMainTab('expenses')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mainTab === 'expenses' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            <TrendingDown className="w-4 h-4" />
            Expenses
          </button>
          <button onClick={() => setMainTab('budgets')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              mainTab === 'budgets' ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
            }`}>
            <Target className="w-4 h-4" />
            Budgets
          </button>
        </div>

        {/* Period tabs (only for expenses) */}
        {mainTab === 'expenses' && (
          <div className="flex gap-1 mt-2">
            {(['today', 'week', 'month', 'year'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p ? 'bg-gray-700 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}>
                {p.charAt(0).toUpperCase() + p.slice(1)}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── EXPENSES TAB ── */}
        {mainTab === 'expenses' && (
          <>
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 uppercase">Total</p>
                  <TrendingDown className="w-4 h-4 text-red-400" />
                </div>
                <p className="text-xl font-bold text-gray-800">{fmt(totalCents)}</p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 uppercase">Approved</p>
                  <CheckCircle className="w-4 h-4 text-green-500" />
                </div>
                <p className="text-xl font-bold text-green-700">{fmt(approvedCents)}</p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 uppercase">Pending</p>
                  <Clock className="w-4 h-4 text-yellow-500" />
                </div>
                <p className="text-xl font-bold text-yellow-600">{pendingCount}</p>
              </div>
              <div className="bg-white rounded-xl border p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-gray-500 uppercase">Count</p>
                  <DollarSign className="w-4 h-4 text-blue-400" />
                </div>
                <p className="text-xl font-bold text-gray-800">{expenses.length}</p>
              </div>
            </div>

            {/* Category breakdown */}
            {categorySummary.length > 0 && (
              <div className="bg-white rounded-2xl border shadow-sm p-5">
                <h2 className="font-bold text-gray-800 mb-4">Spending by Category</h2>
                <div className="space-y-3">
                  {categorySummary
                    .sort((a, b) => b.totalCents - a.totalCents)
                    .map((cat, idx) => (
                      <div key={cat.category}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700">{cat.category}</span>
                          <span className="text-gray-600 font-semibold">{fmt(cat.totalCents)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}`}
                            style={{ width: `${Math.round((cat.totalCents / maxCategory) * 100)}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-400 mt-0.5">{cat.count} transactions</div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex gap-3 flex-wrap">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400" />
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                  className="border rounded-xl px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 bg-white">
                  <option value="ALL">All Categories</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="border rounded-xl px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 bg-white">
                <option value="ALL">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            {/* Expenses list */}
            {isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-20">
                <DollarSign className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium text-lg">No expenses found</p>
                <button onClick={() => setShowAdd(true)}
                  className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium">
                  Add First Expense
                </button>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Date</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Category</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Description</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Method</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Amount</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                      {isManager && (
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Actions</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {expenses.map((expense) => (
                      <tr key={expense.id} className="border-t hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="text-sm font-medium text-gray-800">
                            {new Date(expense.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })}
                          </div>
                          {expense.isRecurring && (
                            <div className="text-xs text-purple-600 mt-0.5">↻ Recurring</div>
                          )}
                        </td>
                        <td className="px-4 py-4">
                          <span className="text-sm font-medium text-gray-800">{expense.category}</span>
                        </td>
                        <td className="px-4 py-4 hidden md:table-cell">
                          <p className="text-sm text-gray-600 truncate max-w-xs">{expense.description}</p>
                        </td>
                        <td className="px-4 py-4 hidden sm:table-cell">
                          <span className="text-sm text-gray-600">{expense.paidBy}</span>
                        </td>
                        <td className="px-4 py-4 text-right">
                          <span className="font-bold text-gray-800">{fmt(expense.amountCents)}</span>
                        </td>
                        <td className="px-4 py-4 text-center">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[expense.approvalStatus]}`}>
                            {expense.approvalStatus}
                          </span>
                        </td>
                        {isManager && (
                          <td className="px-4 py-4 text-center">
                            {expense.approvalStatus === 'PENDING' && (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => approve.mutate(expense.id)}
                                  disabled={approve.isPending}
                                  title="Approve"
                                  className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                                >
                                  <CheckCircle className="w-5 h-5" />
                                </button>
                                <button
                                  onClick={() => reject.mutate(expense.id)}
                                  disabled={reject.isPending}
                                  title="Reject"
                                  className="p-1.5 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
                                >
                                  <XCircle className="w-5 h-5" />
                                </button>
                              </div>
                            )}
                            {expense.approvalStatus !== 'PENDING' && (
                              <span className="text-xs text-gray-400">
                                {expense.approvedBy ? `by ${expense.approvedBy.slice(0, 8)}` : '—'}
                              </span>
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── BUDGETS TAB ── */}
        {mainTab === 'budgets' && (
          <>
            {/* Month/Year selector */}
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Month</label>
                <select value={budgetMonth} onChange={(e) => setBudgetMonth(Number(e.target.value))}
                  className="border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white">
                  {MONTH_NAMES.slice(1).map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 uppercase mb-1">Year</label>
                <select value={budgetYear} onChange={(e) => setBudgetYear(Number(e.target.value))}
                  className="border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white">
                  {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {budgetVsActual.length === 0 ? (
              <div className="text-center py-20">
                <Target className="w-16 h-16 mx-auto text-gray-200 mb-4" />
                <p className="text-gray-500 font-medium text-lg">
                  No budgets set for {MONTH_NAMES[budgetMonth]} {budgetYear}
                </p>
                <p className="text-sm text-gray-400 mt-1">Set category budgets to track your spending</p>
                <button onClick={() => { setEditBudget(undefined); setShowBudgetModal(true); }}
                  className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium">
                  Set First Budget
                </button>
              </div>
            ) : (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Total Budget</p>
                    <p className="text-xl font-bold text-blue-600">
                      {fmt(budgetVsActual.reduce((s, b) => s + b.amountCents, 0))}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Total Spent</p>
                    <p className="text-xl font-bold text-gray-800">
                      {fmt(budgetVsActual.reduce((s, b) => s + (b.actualCents ?? 0), 0))}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Remaining</p>
                    <p className={`text-xl font-bold ${
                      budgetVsActual.reduce((s, b) => s + (b.varianceCents ?? 0), 0) >= 0
                        ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {fmt(budgetVsActual.reduce((s, b) => s + (b.varianceCents ?? 0), 0))}
                    </p>
                  </div>
                </div>

                {/* Budget vs Actual cards */}
                <div className="space-y-3">
                  {budgetVsActual.map((b) => {
                    const pct = b.pctUsed ?? 0;
                    const over = pct > 100;
                    return (
                      <div key={b.id} className="bg-white rounded-2xl border p-5">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-800">{b.category}</h3>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-bold ${over ? 'text-red-600' : 'text-gray-600'}`}>
                              {pct}%
                            </span>
                            <button
                              onClick={() => { setEditBudget(b); setShowBudgetModal(true); }}
                              className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                              title="Edit budget"
                            >
                              <Target className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteBudget.mutate(b.id)}
                              disabled={deleteBudget.isPending}
                              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                              title="Delete budget"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm mb-2">
                          <div>
                            <span className="text-gray-500">Spent: </span>
                            <span className="font-semibold text-gray-800">{fmt(b.actualCents ?? 0)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500">Budget: </span>
                            <span className="font-semibold text-gray-800">{fmt(b.amountCents)}</span>
                          </div>
                        </div>

                        <div className="h-3 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${
                              over ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>

                        {over ? (
                          <p className="text-xs text-red-600 font-semibold mt-1 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Over budget by {fmt(Math.abs(b.varianceCents ?? 0))}
                          </p>
                        ) : (
                          <p className="text-xs text-green-600 mt-1">
                            {fmt(b.varianceCents ?? 0)} remaining
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Quick add for remaining categories */}
                {categoriesWithoutBudget.length > 0 && (
                  <div className="bg-gray-50 rounded-2xl border border-dashed border-gray-300 p-5">
                    <p className="text-sm font-medium text-gray-600 mb-3">Categories without budgets:</p>
                    <div className="flex flex-wrap gap-2">
                      {categoriesWithoutBudget.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => { setEditBudget(undefined); setShowBudgetModal(true); }}
                          className="px-3 py-1.5 text-sm bg-white border rounded-lg text-gray-600 hover:border-blue-400 hover:text-blue-600 transition-colors"
                        >
                          + {cat}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      {/* Modals */}
      {showAdd && (
        <AddExpenseModal
          businessId={businessId}
          storeId={storeId}
          userId={userId}
          onClose={() => setShowAdd(false)}
          onSuccess={() => void refetch()}
        />
      )}

      {showBudgetModal && (
        <SetBudgetModal
          businessId={businessId}
          month={budgetMonth}
          year={budgetYear}
          existing={editBudget}
          onClose={() => { setShowBudgetModal(false); setEditBudget(undefined); }}
          onSuccess={() => void refetchBudgets()}
        />
      )}
    </div>
  );
}

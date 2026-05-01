import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, DollarSign, CheckCircle, XCircle, Clock, Filter,
  X, Loader2, AlertCircle, TrendingDown, RefreshCw, Target, Trash2,
  FileText, ShieldCheck, Users, Download,
} from 'lucide-react';
import { api, openPdfReport } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ApprovalStep {
  id: string;
  level: number;
  approverId: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  comment?: string;
  actionAt?: string;
}

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
  vatReclaimable?: boolean;
  vatAmountCents?: number;
  createdAt: string;
  approvalSteps?: ApprovalStep[];
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

interface VATReclaimSummary {
  count: number;
  totalCents: number;
  vatCents: number;
  expenses: Expense[];
}

interface BusinessUser {
  id: string;
  name: string;
  role: string;
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
  PENDING: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
  APPROVED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  REJECTED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
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

function downloadCsv(filename: string, rows: string[][]): void {
  const content = rows
    .map((row) => row.map((cell) => {
      const s = String(cell ?? '');
      return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(','))
    .join('\r\n');
  const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
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
    receiptPhotoUrl: '',
    vatReclaimable: false,
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
        receiptPhotoUrl: form.receiptPhotoUrl || undefined,
        vatReclaimable: form.vatReclaimable,
        vatAmountCents: form.vatReclaimable
          ? Math.round(Math.round(parseFloat(form.amountStr || '0') * 100) * 16 / 116)
          : 0,
      }),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed to save expense'),
  });

  const amountCents = Math.round(parseFloat(form.amountStr || '0') * 100);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add Expense</h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Amount (KES) *</label>
            <input
              type="number" min={0} step={0.01} value={form.amountStr}
              onChange={(e) => setForm({ ...form, amountStr: e.target.value })}
              placeholder="0.00"
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-4 py-3 text-xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Category *</label>
              <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Payment Method *</label>
              <select value={form.paidBy} onChange={(e) => setForm({ ...form, paidBy: e.target.value })}
                className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
                {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Description *</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="What was this expense for?" rows={2}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none resize-none" />
          </div>

          {/* VAT Reclaimable toggle */}
          <label className="flex items-center gap-3 cursor-pointer p-3 rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-900/20">
            <input type="checkbox" checked={form.vatReclaimable}
              onChange={(e) => setForm({ ...form, vatReclaimable: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-green-600" />
            <div>
              <span className="text-sm font-semibold text-green-800 dark:text-green-300">VAT Reclaimable</span>
              {form.vatReclaimable && amountCents > 0 && (
                <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                  Estimated input VAT: KES {(Math.round(amountCents * 16 / 116) / 100).toFixed(2)}
                </p>
              )}
            </div>
          </label>

          <label className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={form.isRecurring}
              onChange={(e) => setForm({ ...form, isRecurring: e.target.checked })}
              className="w-4 h-4 rounded border-gray-300 text-blue-600" />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">This is a recurring expense</span>
          </label>

          {form.isRecurring && (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Recurring Day of Month</label>
              <input type="number" min={1} max={28} value={form.recurringDay}
                onChange={(e) => setForm({ ...form, recurringDay: parseInt(e.target.value) || 1 })}
                className="w-32 border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none" />
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Receipt Photo</label>
            <div className="mt-1 flex items-center gap-3">
              <input
                type="file"
                accept="image/*"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  const formData = new FormData();
                  formData.append('file', file);
                  try {
                    const res = await fetch('/api/v1/expenses/upload-receipt', {
                      method: 'POST',
                      body: formData,
                      headers: { Authorization: `Bearer ${sessionStorage.getItem('pos-access-token')}` },
                    });
                    const data = await res.json();
                    setForm((f) => ({ ...f, receiptPhotoUrl: data.url ?? '' }));
                  } catch { /* ignore upload errors */ }
                }}
                className="text-sm text-gray-600 dark:text-gray-400"
              />
              {form.receiptPhotoUrl && (
                <img src={form.receiptPhotoUrl} alt="Receipt" className="h-12 w-12 object-cover rounded-xl border border-gray-200 dark:border-gray-600" />
              )}
            </div>
          </div>
        </div>

        <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold transition-colors">
            Cancel
          </button>
          <button onClick={() => create.mutate()}
            disabled={!form.amountStr || amountCents <= 0 || !form.description || create.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2 transition-colors">
            {create.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Plus className="w-5 h-5" />}
            Add Expense
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Request Approval Modal ───────────────────────────────────────────────────

interface RequestApprovalModalProps {
  expense: Expense;
  businessId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function RequestApprovalModal({ expense, businessId, onClose, onSuccess }: RequestApprovalModalProps) {
  const [approver1, setApprover1] = useState('');
  const [approver2, setApprover2] = useState('');
  const [error, setError] = useState('');

  const { data: users = [] } = useQuery<BusinessUser[]>({
    queryKey: ['business-users-approval', businessId],
    queryFn: () => api.get<BusinessUser[]>(`/business/${businessId}/users`),
    enabled: !!businessId,
  });

  const managers = users.filter(u => u.role === 'MANAGER' || u.role === 'OWNER');

  const submit = useMutation({
    mutationFn: async () => {
      if (!approver1) throw new Error('Select at least one approver');
      await api.post(`/expenses/${expense.id}/request-approval`, { approverId: approver1, level: 1 });
      if (approver2) {
        await api.post(`/expenses/${expense.id}/request-approval`, { approverId: approver2, level: 2 });
      }
    },
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-blue-500" />
            Request Approval
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 rounded-xl text-sm">{error}</div>}
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Expense: <strong className="text-gray-800 dark:text-white">{fmt(expense.amountCents)} – {expense.category}</strong>
          </p>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Level 1 Approver *</label>
            <select value={approver1} onChange={e => setApprover1(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">Select manager...</option>
              {managers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Level 2 Approver (optional)</label>
            <select value={approver2} onChange={e => setApprover2(e.target.value)}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none">
              <option value="">None</option>
              {managers.filter(u => u.id !== approver1).map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 font-semibold">Cancel</button>
          <button onClick={() => submit.mutate()} disabled={!approver1 || submit.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2">
            {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
            Submit
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
  initialCategory?: string;
  onClose: () => void;
  onSuccess: () => void;
}

function SetBudgetModal({ businessId, month, year, existing, initialCategory, onClose, onSuccess }: SetBudgetModalProps) {
  const [form, setForm] = useState({
    category: existing?.category ?? initialCategory ?? 'Rent',
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-700">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {existing ? 'Edit' : 'Set'} Budget
          </h2>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">{error}</div>
          )}
          <p className="text-sm text-gray-500 dark:text-gray-400 font-semibold">
            {MONTH_NAMES[month]} {year}
          </p>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Category *</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              disabled={!!existing}
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none disabled:bg-gray-50 dark:disabled:bg-gray-600">
              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">Budget Amount (KES) *</label>
            <input
              type="number" min={0} step={0.01} value={form.amountStr}
              onChange={(e) => setForm({ ...form, amountStr: e.target.value })}
              placeholder="0.00"
              className="w-full border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-xl px-4 py-3 text-xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              autoFocus
            />
          </div>
        </div>
        <div className="border-t border-gray-100 dark:border-gray-700 px-6 py-4 flex gap-3">
          <button onClick={onClose}
            className="flex-1 py-2.5 border border-gray-200 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-semibold transition-colors">
            Cancel
          </button>
          <button onClick={() => upsert.mutate()}
            disabled={!form.amountStr || parseFloat(form.amountStr) <= 0 || upsert.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2 transition-colors">
            {upsert.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Target className="w-4 h-4" />}
            Save Budget
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type MainTab = 'expenses' | 'budgets' | 'vat-reclaim';

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
  const [preselectedCategory, setPreselectedCategory] = useState<string | undefined>();
  const [approvalExpense, setApprovalExpense] = useState<Expense | null>(null);

  const now = new Date();
  const [budgetMonth, setBudgetMonth] = useState(now.getMonth() + 1);
  const [budgetYear, setBudgetYear] = useState(now.getFullYear());
  const [vatMonth, setVatMonth] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';
  const userId = user?.id ?? '';
  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const { start, end } = dateRangeForPeriod(period);

  const isCashier = user?.role === 'CASHIER' || user?.role === 'WAITER';

  const { data: expenses = [], isLoading, refetch } = useQuery<Expense[]>({
    queryKey: ['expenses', businessId, start, end, categoryFilter, statusFilter, isCashier ? userId : ''],
    queryFn: () => {
      let url = `/expenses?businessId=${businessId}&startDate=${start}&endDate=${end}`;
      if (categoryFilter !== 'ALL') url += `&category=${categoryFilter}`;
      if (statusFilter !== 'ALL') url += `&approvalStatus=${statusFilter}`;
      // Cashiers only see their own expenses
      if (isCashier && userId) url += `&submittedBy=${encodeURIComponent(userId)}`;
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

  // VAT reclaim start/end from vatMonth
  const [vatY, vatM] = vatMonth.split('-').map(Number);
  const vatStart = `${vatMonth}-01`;
  const vatEnd = new Date(vatY, vatM, 0).toISOString().split('T')[0];

  const { data: vatReclaim, isLoading: vatLoading } = useQuery<VATReclaimSummary>({
    queryKey: ['vat-reclaim', businessId, vatMonth],
    queryFn: () =>
      api.get<VATReclaimSummary>(
        `/expenses/vat-reclaim?businessId=${businessId}&startDate=${vatStart}&endDate=${vatEnd}`,
      ),
    enabled: !!businessId && mainTab === 'vat-reclaim',
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

  const approveStep = useMutation({
    mutationFn: ({ stepId, comment }: { stepId: string; comment?: string }) =>
      api.patch(`/expenses/approval-steps/${stepId}/approve`, { comment }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const rejectStep = useMutation({
    mutationFn: ({ stepId, comment }: { stepId: string; comment: string }) =>
      api.patch(`/expenses/approval-steps/${stepId}/reject`, { comment }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['expenses'] }),
  });

  const totalCents = expenses.reduce((s, e) => s + e.amountCents, 0);
  const approvedCents = expenses.filter((e) => e.approvalStatus === 'APPROVED').reduce((s, e) => s + e.amountCents, 0);
  const pendingCount = expenses.filter((e) => e.approvalStatus === 'PENDING').length;
  const vatBadgeCount = expenses.filter((e) => e.vatReclaimable).length;
  const maxCategory = categorySummary.length > 0 ? Math.max(...categorySummary.map((c) => c.totalCents)) : 0;
  const categoriesWithoutBudget = CATEGORIES.filter((c) => !budgetVsActual.some((b) => b.category === c));

  // My pending approval steps
  const myPendingSteps = expenses.flatMap(e =>
    (e.approvalSteps ?? [])
      .filter(s => s.approverId === userId && s.status === 'PENDING')
      .map(s => ({ ...s, expense: e }))
  );

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 dark:bg-red-900/30 flex items-center justify-center">
              <TrendingDown className="w-5 h-5 text-red-500 dark:text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Expenses</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5 flex items-center gap-2">
                <span>{expenses.length} records &bull; {fmt(totalCents)} total</span>
                {pendingCount > 0 && (
                  <span className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400 text-xs font-semibold px-2 py-0.5 rounded-full">
                    {pendingCount} pending approval
                  </span>
                )}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => void refetch()}
              className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
              <RefreshCw className="w-5 h-5" />
            </button>
            {mainTab === 'expenses' && (
              <button onClick={() => setShowAdd(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors">
                <Plus className="w-4 h-4" />
                Add Expense
              </button>
            )}
            {mainTab === 'budgets' && (
              <button onClick={() => { setEditBudget(undefined); setShowBudgetModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm shadow-sm transition-colors">
                <Plus className="w-4 h-4" />
                Set Budget
              </button>
            )}
          </div>
        </div>

        {/* Main tabs */}
        <div className="flex gap-1 mt-3 bg-gray-100 dark:bg-gray-700/50 rounded-xl p-1 w-fit">
          <button onClick={() => setMainTab('expenses')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mainTab === 'expenses'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            <TrendingDown className="w-4 h-4" />
            Expenses
          </button>
          <button onClick={() => setMainTab('budgets')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mainTab === 'budgets'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            <Target className="w-4 h-4" />
            Budgets
          </button>
          <button onClick={() => setMainTab('vat-reclaim')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
              mainTab === 'vat-reclaim'
                ? 'bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}>
            <ShieldCheck className="w-4 h-4" />
            VAT Reclaim
            {vatBadgeCount > 0 && (
              <span className="bg-green-100 dark:bg-green-900/40 text-green-700 dark:text-green-400 text-xs px-1.5 py-0.5 rounded-full">
                {vatBadgeCount}
              </span>
            )}
          </button>
        </div>

        {/* Period tabs (only for expenses) */}
        {mainTab === 'expenses' && (
          <div className="flex gap-1 mt-2">
            {(['today', 'week', 'month', 'year'] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-4 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  period === p
                    ? 'bg-gray-800 dark:bg-gray-200 text-white dark:text-gray-900'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
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
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
              <div className="bg-red-50 dark:bg-red-900/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total</p>
                  <TrendingDown className="w-4 h-4 text-red-500 dark:text-red-400" />
                </div>
                <p className="text-xl font-bold text-red-700 dark:text-red-400">{fmt(totalCents)}</p>
              </div>
              <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Approved</p>
                  <CheckCircle className="w-4 h-4 text-green-500 dark:text-green-400" />
                </div>
                <p className="text-xl font-bold text-green-700 dark:text-green-400">{fmt(approvedCents)}</p>
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Pending</p>
                  <Clock className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
                </div>
                <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{pendingCount}</p>
              </div>
              <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Count</p>
                  <DollarSign className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                </div>
                <p className="text-xl font-bold text-blue-700 dark:text-blue-400">{expenses.length}</p>
              </div>
              <div className="bg-emerald-50 dark:bg-emerald-900/20 rounded-xl p-4 cursor-pointer hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors" onClick={() => setMainTab('vat-reclaim')}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">VAT Reclaim</p>
                  <ShieldCheck className="w-4 h-4 text-emerald-500 dark:text-emerald-400" />
                </div>
                <p className="text-xl font-bold text-emerald-700 dark:text-emerald-400">
                  {fmt(expenses.filter(e => e.vatReclaimable && e.approvalStatus === 'APPROVED').reduce((s, e) => s + Math.round(e.amountCents * 16 / 116), 0))}
                </p>
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">{vatBadgeCount} reclaimable</p>
              </div>
            </div>

            {/* My pending approval steps */}
            {myPendingSteps.length > 0 && (
              <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-2xl p-5">
                <h2 className="font-bold text-purple-800 dark:text-purple-300 mb-3 flex items-center gap-2">
                  <Users className="w-5 h-5" />
                  Pending Your Approval ({myPendingSteps.length})
                </h2>
                <div className="space-y-2">
                  {myPendingSteps.map(({ id, level, expense }) => (
                    <div key={id} className="flex items-center justify-between bg-white dark:bg-gray-800 rounded-xl px-4 py-3 border border-purple-100 dark:border-purple-700">
                      <div>
                        <p className="font-semibold text-gray-800 dark:text-white text-sm">{expense.category} — {fmt(expense.amountCents)}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">{expense.description} &bull; Level {level} approval</p>
                      </div>
                      <div className="flex gap-2">
                        <button onClick={() => approveStep.mutate({ stepId: id })} disabled={approveStep.isPending}
                          className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg">
                          <CheckCircle className="w-5 h-5" />
                        </button>
                        <button onClick={() => rejectStep.mutate({ stepId: id, comment: 'Rejected' })} disabled={rejectStep.isPending}
                          className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                          <XCircle className="w-5 h-5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Category breakdown */}
            {categorySummary.length > 0 && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <h2 className="font-bold text-gray-800 dark:text-white mb-4">Spending by Category</h2>
                <div className="space-y-3">
                  {categorySummary
                    .sort((a, b) => b.totalCents - a.totalCents)
                    .map((cat, idx) => (
                      <div key={cat.category}>
                        <div className="flex items-center justify-between text-sm mb-1">
                          <span className="font-medium text-gray-700 dark:text-gray-300">{cat.category}</span>
                          <span className="text-gray-800 dark:text-gray-200 font-semibold">{fmt(cat.totalCents)}</span>
                        </div>
                        <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${CATEGORY_COLORS[idx % CATEGORY_COLORS.length]}`}
                            style={{ width: `${Math.round((cat.totalCents / maxCategory) * 100)}%` }}
                          />
                        </div>
                        <div className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{cat.count} transactions</div>
                      </div>
                    ))}
                </div>
              </div>
            )}

            {/* Filters */}
            <div className="flex gap-3 flex-wrap items-center">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <select value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)}
                  className="border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none">
                  <option value="ALL">All Categories</option>
                  {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
                className="border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none">
                <option value="ALL">All Status</option>
                <option value="PENDING">Pending</option>
                <option value="APPROVED">Approved</option>
                <option value="REJECTED">Rejected</option>
              </select>
            </div>

            {/* Expenses list */}
            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
                <p className="text-sm text-gray-400 dark:text-gray-500">Loading expenses...</p>
              </div>
            ) : expenses.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <DollarSign className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-gray-600 dark:text-gray-300 font-semibold text-lg">No expenses found</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Try adjusting filters or add a new expense</p>
                <button onClick={() => setShowAdd(true)}
                  className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors">
                  Add First Expense
                </button>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                    <tr>
                      <th className="text-left px-6 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Date</th>
                      <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Category</th>
                      <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">Description</th>
                      <th className="text-left px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Method</th>
                      <th className="text-right px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Amount</th>
                      <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Status</th>
                      <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Chain</th>
                      <th className="text-center px-4 py-3.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {expenses.map((expense) => {
                      const steps = expense.approvalSteps ?? [];
                      const approvedSteps = steps.filter(s => s.status === 'APPROVED').length;
                      return (
                        <tr key={expense.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                          <td className="px-6 py-4">
                            <div className="text-sm font-medium text-gray-800 dark:text-gray-200">
                              {new Date(expense.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })}
                            </div>
                            {expense.isRecurring && (
                              <div className="text-xs text-purple-600 dark:text-purple-400 mt-0.5">&#8635; Recurring</div>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">{expense.category}</span>
                              {expense.vatReclaimable && (
                                <span className="text-xs bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 px-1.5 py-0.5 rounded font-bold">VAT</span>
                              )}
                            </div>
                          </td>
                          <td className="px-4 py-4 hidden md:table-cell">
                            <p className="text-sm text-gray-600 dark:text-gray-400 truncate max-w-xs">{expense.description}</p>
                          </td>
                          <td className="px-4 py-4 hidden sm:table-cell">
                            <span className="text-sm text-gray-600 dark:text-gray-400">{expense.paidBy}</span>
                          </td>
                          <td className="px-4 py-4 text-right">
                            <span className="font-bold text-gray-900 dark:text-white">{fmt(expense.amountCents)}</span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${STATUS_STYLES[expense.approvalStatus]}`}>
                              {expense.approvalStatus}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-center">
                            {steps.length > 0 ? (
                              <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                                {approvedSteps}/{steps.length} steps
                              </span>
                            ) : (
                              <span className="text-xs text-gray-300 dark:text-gray-600">—</span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <div className="flex items-center justify-center gap-1">
                              {isManager && expense.approvalStatus === 'PENDING' && (
                                <>
                                  <button onClick={() => approve.mutate(expense.id)} disabled={approve.isPending}
                                    title="Approve" className="p-1.5 text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20 rounded-lg">
                                    <CheckCircle className="w-4 h-4" />
                                  </button>
                                  <button onClick={() => reject.mutate(expense.id)} disabled={reject.isPending}
                                    title="Reject" className="p-1.5 text-red-500 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg">
                                    <XCircle className="w-4 h-4" />
                                  </button>
                                </>
                              )}
                              {!isManager && expense.approvalStatus === 'PENDING' && (
                                <button onClick={() => setApprovalExpense(expense)}
                                  title="Request multi-level approval"
                                  className="p-1.5 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg">
                                  <ShieldCheck className="w-4 h-4" />
                                </button>
                              )}
                              {/* PDF download */}
                              <button
                                onClick={() => openPdfReport(`/reports/pdf/expense-report?employeeId=${expense.submittedBy}&month=${new Date(expense.createdAt).toISOString().slice(0,7)}`)}
                                title="Download PDF report"
                                className="p-1.5 text-gray-400 dark:text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700/50 rounded-lg">
                                <FileText className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
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
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Month</label>
                <select value={budgetMonth} onChange={(e) => setBudgetMonth(Number(e.target.value))}
                  className="border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none">
                  {MONTH_NAMES.slice(1).map((m, i) => (
                    <option key={i + 1} value={i + 1}>{m}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Year</label>
                <select value={budgetYear} onChange={(e) => setBudgetYear(Number(e.target.value))}
                  className="border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white outline-none">
                  {[now.getFullYear() - 1, now.getFullYear(), now.getFullYear() + 1].map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>
            </div>

            {budgetVsActual.length === 0 ? (
              <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
                <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
                  <Target className="w-8 h-8 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-gray-600 dark:text-gray-300 font-semibold text-lg">
                  No budgets set for {MONTH_NAMES[budgetMonth]} {budgetYear}
                </p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Set category budgets to track your spending</p>
                <button onClick={() => { setEditBudget(undefined); setShowBudgetModal(true); }}
                  className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold text-sm transition-colors">
                  Set First Budget
                </button>
              </div>
            ) : (
              <>
                {/* Summary stats */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Total Budget</p>
                    <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                      {fmt(budgetVsActual.reduce((s, b) => s + b.amountCents, 0))}
                    </p>
                  </div>
                  <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Total Spent</p>
                    <p className="text-xl font-bold text-gray-800 dark:text-white">
                      {fmt(budgetVsActual.reduce((s, b) => s + (b.actualCents ?? 0), 0))}
                    </p>
                  </div>
                  <div className={`rounded-xl p-4 ${
                    budgetVsActual.reduce((s, b) => s + (b.varianceCents ?? 0), 0) >= 0
                      ? 'bg-green-50 dark:bg-green-900/20'
                      : 'bg-red-50 dark:bg-red-900/20'
                  }`}>
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Remaining</p>
                    <p className={`text-xl font-bold ${
                      budgetVsActual.reduce((s, b) => s + (b.varianceCents ?? 0), 0) >= 0
                        ? 'text-green-600 dark:text-green-400'
                        : 'text-red-600 dark:text-red-400'
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
                      <div key={b.id} className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 p-5 shadow-sm">
                        <div className="flex items-center justify-between mb-3">
                          <h3 className="font-semibold text-gray-800 dark:text-white">{b.category}</h3>
                          <div className="flex items-center gap-1">
                            <span className={`text-sm font-bold ${over ? 'text-red-600 dark:text-red-400' : 'text-gray-600 dark:text-gray-300'}`}>
                              {pct}%
                            </span>
                            <button
                              onClick={() => { setEditBudget(b); setShowBudgetModal(true); }}
                              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                              title="Edit budget"
                            >
                              <Target className="w-4 h-4" />
                            </button>
                            <button
                              onClick={() => deleteBudget.mutate(b.id)}
                              disabled={deleteBudget.isPending}
                              className="p-1.5 text-gray-400 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                              title="Delete budget"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        <div className="flex items-center justify-between text-sm mb-2">
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Spent: </span>
                            <span className="font-semibold text-gray-800 dark:text-white">{fmt(b.actualCents ?? 0)}</span>
                          </div>
                          <div>
                            <span className="text-gray-500 dark:text-gray-400">Budget: </span>
                            <span className="font-semibold text-gray-800 dark:text-white">{fmt(b.amountCents)}</span>
                          </div>
                        </div>

                        <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              over ? 'bg-red-500' : pct > 80 ? 'bg-yellow-500' : 'bg-green-500'
                            }`}
                            style={{ width: `${Math.min(pct, 100)}%` }}
                          />
                        </div>

                        {over ? (
                          <p className="text-xs text-red-600 dark:text-red-400 font-semibold mt-1.5 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Over budget by {fmt(Math.abs(b.varianceCents ?? 0))}
                          </p>
                        ) : (
                          <p className="text-xs text-green-600 dark:text-green-400 mt-1.5 font-medium">
                            {fmt(b.varianceCents ?? 0)} remaining
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Quick add for remaining categories */}
                {categoriesWithoutBudget.length > 0 && (
                  <div className="bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-dashed border-gray-300 dark:border-gray-600 p-5">
                    <p className="text-sm font-semibold text-gray-600 dark:text-gray-300 mb-3">Categories without budgets:</p>
                    <div className="flex flex-wrap gap-2">
                      {categoriesWithoutBudget.map((cat) => (
                        <button
                          key={cat}
                          onClick={() => { setEditBudget(undefined); setPreselectedCategory(cat); setShowBudgetModal(true); }}
                          className="px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-lg text-gray-600 dark:text-gray-300 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
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

        {/* ── VAT RECLAIM TAB ── */}
        {mainTab === 'vat-reclaim' && (
          <>
            {/* Month picker */}
            <div className="flex items-center gap-3 flex-wrap">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Month</label>
                <input type="month" value={vatMonth} onChange={e => setVatMonth(e.target.value)}
                  className="border border-gray-200 dark:border-gray-600 rounded-xl px-3 py-2 text-sm bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 outline-none" />
              </div>
            </div>

            {vatLoading ? (
              <div className="flex items-center justify-center py-20 gap-3">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : vatReclaim ? (
              <>
                {/* Summary cards */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="bg-green-50 dark:bg-green-900/20 rounded-xl p-5">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Eligible Expenses</p>
                    <p className="text-2xl font-bold text-green-700 dark:text-green-400">{vatReclaim.count}</p>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-5">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Total VAT-Reclaimable</p>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{fmt(vatReclaim.totalCents)}</p>
                  </div>
                  <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-5">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Input VAT (16/116)</p>
                    <p className="text-2xl font-bold text-purple-700 dark:text-purple-400">{fmt(vatReclaim.vatCents)}</p>
                  </div>
                </div>

                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
                  <div className="px-5 py-4 border-b border-gray-100 dark:border-gray-700 flex items-center justify-between">
                    <div>
                      <h2 className="font-bold text-gray-800 dark:text-white">VAT Reclaim Summary — {vatMonth}</h2>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Approved expenses with VAT reclaimable flag</p>
                    </div>
                    <button
                      onClick={() => {
                        if (!vatReclaim.expenses.length) return;
                        downloadCsv(`vat-reclaim-${vatMonth}.csv`, [
                          ['Date', 'Category', 'Description', 'Gross Amount (KES)', 'Input VAT (KES)', 'Method'],
                          ...vatReclaim.expenses.map(e => [
                            new Date(e.createdAt).toLocaleDateString('en-KE'),
                            e.category,
                            e.description,
                            (e.amountCents / 100).toFixed(2),
                            (Math.round(e.amountCents * 16 / 116) / 100).toFixed(2),
                            e.paidBy,
                          ]),
                          ['', '', 'TOTAL', (vatReclaim.totalCents / 100).toFixed(2), (vatReclaim.vatCents / 100).toFixed(2), ''],
                        ]);
                      }}
                      className="flex items-center gap-2 px-3 py-1.5 text-sm bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold">
                      <Download className="w-4 h-4" />
                      Export iTax CSV
                    </button>
                  </div>

                  {vatReclaim.expenses.length === 0 ? (
                    <div className="py-12 text-center text-gray-400 dark:text-gray-500">
                      <ShieldCheck className="w-10 h-10 mx-auto mb-3 opacity-40" />
                      <p className="font-medium">No VAT-reclaimable expenses for this period</p>
                      <p className="text-sm mt-1">Mark expenses as VAT Reclaimable when adding them</p>
                    </div>
                  ) : (
                    <table className="w-full">
                      <thead className="bg-gray-50 dark:bg-gray-700/50">
                        <tr>
                          <th className="text-left px-5 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Date</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Category</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase hidden md:table-cell">Description</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Gross</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase">Input VAT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {vatReclaim.expenses.map(e => (
                          <tr key={e.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                            <td className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300">
                              {new Date(e.createdAt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })}
                            </td>
                            <td className="px-4 py-3 text-sm font-medium text-gray-800 dark:text-white">{e.category}</td>
                            <td className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400 hidden md:table-cell truncate max-w-xs">{e.description}</td>
                            <td className="px-4 py-3 text-sm font-semibold text-gray-800 dark:text-white text-right">{fmt(e.amountCents)}</td>
                            <td className="px-4 py-3 text-sm font-bold text-green-600 dark:text-green-400 text-right">
                              {fmt(Math.round(e.amountCents * 16 / 116))}
                            </td>
                          </tr>
                        ))}
                        <tr className="bg-green-50 dark:bg-green-900/20 font-bold">
                          <td colSpan={3} className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300">TOTAL</td>
                          <td className="px-4 py-3 text-sm text-right text-gray-800 dark:text-white">{fmt(vatReclaim.totalCents)}</td>
                          <td className="px-4 py-3 text-sm text-right text-green-700 dark:text-green-400">{fmt(vatReclaim.vatCents)}</td>
                        </tr>
                      </tbody>
                    </table>
                  )}
                </div>

                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-700 dark:text-blue-300">
                  <strong>iTax Filing Note:</strong> Use the "Export iTax CSV" button to download a formatted file for your VAT return.
                  Input VAT is calculated as 16/116 of the gross (VAT-inclusive) expense amount.
                  File by the 20th of the following month via KRA iTax portal.
                </div>
              </>
            ) : null}
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
          initialCategory={preselectedCategory}
          onClose={() => { setShowBudgetModal(false); setEditBudget(undefined); setPreselectedCategory(undefined); }}
          onSuccess={() => void refetchBudgets()}
        />
      )}

      {approvalExpense && (
        <RequestApprovalModal
          expense={approvalExpense}
          businessId={businessId}
          onClose={() => setApprovalExpense(null)}
          onSuccess={() => void refetch()}
        />
      )}
    </div>
  );
}

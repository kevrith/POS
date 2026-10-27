import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, openPdfReport } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useDialog } from '../components/Dialog';
import { toast } from 'sonner';
import { Plus, Search, CreditCard, ChevronRight, X, DollarSign, Users, AlertTriangle, Star, Upload, FileText, GitMerge, TrendingUp, CheckCircle, ShieldCheck, Clock } from 'lucide-react';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  kraPin?: string;
  creditLimitCents: number;
  creditLimitPendingCents?: number;
  creditApprovalStatus?: 'NONE' | 'PENDING' | 'APPROVED' | 'REJECTED';
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

interface CsvRow {
  name: string;
  phone?: string;
  email?: string;
  creditLimit?: number;
}

interface RFMCustomer {
  id: string;
  name: string;
  phone?: string;
  recencyDays: number;
  frequency: number;
  monetaryCents: number;
  segment: string;
  rScore: number;
  fScore: number;
  mScore: number;
}

interface SegmentData {
  segments: Array<{ key: string; label: string; count: number }>;
  customers: RFMCustomer[];
}

interface DupeCustomer {
  id: string;
  name: string;
  phone: string;
  email: string;
  loyaltyPoints: number;
}

type ActiveTab = 'list' | 'segments' | 'credit-requests';

const blankForm = { name: '', phone: '', email: '', kraPin: '', creditLimitCents: 0 };

function formatKES(cents: number) {
  return `KES ${(cents / 100).toFixed(2)}`;
}

function formatDate(s: string) {
  return new Date(s).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.split('\n').filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase());
  const nameIdx = headers.indexOf('name');
  const phoneIdx = headers.indexOf('phone');
  const emailIdx = headers.indexOf('email');
  const creditIdx = headers.indexOf('credit_limit');

  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    return {
      name: nameIdx >= 0 ? cols[nameIdx] ?? '' : '',
      phone: phoneIdx >= 0 ? cols[phoneIdx] || undefined : undefined,
      email: emailIdx >= 0 ? cols[emailIdx] || undefined : undefined,
      creditLimit: creditIdx >= 0 && cols[creditIdx] ? Number(cols[creditIdx]) : undefined,
    };
  }).filter((r) => r.name);
}

const SEG_COLORS: Record<string, string> = {
  CHAMPIONS: 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300',
  LOYAL: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300',
  HIGH_VALUE: 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800 text-purple-700 dark:text-purple-300',
  NEW: 'bg-teal-50 dark:bg-teal-900/20 border-teal-200 dark:border-teal-800 text-teal-700 dark:text-teal-300',
  AT_RISK: 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800 text-orange-700 dark:text-orange-300',
  LOST: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300',
  PROMISING: 'bg-gray-50 dark:bg-gray-700/50 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300',
};

const SEG_BADGE: Record<string, string> = {
  CHAMPIONS: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
  LOYAL: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
  HIGH_VALUE: 'bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300',
  NEW: 'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300',
  AT_RISK: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
  LOST: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
  PROMISING: 'bg-gray-100 dark:bg-gray-600 text-gray-700 dark:text-gray-300',
};

const SEG_LABEL: Record<string, string> = {
  CHAMPIONS: 'Champions', LOYAL: 'Loyal', HIGH_VALUE: 'High Value',
  NEW: 'New', AT_RISK: 'At Risk', LOST: 'Lost', PROMISING: 'Promising',
};

export default function CustomersPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER';
  const { prompt } = useDialog();

  const [search, setSearch] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState(blankForm);
  const [editCustomer, setEditCustomer] = useState<Customer | null>(null);
  const [editForm, setEditForm] = useState({ name: '', phone: '', email: '', kraPin: '', creditLimitCents: 0 });
  const [selected, setSelected] = useState<Customer | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [activeTab, setActiveTab] = useState<ActiveTab>('list');
  const [segFilter, setSegFilter] = useState<string | null>(null);
  const [showDupes, setShowDupes] = useState(false);
  const [mergeSelections, setMergeSelections] = useState<Record<string, string>>({});
  const qc = useQueryClient();

  const [showImport, setShowImport] = useState(false);
  const [csvRows, setCsvRows] = useState<CsvRow[]>([]);
  const [importResult, setImportResult] = useState<{ created: number; skipped: number; errors: string[] } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showStatement, setShowStatement] = useState(false);
  const [statementCustomer, setStatementCustomer] = useState<Customer | null>(null);

  // Credit request state (cashier)
  const [showCreditRequest, setShowCreditRequest] = useState(false);
  const [creditRequestCustomer, setCreditRequestCustomer] = useState<Customer | null>(null);
  const [creditRequestAmount, setCreditRequestAmount] = useState('');
  const [creditRequestError, setCreditRequestError] = useState('');

  // Set credit limit state (manager/owner)
  const [showSetLimit, setShowSetLimit] = useState(false);
  const [setLimitCustomer, setSetLimitCustomer] = useState<Customer | null>(null);
  const [setLimitAmount, setSetLimitAmount] = useState('');
  const [setLimitError, setSetLimitError] = useState('');
  const today = new Date();
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
  const todayStr = today.toISOString().split('T')[0];
  const [stmtStart, setStmtStart] = useState(firstOfMonth);
  const [stmtEnd, setStmtEnd] = useState(todayStr);

  const { data: customers = [], isLoading } = useQuery({
    queryKey: ['customers', businessId, search],
    queryFn: () => api.get<Customer[]>(`/businesses/${businessId}/customers${search ? `?search=${encodeURIComponent(search)}` : ''}`),
    enabled: !!businessId,
  });

  const { data: segData } = useQuery<SegmentData>({
    queryKey: ['rfm-segments', businessId],
    queryFn: () => api.get<SegmentData>(`/businesses/${businessId}/customers/segmentation`),
    enabled: activeTab === 'segments' && !!businessId,
  });

  const [creditRequestStatus, setCreditRequestStatus] = useState<'PENDING'|'APPROVED'|'DECLINED'>('PENDING');
  const { data: creditRequests = [] } = useQuery<Array<{
    id: string; status: string; reason?: string; reviewNote?: string;
    currentLimitCents: number; requestedLimitCents: number; orderTotalCents: number; createdAt: string;
    customer: { id: string; name: string; shopCode?: string };
    requestedByUser: { name: string };
  }>>({
    queryKey: ['credit-requests', businessId, creditRequestStatus],
    queryFn: () => api.get(`/field-sales/credit-requests?businessId=${businessId}&status=${creditRequestStatus}`),
    enabled: activeTab === 'credit-requests' && !!businessId,
    refetchInterval: activeTab === 'credit-requests' ? 15000 : false,
  });
  const reviewCreditMutation = useMutation({
    mutationFn: ({ id, status, reviewNote }: { id: string; status: string; reviewNote?: string }) =>
      api.patch(`/field-sales/credit-requests/${id}/review`, { status, reviewNote }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['credit-requests'] }); },
    onError: () => toast.error('Failed to update credit request'),
  });

  const { data: dupes = [], refetch: refetchDupes } = useQuery<Array<{ type: string; customers: DupeCustomer[] }>>({
    queryKey: ['customer-duplicates', businessId],
    queryFn: () => api.get(`/businesses/${businessId}/customers/duplicates`),
    enabled: showDupes && !!businessId,
  });

  const mergeMutation = useMutation({
    mutationFn: ({ primaryId, secondaryId }: { primaryId: string; secondaryId: string }) =>
      api.post(`/businesses/${businessId}/customers/merge`, { primaryId, secondaryId }),
    onSuccess: () => { refetchDupes(); qc.invalidateQueries({ queryKey: ['customers'] }); setMergeSelections({}); },
  });

  const { data: detail } = useQuery({
    queryKey: ['customer-detail', businessId, selected?.id],
    queryFn: () => api.get<Customer>(`/businesses/${businessId}/customers/${selected!.id}`),
    enabled: !!selected,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof formData) => api.post(`/businesses/${businessId}/customers`, data),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['customers', businessId] }); setShowForm(false); setFormData(blankForm); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<typeof formData> }) =>
      api.patch(`/businesses/${businessId}/customers/${id}`, data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', businessId] });
      qc.invalidateQueries({ queryKey: ['customer-detail', businessId, selected?.id] });
      setEditCustomer(null);
      toast.success('Customer updated');
    },
  });

  const payMutation = useMutation({
    mutationFn: ({ customerId, amountCents }: { customerId: string; amountCents: number }) =>
      api.post(`/businesses/${businessId}/customers/${customerId}/payment`, { amountCents }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', businessId] });
      qc.invalidateQueries({ queryKey: ['customer-detail', businessId, selected?.id] });
      setPayAmount('');
    },
  });

  const importMutation = useMutation({
    mutationFn: (rows: CsvRow[]) =>
      api.post<{ created: number; skipped: number; errors: string[] }>(`/businesses/${businessId}/customers/import-csv`, { rows }),
    onSuccess: (result) => {
      setImportResult(result);
      if (result.created > 0) qc.invalidateQueries({ queryKey: ['customers', businessId] });
    },
  });

  const requestCreditMutation = useMutation({
    mutationFn: ({ customerId, requestedLimitCents }: { customerId: string; requestedLimitCents: number }) =>
      api.patch(`/businesses/${businessId}/customers/${customerId}/request-credit`, { requestedLimitCents }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', businessId] });
      setShowCreditRequest(false);
      setCreditRequestAmount('');
      setCreditRequestError('');
    },
    onError: (err) => setCreditRequestError(err instanceof Error ? err.message : 'Failed to submit request'),
  });

  const setCreditLimitMutation = useMutation({
    mutationFn: ({ customerId, newLimitCents }: { customerId: string; newLimitCents: number }) =>
      api.patch(`/businesses/${businessId}/customers/${customerId}/set-credit-limit`, { newLimitCents }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', businessId] });
      qc.invalidateQueries({ queryKey: ['customer-detail', businessId, setLimitCustomer?.id] });
      setShowSetLimit(false);
      setSetLimitAmount('');
      setSetLimitError('');
    },
    onError: (err) => setSetLimitError(err instanceof Error ? err.message : 'Failed to set limit'),
  });

  const approveCreditMutation = useMutation({
    mutationFn: (customerId: string) =>
      api.patch(`/businesses/${businessId}/customers/${customerId}/approve-credit`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', businessId] }),
  });

  const rejectCreditMutation = useMutation({
    mutationFn: (customerId: string) =>
      api.patch(`/businesses/${businessId}/customers/${customerId}/reject-credit`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers', businessId] }),
  });

  const markCreditPaidMutation = useMutation({
    mutationFn: (saleId: string) =>
      api.patch(`/sales/${saleId}/mark-credit-paid?businessId=${businessId}`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', businessId] });
      qc.invalidateQueries({ queryKey: ['customer-detail', businessId, selected?.id] });
    },
  });

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => { const text = ev.target?.result as string; setCsvRows(parseCsv(text)); setImportResult(null); };
    reader.readAsText(file);
  }

  function openStatementModal(c: Customer) { setStatementCustomer(c); setStmtStart(firstOfMonth); setStmtEnd(todayStr); setShowStatement(true); }
  function handleGenerateStatement() {
    if (!statementCustomer) return;
    openPdfReport(`/reports/pdf/customer-statement/${statementCustomer.id}?startDate=${stmtStart}&endDate=${stmtEnd}`);
  }

  const creditSales = detail?.sales?.filter((s) => s.status === 'CREDIT') ?? [];
  const totalLoyaltyPoints = customers.reduce((s, c) => s + c.loyaltyPoints, 0);
  const withCreditCount = customers.filter((c) => c.balanceCents < 0).length;
  const totalOutstandingDebtCents = customers.reduce((s, c) => s + Math.max(0, -c.balanceCents), 0);
  const pendingCreditRequests = isManager ? customers.filter((c) => c.creditApprovalStatus === 'PENDING') : [];

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header */}
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
          <div className="flex items-center gap-2">
            {activeTab === 'list' && (
              <>
                <button onClick={() => { setShowDupes(true); setShowForm(false); setShowImport(false); setSelected(null); }} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl transition-colors">
                  <GitMerge className="w-4 h-4" /> Find Duplicates
                </button>
                <button onClick={() => { setShowImport(true); setShowForm(false); setSelected(null); setCsvRows([]); setImportResult(null); }} className="inline-flex items-center gap-2 px-4 py-2 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-sm font-semibold rounded-xl transition-colors">
                  <Upload className="w-4 h-4" /> Import CSV
                </button>
                <button onClick={() => { setShowForm(!showForm); setSelected(null); setShowImport(false); }} className="inline-flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors shadow-sm">
                  <Plus className="w-4 h-4" /> Add Customer
                </button>
              </>
            )}
          </div>
        </div>
        <div className="flex gap-1 mt-4">
          <button onClick={() => setActiveTab('list')} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'list' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
            <Users className="w-3.5 h-3.5" /> All Customers
          </button>
          <button onClick={() => setActiveTab('segments')} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'segments' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
            <TrendingUp className="w-3.5 h-3.5" /> RFM Segments
          </button>
          {isManager && (
            <button onClick={() => setActiveTab('credit-requests')} className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-colors ${activeTab === 'credit-requests' ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
              <ShieldCheck className="w-3.5 h-3.5" /> Credit Requests
            </button>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden flex flex-col p-6 gap-5">

        {/* ── SEGMENTS TAB ── */}
        {activeTab === 'segments' && (
          <div className="flex flex-col gap-5 flex-1 min-h-0 overflow-y-auto">
            {segData ? (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {segData.segments.map(seg => {
                    const cls = SEG_COLORS[seg.key] ?? SEG_COLORS.PROMISING;
                    const isSel = segFilter === seg.key;
                    return (
                      <button key={seg.key} onClick={() => setSegFilter(isSel ? null : seg.key)} className={`rounded-xl border p-4 text-left transition-all ${cls} ${isSel ? 'ring-2 ring-indigo-500' : 'hover:opacity-80'}`}>
                        <p className="text-2xl font-bold">{seg.count}</p>
                        <p className="text-sm font-semibold mt-1">{seg.label}</p>
                      </button>
                    );
                  })}
                </div>
                {segFilter && (
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">Filtered: <strong>{segData.segments.find(s => s.key === segFilter)?.label}</strong></span>
                    <button onClick={() => setSegFilter(null)} className="text-xs text-indigo-600 dark:text-indigo-400 underline">Clear</button>
                  </div>
                )}
                <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-auto flex-1">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-100 dark:border-gray-700 sticky top-0">
                      <tr>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Name</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">Phone</th>
                        <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Segment</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Recency</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Freq</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden lg:table-cell">Monetary</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {(segFilter ? segData.customers.filter(c => c.segment === segFilter) : segData.customers).map(c => (
                        <tr key={c.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30">
                          <td className="px-4 py-3 text-sm font-semibold text-gray-900 dark:text-white">{c.name}</td>
                          <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden sm:table-cell">{c.phone ?? '—'}</td>
                          <td className="px-4 py-3">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${SEG_BADGE[c.segment] ?? SEG_BADGE.PROMISING}`}>{SEG_LABEL[c.segment] ?? c.segment}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-300">{c.recencyDays}d</td>
                          <td className="px-4 py-3 text-right text-sm text-gray-600 dark:text-gray-300">{c.frequency}</td>
                          <td className="px-4 py-3 text-right text-sm font-medium text-gray-900 dark:text-white hidden lg:table-cell">{formatKES(c.monetaryCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {segData.customers.length === 0 && (
                    <div className="flex flex-col items-center justify-center py-12">
                      <p className="text-gray-500 dark:text-gray-400">No customers with purchase history yet.</p>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center py-16 text-gray-400 dark:text-gray-500">
                <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mr-2" /> Loading RFM data...
              </div>
            )}
          </div>
        )}

        {/* ── CREDIT REQUESTS TAB ── */}
        {activeTab === 'credit-requests' && (
          <div className="flex flex-col gap-4 flex-1 min-h-0 overflow-y-auto">
            {/* Status filter */}
            <div className="flex gap-2">
              {(['PENDING', 'APPROVED', 'DECLINED'] as const).map(s => (
                <button key={s} onClick={() => setCreditRequestStatus(s)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${creditRequestStatus === s ? 'bg-indigo-600 text-white' : 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'}`}>
                  {s === 'PENDING' ? <><Clock className="inline w-3 h-3 mr-1" />Pending</> : s === 'APPROVED' ? <><CheckCircle className="inline w-3 h-3 mr-1" />Approved</> : <><X className="inline w-3 h-3 mr-1" />Declined</>}
                </button>
              ))}
            </div>
            {creditRequests.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-gray-400">
                <ShieldCheck className="w-10 h-10 mb-3 opacity-40" />
                <p className="text-sm">No {creditRequestStatus.toLowerCase()} credit requests</p>
              </div>
            ) : (
              <div className="space-y-3">
                {creditRequests.map(req => (
                  <div key={req.id} className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-gray-900 dark:text-white text-sm">{req.customer.name}</span>
                          {req.customer.shopCode && <span className="text-xs text-indigo-500 font-mono">{req.customer.shopCode}</span>}
                        </div>
                        <div className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                          Requested by <strong>{req.requestedByUser.name}</strong> · {new Date(req.createdAt).toLocaleDateString('en-KE')}
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-xs">
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
                            <div className="text-gray-400 mb-0.5">Current Limit</div>
                            <div className="font-semibold text-gray-900 dark:text-white">{formatKES(req.currentLimitCents)}</div>
                          </div>
                          <div className="bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-2">
                            <div className="text-indigo-400 mb-0.5">Requested</div>
                            <div className="font-semibold text-indigo-600 dark:text-indigo-400">{formatKES(req.requestedLimitCents)}</div>
                          </div>
                          <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-2">
                            <div className="text-gray-400 mb-0.5">Order Total</div>
                            <div className="font-semibold text-gray-900 dark:text-white">{formatKES(req.orderTotalCents)}</div>
                          </div>
                        </div>
                        {req.reason && <div className="text-xs text-gray-500 mt-2 italic">"{req.reason}"</div>}
                        {req.reviewNote && (
                          <div className={`text-xs mt-2 px-2 py-1 rounded ${req.status === 'APPROVED' ? 'bg-green-900/20 text-green-400' : 'bg-red-900/20 text-red-400'}`}>
                            Note: {req.reviewNote}
                          </div>
                        )}
                      </div>
                      {req.status === 'PENDING' && (
                        <div className="flex flex-col gap-2 flex-shrink-0">
                          <button
                            onClick={() => reviewCreditMutation.mutate({ id: req.id, status: 'APPROVED' })}
                            disabled={reviewCreditMutation.isPending}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors"
                          >
                            Approve
                          </button>
                          <button
                            onClick={async () => {
                              const note = await prompt({ title: 'Decline Reason', placeholder: 'Reason for declining…', confirmLabel: 'Decline' });
                              if (note !== null) reviewCreditMutation.mutate({ id: req.id, status: 'DECLINED', reviewNote: note ?? undefined });
                            }}
                            disabled={reviewCreditMutation.isPending}
                            className="px-3 py-1.5 bg-red-900/40 hover:bg-red-900/60 text-red-400 border border-red-700/40 text-xs font-semibold rounded-lg transition-colors"
                          >
                            Decline
                          </button>
                        </div>
                      )}
                      {req.status !== 'PENDING' && (
                        <div className={`text-xs font-semibold px-2 py-1 rounded-lg ${req.status === 'APPROVED' ? 'bg-green-900/30 text-green-400' : 'bg-red-900/30 text-red-400'}`}>
                          {req.status}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── LIST TAB ── */}
        {activeTab === 'list' && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
                <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{withCreditCount} customers</p>
                {totalOutstandingDebtCents > 0 && (
                  <p className="text-xs text-amber-700 dark:text-amber-500 mt-0.5 font-semibold">{formatKES(totalOutstandingDebtCents)} owed</p>
                )}
              </div>
              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Total Loyalty Pts</p>
                  <Star className="w-4 h-4 text-yellow-500 dark:text-yellow-400" />
                </div>
                <p className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">{totalLoyaltyPoints.toLocaleString()}</p>
              </div>
            </div>

            {/* Pending credit increase requests alert */}
            {isManager && pendingCreditRequests.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                  <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">
                    {pendingCreditRequests.length} pending credit increase {pendingCreditRequests.length === 1 ? 'request' : 'requests'}
                  </p>
                </div>
                <div className="space-y-1">
                  {pendingCreditRequests.map((c) => (
                    <div key={c.id} className="flex items-center gap-3 bg-white dark:bg-gray-800 rounded-lg px-3 py-2 border border-amber-200 dark:border-amber-800">
                      <span className="text-sm font-semibold text-gray-900 dark:text-white flex-1">{c.name}</span>
                      <span className="text-xs text-gray-500 dark:text-gray-400">Requested: <strong>{formatKES(c.creditLimitPendingCents ?? 0)}</strong></span>
                      <span className="text-xs text-gray-400 dark:text-gray-500">Current: {formatKES(c.creditLimitCents)}</span>
                      <div className="flex gap-1">
                        <button onClick={() => approveCreditMutation.mutate(c.id)} disabled={approveCreditMutation.isPending} className="text-xs px-2 py-1 bg-green-600 hover:bg-green-700 text-white rounded-lg font-semibold disabled:opacity-50 transition-colors">Approve</button>
                        <button onClick={() => rejectCreditMutation.mutate(c.id)} disabled={rejectCreditMutation.isPending} className="text-xs px-2 py-1 bg-red-500 hover:bg-red-600 text-white rounded-lg font-semibold disabled:opacity-50 transition-colors">Reject</button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {showImport && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-gray-900 dark:text-white">Import Customers from CSV</h2>
                  <button onClick={() => setShowImport(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mb-3">CSV format: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">name,phone,email,credit_limit</code></p>
                <input ref={fileInputRef} type="file" accept=".csv" onChange={handleFileChange} className="block w-full text-sm text-gray-700 dark:text-gray-300 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 dark:file:bg-indigo-900/30 file:text-indigo-700 dark:file:text-indigo-300 hover:file:bg-indigo-100 dark:hover:file:bg-indigo-900/50 mb-3" />
                {csvRows.length > 0 && !importResult && (
                  <>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Preview ({csvRows.length} rows):</p>
                    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-gray-700 mb-3">
                      <table className="w-full text-xs">
                        <thead className="bg-gray-50 dark:bg-gray-700/50"><tr><th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400">Name</th><th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400">Phone</th><th className="text-left px-3 py-2 text-gray-500 dark:text-gray-400">Email</th><th className="text-right px-3 py-2 text-gray-500 dark:text-gray-400">Credit Limit</th></tr></thead>
                        <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                          {csvRows.slice(0, 5).map((row, i) => (
                            <tr key={i} className="bg-white dark:bg-gray-800">
                              <td className="px-3 py-2 text-gray-900 dark:text-white">{row.name}</td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.phone ?? '—'}</td>
                              <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{row.email ?? '—'}</td>
                              <td className="px-3 py-2 text-right text-gray-600 dark:text-gray-300">{row.creditLimit ? `KES ${row.creditLimit}` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {csvRows.length > 5 && <p className="text-xs text-gray-400 dark:text-gray-500 text-center py-2">...and {csvRows.length - 5} more rows</p>}
                    </div>
                    <button onClick={() => importMutation.mutate(csvRows)} disabled={importMutation.isPending} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                      {importMutation.isPending ? 'Importing...' : `Import ${csvRows.length} Customers`}
                    </button>
                  </>
                )}
                {importResult && (
                  <div className="rounded-xl border border-gray-200 dark:border-gray-700 p-4 bg-gray-50 dark:bg-gray-700/50">
                    <p className="font-semibold text-gray-900 dark:text-white mb-2">Import Complete</p>
                    <div className="flex gap-4 text-sm mb-2">
                      <span className="text-green-600 dark:text-green-400 font-medium">Created: {importResult.created}</span>
                      <span className="text-amber-600 dark:text-amber-400 font-medium">Skipped: {importResult.skipped}</span>
                      <span className="text-red-600 dark:text-red-400 font-medium">Errors: {importResult.errors.length}</span>
                    </div>
                    {importResult.errors.length > 0 && (
                      <ul className="text-xs text-red-600 dark:text-red-400 space-y-1 list-disc list-inside">
                        {importResult.errors.slice(0, 5).map((e, i) => <li key={i}>{e}</li>)}
                        {importResult.errors.length > 5 && <li>...and {importResult.errors.length - 5} more</li>}
                      </ul>
                    )}
                    <button onClick={() => { setCsvRows([]); setImportResult(null); if (fileInputRef.current) fileInputRef.current.value = ''; }} className="mt-2 text-xs text-indigo-600 dark:text-indigo-400 underline">Import another file</button>
                  </div>
                )}
              </div>
            )}

            {showForm && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm p-5">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-gray-900 dark:text-white">New Customer</h2>
                  <button onClick={() => setShowForm(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X className="w-4 h-4" /></button>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <input placeholder="Full Name *" value={formData.name} onChange={(e) => setFormData({ ...formData, name: e.target.value })} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
                  <input placeholder="Phone (07xxxxxxxx)" value={formData.phone} onChange={(e) => setFormData({ ...formData, phone: e.target.value })} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
                  <input placeholder="Email" value={formData.email} onChange={(e) => setFormData({ ...formData, email: e.target.value })} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
                  <input placeholder="KRA PIN (e.g. A012345678Z)" value={formData.kraPin} onChange={(e) => setFormData({ ...formData, kraPin: e.target.value.toUpperCase() })} className="border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none font-mono" />
                  <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden bg-white dark:bg-gray-700">
                    <span className="px-3 bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-300 border-r border-gray-300 dark:border-gray-600 py-2.5 text-sm">KES</span>
                    <input type="number" placeholder="Credit Limit" min={0} value={formData.creditLimitCents / 100 || ''} onChange={(e) => setFormData({ ...formData, creditLimitCents: Math.round(Number(e.target.value) * 100) })} className="flex-1 p-2.5 outline-none bg-transparent text-gray-900 dark:text-white text-sm" />
                  </div>
                </div>
                <div className="flex gap-2 mt-4">
                  <button onClick={() => createMutation.mutate(formData)} disabled={!formData.name || createMutation.isPending} className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors">
                    {createMutation.isPending ? 'Saving...' : 'Save Customer'}
                  </button>
                  <button onClick={() => setShowForm(false)} className="px-5 py-2 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancel</button>
                </div>
                {createMutation.isError && <p className="text-red-600 dark:text-red-400 mt-2 text-sm">{(createMutation.error as Error).message}</p>}
              </div>
            )}

            <div className="flex gap-5 flex-1 min-h-0">
              <div className="flex-1 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden flex flex-col">
                <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                  <div className="relative">
                    <Search className="absolute left-3 top-2.5 text-gray-400 dark:text-gray-500 w-4 h-4" />
                    <input placeholder="Search by name or phone..." value={search} onChange={(e) => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2 border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
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
                    <div className="w-14 h-14 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-3"><Users className="w-7 h-7 text-gray-400 dark:text-gray-500" /></div>
                    <p className="text-gray-600 dark:text-gray-300 font-semibold">No customers found</p>
                    <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">{search ? 'Try a different search term' : 'Add your first customer above'}</p>
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
                          <th className="px-4 py-3 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden xl:table-cell">Credit Status</th>
                          <th className="px-4 py-3 w-8"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                        {customers.map((c) => (
                          <tr key={c.id} className={`cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors ${selected?.id === c.id ? 'bg-indigo-50 dark:bg-indigo-900/20' : ''}`} onClick={() => { setSelected(c); setShowForm(false); setShowImport(false); }}>
                            <td className="px-4 py-3"><p className="text-sm font-semibold text-gray-900 dark:text-white">{c.name}</p>{c.email && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{c.email}</p>}</td>
                            <td className="px-4 py-3 text-sm text-gray-600 dark:text-gray-300 hidden sm:table-cell">{c.phone || <span className="text-gray-400 dark:text-gray-500">—</span>}</td>
                            <td className="px-4 py-3 text-right text-sm text-gray-500 dark:text-gray-400 hidden lg:table-cell">{formatKES(c.creditLimitCents)}</td>
                            <td className="px-4 py-3 text-right">
                              <span className={`text-sm font-semibold ${c.balanceCents < 0 ? 'text-red-600 dark:text-red-400' : c.balanceCents > 0 ? 'text-green-600 dark:text-green-400' : 'text-gray-500 dark:text-gray-400'}`}>
                                {formatKES(Math.abs(c.balanceCents))}
                                {c.balanceCents < 0 && <span className="ml-1 text-xs font-normal opacity-70">(owed)</span>}
                                {c.balanceCents > 0 && <span className="ml-1 text-xs font-normal opacity-70">(credit)</span>}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right"><span className="inline-flex items-center gap-1 text-sm font-medium text-yellow-600 dark:text-yellow-400"><CreditCard className="w-3.5 h-3.5" />{c.loyaltyPoints.toLocaleString()}</span></td>
                            <td className="px-4 py-3 text-center hidden xl:table-cell" onClick={(e) => e.stopPropagation()}>
                              {isManager ? (
                                <button
                                  onClick={() => { setSetLimitCustomer(c); setSetLimitAmount(String(c.creditLimitCents / 100)); setSetLimitError(''); setShowSetLimit(true); }}
                                  className="text-xs px-2.5 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 rounded-lg font-semibold hover:bg-indigo-200 dark:hover:bg-indigo-900/50 transition-colors"
                                >
                                  Set Limit
                                </button>
                              ) : (
                                <>
                                  {c.creditApprovalStatus === 'PENDING' && (
                                    <span className="inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400">
                                      PENDING ({formatKES(c.creditLimitPendingCents ?? 0)})
                                    </span>
                                  )}
                                  {c.creditApprovalStatus !== 'PENDING' && (
                                    <button
                                      onClick={() => { setCreditRequestCustomer(c); setCreditRequestAmount(''); setCreditRequestError(''); setShowCreditRequest(true); }}
                                      className="text-xs text-indigo-600 dark:text-indigo-400 underline hover:text-indigo-800 dark:hover:text-indigo-300"
                                    >
                                      Request Increase
                                    </button>
                                  )}
                                </>
                              )}
                            </td>
                            <td className="px-4 py-3 text-gray-400 dark:text-gray-500"><ChevronRight className="w-4 h-4" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {selected && (
                <div className="fixed inset-0 z-40 md:static md:inset-auto md:z-auto w-full md:w-80 xl:w-96 md:rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm flex flex-col overflow-hidden">
                  <div className="p-5 border-b border-gray-100 dark:border-gray-700">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center flex-shrink-0">
                          <span className="text-indigo-700 dark:text-indigo-300 font-bold text-sm">{selected.name.charAt(0).toUpperCase()}</span>
                        </div>
                        <div>
                          <h2 className="font-bold text-gray-900 dark:text-white">{selected.name}</h2>
                          {selected.phone && <p className="text-sm text-gray-500 dark:text-gray-400">{selected.phone}</p>}
                          {selected.email && <p className="text-xs text-gray-400 dark:text-gray-500">{selected.email}</p>}
                          {selected.kraPin && <p className="text-xs text-gray-400 dark:text-gray-500 font-mono">KRA PIN: {selected.kraPin}</p>}
                        </div>
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => { setEditCustomer(selected); setEditForm({ name: selected.name, phone: selected.phone ?? '', email: selected.email ?? '', kraPin: selected.kraPin ?? '', creditLimitCents: selected.creditLimitCents }); }} className="p-1.5 rounded-lg text-gray-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors" title="Edit customer"><Plus className="w-4 h-4 rotate-45" /></button>
                        <button onClick={() => setSelected(null)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X className="w-4 h-4" /></button>
                      </div>
                    </div>
                    <button onClick={() => openStatementModal(selected)} className="mt-3 w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-gray-50 dark:bg-gray-700 hover:bg-gray-100 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-semibold rounded-xl transition-colors border border-gray-200 dark:border-gray-600">
                      <FileText className="w-3.5 h-3.5" /> Customer Statement
                    </button>
                    {/* Credit limit controls */}
                    {isManager ? (
                      <button
                        onClick={() => { setSetLimitCustomer(selected); setSetLimitAmount(String(selected.creditLimitCents / 100)); setSetLimitError(''); setShowSetLimit(true); }}
                        className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold rounded-xl transition-colors border border-indigo-200 dark:border-indigo-700"
                      >
                        <CreditCard className="w-3.5 h-3.5" /> Set Credit Limit
                      </button>
                    ) : (
                      <>
                        {selected.creditApprovalStatus === 'PENDING' && (
                          <div className="mt-2 p-2.5 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl">
                            <p className="text-xs font-semibold text-yellow-800 dark:text-yellow-300 mb-1">Credit Increase Request: PENDING</p>
                            <p className="text-xs text-yellow-700 dark:text-yellow-400">Requested: {formatKES(selected.creditLimitPendingCents ?? 0)}</p>
                          </div>
                        )}
                        {selected.creditApprovalStatus !== 'PENDING' && (
                          <button
                            onClick={() => { setCreditRequestCustomer(selected); setCreditRequestAmount(''); setCreditRequestError(''); setShowCreditRequest(true); }}
                            className="mt-2 w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-indigo-50 dark:bg-indigo-900/30 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs font-semibold rounded-xl transition-colors border border-indigo-200 dark:border-indigo-700"
                          >
                            <CreditCard className="w-3.5 h-3.5" /> Request Credit Increase
                          </button>
                        )}
                      </>
                    )}
                  </div>
                  <div className="p-4 grid grid-cols-2 gap-3 border-b border-gray-100 dark:border-gray-700">
                    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-xl p-3 text-center">
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Credit Limit</p>
                      <p className="font-bold text-gray-900 dark:text-white text-sm">{formatKES(selected.creditLimitCents)}</p>
                      {selected.creditApprovalStatus === 'PENDING' && (
                        <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-0.5 font-medium">
                          Pending: {formatKES(selected.creditLimitPendingCents ?? 0)}
                        </p>
                      )}
                    </div>
                    <div className={`rounded-xl p-3 text-center ${(detail?.balanceCents ?? selected.balanceCents) < 0 ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'}`}>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Balance</p>
                      <p className={`font-bold text-sm ${(detail?.balanceCents ?? selected.balanceCents) < 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{formatKES(Math.abs(detail?.balanceCents ?? selected.balanceCents))}</p>
                    </div>
                    <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-xl p-3 text-center col-span-2">
                      <p className="text-xs text-yellow-700 dark:text-yellow-400 mb-1">Loyalty Points</p>
                      <p className="font-bold text-yellow-700 dark:text-yellow-400 text-sm">{(detail?.loyaltyPoints ?? selected.loyaltyPoints).toLocaleString()} pts</p>
                    </div>
                  </div>
                  {(detail?.balanceCents ?? selected.balanceCents) < 0 && (
                    <div className="p-4 border-b border-gray-100 dark:border-gray-700">
                      <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2">Record Credit Payment</p>
                      <div className="flex gap-2">
                        <div className="flex items-center border border-gray-200 dark:border-gray-600 rounded-xl overflow-hidden flex-1 bg-gray-50 dark:bg-gray-700">
                          <span className="px-2.5 bg-gray-100 dark:bg-gray-600 text-gray-500 dark:text-gray-300 text-xs border-r border-gray-200 dark:border-gray-600 py-2">KES</span>
                          <input type="number" placeholder="Amount" min={0} value={payAmount} onChange={(e) => setPayAmount(e.target.value)} className="flex-1 p-2 text-sm outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500" />
                        </div>
                        <button onClick={() => { const cents = Math.round(Number(payAmount) * 100); if (cents > 0) payMutation.mutate({ customerId: selected.id, amountCents: cents }); }} disabled={!payAmount || payMutation.isPending} className="bg-green-600 hover:bg-green-700 text-white px-3 py-2 rounded-xl text-sm flex items-center gap-1.5 disabled:opacity-50 font-semibold transition-colors">
                          <DollarSign className="w-3.5 h-3.5" /> Pay
                        </button>
                      </div>
                    </div>
                  )}
                  <div className="flex-1 overflow-y-auto p-4 space-y-4">
                    {creditSales.length > 0 && (
                      <div>
                        <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2">Credit Sales ({creditSales.length})</p>
                        <div className="space-y-2">
                          {creditSales.map((sale) => (
                            <div key={sale.id} className="bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-800/30 rounded-xl p-3">
                              <div className="flex justify-between items-start">
                                <span className="font-mono text-xs font-semibold text-gray-700 dark:text-gray-300">{sale.receiptNumber}</span>
                                <span className="font-bold text-red-600 dark:text-red-400 text-sm">{formatKES(sale.totalCents)}</span>
                              </div>
                              <div className="flex items-center justify-between mt-1.5">
                                <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(sale.createdAt)}</span>
                                <button
                                  onClick={() => markCreditPaidMutation.mutate(sale.id)}
                                  disabled={markCreditPaidMutation.isPending}
                                  className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg transition-colors disabled:opacity-50"
                                >
                                  <CheckCircle className="w-3 h-3" />
                                  Mark Paid
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {(detail?.sales?.filter((s) => s.status !== 'CREDIT').length ?? 0) > 0 && (
                      <div>
                        <p className="font-semibold text-sm text-gray-800 dark:text-gray-200 mb-2">Recent Sales</p>
                        <div className="space-y-2">
                          {detail!.sales!.filter((s) => s.status !== 'CREDIT').map((sale) => (
                            <div key={sale.id} className="bg-gray-50 dark:bg-gray-700/50 border border-gray-100 dark:border-gray-700 rounded-xl p-3">
                              <div className="flex justify-between items-start"><span className="font-mono text-xs text-gray-700 dark:text-gray-300">{sale.receiptNumber}</span><span className="font-semibold text-sm text-gray-900 dark:text-white">{formatKES(sale.totalCents)}</span></div>
                              <div className="flex justify-between items-center mt-1">
                                <span className="text-xs text-gray-400 dark:text-gray-500">{formatDate(sale.createdAt)}</span>
                                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sale.status === 'PAID' ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-gray-100 dark:bg-gray-600 text-gray-600 dark:text-gray-300'}`}>{sale.status}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {creditSales.length === 0 && (detail?.sales?.length ?? 0) === 0 && (
                      <div className="text-center py-8"><p className="text-sm text-gray-400 dark:text-gray-500">No sales history</p></div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Duplicates modal */}
      {showDupes && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-2xl max-h-[80vh] flex flex-col">
            <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-gray-700">
              <h2 className="font-bold text-gray-900 dark:text-white text-lg">Duplicate Customers</h2>
              <button onClick={() => setShowDupes(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {dupes.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-gray-500 dark:text-gray-400 font-medium">No duplicate customers found.</p>
                  <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">All customers have unique phone numbers.</p>
                </div>
              ) : dupes.map((group, gi) => {
                const groupKey = `group-${gi}`;
                const selectedPrimary = mergeSelections[groupKey];
                const secondaryId = group.customers.find(c => c.id !== selectedPrimary)?.id;
                return (
                  <div key={gi} className="bg-gray-50 dark:bg-gray-700/50 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
                    <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-3">
                      {group.type === 'SAME_PHONE' ? 'Same Phone Number' : group.type} — {group.customers.length} duplicates
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {group.customers.map(c => (
                        <label key={c.id} className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${selectedPrimary === c.id ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 hover:border-gray-300 dark:hover:border-gray-500'}`}>
                          <input type="radio" name={groupKey} value={c.id} checked={selectedPrimary === c.id} onChange={() => setMergeSelections(prev => ({ ...prev, [groupKey]: c.id }))} className="mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <p className="font-semibold text-sm text-gray-900 dark:text-white truncate">{c.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">{c.phone}</p>
                            {c.email && <p className="text-xs text-gray-400 dark:text-gray-500 truncate">{c.email}</p>}
                            <p className="text-xs text-yellow-600 dark:text-yellow-400 mt-1">{c.loyaltyPoints} pts</p>
                          </div>
                        </label>
                      ))}
                    </div>
                    {selectedPrimary && secondaryId && (
                      <div className="mt-3 flex items-center gap-3">
                        <p className="text-xs text-gray-500 dark:text-gray-400 flex-1">Selected record will be kept; the other merged into it (loyalty points combined).</p>
                        <button onClick={() => mergeMutation.mutate({ primaryId: selectedPrimary, secondaryId })} disabled={mergeMutation.isPending} className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors">
                          {mergeMutation.isPending ? 'Merging...' : 'Merge'}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Edit Customer modal */}
      {editCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-900 dark:text-white">Edit Customer</h3>
              <button onClick={() => setEditCustomer(null)} className="p-1.5 rounded-lg text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"><X className="w-4 h-4" /></button>
            </div>
            <div className="space-y-3">
              <input placeholder="Full Name *" value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              <input placeholder="Phone" value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              <input placeholder="Email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 outline-none" />
              <div>
                <input placeholder="KRA PIN (e.g. A012345678Z)" value={editForm.kraPin} onChange={(e) => setEditForm({ ...editForm, kraPin: e.target.value.toUpperCase() })} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2.5 rounded-xl text-sm font-mono focus:ring-2 focus:ring-indigo-500 outline-none" />
                <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">Required for B2B tax invoices. Will appear on KRA eTIMS submissions.</p>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              <button
                onClick={() => updateMutation.mutate({ id: editCustomer.id, data: editForm })}
                disabled={!editForm.name || updateMutation.isPending}
                className="flex-1 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl disabled:opacity-50 transition-colors"
              >
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </button>
              <button onClick={() => setEditCustomer(null)} className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Credit Request modal */}
      {showCreditRequest && creditRequestCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 dark:text-white">Request Credit Increase</h2>
              <button onClick={() => setShowCreditRequest(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Requesting credit increase for <strong className="text-gray-900 dark:text-white">{creditRequestCustomer.name}</strong>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Current Limit: <strong>{formatKES(creditRequestCustomer.creditLimitCents)}</strong></p>
            {creditRequestError && (
              <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">{creditRequestError}</div>
            )}
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Requested Credit Limit (KES) *</label>
                <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden bg-white dark:bg-gray-700">
                  <span className="px-3 bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-300 border-r border-gray-300 dark:border-gray-600 py-2.5 text-sm">KES</span>
                  <input
                    type="number" min={0} placeholder="e.g. 50000" value={creditRequestAmount}
                    onChange={(e) => setCreditRequestAmount(e.target.value)}
                    className="flex-1 p-2.5 text-sm outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                    autoFocus
                  />
                </div>
                {creditRequestAmount && Number(creditRequestAmount) > 0 && (
                  <p className="text-xs text-indigo-600 dark:text-indigo-400 mt-1">
                    Increase of {formatKES(Math.round(Number(creditRequestAmount) * 100) - creditRequestCustomer.creditLimitCents)} above current limit
                  </p>
                )}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const cents = Math.round(Number(creditRequestAmount) * 100);
                  if (!cents || cents <= 0) {
                    setCreditRequestError('Please enter a valid requested amount');
                    return;
                  }
                  requestCreditMutation.mutate({ customerId: creditRequestCustomer.id, requestedLimitCents: cents });
                }}
                disabled={!creditRequestAmount || requestCreditMutation.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {requestCreditMutation.isPending ? 'Submitting...' : 'Submit Request'}
              </button>
              <button onClick={() => setShowCreditRequest(false)} className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}

      {/* Set Credit Limit modal (manager/owner) */}
      {showSetLimit && setLimitCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 dark:text-white">Set Credit Limit</h2>
              <button onClick={() => setShowSetLimit(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
              Customer: <strong className="text-gray-900 dark:text-white">{setLimitCustomer.name}</strong>
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
              Current Limit: <strong>{formatKES(setLimitCustomer.creditLimitCents)}</strong>
              {setLimitCustomer.creditApprovalStatus === 'PENDING' && (
                <span className="ml-2 text-yellow-600 dark:text-yellow-400 font-semibold">
                  (Pending request: {formatKES(setLimitCustomer.creditLimitPendingCents ?? 0)})
                </span>
              )}
            </p>
            {setLimitError && (
              <div className="mb-3 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">{setLimitError}</div>
            )}
            <div className="mb-5">
              <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">New Credit Limit (KES) *</label>
              <div className="flex items-center border border-gray-300 dark:border-gray-600 rounded-xl overflow-hidden bg-white dark:bg-gray-700">
                <span className="px-3 bg-gray-50 dark:bg-gray-600 text-gray-500 dark:text-gray-300 border-r border-gray-300 dark:border-gray-600 py-2.5 text-sm">KES</span>
                <input
                  type="number" min={0} placeholder="e.g. 50000" value={setLimitAmount}
                  onChange={(e) => setSetLimitAmount(e.target.value)}
                  className="flex-1 p-2.5 text-sm outline-none bg-transparent text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                  autoFocus
                />
              </div>
              {setLimitAmount && Number(setLimitAmount) >= 0 && (
                <p className={`text-xs mt-1 ${Math.round(Number(setLimitAmount) * 100) < setLimitCustomer.creditLimitCents ? 'text-amber-600 dark:text-amber-400' : 'text-green-600 dark:text-green-400'}`}>
                  {Math.round(Number(setLimitAmount) * 100) < setLimitCustomer.creditLimitCents
                    ? `Reduction of ${formatKES(setLimitCustomer.creditLimitCents - Math.round(Number(setLimitAmount) * 100))}`
                    : Math.round(Number(setLimitAmount) * 100) > setLimitCustomer.creditLimitCents
                    ? `Increase of ${formatKES(Math.round(Number(setLimitAmount) * 100) - setLimitCustomer.creditLimitCents)}`
                    : 'No change'}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const cents = Math.round(Number(setLimitAmount) * 100);
                  if (isNaN(cents) || cents < 0) { setSetLimitError('Enter a valid amount (0 or more)'); return; }
                  setCreditLimitMutation.mutate({ customerId: setLimitCustomer.id, newLimitCents: cents });
                }}
                disabled={setLimitAmount === '' || setCreditLimitMutation.isPending}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors disabled:opacity-50"
              >
                {setCreditLimitMutation.isPending ? 'Saving...' : 'Save Limit'}
              </button>
              <button onClick={() => setShowSetLimit(false)} className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancel</button>
            </div>
            {/* If there's a pending request, also show approve/reject */}
            {setLimitCustomer.creditApprovalStatus === 'PENDING' && (
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                <p className="text-xs font-semibold text-gray-600 dark:text-gray-400 mb-2">Or respond to the cashier's request:</p>
                <div className="flex gap-2">
                  <button onClick={() => { approveCreditMutation.mutate(setLimitCustomer.id); setShowSetLimit(false); }} disabled={approveCreditMutation.isPending} className="flex-1 py-2 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded-xl disabled:opacity-50">
                    Approve Request ({formatKES(setLimitCustomer.creditLimitPendingCents ?? 0)})
                  </button>
                  <button onClick={() => { rejectCreditMutation.mutate(setLimitCustomer.id); setShowSetLimit(false); }} disabled={rejectCreditMutation.isPending} className="flex-1 py-2 text-xs font-semibold bg-red-500 hover:bg-red-600 text-white rounded-xl disabled:opacity-50">
                    Reject
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Statement modal */}
      {showStatement && statementCustomer && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl w-full max-w-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-bold text-gray-900 dark:text-white">Customer Statement</h2>
              <button onClick={() => setShowStatement(false)} className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"><X className="w-4 h-4" /></button>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">Generating statement for <strong className="text-gray-900 dark:text-white">{statementCustomer.name}</strong></p>
            <div className="space-y-3 mb-5">
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">Start Date</label>
                <input type="date" value={stmtStart} onChange={(e) => setStmtStart(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1 uppercase tracking-wide">End Date</label>
                <input type="date" value={stmtEnd} onChange={(e) => setStmtEnd(e.target.value)} className="w-full border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white p-2.5 rounded-xl text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent outline-none" />
              </div>
            </div>
            <div className="flex gap-2">
              <button onClick={handleGenerateStatement} className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-xl transition-colors">
                <FileText className="w-4 h-4" /> Generate PDF
              </button>
              <button onClick={() => setShowStatement(false)} className="px-4 py-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-sm font-medium rounded-xl hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

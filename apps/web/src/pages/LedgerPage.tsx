import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Plus, X, Loader2, RefreshCw, Check, RotateCcw } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

type JournalStatus = 'DRAFT' | 'POSTED' | 'REVERSED';

interface JournalLine {
  accountCode: string;
  accountName: string;
  debitCents: number;
  creditCents: number;
}

interface JournalEntry {
  id: string;
  entryNumber: string;
  date: string;
  description: string;
  reference?: string;
  source?: string;
  status: JournalStatus;
  createdAt: string;
  lines: JournalLine[];
}

interface TrialBalanceLine {
  accountCode: string;
  accountName: string;
  totalDebitCents: number;
  totalCreditCents: number;
}

const emptyLine = (): JournalLine => ({
  accountCode: '',
  accountName: '',
  debitCents: 0,
  creditCents: 0,
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function statusBadge(status: JournalStatus) {
  const map: Record<JournalStatus, string> = {
    DRAFT: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
    POSTED: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
    REVERSED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300',
  };
  return map[status];
}

function fmt(cents: number) {
  if (!cents) return '—';
  return `KES ${(Math.abs(cents) / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

function fmtSigned(cents: number) {
  const abs = `KES ${(Math.abs(cents) / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
  if (cents < 0) return `-${abs}`;
  return abs;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LedgerPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const qc = useQueryClient();

  const [tab, setTab] = useState<'entries' | 'trial-balance'>('entries');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [statusFilter, setStatusFilter] = useState<JournalStatus | 'ALL'>('ALL');
  const [asOfDate, setAsOfDate] = useState(new Date().toISOString().slice(0, 10));
  const [showModal, setShowModal] = useState(false);
  const [form, setForm] = useState({
    date: new Date().toISOString().slice(0, 10),
    description: '',
    reference: '',
    lines: [emptyLine(), emptyLine()],
  });

  // ─── Queries ──────────────────────────────────────────────────────────────

  const { data: entries = [], isLoading: loadingEntries, refetch } = useQuery<JournalEntry[]>({
    queryKey: ['journal', businessId, startDate, endDate, statusFilter],
    queryFn: () => {
      const params = new URLSearchParams({ businessId });
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);
      return api.get(`/accounting/journal?${params.toString()}`);
    },
    enabled: !!businessId && tab === 'entries',
  });

  const { data: trialBalance = [], isLoading: loadingTB } = useQuery<TrialBalanceLine[]>({
    queryKey: ['trial-balance', businessId, asOfDate],
    queryFn: () => api.get(`/accounting/journal/trial-balance?businessId=${businessId}&asOfDate=${asOfDate}`),
    enabled: !!businessId && tab === 'trial-balance',
  });

  // ─── Mutations ────────────────────────────────────────────────────────────

  const createMut = useMutation({
    mutationFn: (dto: object) => api.post('/accounting/journal', dto),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['journal'] });
      setShowModal(false);
      setForm({ date: new Date().toISOString().slice(0, 10), description: '', reference: '', lines: [emptyLine(), emptyLine()] });
    },
  });

  const postMut = useMutation({
    mutationFn: (id: string) => api.patch(`/accounting/journal/${id}/post`, { postedBy: user?.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journal'] }),
  });

  const reverseMut = useMutation({
    mutationFn: (id: string) => api.patch(`/accounting/journal/${id}/reverse`, { reversedBy: user?.id }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['journal'] }),
  });

  // ─── Form helpers ─────────────────────────────────────────────────────────

  const totalDebits = form.lines.reduce((s, l) => s + (l.debitCents || 0), 0);
  const totalCredits = form.lines.reduce((s, l) => s + (l.creditCents || 0), 0);
  const balanced = totalDebits > 0 && totalDebits === totalCredits;

  function updateLine(idx: number, field: keyof JournalLine, value: string | number) {
    setForm((f) => ({
      ...f,
      lines: f.lines.map((l, i) => i === idx ? { ...l, [field]: field.includes('Cents') ? Math.round(Number(value) * 100) : value } : l),
    }));
  }

  function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!balanced) return;
    createMut.mutate({
      businessId,
      date: form.date,
      description: form.description,
      reference: form.reference || undefined,
      lines: form.lines.filter((l) => l.accountCode.trim()),
    });
  }

  // ─── Trial balance totals ─────────────────────────────────────────────────

  const tbTotalDebit = trialBalance.reduce((s, l) => s + l.totalDebitCents, 0);
  const tbTotalCredit = trialBalance.reduce((s, l) => s + l.totalCreditCents, 0);

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-emerald-500" />
            General Ledger
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
            Journal entries and trial balance
          </p>
        </div>
        <div className="flex gap-2">
          {tab === 'entries' && (
            <>
              <button
                onClick={() => refetch()}
                className="p-2 rounded-lg border border-gray-200 dark:border-gray-700 text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4" />
                New Entry
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200 dark:border-gray-700">
        {([{ id: 'entries', label: 'Journal Entries' }, { id: 'trial-balance', label: 'Trial Balance' }] as const).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t.id
                ? 'border-blue-600 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Journal Entries */}
      {tab === 'entries' && (
        <>
          {/* Filters */}
          <div className="flex flex-wrap gap-3 mb-4">
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex items-center gap-2">
              <label className="text-xs text-gray-500 dark:text-gray-400">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as JournalStatus | 'ALL')}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ALL">All Status</option>
              <option value="DRAFT">Draft</option>
              <option value="POSTED">Posted</option>
              <option value="REVERSED">Reversed</option>
            </select>
          </div>

          {loadingEntries ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-16 text-gray-400 dark:text-gray-500">
              <BookOpen className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No journal entries found</p>
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Entry #</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Date</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Description</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Source</th>
                    <th className="text-center px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Status</th>
                    <th className="px-4 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {entries.map((entry) => (
                    <tr key={entry.id} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                      <td className="px-4 py-3 font-mono text-xs text-gray-700 dark:text-gray-300">{entry.entryNumber}</td>
                      <td className="px-4 py-3 text-gray-700 dark:text-gray-300 whitespace-nowrap">
                        {new Date(entry.date).toLocaleDateString()}
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-gray-900 dark:text-white">{entry.description}</p>
                        {entry.reference && <p className="text-xs text-gray-400">Ref: {entry.reference}</p>}
                      </td>
                      <td className="px-4 py-3 text-gray-500 dark:text-gray-400">{entry.source ?? '—'}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-semibold ${statusBadge(entry.status)}`}>
                          {entry.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1 justify-end">
                          {entry.status === 'DRAFT' && (
                            <button
                              onClick={() => postMut.mutate(entry.id)}
                              disabled={postMut.isPending}
                              className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg transition-colors"
                            >
                              <Check className="w-3 h-3" /> Post
                            </button>
                          )}
                          {entry.status === 'POSTED' && (
                            <button
                              onClick={() => {
                                if (window.confirm('Reverse this journal entry?')) reverseMut.mutate(entry.id);
                              }}
                              disabled={reverseMut.isPending}
                              className="flex items-center gap-1 px-2.5 py-1 bg-red-100 hover:bg-red-200 dark:bg-red-900/30 dark:hover:bg-red-900/50 text-red-700 dark:text-red-400 text-xs font-medium rounded-lg transition-colors"
                            >
                              <RotateCcw className="w-3 h-3" /> Reverse
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Trial Balance */}
      {tab === 'trial-balance' && (
        <>
          <div className="flex items-center gap-3 mb-4">
            <label className="text-sm text-gray-600 dark:text-gray-400 font-medium">As of date:</label>
            <input
              type="date"
              value={asOfDate}
              onChange={(e) => setAsOfDate(e.target.value)}
              className="px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {loadingTB ? (
            <div className="flex justify-center py-16">
              <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
            </div>
          ) : (
            <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
                  <tr>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Code</th>
                    <th className="text-left px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Account Name</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Total Debits</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Total Credits</th>
                    <th className="text-right px-4 py-3 font-semibold text-gray-600 dark:text-gray-300">Net</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                  {trialBalance.map((line, i) => {
                    const net = line.totalDebitCents - line.totalCreditCents;
                    return (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors">
                        <td className="px-4 py-3 font-mono text-xs text-gray-600 dark:text-gray-400">{line.accountCode}</td>
                        <td className="px-4 py-3 text-gray-900 dark:text-white">{line.accountName}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(line.totalDebitCents)}</td>
                        <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">{fmt(line.totalCreditCents)}</td>
                        <td className={`px-4 py-3 text-right font-medium ${net >= 0 ? 'text-blue-700 dark:text-blue-400' : 'text-red-600 dark:text-red-400'}`}>
                          {fmtSigned(net)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot className="border-t-2 border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-800">
                  <tr>
                    <td colSpan={2} className="px-4 py-3 font-bold text-gray-900 dark:text-white">TOTAL</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{fmt(tbTotalDebit)}</td>
                    <td className="px-4 py-3 text-right font-bold text-gray-900 dark:text-white">{fmt(tbTotalCredit)}</td>
                    <td className={`px-4 py-3 text-right font-bold ${tbTotalDebit === tbTotalCredit ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                      {tbTotalDebit === tbTotalCredit ? 'Balanced' : fmtSigned(tbTotalDebit - tbTotalCredit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {/* New Entry Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700 sticky top-0 bg-white dark:bg-gray-900">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">New Journal Entry</h2>
              <button onClick={() => setShowModal(false)} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200">
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleCreate} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Date *</label>
                  <input
                    type="date"
                    value={form.date}
                    onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                    required
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Reference</label>
                  <input
                    type="text"
                    value={form.reference}
                    onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                    placeholder="e.g. INV-001"
                    className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Description *</label>
                <input
                  type="text"
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  required
                  placeholder="e.g. Monthly rent payment"
                  className="w-full px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Lines */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700 dark:text-gray-300">Lines *</label>
                  <button
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, lines: [...f.lines, emptyLine()] }))}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add line
                  </button>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-200 dark:border-gray-700">
                        <th className="text-left pb-1">Account Code</th>
                        <th className="text-left pb-1">Account Name</th>
                        <th className="text-right pb-1">Debit (KES)</th>
                        <th className="text-right pb-1">Credit (KES)</th>
                        <th className="pb-1" />
                      </tr>
                    </thead>
                    <tbody>
                      {form.lines.map((line, idx) => (
                        <tr key={idx}>
                          <td className="py-1 pr-1">
                            <input
                              type="text"
                              value={line.accountCode}
                              onChange={(e) => updateLine(idx, 'accountCode', e.target.value)}
                              placeholder="1000"
                              className="w-24 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="py-1 pr-1">
                            <input
                              type="text"
                              value={line.accountName}
                              onChange={(e) => updateLine(idx, 'accountName', e.target.value)}
                              placeholder="Cash"
                              className="w-36 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="py-1 pr-1 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.debitCents / 100 || ''}
                              onChange={(e) => updateLine(idx, 'debitCents', e.target.value)}
                              placeholder="0.00"
                              className="w-28 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="py-1 pr-1 text-right">
                            <input
                              type="number"
                              min="0"
                              step="0.01"
                              value={line.creditCents / 100 || ''}
                              onChange={(e) => updateLine(idx, 'creditCents', e.target.value)}
                              placeholder="0.00"
                              className="w-28 px-2 py-1.5 rounded border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-blue-500"
                            />
                          </td>
                          <td className="py-1">
                            {form.lines.length > 2 && (
                              <button
                                type="button"
                                onClick={() => setForm((f) => ({ ...f, lines: f.lines.filter((_, i) => i !== idx) }))}
                                className="text-gray-400 hover:text-red-500 ml-1"
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="border-t border-gray-200 dark:border-gray-700">
                      <tr>
                        <td colSpan={2} className="py-2 text-xs font-semibold text-gray-600 dark:text-gray-400">Totals</td>
                        <td className={`py-2 text-right text-xs font-bold ${balanced ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                          {fmt(totalDebits)}
                        </td>
                        <td className={`py-2 text-right text-xs font-bold ${balanced ? 'text-green-600 dark:text-green-400' : 'text-gray-700 dark:text-gray-300'}`}>
                          {fmt(totalCredits)}
                        </td>
                        <td />
                      </tr>
                      {totalDebits > 0 && !balanced && (
                        <tr>
                          <td colSpan={5} className="pb-2">
                            <p className="text-xs text-red-500">Debits and credits must be equal</p>
                          </td>
                        </tr>
                      )}
                      {balanced && (
                        <tr>
                          <td colSpan={5} className="pb-2">
                            <p className="text-xs text-green-600 dark:text-green-400 flex items-center gap-1">
                              <Check className="w-3 h-3" /> Entry is balanced
                            </p>
                          </td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              </div>

              {createMut.isError && (
                <p className="text-sm text-red-500">Failed to create entry. Please try again.</p>
              )}
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 px-4 py-2 rounded-lg border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMut.isPending || !balanced}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
                >
                  {createMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                  Save as Draft
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

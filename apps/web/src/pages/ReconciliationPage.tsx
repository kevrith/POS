import { useState, useEffect, useRef } from 'react';
import { toast } from 'sonner';
import { api, getToken } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useDialog } from '../components/Dialog';

const formatKES = (cents: number) =>
  'KES ' + (cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 });

const formatDate = (d: string | Date) => new Date(d).toLocaleDateString('en-KE');

interface Statement {
  id: string;
  fileName: string;
  periodStart: string;
  periodEnd: string;
  totalCredits: number;
  totalDebits: number;
  matchedCount: number;
  unmatchedCount: number;
  totalEntries: number;
  uploadedAt: string;
}

interface Entry {
  id: string;
  date: string;
  description: string;
  creditCents: number;
  debitCents: number;
  balance: number;
  reference: string | null;
  matchedSaleId: string | null;
  matchStatus: 'MATCHED' | 'UNMATCHED' | 'MANUAL';
}

interface Summary {
  totalSalesCents: number;
  totalBankCreditsCents: number;
  varianceCents: number;
  salesCount: number;
  matchedEntriesCount: number;
}

type Tab = 'statements' | 'entries' | 'paystack' | 'summary';

export default function ReconciliationPage() {
  const user = useAuthStore(s => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId;
  const { confirm } = useDialog();
  const [tab, setTab] = useState<Tab>('statements');

  // Statements
  const [statements, setStatements] = useState<Statement[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Entries
  const [selectedStatementId, setSelectedStatementId] = useState('');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [entryFilter, setEntryFilter] = useState('');
  const [matchSaleId, setMatchSaleId] = useState<Record<string, string>>({});
  const [loadingEntries, setLoadingEntries] = useState(false);

  // Summary
  const [summaryStart, setSummaryStart] = useState(() => {
    const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10);
  });
  const [summaryEnd, setSummaryEnd] = useState(() => new Date().toISOString().slice(0, 10));
  const [summary, setSummary] = useState<Summary | null>(null);

  // Paystack
  const [paystackEmail, setPaystackEmail] = useState('');
  const [paystackAmount, setPaystackAmount] = useState('');
  const [paystackRef, setPaystackRef] = useState('');
  const [paystackResult, setPaystackResult] = useState<string>('');

  const loadStatements = async () => {
    try {
      const data = await api.get<Statement[]>(`/payments/reconciliation/statements?businessId=${businessId}`);
      setStatements(data);
    } catch (e) { console.error(e); }
  };

  useEffect(() => { loadStatements(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      form.append('businessId', businessId);
      if (storeId) form.append('storeId', storeId);

      const token = getToken();
      const res = await fetch('/api/v1/payments/reconciliation/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error(await res.text());
      await loadStatements();
      toast.success('Statement uploaded and auto-matched successfully!');
    } catch (err: any) {
      toast.error(`Upload failed: ${err.message}`);
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleDeleteStatement = async (id: string, name: string) => {
    const ok = await confirm({ title: 'Delete Statement', message: `Delete "${name}"? All matched entries will be unmatched. This cannot be undone.`, variant: 'danger', confirmLabel: 'Delete' });
    if (!ok) return;
    try {
      await api.delete(`/payments/reconciliation/statements/${id}`);
      await loadStatements();
      toast.success('Statement deleted');
    } catch (e: any) { toast.error(e.message || 'Error deleting'); }
  };

  const loadEntries = async () => {
    if (!selectedStatementId) return;
    setLoadingEntries(true);
    try {
      const params = new URLSearchParams({ ...(entryFilter ? { matchStatus: entryFilter } : {}) });
      const data = await api.get<Entry[]>(`/payments/reconciliation/entries/${selectedStatementId}?${params}`);
      setEntries(data);
    } catch (e) { console.error(e); }
    setLoadingEntries(false);
  };

  useEffect(() => { if (tab === 'entries') loadEntries(); }, [tab, selectedStatementId, entryFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleManualMatch = async (entryId: string) => {
    const saleId = matchSaleId[entryId];
    if (!saleId?.trim()) { toast.warning('Enter a Sale ID first'); return; }
    try {
      await api.patch(`/payments/reconciliation/entries/${entryId}/match`, { saleId });
      await loadEntries();
      setMatchSaleId(prev => { const n = { ...prev }; delete n[entryId]; return n; });
      toast.success('Entry matched successfully');
    } catch (e: any) { toast.error(e.message || 'Error matching'); }
  };

  const loadSummary = async () => {
    try {
      const data = await api.get<Summary>(`/payments/reconciliation/summary?businessId=${businessId}&startDate=${summaryStart}&endDate=${summaryEnd}`);
      setSummary(data);
    } catch (e) { console.error(e); }
  };

  const initiatePaystack = async () => {
    try {
      const data = await api.post<{ authorizationUrl: string; reference: string }>('/payments/paystack/initiate', {
        businessId,
        amountCents: Math.round(parseFloat(paystackAmount) * 100),
        email: paystackEmail,
      });
      setPaystackRef(data.reference);
      window.open(data.authorizationUrl, '_blank');
    } catch (e: any) { alert(e.message || 'Error initiating payment'); }
  };

  const verifyPaystack = async () => {
    try {
      const data = await api.post<{ verified: boolean; status: string }>('/payments/paystack/verify', {
        reference: paystackRef,
        businessId,
      });
      setPaystackResult(data.verified ? `✅ Payment verified! Status: ${data.status}` : `❌ Not verified. Status: ${data.status}`);
    } catch (e: any) { setPaystackResult(`Error: ${e.message}`); }
  };

  const statusBadge = (s: string) => {
    const colors: Record<string, string> = {
      MATCHED: 'bg-green-100 text-green-700',
      UNMATCHED: 'bg-yellow-100 text-yellow-700',
      MANUAL: 'bg-blue-100 text-blue-700',
    };
    return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[s] ?? 'bg-gray-100 text-gray-600'}`}>{s}</span>;
  };

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">Bank Reconciliation</h1>

      {/* Tabs */}
      <div className="flex overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        {([['statements', 'Bank Statements'], ['entries', 'Reconciliation'], ['paystack', 'Paystack'], ['summary', 'Summary']] as [Tab, string][]).map(([t, label]) => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${tab === t ? 'border-indigo-600 text-indigo-600' : 'border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}>
            {label}
          </button>
        ))}
      </div>

      {/* Statements Tab */}
      {tab === 'statements' && (
        <div>
          <div className="flex items-center gap-4 mb-4">
            <input ref={fileRef} type="file" accept=".csv" onChange={handleUpload} className="hidden" />
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading…' : 'Upload CSV Statement'}
            </button>
            <span className="text-xs text-gray-500">Supports KCB, Equity, NCBA, Co-op CSV exports</span>
          </div>

          <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>{['File', 'Period', 'Credits', 'Debits', 'Matched', 'Unmatched', 'Uploaded', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                ))}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {statements.length === 0 && (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No statements uploaded yet. Upload a CSV bank statement to get started.</td></tr>
                )}
                {statements.map(s => (
                  <tr key={s.id}>
                    <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">{s.fileName}</td>
                    <td className="px-4 py-3 text-gray-600 dark:text-gray-300 text-xs">{formatDate(s.periodStart)} – {formatDate(s.periodEnd)}</td>
                    <td className="px-4 py-3 text-green-600">{formatKES(s.totalCredits)}</td>
                    <td className="px-4 py-3 text-red-500">{formatKES(s.totalDebits)}</td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-green-100 text-green-700 rounded text-xs">{s.matchedCount}</span></td>
                    <td className="px-4 py-3"><span className="px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded text-xs">{s.unmatchedCount}</span></td>
                    <td className="px-4 py-3 text-gray-400 text-xs">{formatDate(s.uploadedAt)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => { setSelectedStatementId(s.id); setTab('entries'); }}
                        className="text-indigo-600 hover:text-indigo-800 text-xs mr-3"
                      >
                        View
                      </button>
                      <button onClick={() => handleDeleteStatement(s.id, s.fileName)} className="text-red-500 hover:text-red-700 text-xs">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Entries Tab */}
      {tab === 'entries' && (
        <div>
          <div className="flex items-center gap-4 mb-4">
            <select
              value={selectedStatementId}
              onChange={e => setSelectedStatementId(e.target.value)}
              className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white"
            >
              <option value="">Select Statement</option>
              {statements.map(s => (
                <option key={s.id} value={s.id}>{s.fileName} ({formatDate(s.periodStart)} – {formatDate(s.periodEnd)})</option>
              ))}
            </select>
            <select value={entryFilter} onChange={e => setEntryFilter(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white">
              <option value="">All</option>
              <option value="UNMATCHED">Unmatched</option>
              <option value="MATCHED">Matched</option>
              <option value="MANUAL">Manual</option>
            </select>
            <button onClick={loadEntries} className="px-3 py-2 bg-gray-100 dark:bg-gray-700 rounded-lg text-sm hover:bg-gray-200">Reload</button>
          </div>

          {loadingEntries && <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-4 border-indigo-600 border-t-transparent" /></div>}

          {!loadingEntries && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>{['Date', 'Description', 'Credit', 'Debit', 'Reference', 'Status', 'Match Sale ID', ''].map(h => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">{h}</th>
                  ))}</tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {entries.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No entries found.</td></tr>}
                  {entries.map(e => (
                    <tr key={e.id} className={e.matchStatus === 'UNMATCHED' ? 'bg-yellow-50 dark:bg-yellow-900/10' : ''}>
                      <td className="px-3 py-2 text-gray-600 dark:text-gray-300">{formatDate(e.date)}</td>
                      <td className="px-3 py-2 text-gray-900 dark:text-white max-w-xs truncate" title={e.description}>{e.description}</td>
                      <td className="px-3 py-2 text-green-600">{e.creditCents > 0 ? formatKES(e.creditCents) : '—'}</td>
                      <td className="px-3 py-2 text-red-500">{e.debitCents > 0 ? formatKES(e.debitCents) : '—'}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{e.reference || '—'}</td>
                      <td className="px-3 py-2">{statusBadge(e.matchStatus)}</td>
                      <td className="px-3 py-2">
                        {e.matchStatus === 'UNMATCHED' ? (
                          <input
                            value={matchSaleId[e.id] || ''}
                            onChange={ev => setMatchSaleId(prev => ({ ...prev, [e.id]: ev.target.value }))}
                            placeholder="Sale ID"
                            className="w-32 px-2 py-1 border border-gray-300 dark:border-gray-600 rounded text-xs dark:bg-gray-700"
                          />
                        ) : (
                          <span className="text-xs text-gray-400">{e.matchedSaleId?.slice(0, 8) || '—'}</span>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        {e.matchStatus === 'UNMATCHED' && (
                          <button onClick={() => handleManualMatch(e.id)} className="text-indigo-600 hover:text-indigo-800 text-xs">Match</button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Paystack Tab */}
      {tab === 'paystack' && (
        <div className="max-w-lg">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 space-y-4">
            <h3 className="font-semibold text-gray-900 dark:text-white">Initiate Paystack Card Payment</h3>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Customer Email</label>
              <input type="email" value={paystackEmail} onChange={e => setPaystackEmail(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm" placeholder="customer@example.com" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Amount (KES)</label>
              <input type="number" value={paystackAmount} onChange={e => setPaystackAmount(e.target.value)} className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg dark:bg-gray-700 dark:text-white text-sm" placeholder="0.00" />
            </div>
            <button onClick={initiatePaystack} className="w-full py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 font-medium text-sm">
              Pay with Card (Paystack)
            </button>

            {paystackRef && (
              <div className="border-t pt-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">Reference: <code className="bg-gray-100 dark:bg-gray-700 px-2 py-0.5 rounded text-xs">{paystackRef}</code></p>
                <button onClick={verifyPaystack} className="w-full py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium text-sm">
                  Verify Payment
                </button>
                {paystackResult && <p className="mt-2 text-sm font-medium">{paystackResult}</p>}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Summary Tab */}
      {tab === 'summary' && (
        <div className="max-w-2xl">
          <div className="flex items-center gap-3 mb-6">
            <input type="date" value={summaryStart} onChange={e => setSummaryStart(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white" />
            <span className="text-gray-500">to</span>
            <input type="date" value={summaryEnd} onChange={e => setSummaryEnd(e.target.value)} className="px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-sm dark:bg-gray-700 dark:text-white" />
            <button onClick={loadSummary} className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm hover:bg-indigo-700">Generate</button>
          </div>

          {summary && (
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-6 space-y-4">
              <h3 className="font-semibold text-gray-900 dark:text-white">Reconciliation Summary</h3>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Total Sales (POS)', value: formatKES(summary.totalSalesCents), color: 'text-green-600' },
                  { label: 'Bank Credits (Matched)', value: formatKES(summary.totalBankCreditsCents), color: 'text-blue-600' },
                  { label: 'Variance', value: formatKES(Math.abs(summary.varianceCents)), color: Math.abs(summary.varianceCents) > 0 ? 'text-red-600' : 'text-green-600' },
                  { label: 'Matched Entries', value: String(summary.matchedEntriesCount), color: 'text-gray-700 dark:text-gray-300' },
                ].map(card => (
                  <div key={card.label} className="bg-gray-50 dark:bg-gray-700 rounded-lg p-4">
                    <p className="text-xs text-gray-500 dark:text-gray-400">{card.label}</p>
                    <p className={`text-xl font-bold mt-1 ${card.color}`}>{card.value}</p>
                  </div>
                ))}
              </div>
              {Math.abs(summary.varianceCents) > 0 && (
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg p-3">
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    ⚠ Variance of {formatKES(Math.abs(summary.varianceCents))} detected. Check for unmatched bank entries or missing sale records.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

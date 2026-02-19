import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign, Lock, Unlock, TrendingUp, Printer,
  RefreshCw, AlertTriangle, CheckCircle, X, Loader2,
  Clock, CreditCard, Smartphone,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CashDrawerSession {
  id: string;
  status: 'OPEN' | 'CLOSED';
  openingBalanceCents: number;
  closingBalanceCents?: number;
  expectedBalanceCents?: number;
  varianceCents?: number;
  openedAt: string;
  closedAt?: string;
  cashierId: string;
  storeId: string;
}

interface SessionSummary {
  totalSalesCents: number;
  cashSalesCents: number;
  mpesaSalesCents: number;
  otherPaymentsCents: number;
  refundsCents: number;
  transactionCount: number;
  paymentBreakdown: Array<{ method: string; amountCents: number; count: number }>;
  expectedClosingCents: number;
}

interface XReport {
  session: CashDrawerSession;
  summary: SessionSummary;
  generatedAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (cents: number) =>
  `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtDT = (dt: string) =>
  new Date(dt).toLocaleString('en-KE', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

function PaymentIcon({ method }: { method: string }) {
  if (method.startsWith('MPESA')) return <Smartphone className="w-4 h-4 text-green-500" />;
  if (method === 'CASH') return <DollarSign className="w-4 h-4 text-blue-500" />;
  return <CreditCard className="w-4 h-4 text-purple-500" />;
}

// ─── Z-Report Modal ───────────────────────────────────────────────────────────

interface ZReportModalProps {
  session: CashDrawerSession;
  summary: SessionSummary | null;
  businessId: string;
  storeId: string;
  cashierId: string;
  onConfirm: (closingBalanceCents: number) => void;
  onCancel: () => void;
  isProcessing: boolean;
}

function ZReportModal({
  session, summary,
  onConfirm, onCancel, isProcessing,
}: ZReportModalProps) {
  const [closingInput, setClosingInput] = useState('');
  const closingCents = Math.round(parseFloat(closingInput || '0') * 100);
  const expected = summary?.expectedClosingCents ?? 0;
  const variance = closingCents - expected;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Z-Report — End of Day</h2>
            <p className="text-sm text-gray-500">Close session and reconcile cash</p>
          </div>
          <button onClick={onCancel} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Session totals */}
          {summary && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Session Summary</h3>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Sales</span>
                <span className="font-semibold">{fmt(summary.totalSalesCents)}</span>
              </div>
              {summary.paymentBreakdown.map((p) => (
                <div key={p.method} className="flex justify-between text-sm pl-4">
                  <span className="text-gray-500 flex items-center gap-1">
                    <PaymentIcon method={p.method} />
                    {p.method} ({p.count} txns)
                  </span>
                  <span className="font-medium">{fmt(p.amountCents)}</span>
                </div>
              ))}
              <div className="flex justify-between text-sm border-t pt-2 mt-2">
                <span className="text-gray-600">Refunds</span>
                <span className="text-red-600 font-semibold">−{fmt(summary.refundsCents)}</span>
              </div>
              <div className="flex justify-between text-sm font-bold text-base border-t pt-2 mt-2">
                <span>Opening Balance</span>
                <span>{fmt(session.openingBalanceCents)}</span>
              </div>
              <div className="flex justify-between text-base font-bold text-blue-700">
                <span>Expected Closing</span>
                <span>{fmt(expected)}</span>
              </div>
            </div>
          )}

          {/* Actual closing balance input */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 mb-2">
              Actual Closing Balance (Count your cash)
            </label>
            <input
              type="number"
              min={0}
              step={0.01}
              value={closingInput}
              onChange={(e) => setClosingInput(e.target.value)}
              placeholder="0.00"
              className="w-full border rounded-xl px-4 py-3 text-xl font-bold focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
          </div>

          {/* Variance display */}
          {closingInput && (
            <div className={`rounded-xl p-4 flex items-center justify-between ${
              Math.abs(variance) < 100
                ? 'bg-green-50 border border-green-200'
                : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-center gap-2">
                {Math.abs(variance) < 100
                  ? <CheckCircle className="w-5 h-5 text-green-600" />
                  : <AlertTriangle className="w-5 h-5 text-red-600" />
                }
                <span className={`font-semibold ${Math.abs(variance) < 100 ? 'text-green-700' : 'text-red-700'}`}>
                  {Math.abs(variance) < 100 ? 'Balanced' : 'Variance detected'}
                </span>
              </div>
              <span className={`text-lg font-bold ${variance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                {variance >= 0 ? '+' : ''}{fmt(variance)}
              </span>
            </div>
          )}
        </div>

        <div className="border-t px-6 py-4 flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(closingCents)}
            disabled={!closingInput || isProcessing}
            className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
            Close Session
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CashDrawerPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [openingInput, setOpeningInput] = useState('');
  const [showZReport, setShowZReport] = useState(false);
  const [closeError, setCloseError] = useState('');

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';
  const cashierId = user?.id ?? '';

  // Current session
  const { data: session, isLoading: sessionLoading, refetch: refetchSession } = useQuery<CashDrawerSession | null>({
    queryKey: ['cash-drawer-session', cashierId, storeId],
    queryFn: async () => {
      try {
        return await api.get<CashDrawerSession>(`/cash-drawer/current/${cashierId}/${storeId}`);
      } catch {
        return null;
      }
    },
    enabled: !!cashierId && !!storeId,
    refetchInterval: 30000,
  });

  // Session summary (when open)
  const { data: summary, refetch: refetchSummary } = useQuery<SessionSummary | null>({
    queryKey: ['cash-drawer-summary', session?.id],
    queryFn: async () => {
      if (!session?.id) return null;
      return api.get<SessionSummary>(`/cash-drawer/${session.id}/summary`);
    },
    enabled: !!session?.id && session?.status === 'OPEN',
    refetchInterval: 60000,
  });

  // X-Report
  const { data: xReport, refetch: refetchXReport, isFetching: xFetching } = useQuery<XReport | null>({
    queryKey: ['x-report', businessId, storeId, cashierId],
    queryFn: () =>
      api.get<XReport>(`/reports/x-report?businessId=${businessId}&storeId=${storeId}&cashierId=${cashierId}`),
    enabled: false,
  });

  // Open drawer
  const openDrawer = useMutation({
    mutationFn: (openingBalanceCents: number) =>
      api.post('/cash-drawer/open', { businessId, storeId, cashierId, openingBalanceCents }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cash-drawer-session'] });
      setOpeningInput('');
    },
  });

  // Close drawer (Z-Report)
  const closeDrawer = useMutation({
    mutationFn: async (closingBalanceCents: number) => {
      if (!session) throw new Error('No session');
      const expected = summary?.expectedClosingCents ?? 0;
      return api.patch(`/cash-drawer/${session.id}/close`, {
        closingBalanceCents,
        expectedBalanceCents: expected,
      });
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cash-drawer-session'] });
      void qc.invalidateQueries({ queryKey: ['cash-drawer-summary'] });
      setShowZReport(false);
      setCloseError('');
    },
    onError: (err) => setCloseError(err instanceof Error ? err.message : 'Failed to close session'),
  });

  const isOpen = session?.status === 'OPEN';
  const openingCents = Math.round(parseFloat(openingInput || '0') * 100);

  const sessionDuration = session ? (() => {
    const ms = Date.now() - new Date(session.openedAt).getTime();
    const h = Math.floor(ms / 3600000);
    const m = Math.floor((ms % 3600000) / 60000);
    return `${h}h ${m}m`;
  })() : '';

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-gray-50">
      <div className="max-w-3xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Cash Drawer</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {user?.name} • {isOpen ? (
                <span className="text-green-600 font-medium">Session Open • {sessionDuration}</span>
              ) : (
                <span className="text-gray-400">No active session</span>
              )}
            </p>
          </div>
          <button
            onClick={() => { void refetchSession(); void refetchSummary(); }}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        {/* ── Closed: Open Session ── */}
        {!isOpen && (
          <div className="bg-white rounded-2xl border shadow-sm p-6">
            <div className="flex items-center gap-3 mb-2">
              <div className="p-3 bg-green-100 rounded-xl">
                <Unlock className="w-6 h-6 text-green-600" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-gray-800">Open Cash Drawer</h2>
                <p className="text-sm text-gray-500">Start your shift by counting and entering the opening cash</p>
              </div>
            </div>

            <div className="mt-6">
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Opening Balance (KES)
              </label>
              <input
                type="number"
                min={0}
                step={0.01}
                value={openingInput}
                onChange={(e) => setOpeningInput(e.target.value)}
                placeholder="0.00"
                className="w-full border rounded-xl px-4 py-3 text-2xl font-bold focus:ring-2 focus:ring-green-500 focus:border-transparent"
                autoFocus
              />
              <div className="flex gap-2 mt-3 flex-wrap">
                {[0, 500, 1000, 2000, 5000].map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setOpeningInput(String(amt))}
                    className={`px-4 py-2 rounded-lg text-sm border transition-colors ${
                      openingCents === amt * 100
                        ? 'bg-green-600 text-white border-green-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-green-400'
                    }`}
                  >
                    {amt === 0 ? 'KES 0' : `KES ${amt.toLocaleString()}`}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => openDrawer.mutate(openingCents)}
              disabled={openingInput === '' || openDrawer.isPending}
              className="mt-6 w-full py-4 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl disabled:opacity-40 flex items-center justify-center gap-2 text-lg transition-colors"
            >
              {openDrawer.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Unlock className="w-5 h-5" />}
              Open Drawer
            </button>
          </div>
        )}

        {/* ── Open Session ── */}
        {isOpen && session && (
          <>
            {/* Session info banner */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-white/20 rounded-xl">
                    <DollarSign className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-bold text-lg">Session Active</div>
                    <div className="text-blue-200 text-sm flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Started {fmtDT(session.openedAt)}
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-blue-200 text-xs">Duration</div>
                  <div className="text-xl font-bold">{sessionDuration}</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-white/10 rounded-xl p-3">
                  <div className="text-blue-200 text-xs mb-1">Opening Balance</div>
                  <div className="text-xl font-bold">{fmt(session.openingBalanceCents)}</div>
                </div>
                <div className="bg-white/10 rounded-xl p-3">
                  <div className="text-blue-200 text-xs mb-1">Expected Now</div>
                  <div className="text-xl font-bold">
                    {summary ? fmt(summary.expectedClosingCents) : '…'}
                  </div>
                </div>
              </div>
            </div>

            {/* Session Summary */}
            {summary && (
              <div className="bg-white rounded-2xl border shadow-sm p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="font-bold text-gray-800 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-blue-500" />
                    Session Transactions
                  </h2>
                  <button
                    onClick={() => void refetchSummary()}
                    className="text-sm text-blue-600 hover:text-blue-700 flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Refresh
                  </button>
                </div>

                <div className="grid grid-cols-3 gap-4 mb-6">
                  <div className="text-center p-4 bg-blue-50 rounded-xl">
                    <div className="text-2xl font-bold text-blue-700">{summary.transactionCount}</div>
                    <div className="text-xs text-blue-600 mt-1">Transactions</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-xl">
                    <div className="text-xl font-bold text-green-700">{fmt(summary.totalSalesCents)}</div>
                    <div className="text-xs text-green-600 mt-1">Total Sales</div>
                  </div>
                  <div className="text-center p-4 bg-red-50 rounded-xl">
                    <div className="text-xl font-bold text-red-700">{fmt(summary.refundsCents)}</div>
                    <div className="text-xs text-red-600 mt-1">Refunds</div>
                  </div>
                </div>

                {/* Payment breakdown */}
                <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Payment Methods</h3>
                <div className="space-y-2">
                  {summary.paymentBreakdown.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-4">No transactions yet</p>
                  ) : (
                    summary.paymentBreakdown.map((p) => (
                      <div key={p.method} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                        <div className="flex items-center gap-3">
                          <PaymentIcon method={p.method} />
                          <div>
                            <div className="font-medium text-gray-800 text-sm">{p.method}</div>
                            <div className="text-xs text-gray-400">{p.count} transaction{p.count !== 1 ? 's' : ''}</div>
                          </div>
                        </div>
                        <div className="font-bold text-gray-800">{fmt(p.amountCents)}</div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* X-Report */}
            <div className="bg-white rounded-2xl border shadow-sm p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="font-bold text-gray-800">X-Report (Snapshot)</h2>
                  <p className="text-sm text-gray-500">View current totals without closing the session</p>
                </div>
                <button
                  onClick={() => void refetchXReport()}
                  disabled={xFetching}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors disabled:opacity-40"
                >
                  {xFetching ? <Loader2 className="w-4 h-4 animate-spin" /> : <Printer className="w-4 h-4" />}
                  Generate X-Report
                </button>
              </div>

              {xReport && (
                <div className="bg-gray-50 rounded-xl p-4 font-mono text-sm space-y-1 border">
                  <div className="text-center font-bold text-base border-b pb-2 mb-2">X-REPORT</div>
                  <div className="flex justify-between">
                    <span>Generated:</span>
                    <span>{fmtDT(xReport.generatedAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Opening Balance:</span>
                    <span>{fmt(xReport.session.openingBalanceCents)}</span>
                  </div>
                  <div className="border-t my-1" />
                  {xReport.summary?.paymentBreakdown?.map((p) => (
                    <div key={p.method} className="flex justify-between">
                      <span>{p.method}:</span>
                      <span>{fmt(p.amountCents)}</span>
                    </div>
                  ))}
                  <div className="border-t my-1" />
                  <div className="flex justify-between font-bold">
                    <span>Net Sales:</span>
                    <span>{fmt((xReport.summary?.totalSalesCents ?? 0) - (xReport.summary?.refundsCents ?? 0))}</span>
                  </div>
                  <div className="flex justify-between font-bold">
                    <span>Expected Cash:</span>
                    <span>{fmt(xReport.summary?.expectedClosingCents ?? 0)}</span>
                  </div>
                  <div className="text-center text-gray-400 text-xs border-t pt-2 mt-2">
                    ** X-Report does NOT close the session **
                  </div>
                </div>
              )}
            </div>

            {/* Close Session */}
            <div className="bg-white rounded-2xl border border-red-200 shadow-sm p-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-3 bg-red-100 rounded-xl">
                  <Lock className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-gray-800">Close Session (Z-Report)</h2>
                  <p className="text-sm text-gray-500">Count the cash and close the drawer for end of day</p>
                </div>
              </div>
              {closeError && (
                <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                  {closeError}
                </div>
              )}
              <button
                onClick={() => setShowZReport(true)}
                className="mt-5 w-full py-4 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl flex items-center justify-center gap-2 text-lg transition-colors"
              >
                <Lock className="w-5 h-5" />
                Close Drawer & Generate Z-Report
              </button>
            </div>
          </>
        )}
      </div>

      {/* Z-Report modal */}
      {showZReport && session && (
        <ZReportModal
          session={session}
          summary={summary ?? null}
          businessId={businessId}
          storeId={storeId}
          cashierId={cashierId}
          onConfirm={(cents) => closeDrawer.mutate(cents)}
          onCancel={() => { setShowZReport(false); setCloseError(''); }}
          isProcessing={closeDrawer.isPending}
        />
      )}
    </div>
  );
}

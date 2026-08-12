import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign, Lock, Unlock, TrendingUp, Printer,
  RefreshCw, AlertTriangle, CheckCircle, X, Loader2,
  Clock, CreditCard, Smartphone, Wallet, ArrowDownCircle, ArrowUpCircle,
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
  expensesCents: number;
  transactionCount: number;
  paymentBreakdown: Array<{ method: string; amountCents: number; count: number }>;
  expectedClosingCents: number;
}

interface XReport {
  session: CashDrawerSession | null;
  summary: SessionSummary | null;
  generatedAt: string;
  error?: string;
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

// KES denomination breakdown
const DENOMINATIONS = [1000, 500, 200, 100, 50, 20, 10, 5] as const;

function ZReportModal({
  session, summary,
  onConfirm, onCancel, isProcessing,
}: ZReportModalProps) {
  const [denomCounts, setDenomCounts] = useState<Record<number, string>>({});
  const [submitted, setSubmitted] = useState(false);

  // Calculate total from denomination breakdown
  const denomTotal = DENOMINATIONS.reduce((sum, d) => {
    return sum + d * (parseInt(denomCounts[d] || '0', 10) || 0);
  }, 0);
  const closingCents = denomTotal * 100;

  // Only show expected vs variance AFTER cashier submits count (blind count)
  const expected = summary?.expectedClosingCents ?? 0;
  const variance = closingCents - expected;

  const handleSubmit = () => {
    setSubmitted(true);
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Z-Report — End of Day</h2>
            <p className="text-sm text-gray-500">Blind cash count — count first, then confirm</p>
          </div>
          <button onClick={onCancel} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Session summary — always visible */}
          {summary && (
            <div className="bg-gray-50 rounded-xl p-4 space-y-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Session Summary</h3>
              <div className="flex justify-between text-sm">
                <span className="text-gray-600">Total Sales</span>
                <span className="font-semibold">{fmt(summary.totalSalesCents)}</span>
              </div>
              {(summary.paymentBreakdown ?? []).map((p) => (
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
              {/* Expected balance is HIDDEN until cashier submits count */}
              {submitted ? (
                <div className="flex justify-between text-base font-bold text-blue-700">
                  <span>Expected Closing</span>
                  <span>{fmt(expected)}</span>
                </div>
              ) : (
                <div className="flex justify-between text-sm text-gray-400 italic">
                  <span>Expected Closing</span>
                  <span>hidden until you submit count</span>
                </div>
              )}
            </div>
          )}

          {/* Denomination breakdown */}
          {!submitted && (
            <div>
              <h3 className="text-sm font-semibold text-gray-700 mb-3">Cash Denomination Count</h3>
              <div className="space-y-2">
                {DENOMINATIONS.map((d) => {
                  const qty = parseInt(denomCounts[d] || '0', 10) || 0;
                  const subtotal = d * qty;
                  return (
                    <div key={d} className="flex items-center gap-3">
                      <span className="w-14 text-right text-sm font-semibold text-gray-700">{d}</span>
                      <span className="text-gray-400 text-xs">×</span>
                      <input
                        type="number"
                        min="0"
                        value={denomCounts[d] ?? ''}
                        onChange={(e) => setDenomCounts((prev) => ({ ...prev, [d]: e.target.value }))}
                        placeholder="0"
                        className="w-20 border rounded-lg px-3 py-1.5 text-sm text-center focus:ring-2 focus:ring-blue-500"
                      />
                      <span className="text-xs text-gray-400">=</span>
                      <span className="text-sm font-medium text-gray-800 w-20">
                        {subtotal > 0 ? `KES ${subtotal.toLocaleString()}` : '—'}
                      </span>
                    </div>
                  );
                })}
              </div>
              <div className="mt-4 p-3 bg-blue-50 rounded-xl flex justify-between items-center">
                <span className="text-sm font-semibold text-blue-800">Counted Total</span>
                <span className="text-xl font-bold text-blue-700">{fmt(closingCents)}</span>
              </div>
            </div>
          )}

          {/* After submission — show variance */}
          {submitted && (
            <div className="space-y-3">
              <div className="p-4 bg-blue-50 rounded-xl flex justify-between items-center">
                <span className="font-semibold text-blue-800">Your Count</span>
                <span className="text-xl font-bold text-blue-700">{fmt(closingCents)}</span>
              </div>
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
                    {Math.abs(variance) < 100 ? 'Balanced ✓' : 'Variance Detected!'}
                  </span>
                </div>
                <span className={`text-lg font-bold ${variance >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                  {variance >= 0 ? '+' : ''}{fmt(variance)}
                </span>
              </div>
              {Math.abs(variance) >= 100 && (
                <p className="text-xs text-red-600 text-center">
                  Variance of {fmt(Math.abs(variance))} will be logged for review.
                </p>
              )}
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
          {!submitted ? (
            <button
              onClick={handleSubmit}
              disabled={closingCents === 0}
              className="flex-1 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-40"
            >
              Submit Count
            </button>
          ) : (
            <button
              onClick={() => onConfirm(closingCents)}
              disabled={isProcessing}
              className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isProcessing ? <Loader2 className="w-5 h-5 animate-spin" /> : <Lock className="w-5 h-5" />}
              Close Session
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Petty Cash Types ─────────────────────────────────────────────────────────

interface PettyCashTx {
  id: string;
  type: 'TOP_UP' | 'DISBURSEMENT';
  amountCents: number;
  description: string;
  reference?: string;
  userId: string;
  createdAt: string;
}

interface PettyCashData {
  id: string | null;
  balanceCents: number;
  lastTopUpAt: string | null;
  transactions: PettyCashTx[];
}

// ─── Petty Cash Section ───────────────────────────────────────────────────────

interface PettyCashSectionProps {
  businessId: string;
  userId: string;
  userRole?: string;
}

function PettyCashSection({ businessId, userId, userRole }: PettyCashSectionProps) {
  const qc = useQueryClient();
  const isManagerOrOwner = userRole === 'MANAGER' || userRole === 'OWNER';

  const [showTopUp, setShowTopUp] = useState(false);
  const [showDisburse, setShowDisburse] = useState(false);
  const [topUpAmount, setTopUpAmount] = useState('');
  const [topUpDesc, setTopUpDesc] = useState('');
  const [disburseAmount, setDisburseAmount] = useState('');
  const [disburseDesc, setDisburseDesc] = useState('');
  const [disburseRef, setDisburseRef] = useState('');
  const [formError, setFormError] = useState('');

  const { data: pettyCash, isLoading, refetch } = useQuery<PettyCashData>({
    queryKey: ['petty-cash', businessId],
    queryFn: () => api.get<PettyCashData>(`/expenses/petty-cash?businessId=${businessId}`),
    enabled: !!businessId,
    refetchInterval: 60000,
  });

  const topUpMutation = useMutation({
    mutationFn: (data: { amountCents: number; description: string }) =>
      api.post('/expenses/petty-cash/top-up', {
        businessId,
        amountCents: data.amountCents,
        description: data.description,
        userId,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['petty-cash', businessId] });
      setShowTopUp(false);
      setTopUpAmount('');
      setTopUpDesc('');
      setFormError('');
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Top-up failed'),
  });

  const disburseMutation = useMutation({
    mutationFn: (data: { amountCents: number; description: string; reference?: string }) =>
      api.post('/expenses/petty-cash/disburse', {
        businessId,
        amountCents: data.amountCents,
        description: data.description,
        reference: data.reference || undefined,
        userId,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['petty-cash', businessId] });
      setShowDisburse(false);
      setDisburseAmount('');
      setDisburseDesc('');
      setDisburseRef('');
      setFormError('');
    },
    onError: (err) => setFormError(err instanceof Error ? err.message : 'Disbursement failed'),
  });

  const balance = pettyCash?.balanceCents ?? 0;
  const isLow = balance < 50000; // below KES 500

  const handleTopUp = () => {
    setFormError('');
    const cents = Math.round(parseFloat(topUpAmount || '0') * 100);
    if (!cents || cents <= 0) { setFormError('Enter a valid amount'); return; }
    if (!topUpDesc.trim()) { setFormError('Description is required'); return; }
    topUpMutation.mutate({ amountCents: cents, description: topUpDesc.trim() });
  };

  const handleDisburse = () => {
    setFormError('');
    const cents = Math.round(parseFloat(disburseAmount || '0') * 100);
    if (!cents || cents <= 0) { setFormError('Enter a valid amount'); return; }
    if (!disburseDesc.trim()) { setFormError('Description is required'); return; }
    disburseMutation.mutate({
      amountCents: cents,
      description: disburseDesc.trim(),
      reference: disburseRef.trim() || undefined,
    });
  };

  return (
    <div className="bg-white rounded-2xl border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-xl ${isLow ? 'bg-amber-100' : 'bg-emerald-100'}`}>
            <Wallet className={`w-5 h-5 ${isLow ? 'text-amber-600' : 'text-emerald-600'}`} />
          </div>
          <div>
            <h2 className="font-bold text-gray-800">Petty Cash Float</h2>
            <p className="text-xs text-gray-500">Manage small cash disbursements</p>
          </div>
        </div>
        <button
          onClick={() => void refetch()}
          className="p-1.5 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      <div className="p-6 space-y-5">
        {/* Balance card */}
        {isLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
          </div>
        ) : (
          <>
            <div className={`rounded-2xl p-5 flex items-center justify-between ${
              balance === 0
                ? 'bg-gray-100 border border-gray-200'
                : isLow
                ? 'bg-amber-50 border border-amber-200'
                : 'bg-emerald-50 border border-emerald-200'
            }`}>
              <div>
                <div className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1">
                  Available Balance
                </div>
                <div className={`text-3xl font-bold ${
                  balance === 0 ? 'text-gray-400' : isLow ? 'text-amber-700' : 'text-emerald-700'
                }`}>
                  {fmt(balance)}
                </div>
                {pettyCash?.lastTopUpAt && (
                  <div className="text-xs text-gray-400 mt-1">
                    Last top-up: {fmtDT(pettyCash.lastTopUpAt)}
                  </div>
                )}
              </div>
              {isLow && balance > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full text-xs font-semibold">
                  <AlertTriangle className="w-3.5 h-3.5" />
                  Low Float
                </div>
              )}
              {balance === 0 && (
                <div className="text-gray-400 text-xs font-medium">No float yet</div>
              )}
            </div>

            {/* Action buttons */}
            <div className="flex gap-3">
              {isManagerOrOwner && (
                <button
                  onClick={() => { setShowTopUp(!showTopUp); setShowDisburse(false); setFormError(''); }}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-colors border ${
                    showTopUp
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50'
                  }`}
                >
                  <ArrowUpCircle className="w-4 h-4" />
                  Top Up
                </button>
              )}
              <button
                onClick={() => { setShowDisburse(!showDisburse); setShowTopUp(false); setFormError(''); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl font-semibold text-sm transition-colors border ${
                  showDisburse
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-red-700 border-red-300 hover:bg-red-50'
                }`}
              >
                <ArrowDownCircle className="w-4 h-4" />
                Disburse
              </button>
            </div>

            {/* Error display */}
            {formError && (
              <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {formError}
              </div>
            )}

            {/* Top-Up form */}
            {showTopUp && (
              <div className="border border-emerald-200 rounded-xl p-4 bg-emerald-50/50 space-y-3">
                <h3 className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                  <ArrowUpCircle className="w-4 h-4" />
                  Add Float
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount (KES)</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={topUpAmount}
                      onChange={(e) => setTopUpAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description</label>
                    <input
                      type="text"
                      value={topUpDesc}
                      onChange={(e) => setTopUpDesc(e.target.value)}
                      placeholder="e.g. Weekly float refill"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {[500, 1000, 2000, 5000].map((amt) => (
                    <button
                      key={amt}
                      onClick={() => setTopUpAmount(String(amt))}
                      className="px-3 py-1 rounded-lg text-xs border border-emerald-300 text-emerald-700 hover:bg-emerald-100"
                    >
                      KES {amt.toLocaleString()}
                    </button>
                  ))}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowTopUp(false); setFormError(''); }}
                    className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleTopUp}
                    disabled={topUpMutation.isPending}
                    className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {topUpMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Confirm Top Up
                  </button>
                </div>
              </div>
            )}

            {/* Disburse form */}
            {showDisburse && (
              <div className="border border-red-200 rounded-xl p-4 bg-red-50/50 space-y-3">
                <h3 className="text-sm font-semibold text-red-800 flex items-center gap-2">
                  <ArrowDownCircle className="w-4 h-4" />
                  Disburse Cash
                </h3>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Amount (KES)</label>
                    <input
                      type="number"
                      min="1"
                      step="0.01"
                      value={disburseAmount}
                      onChange={(e) => setDisburseAmount(e.target.value)}
                      placeholder="0.00"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Description *</label>
                    <input
                      type="text"
                      value={disburseDesc}
                      onChange={(e) => setDisburseDesc(e.target.value)}
                      placeholder="e.g. Office supplies"
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Reference (optional)</label>
                  <input
                    type="text"
                    value={disburseRef}
                    onChange={(e) => setDisburseRef(e.target.value)}
                    placeholder="Receipt no. or PO number"
                    className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-red-500 focus:border-transparent"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => { setShowDisburse(false); setFormError(''); }}
                    className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDisburse}
                    disabled={disburseMutation.isPending}
                    className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50 flex items-center justify-center gap-1"
                  >
                    {disburseMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Confirm Disbursement
                  </button>
                </div>
              </div>
            )}

            {/* Transaction history */}
            <div>
              <h3 className="text-sm font-semibold text-gray-600 mb-3">Recent Transactions</h3>
              {pettyCash?.transactions.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-4">No transactions yet</p>
              ) : (
                <div className="space-y-2">
                  {pettyCash?.transactions.map((tx) => (
                    <div
                      key={tx.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`p-1.5 rounded-lg ${
                          tx.type === 'TOP_UP' ? 'bg-emerald-100' : 'bg-red-100'
                        }`}>
                          {tx.type === 'TOP_UP'
                            ? <ArrowUpCircle className="w-4 h-4 text-emerald-600" />
                            : <ArrowDownCircle className="w-4 h-4 text-red-600" />
                          }
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${
                              tx.type === 'TOP_UP'
                                ? 'bg-emerald-100 text-emerald-700'
                                : 'bg-red-100 text-red-700'
                            }`}>
                              {tx.type === 'TOP_UP' ? 'TOP UP' : 'DISBURSEMENT'}
                            </span>
                          </div>
                          <div className="text-sm text-gray-700 mt-0.5">{tx.description}</div>
                          {tx.reference && (
                            <div className="text-xs text-gray-400">Ref: {tx.reference}</div>
                          )}
                          <div className="text-xs text-gray-400">{fmtDT(tx.createdAt)}</div>
                        </div>
                      </div>
                      <div className={`text-base font-bold ${
                        tx.type === 'TOP_UP' ? 'text-emerald-600' : 'text-red-600'
                      }`}>
                        {tx.type === 'TOP_UP' ? '+' : '−'}{fmt(tx.amountCents)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
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

  const [openError, setOpenError] = useState('');

  // Open drawer
  const openDrawer = useMutation({
    mutationFn: (openingBalanceCents: number) =>
      api.post('/cash-drawer/open', { businessId, storeId, cashierId, openingBalanceCents }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['cash-drawer-session'] });
      setOpeningInput('');
      setOpenError('');
    },
    onError: (err) => setOpenError(err instanceof Error ? err.message : 'Failed to open drawer'),
  });

  // Close drawer (Z-Report). The server recomputes the expected balance — sending a
  // stale or missing value here is what made every close report a full-count variance.
  const closeDrawer = useMutation({
    mutationFn: async (closingBalanceCents: number) => {
      if (!session) throw new Error('No session');
      return api.patch(`/cash-drawer/${session.id}/close`, { closingBalanceCents });
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

            {!storeId && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-800">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                No store is selected for your session. Pick a store (Settings → Stores) or sign in
                again — the drawer cannot be opened without one.
              </div>
            )}
            {openError && (
              <div className="mt-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {openError}
              </div>
            )}

            <button
              onClick={() => openDrawer.mutate(openingCents)}
              disabled={openingInput === '' || openDrawer.isPending || !storeId}
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
                  {(summary.paymentBreakdown ?? []).length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-4">No transactions yet</p>
                  ) : (
                    (summary.paymentBreakdown ?? []).map((p) => (
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

              {xReport?.error && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-sm text-amber-800">
                  {xReport.error}
                </div>
              )}

              {xReport?.session && (
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

        {/* Petty Cash Float */}
        <PettyCashSection
          businessId={businessId}
          userId={cashierId}
          userRole={user?.role}
        />
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

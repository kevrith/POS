import { useState, useEffect, useCallback } from 'react';
import { Phone, CheckCircle2, X, RefreshCw, Smartphone, ChevronDown, ChevronUp, Banknote, Clock } from 'lucide-react';
import { api } from '../../lib/api';
import { subscribeToEvent, SocketEvents } from '../../lib/socket';

interface C2BPayment {
  id: string;
  transactionId: string;
  customerName: string;
  phoneNumber: string;
  amountCents: number;
  billRefNumber: string;
  status: string;
  createdAt: string;
  shortCode: string | null;
  transactionType: string;
}

interface Props {
  businessId: string;
  onApply: (payment: C2BPayment) => void; // Apply payment to current sale
}

function fmtKES(cents: number) {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  return d.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

export default function IncomingPaymentsPanel({ businessId, onApply }: Props) {
  const [payments, setPayments] = useState<C2BPayment[]>([]);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [dismissing, setDismissing] = useState<string | null>(null);

  const fetchPayments = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    try {
      const data = await api.get<C2BPayment[]>(`/payments/mpesa/c2b/incoming?businessId=${businessId}&limit=30`);
      setPayments(data);
    } catch {
      // fail silently
    } finally {
      setLoading(false);
    }
  }, [businessId]);

  useEffect(() => {
    void fetchPayments();
  }, [fetchPayments]);

  // Real-time: prepend new payments as they arrive
  useEffect(() => {
    if (!businessId) return;
    return subscribeToEvent(SocketEvents.MPESA_C2B_PAYMENT, (data) => {
      const incoming = data as unknown as C2BPayment;
      setPayments((prev) => {
        if (prev.some((p) => p.id === incoming.id)) return prev;
        return [{ ...incoming, status: 'PENDING' }, ...prev];
      });
    });
  }, [businessId]);

  async function dismiss(id: string) {
    setDismissing(id);
    try {
      await api.patch(`/payments/mpesa/c2b/${id}/dismiss`, {});
      setPayments((prev) => prev.filter((p) => p.id !== id));
    } catch {
      // fail silently
    } finally {
      setDismissing(null);
    }
  }

  const pending = payments.filter((p) => p.status === 'PENDING');
  const matched = payments.filter((p) => p.status === 'MATCHED');

  if (payments.length === 0 && !loading) {
    return (
      <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-center">
        <Smartphone className="w-8 h-8 text-slate-600 mx-auto mb-2" />
        <p className="text-sm text-slate-500">No incoming M-Pesa payments</p>
        <p className="text-xs text-slate-600 mt-1">Payments to your Paybill/Till appear here in real-time</p>
        <button onClick={() => void fetchPayments()} className="mt-3 text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 mx-auto">
          <RefreshCw className="w-3 h-3" /> Refresh
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setCollapsed((c) => !c)}
          className="flex items-center gap-2 text-sm font-semibold text-slate-300"
        >
          {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
          Incoming Payments
          {pending.length > 0 && (
            <span className="bg-green-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">
              {pending.length} new
            </span>
          )}
        </button>
        <button
          onClick={() => void fetchPayments()}
          disabled={loading}
          className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
          title="Refresh"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {!collapsed && (
        <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
          {/* Pending payments first */}
          {pending.map((p) => (
            <div
              key={p.id}
              className="bg-slate-800 border border-green-700/50 rounded-xl p-3 relative"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-green-900/50 flex items-center justify-center flex-shrink-0">
                    <Banknote className="w-4 h-4 text-green-400" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-100 truncate">{p.customerName}</p>
                    <p className="text-xs text-slate-400 flex items-center gap-1">
                      <Phone className="w-3 h-3" /> {p.phoneNumber}
                    </p>
                  </div>
                </div>
                <div className="text-right flex-shrink-0">
                  <p className="text-base font-black text-green-400">{fmtKES(p.amountCents)}</p>
                  <p className="text-[10px] text-slate-500 flex items-center justify-end gap-1">
                    <Clock className="w-2.5 h-2.5" />{fmtTime(p.createdAt)}
                  </p>
                </div>
              </div>
              {p.billRefNumber && (
                <p className="text-xs text-slate-400 mt-1.5 bg-slate-700/50 rounded px-2 py-1">
                  Ref: <span className="text-slate-200 font-mono">{p.billRefNumber}</span>
                </p>
              )}
              <p className="text-[10px] text-slate-500 mt-1">
                {p.transactionType === 'CustomerBuyGoodsOnline' ? 'Till (Buy Goods)' : 'Paybill'} · {p.transactionId}
              </p>
              <div className="flex gap-2 mt-2.5">
                <button
                  onClick={() => onApply(p)}
                  className="flex-1 py-1.5 bg-green-600 hover:bg-green-500 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" /> Apply to Sale
                </button>
                <button
                  onClick={() => void dismiss(p.id)}
                  disabled={dismissing === p.id}
                  className="py-1.5 px-3 bg-slate-700 hover:bg-slate-600 text-slate-400 hover:text-slate-200 text-xs rounded-lg transition-colors"
                  title="Dismiss"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}

          {/* Already matched (dimmed) */}
          {matched.slice(0, 3).map((p) => (
            <div key={p.id} className="bg-slate-800/40 border border-slate-700/50 rounded-xl p-3 opacity-60">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-slate-300">{p.customerName}</p>
                    <p className="text-[10px] text-slate-500">{p.billRefNumber || p.transactionId}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-slate-400">{fmtKES(p.amountCents)}</p>
                  <p className="text-[10px] text-green-600">Matched</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

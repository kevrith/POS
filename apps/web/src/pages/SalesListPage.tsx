import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Receipt, Ban, Eye, RotateCcw, Printer, MessageSquare, TrendingUp, CheckCircle2, Clock, Calendar, X } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import VoidModal from '../components/VoidModal';
import ReturnModal from '../components/ReturnModal';
import PrintModal from '../components/PrintModal';
import type { ReceiptData } from '../lib/printer';

interface Sale {
  id: string;
  receiptNumber: string;
  status: string;
  totalCents: number;
  createdAt: string;
  cashier: { name: string };
  customer?: { id: string; name: string; phone?: string };
  etimsSubmitted?: boolean;
  etimsControlNumber?: string;
}

interface SaleDetail extends Sale {
  items: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
  payments: Array<{
    method: string;
    amountCents: number;
    reference?: string;
  }>;
  subtotalCents: number;
  serviceChargeCents: number;
  discountCents: number;
  vatCents: number;
  totCents: number;
}

type SalesRange = 'today' | 'week' | 'month' | 'custom';

function getSalesDateRange(range: SalesRange, from: string, to: string): { startDate: string; endDate: string } {
  const now = new Date();
  if (range === 'today') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (range === 'week') {
    const day = now.getDay();
    const start = new Date(now); start.setDate(now.getDate() - day); start.setHours(0, 0, 0, 0);
    const end = new Date(now); end.setHours(23, 59, 59, 999);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  if (range === 'month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }
  return { startDate: new Date(from).toISOString(), endDate: new Date(to + 'T23:59:59').toISOString() };
}

function SaleDetailModal({ saleId, businessId, onClose }: { saleId: string; businessId: string; onClose: () => void }) {
  const { data: sale, isLoading } = useQuery<SaleDetail>({
    queryKey: ['sale-detail', saleId],
    queryFn: () => api.get<SaleDetail>(`/sales/${saleId}?businessId=${businessId}`),
  });

  const formatKES = (cents: number) =>
    `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Sale Details</h2>
            {sale && <p className="text-sm text-gray-500 dark:text-gray-400">Receipt #{sale.receiptNumber}</p>}
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : sale ? (
            <div className="space-y-6">
              {/* Sale Info */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Date</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {new Date(sale.createdAt).toLocaleString('en-KE')}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Cashier</p>
                  <p className="text-sm font-medium text-gray-900 dark:text-white">{sale.cashier?.name ?? 'N/A'}</p>
                </div>
                {sale.customer && (
                  <div className="col-span-2">
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Customer</p>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      {sale.customer.name}
                      {sale.customer.phone && <span className="text-gray-500 ml-2">({sale.customer.phone})</span>}
                    </p>
                  </div>
                )}
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">Status</p>
                  <span className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${
                    sale.status === 'PAID' ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                    sale.status === 'VOIDED' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                    'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                  }`}>
                    {sale.status}
                  </span>
                </div>
                {sale.etimsControlNumber && (
                  <div>
                    <p className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-1">KRA Control #</p>
                    <p className="text-sm font-mono font-medium text-gray-900 dark:text-white">{sale.etimsControlNumber}</p>
                  </div>
                )}
              </div>

              {/* Items */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Items</h3>
                <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-semibold text-gray-500 dark:text-gray-400">Item</th>
                        <th className="px-4 py-2 text-center text-xs font-semibold text-gray-500 dark:text-gray-400">Qty</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">Price</th>
                        <th className="px-4 py-2 text-right text-xs font-semibold text-gray-500 dark:text-gray-400">Total</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                      {sale.items.map((item, i) => (
                        <tr key={i}>
                          <td className="px-4 py-3 text-gray-900 dark:text-white">{item.name}</td>
                          <td className="px-4 py-3 text-center text-gray-600 dark:text-gray-300">{item.quantity}</td>
                          <td className="px-4 py-3 text-right text-gray-600 dark:text-gray-300">{formatKES(item.unitPriceCents)}</td>
                          <td className="px-4 py-3 text-right font-medium text-gray-900 dark:text-white">{formatKES(item.totalCents)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Totals */}
              <div className="border-t border-gray-200 dark:border-gray-700 pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-600 dark:text-gray-400">Subtotal</span>
                  <span className="font-medium text-gray-900 dark:text-white">{formatKES(sale.subtotalCents)}</span>
                </div>
                {sale.discountCents > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Discount</span>
                    <span className="font-medium text-green-600 dark:text-green-400">-{formatKES(sale.discountCents)}</span>
                  </div>
                )}
                {sale.vatCents > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">VAT (16% inclusive)</span>
                    <span className="font-medium text-gray-500 dark:text-gray-400">{formatKES(sale.vatCents)}</span>
                  </div>
                )}
                {sale.serviceChargeCents > 0 && (
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-600 dark:text-gray-400">Service Charge (10%)</span>
                    <span className="font-medium text-gray-900 dark:text-white">{formatKES(sale.serviceChargeCents)}</span>
                  </div>
                )}
                <div className="flex justify-between text-base font-bold border-t border-gray-200 dark:border-gray-700 pt-2">
                  <span className="text-gray-900 dark:text-white">Total</span>
                  <span className="text-blue-600 dark:text-blue-400">{formatKES(sale.totalCents)}</span>
                </div>
              </div>

              {/* Payments */}
              <div>
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">Payments</h3>
                <div className="space-y-2">
                  {sale.payments.map((payment, i) => (
                    <div key={i} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                      <div>
                        <p className="text-sm font-medium text-gray-900 dark:text-white">{payment.method}</p>
                        {payment.reference && <p className="text-xs text-gray-500 dark:text-gray-400">Ref: {payment.reference}</p>}
                      </div>
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{formatKES(payment.amountCents)}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-center text-gray-500 dark:text-gray-400 py-12">Sale not found</p>
          )}
        </div>

        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4">
          <button
            onClick={onClose}
            className="w-full py-2.5 bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-xl transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

export default function SalesListPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [selectedSale, setSelectedSale] = useState<Sale | null>(null);
  const [showViewModal, setShowViewModal] = useState(false);
  const [showVoidModal, setShowVoidModal] = useState(false);
  const [showReturnModal, setShowReturnModal] = useState(false);
  const [showPrintModal, setShowPrintModal] = useState(false);
  const [reprintData, setReprintData] = useState<ReceiptData | null>(null);
  const [reprintLoading, setReprintLoading] = useState<string | null>(null);
  const [sendingWhatsApp, setSendingWhatsApp] = useState<string | null>(null);
  const [dateRange, setDateRange] = useState<SalesRange>('month');
  const [customFrom, setCustomFrom] = useState(() => {
    const d = new Date(); d.setDate(1);
    return d.toISOString().substring(0, 10);
  });
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().substring(0, 10));

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';

  const { startDate, endDate } = useMemo(
    () => getSalesDateRange(dateRange, customFrom, customTo),
    [dateRange, customFrom, customTo],
  );

  const { data: sales = [], isLoading } = useQuery<Sale[]>({
    queryKey: ['sales', businessId, storeId, startDate, endDate],
    queryFn: () =>
      api.get<{ data: Sale[] }>(
        `/sales?businessId=${businessId}&storeId=${storeId}&limit=500&startDate=${startDate}&endDate=${endDate}`,
      ).then(r => r.data),
    enabled: !!businessId && !!storeId,
  });

  const formatKES = (cents: number) =>
    `KES ${(cents / 100).toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  const STATUS_COLORS: Record<string, string> = {
    PAID: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
    VOIDED: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
    AMENDED: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400',
    CREDIT: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  };

  const handleReprint = async (sale: Sale) => {
    setReprintLoading(sale.id);
    try {
      const detail = await api.get<SaleDetail>(`/sales/${sale.id}?businessId=${businessId}`);
      const receipt: ReceiptData = {
        receiptNumber: detail.receiptNumber,
        businessName: user?.name ? `${user.name}'s Business` : 'Universal POS',
        storeName: 'Main Store',
        date: detail.createdAt,
        cashierName: detail.cashier?.name ?? 'Cashier',
        customerName: detail.customer?.name,
        customerPhone: detail.customer?.phone,
        items: detail.items.map(item => ({
          name: item.name,
          quantity: item.quantity,
          unitPriceCents: item.unitPriceCents,
          totalCents: item.totalCents,
        })),
        subtotalCents: detail.subtotalCents,
        serviceChargeCents: detail.serviceChargeCents,
        // Recalculate tax using inclusive formula (fixes historical data stored with exclusive formula)
        vatCents: detail.totCents > 0 ? 0 : Math.round(Math.max(0, detail.subtotalCents - detail.discountCents) * 16 / 116),
        totCents: detail.totCents > 0 ? Math.round(Math.max(0, detail.subtotalCents - detail.discountCents) * 3 / 103) : 0,
        totalCents: detail.totalCents,
        payments: detail.payments,
        kraControlNumber: detail.etimsControlNumber,
        etimsSubmitted: detail.etimsSubmitted,
        saleId: detail.id,
      };
      setReprintData(receipt);
      setShowPrintModal(true);
    } catch (err) {
      console.error('Failed to load sale for reprint:', err);
    } finally {
      setReprintLoading(null);
    }
  };

  const handleSendWhatsApp = async (sale: Sale) => {
    if (!sale.customer?.phone) return;
    setSendingWhatsApp(sale.id);
    try {
      await api.post('/notifications/send-receipt', {
        businessId,
        phone: sale.customer.phone,
        receiptNumber: sale.receiptNumber,
        totalCents: sale.totalCents,
        channel: 'whatsapp',
      });
    } catch (err) {
      console.error('WhatsApp send failed:', err);
    } finally {
      setSendingWhatsApp(null);
    }
  };

  const totalRevenue = sales.reduce((s, sale) => s + (sale.status !== 'VOIDED' ? sale.totalCents : 0), 0);
  const paidCount = sales.filter((s) => s.status === 'PAID').length;
  const voidedCount = sales.filter((s) => s.status === 'VOIDED').length;
  const pendingKraCount = sales.filter((s) => s.etimsSubmitted === false && s.status === 'PAID').length;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Page Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 px-6 py-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 dark:bg-blue-900/30 flex items-center justify-center">
              <Receipt className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-gray-900 dark:text-white">Sales History</h1>
              <p className="text-sm text-gray-500 dark:text-gray-400">{sales.length} transactions</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Calendar className="w-4 h-4 text-gray-400" />
            {(['today', 'week', 'month', 'custom'] as SalesRange[]).map((r) => (
              <button
                key={r}
                onClick={() => setDateRange(r)}
                className={`px-3 py-1.5 text-xs rounded-lg font-medium transition-colors ${
                  dateRange === r ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {r === 'today' ? 'Today' : r === 'week' ? 'This Week' : r === 'month' ? 'This Month' : 'Custom'}
              </button>
            ))}
            {dateRange === 'custom' && (
              <>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="border px-2 py-1.5 rounded-lg text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                <span className="text-gray-400 text-xs">to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="border px-2 py-1.5 rounded-lg text-xs dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </>
            )}
            {pendingKraCount > 0 && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-xs font-semibold rounded-full">
                <Clock className="w-3.5 h-3.5" />
                {pendingKraCount} pending KRA
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-5">
        {/* Summary stat cards */}
        {!isLoading && sales.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[
              {
                label: 'Total Revenue',
                value: formatKES(totalRevenue),
                icon: TrendingUp,
                iconColor: 'text-green-600 dark:text-green-400',
                bg: 'bg-green-50 dark:bg-green-900/20',
                valueColor: 'text-green-700 dark:text-green-400',
              },
              {
                label: 'Transactions',
                value: sales.length.toLocaleString(),
                icon: Receipt,
                iconColor: 'text-blue-600 dark:text-blue-400',
                bg: 'bg-blue-50 dark:bg-blue-900/20',
                valueColor: 'text-blue-700 dark:text-blue-400',
              },
              {
                label: 'Completed',
                value: paidCount.toLocaleString(),
                icon: CheckCircle2,
                iconColor: 'text-indigo-600 dark:text-indigo-400',
                bg: 'bg-indigo-50 dark:bg-indigo-900/20',
                valueColor: 'text-indigo-700 dark:text-indigo-400',
              },
              {
                label: 'Voided',
                value: voidedCount.toLocaleString(),
                icon: Ban,
                iconColor: 'text-red-500 dark:text-red-400',
                bg: 'bg-red-50 dark:bg-red-900/20',
                valueColor: 'text-red-600 dark:text-red-400',
              },
            ].map(({ label, value, icon: Icon, iconColor, bg, valueColor }) => (
              <div key={label} className={`${bg} rounded-xl p-4`}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">{label}</p>
                  <Icon className={`w-4 h-4 ${iconColor}`} />
                </div>
                <p className={`text-xl font-bold ${valueColor}`}>{value}</p>
              </div>
            ))}
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-20 gap-3">
            <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-gray-400 dark:text-gray-500">Loading sales...</p>
          </div>
        ) : sales.length === 0 ? (
          <div className="text-center py-20 bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center">
              <Receipt className="w-8 h-8 text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-gray-600 dark:text-gray-300 font-semibold text-lg">No sales yet</p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mt-1">Sales will appear here after checkout</p>
          </div>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
                <tr>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Receipt
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Date
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden sm:table-cell">
                    Cashier
                  </th>
                  <th className="px-6 py-3.5 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide hidden md:table-cell">
                    Customer
                  </th>
                  <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Amount
                  </th>
                  <th className="px-6 py-3.5 text-center text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Status
                  </th>
                  <th className="px-6 py-3.5 text-right text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                {sales.map((sale) => (
                  <tr key={sale.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors">
                    <td className="px-6 py-4">
                      <p className="text-sm font-mono font-semibold text-gray-900 dark:text-white">{sale.receiptNumber}</p>
                      {sale.etimsSubmitted === false && (
                        <span className="inline-flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400 font-medium mt-0.5">
                          <Clock className="w-3 h-3" />
                          Pending KRA
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 whitespace-nowrap">
                      {new Date(sale.createdAt).toLocaleString('en-KE', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-300 hidden sm:table-cell">
                      {sale.cashier?.name ?? 'N/A'}
                    </td>
                    <td className="px-6 py-4 text-sm hidden md:table-cell">
                      {sale.customer?.name ? (
                        <span className="font-medium text-gray-800 dark:text-gray-200">{sale.customer.name}</span>
                      ) : (
                        <span className="text-gray-400 dark:text-gray-500">Walk-in</span>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <span className="text-sm font-bold text-gray-900 dark:text-white">{formatKES(sale.totalCents)}</span>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <span
                        className={`inline-flex px-2.5 py-1 text-xs font-semibold rounded-full ${
                          STATUS_COLORS[sale.status] ?? 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
                        }`}
                      >
                        {sale.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <button
                          onClick={() => {
                            setSelectedSale(sale);
                            setShowViewModal(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
                          title="View"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          View
                        </button>
                        {sale.status === 'PAID' && (
                          <>
                            <button
                              onClick={() => void handleReprint(sale)}
                              disabled={reprintLoading === sale.id}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 rounded-lg transition-colors disabled:opacity-50"
                              title="Reprint receipt"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              {reprintLoading === sale.id ? '...' : 'Print'}
                            </button>
                            {sale.customer?.phone && (
                              <button
                                onClick={() => void handleSendWhatsApp(sale)}
                                disabled={sendingWhatsApp === sale.id}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-teal-600 dark:text-teal-400 hover:bg-teal-50 dark:hover:bg-teal-900/20 rounded-lg transition-colors disabled:opacity-50"
                                title="Send WhatsApp receipt"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                                {sendingWhatsApp === sale.id ? '...' : 'WhatsApp'}
                              </button>
                            )}
                            <button
                              onClick={() => {
                                setSelectedSale(sale);
                                setShowReturnModal(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-orange-600 dark:text-orange-400 hover:bg-orange-50 dark:hover:bg-orange-900/20 rounded-lg transition-colors"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              Return
                            </button>
                            <button
                              onClick={() => {
                                setSelectedSale(sale);
                                setShowVoidModal(true);
                              }}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                            >
                              <Ban className="w-3.5 h-3.5" />
                              Void
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* View Sale Modal */}
      {showViewModal && selectedSale && (
        <SaleDetailModal
          saleId={selectedSale.id}
          businessId={businessId}
          onClose={() => {
            setShowViewModal(false);
            setSelectedSale(null);
          }}
        />
      )}

      {showVoidModal && selectedSale && (
        <VoidModal
          saleId={selectedSale.id}
          receiptNumber={selectedSale.receiptNumber}
          totalCents={selectedSale.totalCents}
          businessId={businessId}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ['sales'] });
          }}
          onClose={() => {
            setShowVoidModal(false);
            setSelectedSale(null);
          }}
        />
      )}

      {showReturnModal && selectedSale && (
        <ReturnModal
          saleId={selectedSale.id}
          receiptNumber={selectedSale.receiptNumber}
          totalCents={selectedSale.totalCents}
          customerId={selectedSale.customer?.id}
          businessId={businessId}
          onSuccess={() => {
            void qc.invalidateQueries({ queryKey: ['sales'] });
          }}
          onClose={() => {
            setShowReturnModal(false);
            setSelectedSale(null);
          }}
        />
      )}

      {showPrintModal && reprintData && (
        <PrintModal
          receipt={reprintData}
          onClose={() => {
            setShowPrintModal(false);
            setReprintData(null);
          }}
        />
      )}
    </div>
  );
}

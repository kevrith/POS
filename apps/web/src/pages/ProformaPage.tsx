import { useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { api, ApiError, openPdfReport } from '../lib/api';
import RestrictedSaleModal, { type RestrictedApprovalInput } from '../components/clinical/RestrictedSaleModal';
import { useAuthStore } from '../stores/auth';
import { useDialog } from '../components/Dialog';
import { X, Printer, FileText } from 'lucide-react';

interface Proforma {
  id: string;
  receiptNumber: string;
  customerName?: string;
  customerPhone?: string;
  status: string;
  totalCents: number;
  notes?: string;
  proformaValidUntil?: string;
  createdAt: string;
  items: Array<{
    name: string;
    quantity: number;
    unitPriceCents: number;
    totalCents: number;
  }>;
}

const PAYMENT_METHODS = [
  { value: 'CASH', label: 'Cash' },
  { value: 'MPESA', label: 'M-Pesa' },
  { value: 'CARD', label: 'Card' },
  { value: 'BANK_TRANSFER', label: 'Bank Transfer' },
  { value: 'CHEQUE', label: 'Cheque' },
];

export default function ProformaPage() {
  const [selectedProforma, setSelectedProforma] = useState<Proforma | null>(null);
  const [payMethod, setPayMethod] = useState('CASH');
  const [payRef, setPayRef] = useState('');
  // A quotation holding prescription-only or controlled medicines needs a manager's approval to become a sale, as at the till.
  const approval = useRef<RestrictedApprovalInput | undefined>(undefined);
  const [restrictedAsk, setRestrictedAsk] = useState<{ medicines: string[]; controlled: boolean; vars: { id: string; method: string; reference?: string } } | null>(null);
  const queryClient = useQueryClient();
  const { confirm } = useDialog();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';

  const { data: proformas = [], isLoading, error } = useQuery({
    queryKey: ['proformas', businessId],
    queryFn: () => api.get<Proforma[]>(`/sales/proformas?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const convertMutation = useMutation({
    mutationFn: (vars: { id: string; method: string; reference?: string }) => {
      const proforma = proformas.find((p) => p.id === vars.id);
      return api.post<{ id: string; receiptNumber: string }>(`/sales/proforma/${vars.id}/convert`, {
        cashierId: user?.id,
        storeId: user?.storeId,
        ...(approval.current && { restrictedOverride: approval.current }),
        payments: [
          {
            method: vars.method,
            amountCents: proforma?.totalCents ?? 0,
            reference: vars.reference || undefined,
          },
        ],
      });
    },
    onSuccess: (data) => {
      approval.current = undefined;
      setRestrictedAsk(null);
      queryClient.invalidateQueries({ queryKey: ['proformas', businessId] });
      queryClient.invalidateQueries({ queryKey: ['sales'] });
      setSelectedProforma(null);
      setPayRef('');
      toast.success(`Converted to sale — receipt ${data.receiptNumber}`, {
        action: {
          label: 'Print receipt',
          onClick: () => void openReceipt(data.id),
        },
      });
    },
    onError: (err: Error, vars) => {
      if (err instanceof ApiError && err.code === 'RESTRICTED_SALE') {
        const found = (Array.isArray(err.details) ? err.details : []) as Array<{ name: string; controlled: boolean }>;
        setRestrictedAsk({ medicines: found.map((d) => d.name), controlled: found.some((d) => d.controlled), vars });
      } else {
        // An approval that was refused (a wrong PIN, a missing reason) is said while the window is still open.
        toast.error(err.message || 'Conversion failed');
      }
    },
  });

  const cancelMutation = useMutation({
    mutationFn: (proformaId: string) => api.patch(`/sales/proformas/${proformaId}/cancel`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proformas', businessId] });
      setSelectedProforma(null);
      toast.success('Quotation cancelled');
    },
    onError: (err: Error) => toast.error(err.message || 'Could not cancel'),
  });

  /** Quotations and their converted receipts both render through the sale-receipt PDF route. */
  async function openReceipt(saleId: string) {
    try {
      await openPdfReport(`/reports/pdf/sale/${saleId}`);
    } catch (err) {
      toast.error((err as Error).message || 'Could not open the document');
    }
  }

  async function handleCancel(proforma: Proforma) {
    const ok = await confirm({
      title: 'Cancel quotation',
      message: `Cancel ${proforma.receiptNumber}? This cannot be undone.`,
      confirmLabel: 'Cancel quotation',
      variant: 'danger',
    });
    if (ok) cancelMutation.mutate(proforma.id);
  }

  const formatKES = (cents: number) => `KES ${(cents / 100).toFixed(2)}`;
  const formatDate = (date: string) => new Date(date).toLocaleDateString('en-KE');

  const activeProformas = proformas.filter((p) => p.status === 'PROFORMA');
  const expiredProformas = activeProformas.filter(
    (p) => p.proformaValidUntil && new Date(p.proformaValidUntil) < new Date()
  );

  return (
    <div className="p-3 sm:p-6">
      <h1 className="text-2xl font-bold mb-6">Proforma / Quotations</h1>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded">
          <p className="text-sm text-blue-600 font-medium">Active Proformas</p>
          <p className="text-2xl font-bold">{activeProformas.length}</p>
        </div>
        <div className="bg-yellow-50 p-4 rounded">
          <p className="text-sm text-yellow-600 font-medium">Expired</p>
          <p className="text-2xl font-bold">{expiredProformas.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded">
          <p className="text-sm text-green-600 font-medium">Total Value</p>
          <p className="text-2xl font-bold">
            {formatKES(activeProformas.reduce((sum, p) => sum + p.totalCents, 0))}
          </p>
        </div>
      </div>

      <div className="bg-white rounded shadow">
        <div className="p-4 border-b">
          <h2 className="font-bold">Active Quotations</h2>
        </div>

        {isLoading ? (
          <div className="p-8 text-center">Loading...</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">{(error as Error).message}</div>
        ) : activeProformas.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            No quotations yet. Create one from the POS screen, or generate an invoice from a field order.
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4">Proforma #</th>
                <th className="text-left p-4">Customer</th>
                <th className="text-left p-4">Date</th>
                <th className="text-left p-4">Valid Until</th>
                <th className="text-right p-4">Total</th>
                <th className="text-center p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {activeProformas.map((proforma) => {
                const isExpired =
                  proforma.proformaValidUntil && new Date(proforma.proformaValidUntil) < new Date();
                return (
                  <tr key={proforma.id} className="border-t hover:bg-gray-50">
                    <td className="p-4 font-mono font-medium">{proforma.receiptNumber}</td>
                    <td className="p-4">
                      <div className="font-medium">{proforma.customerName || 'Walk-in'}</div>
                      <div className="text-sm text-gray-500">{proforma.customerPhone}</div>
                    </td>
                    <td className="p-4">{formatDate(proforma.createdAt)}</td>
                    <td className="p-4">
                      {proforma.proformaValidUntil ? (
                        <span className={isExpired ? 'text-red-600 font-medium' : ''}>
                          {formatDate(proforma.proformaValidUntil)}
                          {isExpired && ' (Expired)'}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="p-4 text-right font-bold">{formatKES(proforma.totalCents)}</td>
                    <td className="p-4">
                      <div className="flex gap-2 justify-center">
                        <button
                          onClick={() => setSelectedProforma(proforma)}
                          className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
                        >
                          View
                        </button>
                        <button
                          onClick={() => void openReceipt(proforma.id)}
                          className="px-3 py-1 text-sm bg-gray-100 text-gray-700 rounded hover:bg-gray-200 flex items-center gap-1"
                          title="Print / save as PDF"
                        >
                          <Printer size={14} /> Print
                        </button>
                        <button
                          onClick={() => handleCancel(proforma)}
                          disabled={cancelMutation.isPending}
                          className="bg-red-600 text-white px-3 py-1 rounded text-sm disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      {selectedProforma && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white p-6 rounded shadow-lg max-w-2xl w-full max-h-[85vh] overflow-y-auto">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h2 className="text-xl font-bold">Proforma {selectedProforma.receiptNumber}</h2>
                <p className="text-gray-600">{selectedProforma.customerName || 'Walk-in Customer'}</p>
              </div>
              <button onClick={() => setSelectedProforma(null)} className="text-gray-500" aria-label="Close">
                <X size={24} />
              </button>
            </div>

            <div className="border-t border-b py-4 mb-4">
              <table className="w-full">
                <thead>
                  <tr className="text-left text-sm text-gray-600">
                    <th className="pb-2">Item</th>
                    <th className="pb-2 text-right">Qty</th>
                    <th className="pb-2 text-right">Price</th>
                    <th className="pb-2 text-right">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedProforma.items.map((item, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="py-2">{item.name}</td>
                      <td className="py-2 text-right">{item.quantity}</td>
                      <td className="py-2 text-right">{formatKES(item.unitPriceCents)}</td>
                      <td className="py-2 text-right font-medium">{formatKES(item.totalCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {selectedProforma.notes && (
              <p className="text-sm text-gray-500 mb-4">{selectedProforma.notes}</p>
            )}

            <div className="flex justify-between items-center mb-4">
              <span className="text-lg font-medium">Total</span>
              <span className="text-2xl font-bold">{formatKES(selectedProforma.totalCents)}</span>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Payment Method</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value)}
                  className="w-full border rounded px-3 py-2 text-sm"
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m.value} value={m.value}>{m.label}</option>
                  ))}
                </select>
              </div>
              {payMethod !== 'CASH' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Reference</label>
                  <input
                    value={payRef}
                    onChange={(e) => setPayRef(e.target.value)}
                    placeholder="e.g. QHJ23K8LP0"
                    className="w-full border rounded px-3 py-2 text-sm"
                  />
                </div>
              )}
            </div>

            <div className="flex gap-2">
              <button
                onClick={() =>
                  convertMutation.mutate({
                    id: selectedProforma.id,
                    method: payMethod,
                    reference: payRef,
                  })
                }
                disabled={convertMutation.isPending}
                className="flex-1 bg-green-600 text-white py-2 rounded font-medium disabled:opacity-50"
              >
                {convertMutation.isPending ? 'Converting...' : 'Convert to Sale'}
              </button>
              <button
                onClick={() => void openReceipt(selectedProforma.id)}
                className="px-4 bg-gray-100 text-gray-700 py-2 rounded font-medium flex items-center gap-1.5"
              >
                <FileText size={16} /> Print
              </button>
              <button
                onClick={() => setSelectedProforma(null)}
                className="px-4 bg-gray-300 py-2 rounded font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
      {restrictedAsk && (
        <RestrictedSaleModal
          medicines={restrictedAsk.medicines}
          controlled={restrictedAsk.controlled}
          role={user?.role}
          busy={convertMutation.isPending}
          onCancel={() => { approval.current = undefined; setRestrictedAsk(null); }}
          onApprove={(a) => { approval.current = a; convertMutation.mutate(restrictedAsk.vars); }}
        />
      )}
    </div>
  );
}

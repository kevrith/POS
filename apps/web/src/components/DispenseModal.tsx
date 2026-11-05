import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatKES } from '@pos/shared';
import { toast } from 'sonner';
import { Loader2, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { autoPrintReceipt, printErrorMessage } from '../lib/receiptPrint';
import { buildDirectSaleReceipt, type DirectSaleResponse } from '../lib/directSaleReceipt';
import type { ReceiptData } from '../lib/printer';
import DirectSaleReceiptModal from './DirectSaleReceiptModal';

interface Quote {
  invoice: boolean;
  totalCents: number;
  unpriced: string[];
  lines: Array<{ name: string; quantity: number; unitPriceCents: number; totalCents: number }>;
}

interface FillResponse extends DirectSaleResponse {
  insurerShareCents?: number;
  patientShareCents?: number;
  patientPaidCents?: number;
}

const METHODS = [
  { id: 'CASH', label: 'Cash' },
  { id: 'MPESA', label: 'M-Pesa' },
  { id: 'CARD', label: 'Card' },
  { id: 'BANK', label: 'Bank' },
];

/**
 * Dispense (or refill) a prescription. For a business that records pharmacy takings as sales this prices the fill,
 * takes the patient's payment and any insurer's share, and ends in a receipt; otherwise it just confirms.
 */
export default function DispenseModal({
  rx,
  mode,
  onClose,
}: {
  rx: { id: string; prescriptionNumber: string; patientName: string };
  mode: 'dispense' | 'refill';
  onClose: () => void;
}) {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const qc = useQueryClient();
  const [method, setMethod] = useState('CASH');
  const [tendered, setTendered] = useState('');
  const [kraPin, setKraPin] = useState('');
  const [insured, setInsured] = useState(false);
  const [providerId, setProviderId] = useState('');
  const [memberNumber, setMemberNumber] = useState('');
  const [patientPct, setPatientPct] = useState('20');
  const [receipt, setReceipt] = useState<{ data: ReceiptData; res: FillResponse } | null>(null);

  const { data: quote, isError: quoteFailed } = useQuery<Quote>({
    queryKey: ['rx-quote', rx.id],
    queryFn: () => api.get(`/prescriptions/${rx.id}/quote`),
    staleTime: 0,
  });
  const { data: providers = [] } = useQuery<Array<{ id: string; name: string; isActive: boolean }>>({
    queryKey: ['pharmacy-providers', businessId],
    queryFn: () => api.get(`/pharmacy/providers?businessId=${businessId}`),
    enabled: !!businessId && !!quote?.invoice,
    staleTime: 60_000,
  });
  const { data: biz } = useQuery<{ name?: string; receiptHeader?: string; receiptFooter?: string }>({
    queryKey: ['biz-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 5 * 60_000,
  });

  const total = quote?.totalCents ?? 0;
  const pct = insured ? Math.min(99, Math.max(0, Math.floor(Number(patientPct) || 0))) : 100;
  const patientShare = Math.round((total * pct) / 100);
  const insurerShare = total - patientShare;
  const tenderedCents = Math.round((parseFloat(tendered) || 0) * 100);
  const paying = tenderedCents > 0 ? tenderedCents : patientShare;
  const change = Math.max(0, paying - patientShare);

  const fill = useMutation({
    mutationFn: () =>
      api.patch<FillResponse>(`/prescriptions/${rx.id}/${mode}`, quote?.invoice ? {
        payments: patientShare > 0 ? [{ method, amountCents: paying }] : [],
        ...(insured && { insurance: { providerId, memberNumber: memberNumber.trim() || undefined, patientPct: pct } }),
        buyerKraPin: kraPin.trim() || undefined,
      } : {}),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['prescriptions'] });
      void qc.invalidateQueries({ queryKey: ['pharmacy-refill-queue'] });
      void qc.invalidateQueries({ queryKey: ['pharmacy-claims'] });
      const data = buildDirectSaleReceipt(res, {
        businessName: biz?.name, cashierName: user?.name, receiptHeader: biz?.receiptHeader, receiptFooter: biz?.receiptFooter, fallbackName: 'Pharmacy',
      });
      if (!data) { onClose(); return; }
      setReceipt({ data, res });
      void autoPrintReceipt(data, false).catch((err) => toast.error(`Auto-print failed: ${printErrorMessage(err)}`));
    },
    onError: (err: Error) => toast.error(err.message),
  });

  if (receipt) {
    const r = receipt.res;
    return (
      <DirectSaleReceiptModal receipt={receipt.data} title="Dispensed" onClose={onClose}>
        {(r.insurerShareCents ?? 0) > 0 && (
          <div className="flex justify-between text-blue-700"><span>Billed to insurer</span><span>{formatKES(r.insurerShareCents ?? 0)}</span></div>
        )}
        {(r.patientShareCents ?? 0) > 0 && (
          <div className="flex justify-between"><span>Patient share</span><span>{formatKES(r.patientShareCents ?? 0)}</span></div>
        )}
      </DirectSaleReceiptModal>
    );
  }

  const blocked =
    !quote ||
    (quote.invoice && (quote.unpriced.length > 0 || (insured && !providerId) || paying < patientShare));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
        <div className="p-5 border-b dark:border-gray-700">
          <p className="font-mono text-sm text-blue-600">{rx.prescriptionNumber}</p>
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">
            {mode === 'refill' ? 'Refill' : 'Dispense'} for {rx.patientName}
          </h2>
        </div>

        <div className="p-5 space-y-4 max-h-[65vh] overflow-y-auto">
          {quoteFailed && <p className="text-sm text-red-600">Could not price this prescription. Close this and try again.</p>}
          {!quote && !quoteFailed && <div className="flex justify-center py-6"><Loader2 className="w-6 h-6 animate-spin text-green-600" /></div>}

          {quote && !quote.invoice && (
            <p className="text-sm text-gray-600 dark:text-gray-300">
              This takes the medicines out of stock and records the fill. Payment is taken at the till.
            </p>
          )}

          {quote?.invoice && (
            <>
              <div className="rounded-xl bg-gray-50 dark:bg-gray-700/50 p-3 text-sm space-y-1.5">
                {quote.lines.map((l, i) => (
                  <div key={i} className="flex justify-between gap-3">
                    <span>{l.name} x {l.quantity}</span>
                    <span className="font-medium">{formatKES(l.totalCents)}</span>
                  </div>
                ))}
                <div className="flex justify-between border-t pt-1.5 text-base font-bold"><span>Total</span><span>{formatKES(total)}</span></div>
              </div>

              {quote.unpriced.length > 0 && (
                <p className="text-sm text-red-600">
                  Link and price these in the catalogue before dispensing: {quote.unpriced.join(', ')}.
                </p>
              )}

              <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-200">
                <input type="checkbox" checked={insured} onChange={(e) => setInsured(e.target.checked)} />
                <ShieldCheck className="w-4 h-4 text-blue-600" /> Insurance covers part of this
              </label>
              {insured && (
                <div className="grid grid-cols-2 gap-3">
                  <select className="col-span-2 border rounded-lg px-3 py-2 text-sm" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                    <option value="">Choose insurer…</option>
                    {providers.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </select>
                  <input className="border rounded-lg px-3 py-2 text-sm" placeholder="Member number" value={memberNumber} onChange={(e) => setMemberNumber(e.target.value)} />
                  <label className="flex items-center gap-2 text-sm text-gray-600">
                    Patient pays
                    <input className="w-16 border rounded-lg px-2 py-2 text-sm" type="number" min={0} max={99} value={patientPct} onChange={(e) => setPatientPct(e.target.value)} />%
                  </label>
                  <div className="col-span-2 flex justify-between text-sm text-blue-700">
                    <span>Billed to insurer</span><span className="font-medium">{formatKES(insurerShare)}</span>
                  </div>
                </div>
              )}

              {patientShare > 0 && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm font-semibold"><span>Patient pays</span><span>{formatKES(patientShare)}</span></div>
                  <div className="grid grid-cols-4 gap-2">
                    {METHODS.map((m) => (
                      <button key={m.id} type="button" onClick={() => setMethod(m.id)}
                        className={`py-2 rounded-lg text-sm border ${method === m.id ? 'bg-green-600 text-white border-green-600' : 'text-gray-700 hover:bg-gray-50'}`}>
                        {m.label}
                      </button>
                    ))}
                  </div>
                  <input className="w-full border rounded-lg px-3 py-2 text-sm" type="number" min={0} step="0.01"
                    placeholder={`Amount received (${(patientShare / 100).toFixed(2)})`} value={tendered} onChange={(e) => setTendered(e.target.value)} />
                  {method === 'CASH' && change > 0 && <p className="text-sm text-green-700">Change due: {formatKES(change)}</p>}
                  {paying < patientShare && <p className="text-sm text-red-600">The amount received is less than the patient's share.</p>}
                </div>
              )}

              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Buyer KRA PIN (company patient, optional)"
                value={kraPin} onChange={(e) => setKraPin(e.target.value.toUpperCase())} />
            </>
          )}
        </div>

        <div className="p-5 border-t dark:border-gray-700 grid grid-cols-2 gap-3">
          <button onClick={onClose} className="py-2 border rounded-lg text-sm font-medium text-gray-700">Cancel</button>
          <button onClick={() => fill.mutate()} disabled={blocked || fill.isPending}
            className="py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-sm font-medium disabled:opacity-50">
            {fill.isPending ? 'Working…' : quote?.invoice ? 'Take payment and dispense' : mode === 'refill' ? 'Refill and deduct stock' : 'Dispense and deduct stock'}
          </button>
        </div>
      </div>
    </div>
  );
}

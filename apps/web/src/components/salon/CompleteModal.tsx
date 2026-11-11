import { useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, X } from 'lucide-react';
import { formatKES } from '@pos/shared';
import { billTotals, type Appointment, type Stylist } from '../../lib/salon';
import type { CatalogueItem } from './BookingModal';

const PAY_METHODS = ['CASH', 'MPESA', 'CARD', 'BANK'] as const;

interface Line { key: number; itemId: string | null; name: string; quantity: number; unitPriceCents: number; staffId: string; locked: boolean }
let lineKey = 0;

export interface CompletePayload {
  lines?: Array<{ itemId: string; quantity: number; unitPriceCents: number; staffId?: string }>;
  amountCents?: number;
  payments: Array<{ method: string; amountCents: number }>;
  tipCents: number;
  tipMethod?: string;
  buyerKraPin?: string;
  refundMethod: string;
}

/**
 * Complete a visit and take payment. The bill starts as the booked services (each with its stylist); the desk can change a
 * stylist, remove a service, or add another service or a retail product. A tip is taken separately from the invoice.
 *
 * Only a manager can change a price. Lines are sent to the server only if the bill was edited: untouched, the server bills
 * the visit exactly as booked.
 */
export default function CompleteModal({
  appointment, catalogue, stylists, canChangePrice, busy, onCancel, onSubmit,
}: {
  appointment: Appointment;
  catalogue: CatalogueItem[];
  stylists: Stylist[];
  canChangePrice: boolean;
  busy: boolean;
  onCancel: () => void;
  onSubmit: (p: CompletePayload) => void;
}) {
  const initial = useMemo<Line[]>(() => {
    const stored = appointment.services ?? [];
    if (stored.length > 0) {
      return stored.map((s) => ({ key: ++lineKey, itemId: s.itemId ?? null, name: s.name, quantity: 1, unitPriceCents: s.unitPriceCents, staffId: s.staffId ?? '', locked: true }));
    }
    const item = catalogue.find((i) => i.id === appointment.serviceItemId);
    return item ? [{ key: ++lineKey, itemId: item.id, name: item.name, quantity: 1, unitPriceCents: item.retailPriceCents, staffId: appointment.staffId ?? '', locked: true }] : [];
  // the booking never changes while this window is open
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const [lines, setLines] = useState<Line[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [method, setMethod] = useState('CASH');
  const [received, setReceived] = useState('');
  const [tip, setTip] = useState('');
  const [tipMethod, setTipMethod] = useState('CASH');
  const [kra, setKra] = useState('');
  const [refundMethod, setRefundMethod] = useState('CASH');
  const [manualPrice, setManualPrice] = useState('');

  const edit = (fn: (l: Line[]) => Line[]) => { setLines(fn); setDirty(true); };
  const legacyNoService = initial.length === 0 && lines.length === 0;
  const manualCents = Math.round((parseFloat(manualPrice) || 0) * 100);
  const effective = legacyNoService && manualCents > 0 ? [{ quantity: 1, unitPriceCents: manualCents }] : lines;
  const totals = billTotals(effective, appointment.depositCents);
  const tipCents = Math.round((parseFloat(tip) || 0) * 100);
  const receivedCents = Math.round((parseFloat(received) || 0) * 100);
  const paying = receivedCents > 0 ? receivedCents : totals.dueCents;
  const active = stylists.filter((s) => s.active);
  const addable = catalogue.filter((i) => i.retailPriceCents > 0);

  const canComplete = !busy && totals.priceCents > 0 && (totals.dueCents === 0 || paying >= totals.dueCents);
  const field = 'w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700 dark:text-white';
  const methodButtons = (value: string, set: (m: string) => void) => (
    <div className="grid grid-cols-4 gap-2">
      {PAY_METHODS.map((m) => (
        <button key={m} type="button" onClick={() => set(m)} aria-pressed={value === m}
          className={`rounded-lg border py-2 text-xs font-semibold ${value === m ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-300 text-gray-700 dark:text-gray-200'}`}>{m}</button>
      ))}
    </div>
  );

  const submit = () => {
    onSubmit({
      ...(dirty && lines.length > 0 && {
        lines: lines.filter((l) => l.itemId).map((l) => ({ itemId: l.itemId as string, quantity: l.quantity, unitPriceCents: l.unitPriceCents, ...(l.staffId && { staffId: l.staffId }) })),
      }),
      ...(legacyNoService && manualCents > 0 && { amountCents: manualCents }),
      payments: totals.dueCents > 0 ? [{ method, amountCents: paying }] : [],
      tipCents,
      ...(tipCents > 0 && { tipMethod }),
      buyerKraPin: kra.trim() || undefined,
      refundMethod,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}>
      <div role="dialog" aria-modal="true" aria-label="Complete and take payment" className="flex max-h-[92vh] w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="flex items-start justify-between border-b p-5 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Complete and take payment</h2>
            <p className="text-sm text-gray-500">{appointment.customerName}</p>
          </div>
          <button onClick={onCancel} aria-label="Close" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto p-5 text-sm">
          <section aria-label="The bill" className="space-y-2">
            {lines.length === 0 && !legacyNoService && <p className="text-gray-500">Nothing on the bill yet. Add a service or product below.</p>}
            {lines.map((l) => (
              <div key={l.key} className="grid grid-cols-12 items-center gap-2 rounded-lg bg-gray-50 p-2 dark:bg-gray-700/50">
                <span className="col-span-4 truncate font-medium">{l.name}</span>
                <input type="number" min={1} max={99} value={l.quantity} aria-label={`Quantity of ${l.name}`}
                  onChange={(e) => edit((all) => all.map((x) => (x.key === l.key ? { ...x, quantity: Math.max(1, Math.round(Number(e.target.value)) || 1) } : x)))}
                  className="col-span-2 rounded-lg border px-2 py-1 text-center dark:border-gray-600 dark:bg-gray-700" />
                <select value={l.staffId} aria-label={`Who did ${l.name}`}
                  onChange={(e) => edit((all) => all.map((x) => (x.key === l.key ? { ...x, staffId: e.target.value } : x)))}
                  className="col-span-3 rounded-lg border px-1 py-1 text-xs dark:border-gray-600 dark:bg-gray-700">
                  <option value="">No one in particular</option>
                  {active.map((s) => <option key={s.userId} value={s.userId}>{s.name}</option>)}
                </select>
                <span className="col-span-2 text-right font-semibold">{formatKES(Math.round(l.unitPriceCents * l.quantity))}</span>
                <button onClick={() => edit((all) => all.filter((x) => x.key !== l.key))} aria-label={`Remove ${l.name}`} className="col-span-1 rounded p-1 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                {canChangePrice && (
                  <div className="col-span-12 flex items-center gap-2 text-xs text-gray-500">
                    <label htmlFor={`price-${l.key}`}>Price each (KES)</label>
                    <input id={`price-${l.key}`} type="number" min={0} step={10} value={l.unitPriceCents / 100}
                      onChange={(e) => edit((all) => all.map((x) => (x.key === l.key ? { ...x, unitPriceCents: Math.max(0, Math.round(Number(e.target.value) * 100)) } : x)))}
                      className="w-28 rounded-lg border px-2 py-1 dark:border-gray-600 dark:bg-gray-700" />
                  </div>
                )}
              </div>
            ))}
            {legacyNoService && (
              <input type="number" min={0} step={0.01} value={manualPrice} onChange={(e) => setManualPrice(e.target.value)} placeholder="This appointment has no service chosen. Price (KES)" aria-label="Price" className={field} />
            )}
            <select value="" aria-label="Add a service or product"
              onChange={(e) => {
                const item = addable.find((i) => i.id === e.target.value);
                if (item) edit((all) => [...all, { key: ++lineKey, itemId: item.id, name: item.name, quantity: 1, unitPriceCents: item.retailPriceCents, staffId: '', locked: false }]);
              }}
              className={field}>
              <option value="">Add a service or product...</option>
              {addable.map((i) => <option key={i.id} value={i.id}>{i.name} - {formatKES(i.retailPriceCents)}{i.trackStock ? ' (product)' : ''}</option>)}
            </select>
            <p className="flex items-center gap-1 text-xs text-gray-500"><Plus className="h-3 w-3" /> Each stylist is credited, and earns commission, on the lines you name them on.</p>
          </section>

          <section aria-label="Totals" className="space-y-1 rounded-xl bg-gray-50 p-3 dark:bg-gray-700/50">
            <div className="flex justify-between"><span>Bill</span><span className="font-medium">{formatKES(totals.priceCents)}</span></div>
            {appointment.depositCents > 0 && <div className="flex justify-between text-gray-500"><span>Deposit held</span><span>- {formatKES(totals.appliedCents)}</span></div>}
            <div className="flex justify-between border-t pt-1 font-bold"><span>To pay now</span><span>{formatKES(totals.dueCents)}</span></div>
            {totals.surplusCents > 0 && totals.priceCents > 0 && <p className="text-xs text-amber-700">{formatKES(totals.surplusCents)} of the deposit is paid back.</p>}
          </section>

          {totals.dueCents > 0 && (
            <section aria-label="Payment" className="space-y-2">
              {methodButtons(method, setMethod)}
              <input type="number" min={0} step={0.01} value={received} onChange={(e) => setReceived(e.target.value)} placeholder={`Amount received (${(totals.dueCents / 100).toFixed(2)})`} aria-label="Amount received" className={field} />
              {paying < totals.dueCents && <p className="text-xs text-red-600">Less than the amount due.</p>}
              {method === 'CASH' && paying > totals.dueCents && <p className="text-xs text-green-700">Change due: {formatKES(paying - totals.dueCents)}</p>}
            </section>
          )}

          <section aria-label="Tip" className="space-y-2">
            <input type="number" min={0} step={10} value={tip} onChange={(e) => setTip(e.target.value)} placeholder="Tip (KES), optional. Not part of the invoice" aria-label="Tip amount in KES" className={field} />
            {tipCents > 0 && methodButtons(tipMethod, setTipMethod)}
          </section>

          {totals.surplusCents > 0 && totals.priceCents > 0 && (
            <div>
              <p className="mb-1 text-xs text-gray-500">If the way the deposit was paid is not on record, pay the rest back by:</p>
              {methodButtons(refundMethod, setRefundMethod)}
            </div>
          )}
          <input value={kra} onChange={(e) => setKra(e.target.value.toUpperCase())} placeholder="Buyer KRA PIN (company customer, optional)" aria-label="Buyer KRA PIN" className={field} />
        </div>

        <div className="grid grid-cols-2 gap-3 border-t p-4 dark:border-gray-700">
          <button onClick={onCancel} className="rounded-xl border border-gray-300 py-2.5 text-sm font-semibold text-gray-700">Back</button>
          <button onClick={submit} disabled={!canComplete} className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 py-2.5 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-50">
            {busy && <Loader2 className="h-4 w-4 animate-spin" />} Complete
          </button>
        </div>
      </div>
    </div>
  );
}

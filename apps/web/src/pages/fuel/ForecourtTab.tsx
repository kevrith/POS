import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Fuel, Zap, ZapOff, Clock } from 'lucide-react';
import { formatKES } from '@pos/shared';
import { api } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Input, Select } from '../../components/ui';
import type { ReceiptData } from '../../lib/printer';
import { buildDirectSaleReceipt } from '../../lib/directSaleReceipt';
import { isValidKraPin } from '../../lib/kraPin';
import DirectSaleReceiptModal from '../../components/DirectSaleReceiptModal';
import { autoPrintReceipt, printErrorMessage } from '../../lib/receiptPrint';
import { Modal } from './Modal';
import { litres as fmtL, parseLitres } from './money';
import { PAYMENT_LABEL, PAYMENT_METHODS, type Nozzle, type Pump, type Shift } from './types';
import { useFleetAccounts, useFuelScope, useOpenShift, usePumps } from './useFuelData';

export interface Prefill { pumpNumber: number; litres: number }

const STATUS_TONE: Record<string, 'success' | 'brand' | 'danger' | 'neutral' | 'warning'> = {
  IDLE: 'neutral', AUTHORIZED: 'success', DISPENSING: 'brand', SUSPENDED: 'danger', OFFLINE: 'danger', MAINTENANCE: 'warning',
};

/** Who answers for a nozzle in the open shift. */
function attendantFor(shift: Shift | null | undefined, nozzle: Nozzle) {
  return shift?.attendants.find((a) => a.nozzleIds.includes(nozzle.id))?.name ?? null;
}

export default function ForecourtTab({
  onGoShift, controllerActive, onControllerAction, prefill, clearPrefill,
}: {
  onGoShift: () => void;
  /** A pump controller is connected: Authorize and Stop are sent to it as well. */
  controllerActive: boolean;
  onControllerAction: (action: 'authorize' | 'stop', pump: Pump) => void;
  prefill: Prefill | null;
  clearPrefill: () => void;
}) {
  const qc = useQueryClient();
  const { data: pumps = [], isPending: pumpsPending } = usePumps();
  const { data: shift, isPending: shiftPending } = useOpenShift();
  const [selling, setSelling] = useState<{ pump: Pump; nozzle: Nozzle; litres?: string } | null>(null);
  const [receipt, setReceipt] = useState<ReceiptData | null>(null);

  const authorize = useMutation({
    mutationFn: (id: string) => api.post(`/fuel-pump/pumps/${id}/authorize`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['fuel-pumps'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const stop = useMutation({
    mutationFn: (id: string) => api.post(`/fuel-pump/pumps/${id}/stop`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['fuel-pumps'] }),
    onError: (e: Error) => toast.error(e.message),
  });

  // A reading that arrives from the pump controller opens the sale for that pump with the litres filled in.
  useEffect(() => {
    if (!prefill || !shift) return;
    const pump = pumps.find((p) => p.pumpNumber === prefill.pumpNumber);
    const onShift = pump?.nozzles.filter((n) => n.isActive && shift.readings.some((r) => r.nozzleId === n.id)) ?? [];
    if (pump && onShift.length === 1) setSelling({ pump, nozzle: onShift[0], litres: prefill.litres.toFixed(3) });
    clearPrefill();
  }, [prefill, pumps, shift, clearPrefill]);

  const onShiftIds = new Set((shift?.readings ?? []).map((r) => r.nozzleId));

  return (
    <div className="space-y-4">
      {shiftPending ? (
        <Card className="p-4 text-sm text-gray-600">Checking the shift...</Card>
      ) : shift ? (
        <Card className="p-4 flex flex-wrap items-center gap-x-6 gap-y-2">
          <Badge tone="success" icon={<Clock className="w-3 h-3" aria-hidden />}>Shift open</Badge>
          <span className="text-sm text-gray-700">Since {new Date(shift.openedAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}, opened by {shift.cashierName}</span>
          <span className="text-sm text-gray-700">{shift.attendants.map((a) => a.name).join(', ')}</span>
        </Card>
      ) : (
        <Card className="p-4 flex flex-wrap items-center justify-between gap-3 border-amber-300 bg-amber-50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-700 mt-0.5 flex-shrink-0" aria-hidden />
            <div>
              <p className="font-semibold text-amber-900">No shift is open</p>
              <p className="text-sm text-amber-900">Fuel can only be sold inside a shift, so every litre has an attendant answering for it. Read the pump meters and open one.</p>
            </div>
          </div>
          <Button onClick={onGoShift}>Open a shift</Button>
        </Card>
      )}

      {pumpsPending ? (
        <p className="text-sm text-gray-500 py-8 text-center">Loading pumps...</p>
      ) : pumps.length === 0 ? (
        <Card><EmptyState icon={<Fuel className="w-6 h-6" />} title="No pumps set up yet" description="Add your fuel grades and tanks, then add each pump with its nozzles under Setup." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {pumps.map((pump) => {
            const hoses = pump.nozzles.filter((n) => n.isActive);
            return (
              <Card key={pump.id} className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-lg font-extrabold text-gray-900">Pump {pump.pumpNumber}</p>
                    {pump.label && <p className="text-sm text-gray-600 truncate">{pump.label}</p>}
                  </div>
                  <Badge tone={STATUS_TONE[pump.status] ?? 'neutral'}>{pump.status}</Badge>
                </div>

                <div className="space-y-2">
                  {hoses.length === 0 && <p className="text-sm text-gray-500">No active nozzle. Switch one on under Setup.</p>}
                  {hoses.map((n) => {
                    const sellable = !!shift && onShiftIds.has(n.id);
                    const who = attendantFor(shift, n);
                    const tankLow = n.tank && n.tank.currentLitres <= 0;
                    return (
                      <button
                        key={n.id}
                        type="button"
                        disabled={!sellable || !!tankLow}
                        onClick={() => setSelling({ pump, nozzle: n })}
                        className="w-full text-left rounded-lg border border-gray-200 px-3 py-2.5 flex items-center justify-between gap-3 hover:border-brand-500 hover:bg-brand-50/40 disabled:opacity-60 disabled:hover:border-gray-200 disabled:hover:bg-transparent disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-brand-600/40"
                      >
                        <span className="min-w-0">
                          <span className="block font-semibold text-gray-900">{hoses.length > 1 ? `Nozzle ${n.nozzleNumber}: ` : ''}{n.grade.name}</span>
                          <span className="block text-xs text-gray-600 truncate">
                            {tankLow ? 'Tank empty' : !shift ? 'No shift open' : !sellable ? 'Not on this shift' : who ? `Attendant: ${who}` : ''}
                          </span>
                        </span>
                        <span className="text-right flex-shrink-0">
                          <span className="block text-sm font-bold tabular-nums">{formatKES(n.grade.pricePerLitreCents)}</span>
                          <span className="block text-xs text-gray-600">per litre</span>
                        </span>
                      </button>
                    );
                  })}
                </div>

                {controllerActive && (
                  <div className="flex gap-2">
                    {pump.status === 'IDLE' ? (
                      <Button variant="success" size="sm" fullWidth icon={<Zap className="w-4 h-4" />} loading={authorize.isPending} onClick={() => { onControllerAction('authorize', pump); authorize.mutate(pump.id); }}>Authorize</Button>
                    ) : (
                      <Button variant="danger" size="sm" fullWidth icon={<ZapOff className="w-4 h-4" />} loading={stop.isPending} onClick={() => { onControllerAction('stop', pump); stop.mutate(pump.id); }}>Stop</Button>
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {selling && (
        <SaleDialog
          pump={selling.pump}
          nozzle={selling.nozzle}
          initialLitres={selling.litres}
          attendant={attendantFor(shift, selling.nozzle)}
          onClose={() => setSelling(null)}
          onDone={(r) => { setSelling(null); if (r) setReceipt(r); }}
        />
      )}
      {receipt && <DirectSaleReceiptModal receipt={receipt} onClose={() => setReceipt(null)} title="Fuel sale recorded" quantityLabel={(q) => `${q} L`} />}
    </div>
  );
}

function SaleDialog({
  pump, nozzle, initialLitres, attendant, onClose, onDone,
}: {
  pump: Pump; nozzle: Nozzle; initialLitres?: string; attendant: string | null; onClose: () => void; onDone: (receipt: ReceiptData | null) => void;
}) {
  const qc = useQueryClient();
  const { user, businessId, storeId } = useFuelScope();
  const [litresText, setLitresText] = useState(initialLitres ?? '');
  const [method, setMethod] = useState<string>('CASH');
  const [reference, setReference] = useState('');
  const [plate, setPlate] = useState('');
  const [fleetId, setFleetId] = useState('');
  const [customerId, setCustomerId] = useState('');
  // A buyer who wants their KRA PIN on the receipt. A fleet account's own PIN is used for fleet sales, so it is not asked there.
  const [buyerPin, setBuyerPin] = useState('');
  const [buyerName, setBuyerName] = useState('');

  const { data: fleet = [] } = useFleetAccounts(method === 'FLEET');
  const { data: customers = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['fuel-credit-customers', businessId],
    queryFn: () => api.get(`/businesses/${businessId}/customers`),
    enabled: !!businessId && method === 'CREDIT',
    staleTime: 60_000,
  });
  const { data: biz } = useQuery<{ name?: string; receiptHeader?: string; receiptFooter?: string }>({
    queryKey: ['biz-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 5 * 60_000,
  });

  const amount = parseLitres(litresText);
  const total = amount === null ? null : Math.round(amount * nozzle.grade.pricePerLitreCents);
  const missingFor = method === 'FLEET' && !fleetId ? 'Choose the fleet account' : method === 'CREDIT' && !customerId ? 'Choose the customer' : null;

  const sale = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.post<any>('/fuel-pump/sales', body),
    onSuccess: (res) => {
      for (const k of ['fuel-pumps', 'fuel-sales', 'fuel-stats', 'fuel-tanks', 'fuel-open-shift', 'shift-summary', 'fleet-accounts']) void qc.invalidateQueries({ queryKey: [k] });
      const r = buildDirectSaleReceipt(res ?? {}, {
        businessName: biz?.name, cashierName: user?.name ?? 'Attendant', receiptHeader: biz?.receiptHeader,
        receiptFooter: biz?.receiptFooter, fallbackName: 'Fuel station',
      });
      if (r) void autoPrintReceipt(r, false).catch((err) => toast.error(`Auto-print failed: ${printErrorMessage(err)}`));
      else toast.success(`Sale recorded: ${formatKES(res?.totalCents ?? total ?? 0)}`);
      onDone(r ?? null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const pinProblem = method !== 'FLEET' && buyerPin.trim() !== '' && !isValidKraPin(buyerPin) ? 'A KRA PIN looks like A012345678Z or P051234567Z' : null;

  const submit = () => {
    if (amount === null || amount <= 0 || missingFor || pinProblem) return;
    sale.mutate({
      businessId, storeId, pumpId: pump.id, nozzleId: nozzle.id, cashierId: user?.id,
      litresDispensed: amount, paymentMethod: method,
      vehiclePlate: plate.trim() || undefined,
      paymentRef: reference.trim() || undefined,
      fleetAccountId: method === 'FLEET' ? fleetId : undefined,
      customerId: method === 'CREDIT' ? customerId : undefined,
      buyerKraPin: method !== 'FLEET' && buyerPin.trim() ? buyerPin.trim() : undefined,
      buyerName: method !== 'FLEET' && buyerPin.trim() && buyerName.trim() ? buyerName.trim() : undefined,
    });
  };

  return (
    <Modal title={`Pump ${pump.pumpNumber}${pump.nozzles.filter((n) => n.isActive).length > 1 ? `, nozzle ${nozzle.nozzleNumber}` : ''}: ${nozzle.grade.name}`} subtitle={attendant ? `Attendant: ${attendant}` : undefined} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
        <Input label="Litres dispensed" inputMode="decimal" autoFocus placeholder="0.000" value={litresText} onChange={(e) => setLitresText(e.target.value)}
          error={litresText && amount === null ? 'Enter litres as a number, up to 3 decimal places' : undefined} hint="Read from the pump display" />
        <div className="rounded-lg bg-brand-50 px-4 py-3 flex items-baseline justify-between">
          <span className="text-sm text-gray-700">{formatKES(nozzle.grade.pricePerLitreCents)} per litre</span>
          <span className="text-2xl font-extrabold tabular-nums text-brand-800">{total === null ? '-' : formatKES(total)}</span>
        </div>

        <fieldset>
          <legend className="text-[13px] font-semibold text-gray-700 mb-1.5">Paid by</legend>
          <div className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((m) => (
              <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}
                className={`h-10 px-4 rounded-lg border text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-brand-600/40 ${method === m ? 'bg-brand-600 border-brand-600 text-white' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50'}`}>
                {PAYMENT_LABEL[m]}
              </button>
            ))}
          </div>
        </fieldset>

        {method === 'FLEET' && (
          <Select label="Fleet account" value={fleetId} onChange={(e) => setFleetId(e.target.value)}>
            <option value="">Choose the account to charge</option>
            {fleet.filter((f) => f.isActive).map((f) => <option key={f.id} value={f.id}>{f.companyName}</option>)}
          </Select>
        )}
        {method === 'CREDIT' && (
          <Select label="Customer" value={customerId} onChange={(e) => setCustomerId(e.target.value)} hint="Credit is only for a registered customer who can be billed">
            <option value="">Choose the customer</option>
            {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Vehicle plate (optional)" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
          {(method === 'MPESA' || method === 'CARD') && <Input label={method === 'MPESA' ? 'M-Pesa code' : 'Card slip number'} value={reference} onChange={(e) => setReference(e.target.value)} />}
        </div>

        {method !== 'FLEET' && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Buyer's KRA PIN (optional)" value={buyerPin} onChange={(e) => setBuyerPin(e.target.value.toUpperCase())} placeholder="A012345678Z"
              hint="Only if the buyer asks for it on the receipt" error={pinProblem ?? undefined} />
            {buyerPin.trim() !== '' && <Input label="Name on the receipt (optional)" value={buyerName} onChange={(e) => setBuyerName(e.target.value)} />}
          </div>
        )}

        {missingFor && <p className="text-sm text-amber-800">{missingFor}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={sale.isPending} disabled={amount === null || amount <= 0 || !!missingFor || !!pinProblem}>
            Record sale {total !== null && amount !== null && amount > 0 ? `(${fmtL(amount, 3)})` : ''}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

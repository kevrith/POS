import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Droplets, Plus, Truck, Ruler } from 'lucide-react';
import { formatKES } from '@pos/shared';
import { api } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Input, Select, Textarea } from '../../components/ui';
import { Modal } from './Modal';
import { kesToCents, litres, parseLitres } from './money';
import type { Tank } from './types';
import { useFuelScope, useGrades, useTanks } from './useFuelData';

export default function TanksTab() {
  const { businessId, storeId, isManager } = useFuelScope();
  const { data: tanks = [], isPending: isLoading } = useTanks();
  const [dipFor, setDipFor] = useState<Tank | null>(null);
  const [deliveryFor, setDeliveryFor] = useState<Tank | null>(null);
  const [adding, setAdding] = useState(false);

  const { data: deliveries = [] } = useQuery({
    queryKey: ['fuel-deliveries', businessId],
    queryFn: () => api.get<any[]>(`/fuel-pump/deliveries?businessId=${businessId}`),
    enabled: !!businessId,
  });

  return (
    <div className="space-y-6">
      {isManager && (
        <div className="flex justify-end">
          <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => setAdding(true)}>Add tank</Button>
        </div>
      )}

      {isLoading ? <p className="text-sm text-gray-500 py-8 text-center">Loading tanks...</p> : tanks.length === 0 ? (
        <Card><EmptyState icon={<Droplets className="w-6 h-6" />} title="No tanks yet" description="Add each underground tank with its grade and capacity. Pumps draw their fuel from the tank you link them to." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {tanks.map((t) => <TankCard key={t.id} tank={t} isManager={isManager} onDip={() => setDipFor(t)} onDelivery={() => setDeliveryFor(t)} />)}
        </div>
      )}

      <section aria-labelledby="deliveries">
        <h2 id="deliveries" className="font-semibold text-gray-900 mb-2">Recent deliveries</h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Date</th><th className="text-left px-3 py-2">Tank</th><th className="text-left px-3 py-2">Supplier</th>
                  <th className="text-right px-3 py-2">On the note</th><th className="text-right px-3 py-2">Received</th><th className="text-right px-3 py-2">Short</th><th className="text-right px-3 py-2">Cost per litre</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => {
                  const short = (d.shortLitres ?? 0) > 0.5 && d.docketLitres && (d.shortLitres / d.docketLitres) * 100 > 0.5;
                  return (
                    <tr key={d.id} className="border-t">
                      <td className="px-4 py-2 whitespace-nowrap">{new Date(d.deliveredAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td className="px-3 py-2">{d.tank?.label ?? `Tank ${d.tank?.tankNumber}`} <span className="text-gray-600">({d.tank?.grade?.name})</span></td>
                      <td className="px-3 py-2">{d.supplierName ?? '-'}{d.docketNumber ? <span className="block text-xs text-gray-600">Note {d.docketNumber}</span> : null}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{litres(d.docketLitres ?? d.litresDelivered)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{litres(d.litresDelivered)}</td>
                      <td className={`px-3 py-2 text-right tabular-nums ${short ? 'text-red-700 font-semibold' : ''}`}>{d.shortLitres ? litres(d.shortLitres) : '-'}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{d.unitCostCents ? formatKES(d.unitCostCents) : '-'}</td>
                    </tr>
                  );
                })}
                {deliveries.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">No deliveries recorded</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {dipFor && <DipModal tank={dipFor} onClose={() => setDipFor(null)} />}
      {deliveryFor && <DeliveryModal tank={deliveryFor} onClose={() => setDeliveryFor(null)} />}
      {adding && <AddTankModal storeId={storeId} onClose={() => setAdding(false)} />}
    </div>
  );
}

function TankCard({ tank, isManager, onDip, onDelivery }: { tank: Tank; isManager: boolean; onDip: () => void; onDelivery: () => void }) {
  const pct = Math.max(0, Math.min(100, (tank.currentLitres / tank.capacityLitres) * 100));
  const low = tank.currentLitres < tank.minLevelLitres;
  const last = tank.dippings[0];
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-bold text-gray-900">{tank.label ?? `Tank ${tank.tankNumber}`}</p>
          <p className="text-sm text-gray-600">{tank.grade.name}</p>
        </div>
        {low ? <Badge tone="danger" icon={<AlertTriangle className="w-3 h-3" aria-hidden />}>Low</Badge> : <Badge tone="success">OK</Badge>}
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-extrabold tabular-nums">{litres(tank.currentLitres, 0)}</span>
          <span className="text-sm text-gray-600">of {litres(tank.capacityLitres, 0)}</span>
        </div>
        <div className="mt-1.5 h-3 rounded-full bg-gray-100 overflow-hidden" role="img" aria-label={`${Math.round(pct)} percent full`}>
          <div className={`h-full rounded-full ${low ? 'bg-red-500' : 'bg-brand-600'}`} style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-gray-600 mt-1">Reorder below {litres(tank.minLevelLitres, 0)}</p>
      </div>
      <dl className="text-sm grid grid-cols-2 gap-x-3 gap-y-1">
        <dt className="text-gray-600">Cost per litre</dt><dd className="text-right tabular-nums">{tank.avgCostCents > 0 ? formatKES(Math.round(tank.avgCostCents)) : 'not known'}</dd>
        <dt className="text-gray-600">Last measured</dt>
        <dd className="text-right">{last ? new Date(last.recordedAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : 'never'}</dd>
        {last && last.varianceLitres !== null && last.varianceLitres !== 0 && (
          <><dt className="text-gray-600">That reading found</dt><dd className={`text-right tabular-nums ${last.varianceLitres < 0 ? 'text-red-700' : ''}`}>{last.varianceLitres > 0 ? '+' : ''}{litres(last.varianceLitres)}</dd></>
        )}
      </dl>
      {isManager && (
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" fullWidth icon={<Ruler className="w-4 h-4" />} onClick={onDip}>Measure</Button>
          <Button variant="secondary" size="sm" fullWidth icon={<Truck className="w-4 h-4" />} onClick={onDelivery}>Delivery</Button>
        </div>
      )}
    </Card>
  );
}

function useRefreshTanks() {
  const qc = useQueryClient();
  return () => { for (const k of ['fuel-tanks', 'fuel-variance', 'fuel-deliveries']) void qc.invalidateQueries({ queryKey: [k] }); };
}

function DipModal({ tank, onClose }: { tank: Tank; onClose: () => void }) {
  const refresh = useRefreshTanks();
  const [reading, setReading] = useState('');
  const [water, setWater] = useState('');
  const [notes, setNotes] = useState('');
  const value = parseLitres(reading);
  const diff = value === null ? null : Math.round((value - tank.currentLitres) * 100) / 100;

  const save = useMutation({
    mutationFn: () => api.post<{ bookLitres: number; varianceLitres: number }>('/fuel-pump/tanks/dipping', {
      tankId: tank.id, litres: value, waterMm: water.trim() ? parseFloat(water) : undefined, notes: notes.trim() || undefined,
    }),
    onSuccess: (d) => {
      const v = d.varianceLitres;
      toast[Math.abs(v) > 0.5 ? 'warning' : 'success'](Math.abs(v) <= 0.5 ? 'Reading saved. The books agree with the tank.' : `Reading saved. The books said ${litres(d.bookLitres)}; the tank holds ${litres(d.bookLitres + v)} (${v > 0 ? '+' : ''}${litres(v)}).`);
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal title={`Measure ${tank.label ?? `tank ${tank.tankNumber}`}`} subtitle={`${tank.grade.name}. The books say ${litres(tank.currentLitres)}.`} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (value !== null) save.mutate(); }}>
        <Input label="Litres measured in the tank" inputMode="decimal" autoFocus value={reading} onChange={(e) => setReading(e.target.value)}
          error={reading && value === null ? 'Enter litres as a number' : value !== null && value > tank.capacityLitres ? `The tank holds at most ${litres(tank.capacityLitres, 0)}` : undefined}
          hint="From the dip stick chart or the tank gauge" />
        {diff !== null && (
          <p className={`text-sm rounded-lg px-3 py-2 ${Math.abs(diff) > 0.5 ? 'bg-amber-50 text-amber-900' : 'bg-green-50 text-green-900'}`}>
            {Math.abs(diff) <= 0.5 ? 'Matches the books.' : `${diff < 0 ? 'Fuel missing' : 'Extra fuel'}: ${litres(Math.abs(diff))} against the books. The difference is kept in the wet stock report.`}
          </p>
        )}
        <Input label="Water at the bottom (mm, optional)" inputMode="decimal" value={water} onChange={(e) => setWater(e.target.value)} />
        <Textarea label="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={value === null || value > tank.capacityLitres}>Save reading</Button></div>
      </form>
    </Modal>
  );
}

function DeliveryModal({ tank, onClose }: { tank: Tank; onClose: () => void }) {
  const refresh = useRefreshTanks();
  const [docket, setDocket] = useState('');
  const [before, setBefore] = useState('');
  const [after, setAfter] = useState('');
  const [cost, setCost] = useState('');
  const [supplier, setSupplier] = useState('');
  const [note, setNote] = useState('');
  const [plate, setPlate] = useState('');

  const docketL = parseLitres(docket);
  const b = parseLitres(before);
  const a = parseLitres(after);
  const costCents = cost.trim() ? kesToCents(cost) : null;
  const measured = b !== null && a !== null && a > b ? Math.round((a - b) * 100) / 100 : null;
  const short = docketL !== null && measured !== null ? Math.round((docketL - measured) * 100) / 100 : null;
  const shortPct = short !== null && docketL ? (short / docketL) * 100 : 0;

  const problems: string[] = [];
  if (docketL === null || docketL <= 0) problems.push('Enter the litres on the delivery note');
  if ((before.trim() !== '') !== (after.trim() !== '')) problems.push('Measure the tank both before and after the offload, or neither');
  if (before.trim() && after.trim() && (b === null || a === null || a <= b)) problems.push('The reading after the offload must be higher than before');
  if (a !== null && a > tank.capacityLitres) problems.push(`The tank holds at most ${litres(tank.capacityLitres, 0)}`);
  if (cost.trim() && costCents === null) problems.push('Enter the cost per litre in shillings');

  const save = useMutation({
    mutationFn: () => api.post<{ litresDelivered: number; shortLitres: number; isShort: boolean }>('/fuel-pump/tanks/delivery', {
      tankId: tank.id, docketLitres: docketL, dipBeforeLitres: b ?? undefined, dipAfterLitres: a ?? undefined,
      unitCostCents: costCents ?? undefined, supplierName: supplier.trim() || undefined, docketNumber: note.trim() || undefined, vehiclePlate: plate.trim() || undefined,
    }),
    onSuccess: (d) => {
      toast[d.isShort ? 'warning' : 'success'](d.isShort ? `Delivery recorded, but the tank received ${litres(d.litresDelivered)}: ${litres(d.shortLitres)} short of the note. Raise it with the supplier.` : `Delivery recorded: ${litres(d.litresDelivered)} received.`);
      refresh();
      onClose();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal title={`Receive fuel into ${tank.label ?? `tank ${tank.tankNumber}`}`} subtitle={`${tank.grade.name}. The books say ${litres(tank.currentLitres)}.`} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (problems.length === 0) save.mutate(); }}>
        <Input label="Litres on the delivery note" inputMode="decimal" autoFocus value={docket} onChange={(e) => setDocket(e.target.value)} />
        <div className="rounded-lg border border-gray-200 p-3 space-y-3">
          <p className="text-sm text-gray-700"><span className="font-semibold">Measure the tank around the offload</span> so the litres received are what the tank really took, not what the note claims.</p>
          <div className="grid grid-cols-2 gap-3">
            <Input label="Reading before (L)" inputMode="decimal" value={before} onChange={(e) => setBefore(e.target.value)} />
            <Input label="Reading after (L)" inputMode="decimal" value={after} onChange={(e) => setAfter(e.target.value)} />
          </div>
          {measured !== null && short !== null && (
            <p className={`text-sm rounded-lg px-3 py-2 ${shortPct > 0.5 ? 'bg-red-50 text-red-900' : 'bg-green-50 text-green-900'}`}>
              The tank received {litres(measured)}. {short > 0 ? `That is ${litres(short)} (${shortPct.toFixed(2)}%) short of the note.` : short < 0 ? `That is ${litres(-short)} more than the note.` : 'Exactly what the note says.'}
            </p>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Cost per litre (KES, optional)" inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} hint="Lets the system work out your margin" />
          <Input label="Supplier" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          <Input label="Delivery note number" value={note} onChange={(e) => setNote(e.target.value)} />
          <Input label="Truck plate" value={plate} onChange={(e) => setPlate(e.target.value.toUpperCase())} />
        </div>
        {problems.length > 0 && <p className="text-sm text-amber-900 bg-amber-50 rounded-lg px-3 py-2">{problems[0]}</p>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={problems.length > 0}>Record delivery</Button></div>
      </form>
    </Modal>
  );
}

function AddTankModal({ storeId, onClose }: { storeId: string; onClose: () => void }) {
  const refresh = useRefreshTanks();
  const { data: grades = [] } = useGrades();
  const [f, setF] = useState({ tankNumber: '', label: '', gradeId: '', capacity: '', min: '500' });
  const cap = parseLitres(f.capacity);
  const min = parseLitres(f.min);
  const num = /^\d+$/.test(f.tankNumber) ? parseInt(f.tankNumber, 10) : null;
  const save = useMutation({
    mutationFn: () => api.post('/fuel-pump/tanks', { storeId, tankNumber: num, label: f.label.trim() || undefined, gradeId: f.gradeId, capacityLitres: cap, minLevelLitres: min ?? 0 }),
    onSuccess: () => { toast.success('Tank added. Measure it to set its opening level.'); refresh(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal title="Add a tank" subtitle="After adding it, measure the tank once to set how much fuel it holds." onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Tank number" inputMode="numeric" value={f.tankNumber} onChange={(e) => setF({ ...f, tankNumber: e.target.value })} />
          <Input label="Name (optional)" value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
        </div>
        <Select label="Grade it holds" value={f.gradeId} onChange={(e) => setF({ ...f, gradeId: e.target.value })}>
          <option value="">Choose</option>
          {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </Select>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Capacity (L)" inputMode="decimal" value={f.capacity} onChange={(e) => setF({ ...f, capacity: e.target.value })} />
          <Input label="Reorder below (L)" inputMode="decimal" value={f.min} onChange={(e) => setF({ ...f, min: e.target.value })} />
        </div>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={num === null || !f.gradeId || cap === null || cap <= 0}>Add tank</Button></div>
      </form>
    </Modal>
  );
}

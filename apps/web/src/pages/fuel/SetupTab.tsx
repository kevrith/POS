import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChevronDown, ChevronRight, Plus, Wrench } from 'lucide-react';
import { formatKES } from '@pos/shared';
import { api } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Input, Select, Textarea } from '../../components/ui';
import { Modal } from './Modal';
import ControllerPanel, { type ControllerLink } from './ControllerPanel';
import { kesToCents } from './money';
import type { Nozzle, Pump, Tank } from './types';
import { useFuelScope, useGrades, usePumps, useTanks } from './useFuelData';

export default function SetupTab({ link }: { link: ControllerLink }) {
  const { data: pumps = [] } = usePumps();
  const { data: tanks = [] } = useTanks();
  const { data: grades = [] } = useGrades();
  const [adding, setAdding] = useState(false);
  const [showController, setShowController] = useState(false);

  return (
    <div className="space-y-8">
      <section aria-labelledby="pumps-h" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="pumps-h" className="font-semibold text-gray-900">Pumps and nozzles</h2>
            <p className="text-sm text-gray-600">Each nozzle sells one grade, draws from one tank and has its own meter.</p>
          </div>
          <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => setAdding(true)} disabled={grades.length === 0}>Add pump</Button>
        </div>
        {grades.length === 0 && <p className="text-sm text-amber-900 bg-amber-50 rounded-lg px-4 py-2">Add a fuel grade under Prices and a tank under Tanks first.</p>}
        {pumps.length === 0 ? <Card><EmptyState title="No pumps yet" description="Add each dispenser with its nozzles." /></Card> : (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{pumps.map((p) => <PumpCard key={p.id} pump={p} tanks={tanks} />)}</div>
        )}
      </section>

      <Maintenance pumps={pumps} />

      <section aria-labelledby="controller-h" className="space-y-3">
        <button type="button" id="controller-h" aria-expanded={showController} onClick={() => setShowController(!showController)} className="flex items-center gap-2 font-semibold text-gray-900">
          {showController ? <ChevronDown className="w-4 h-4" aria-hidden /> : <ChevronRight className="w-4 h-4" aria-hidden />}
          Pump controller connection (optional, not yet tested)
        </button>
        {showController && <ControllerPanel link={link} />}
      </section>

      {adding && <AddPumpModal onClose={() => setAdding(false)} tanks={tanks} />}
    </div>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => { for (const k of ['fuel-pumps', 'fuel-tanks']) void qc.invalidateQueries({ queryKey: [k] }); };
}

function PumpCard({ pump, tanks }: { pump: Pump; tanks: Tank[] }) {
  const refresh = useRefresh();
  const { data: grades = [] } = useGrades();
  const update = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) => api.patch(`/fuel-pump/nozzles/${id}`, body),
    onSuccess: () => { toast.success('Nozzle updated'); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const add = useMutation({
    mutationFn: () => api.post(`/fuel-pump/pumps/${pump.id}/nozzles`, { gradeId: pump.nozzles[0]?.gradeId ?? pump.gradeId }),
    onSuccess: () => { toast.success('Nozzle added'); refresh(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const status = useMutation({
    mutationFn: (s: string) => api.patch(`/fuel-pump/pumps/${pump.id}`, { status: s }),
    onSuccess: refresh,
    onError: (e: Error) => toast.error(e.message),
  });
  const out = pump.status === 'OFFLINE' || pump.status === 'MAINTENANCE';

  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div><p className="font-bold text-gray-900">Pump {pump.pumpNumber}</p>{pump.label && <p className="text-sm text-gray-600">{pump.label}</p>}</div>
        <div className="flex items-center gap-2">
          <Badge tone={out ? 'warning' : 'neutral'}>{pump.status}</Badge>
          <Button size="sm" variant="secondary" onClick={() => status.mutate(out ? 'IDLE' : 'MAINTENANCE')} loading={status.isPending}>{out ? 'Back in service' : 'Take out of service'}</Button>
        </div>
      </div>
      <div className="space-y-2">
        {pump.nozzles.map((n) => (
          <div key={n.id} className={`rounded-lg border p-3 grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr_auto] gap-3 items-end ${n.isActive ? '' : 'opacity-60'}`}>
            <p className="font-semibold text-sm pb-2">Nozzle {n.nozzleNumber}</p>
            <Select label="Grade" value={n.gradeId} onChange={(e) => update.mutate({ id: n.id, body: { gradeId: e.target.value } })}>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <Select label="Draws from" value={n.tankId ?? ''} onChange={(e) => update.mutate({ id: n.id, body: { tankId: e.target.value || null } })}>
              <option value="">No tank (not tracked)</option>
              {tanks.filter((t) => t.gradeId === n.gradeId).map((t) => <option key={t.id} value={t.id}>{t.label ?? `Tank ${t.tankNumber}`}</option>)}
            </Select>
            <label className="flex items-center gap-2 text-sm pb-2"><input type="checkbox" className="w-5 h-5" checked={n.isActive} onChange={(e) => update.mutate({ id: n.id, body: { isActive: e.target.checked } })} />In use</label>
            {n.lastReadingAt && <p className="sm:col-span-4 text-xs text-gray-600">Meter last read {nozzleMeter(n)} on {new Date(n.lastReadingAt).toLocaleDateString('en-KE', { dateStyle: 'medium' })}</p>}
          </div>
        ))}
      </div>
      <Button variant="ghost" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => add.mutate()} loading={add.isPending}>Add a nozzle</Button>
    </Card>
  );
}
const nozzleMeter = (n: Nozzle) => `${n.totalizerLitres.toLocaleString('en-KE', { maximumFractionDigits: 2 })} L`;

function AddPumpModal({ onClose, tanks }: { onClose: () => void; tanks: Tank[] }) {
  const refresh = useRefresh();
  const { storeId } = useFuelScope();
  const { data: grades = [] } = useGrades();
  const [number, setNumber] = useState('');
  const [label, setLabel] = useState('');
  const [hoses, setHoses] = useState<Array<{ gradeId: string; tankId: string }>>([{ gradeId: '', tankId: '' }]);
  const num = /^\d+$/.test(number) ? parseInt(number, 10) : null;
  const save = useMutation({
    mutationFn: () => api.post('/fuel-pump/pumps', { storeId, pumpNumber: num, label: label.trim() || undefined, nozzles: hoses.map((h) => ({ gradeId: h.gradeId, tankId: h.tankId || undefined })) }),
    onSuccess: () => { toast.success('Pump added'); refresh(); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal title="Add a pump" subtitle="A dispenser can have several nozzles, each selling its own grade." onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Pump number" inputMode="numeric" value={number} onChange={(e) => setNumber(e.target.value)} />
          <Input label="Name (optional)" placeholder="Island A, left side" value={label} onChange={(e) => setLabel(e.target.value)} />
        </div>
        {hoses.map((h, i) => (
          <div key={i} className="grid grid-cols-2 gap-3 rounded-lg border p-3">
            <Select label={`Nozzle ${i + 1} sells`} value={h.gradeId} onChange={(e) => setHoses(hoses.map((x, k) => (k === i ? { gradeId: e.target.value, tankId: '' } : x)))}>
              <option value="">Choose a grade</option>
              {grades.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
            </Select>
            <Select label="Draws from" value={h.tankId} onChange={(e) => setHoses(hoses.map((x, k) => (k === i ? { ...x, tankId: e.target.value } : x)))}>
              <option value="">First tank of that grade</option>
              {tanks.filter((t) => t.gradeId === h.gradeId).map((t) => <option key={t.id} value={t.id}>{t.label ?? `Tank ${t.tankNumber}`}</option>)}
            </Select>
          </div>
        ))}
        <Button variant="ghost" size="sm" icon={<Plus className="w-4 h-4" />} onClick={() => setHoses([...hoses, { gradeId: hoses[hoses.length - 1].gradeId, tankId: '' }])} disabled={hoses.length >= 12}>Add another nozzle</Button>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={num === null || hoses.some((h) => !h.gradeId)}>Add pump</Button></div>
      </form>
    </Modal>
  );
}

const MAINT_TYPES = [['SERVICE', 'Service'], ['REPAIR', 'Repair'], ['CALIBRATION', 'Calibration'], ['INSPECTION', 'Inspection'], ['EMERGENCY', 'Emergency']] as const;
const MAINT_STATUS = [['COMPLETED', 'Done'], ['IN_PROGRESS', 'In progress'], ['SCHEDULED', 'Scheduled'], ['CANCELLED', 'Cancelled']] as const;

function Maintenance({ pumps }: { pumps: Pump[] }) {
  const qc = useQueryClient();
  const { businessId } = useFuelScope();
  const [adding, setAdding] = useState(false);
  const { data: logs = [] } = useQuery({
    queryKey: ['fuel-maintenance', businessId],
    queryFn: () => api.get<Array<{ id: string; type: string; description: string; technicianName: string | null; costCents: number; status: string; startedAt: string; pump?: { pumpNumber: number } }>>(`/fuel-pump/maintenance?businessId=${businessId}`),
    enabled: !!businessId,
  });
  const finish = useMutation({
    mutationFn: (id: string) => api.patch(`/fuel-pump/maintenance/${id}`, { status: 'COMPLETED', completedAt: new Date().toISOString() }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['fuel-maintenance'] }),
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <section aria-labelledby="maint-h" className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <div><h2 id="maint-h" className="font-semibold text-gray-900">Pump service and calibration log</h2><p className="text-sm text-gray-600">Keep the record the Weights and Measures inspector asks for.</p></div>
        <Button variant="secondary" icon={<Wrench className="w-4 h-4" />} onClick={() => setAdding(true)} disabled={pumps.length === 0}>Log work</Button>
      </div>
      <Card className="overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide"><tr><th className="text-left px-4 py-2">Date</th><th className="text-left px-3 py-2">Pump</th><th className="text-left px-3 py-2">Work</th><th className="text-left px-3 py-2">Technician</th><th className="text-right px-3 py-2">Cost</th><th className="text-left px-3 py-2">Status</th><th className="px-3 py-2" /></tr></thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-t align-top">
                  <td className="px-4 py-2 whitespace-nowrap">{new Date(l.startedAt).toLocaleDateString('en-KE', { dateStyle: 'medium' })}</td>
                  <td className="px-3 py-2">Pump {l.pump?.pumpNumber}</td>
                  <td className="px-3 py-2"><span className="font-medium">{MAINT_TYPES.find((t) => t[0] === l.type)?.[1] ?? l.type}</span><span className="block text-gray-700">{l.description}</span></td>
                  <td className="px-3 py-2">{l.technicianName ?? '-'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{l.costCents ? formatKES(l.costCents) : '-'}</td>
                  <td className="px-3 py-2"><Badge tone={l.status === 'COMPLETED' ? 'success' : l.status === 'CANCELLED' ? 'neutral' : 'warning'}>{MAINT_STATUS.find((s) => s[0] === l.status)?.[1] ?? l.status}</Badge></td>
                  <td className="px-3 py-2 text-right">{(l.status === 'IN_PROGRESS' || l.status === 'SCHEDULED') && <button type="button" className="text-xs font-semibold text-brand-700 hover:underline" onClick={() => finish.mutate(l.id)}>Mark done</button>}</td>
                </tr>
              ))}
              {logs.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-500">Nothing logged yet</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
      {adding && <LogWork pumps={pumps} onClose={() => setAdding(false)} />}
    </section>
  );
}

function LogWork({ pumps, onClose }: { pumps: Pump[]; onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ pumpId: pumps[0]?.id ?? '', type: 'SERVICE', status: 'COMPLETED', description: '', tech: '', cost: '', notes: '' });
  const cost = f.cost.trim() ? kesToCents(f.cost) : 0;
  const save = useMutation({
    mutationFn: () => api.post('/fuel-pump/maintenance', { pumpId: f.pumpId, type: f.type, status: f.status, description: f.description.trim(), technicianName: f.tech.trim() || undefined, costCents: cost, notes: f.notes.trim() || undefined, completedAt: f.status === 'COMPLETED' ? new Date().toISOString() : undefined }),
    onSuccess: () => { toast.success('Logged'); void qc.invalidateQueries({ queryKey: ['fuel-maintenance'] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal title="Log pump work" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Select label="Pump" value={f.pumpId} onChange={(e) => setF({ ...f, pumpId: e.target.value })}>{pumps.map((p) => <option key={p.id} value={p.id}>Pump {p.pumpNumber}</option>)}</Select>
          <Select label="Kind of work" value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>{MAINT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
          <Select label="Status" value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>{MAINT_STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select>
        </div>
        <Input label="What was done" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Technician" value={f.tech} onChange={(e) => setF({ ...f, tech: e.target.value })} />
          <Input label="Cost (KES)" inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} error={f.cost.trim() && cost === null ? 'Enter an amount' : undefined} />
        </div>
        <Textarea label="Notes (optional)" rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={!f.pumpId || !f.description.trim() || cost === null}>Save</Button></div>
      </form>
    </Modal>
  );
}

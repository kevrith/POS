import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Input, Select, Textarea } from '../../components/ui';
import { useDialog } from '../../components/Dialog';
import { formatKES } from '@pos/shared';
import { Modal } from './Modal';
import ShiftSummaryView from './ShiftSummaryView';
import { centsToInput, kesToCents, litres, parseLitres } from './money';
import type { Pump, Shift, ShiftSummary } from './types';
import { useFuelScope, useOpenShift, usePumps } from './useFuelData';

const GAP_LITRES = 1;

export default function ShiftTab() {
  const { businessId, storeId, isManager } = useFuelScope();
  const { data: open, isPending: isLoading } = useOpenShift();
  const { data: pumps = [] } = usePumps();
  const [viewing, setViewing] = useState<string | null>(null);

  const { data: history = [] } = useQuery({
    queryKey: ['fuel-shifts', businessId, storeId],
    queryFn: () => api.get<Shift[]>(`/fuel-pump/shifts?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!storeId,
  });

  if (isLoading) return <p className="text-sm text-gray-500 py-8 text-center">Loading shift...</p>;

  return (
    <div className="space-y-6">
      {open ? <LiveShift shift={open} isManager={isManager} /> : <OpenShiftForm pumps={pumps} />}

      <section aria-labelledby="shift-history">
        <h2 id="shift-history" className="font-semibold text-gray-900 mb-2">Recent shifts</h2>
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr>
                  <th className="text-left px-4 py-2">Opened</th>
                  <th className="text-left px-3 py-2">Closed</th>
                  <th className="text-left px-3 py-2">Attendants</th>
                  <th className="text-left px-3 py-2">Result</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {history.filter((s) => s.status === 'CLOSED').map((s) => {
                  const short = s.attendants.reduce((t, a) => t + Math.min(0, a.cashVarianceCents ?? 0), 0);
                  return (
                    <tr key={s.id} className="border-t">
                      <td className="px-4 py-2">{new Date(s.openedAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                      <td className="px-3 py-2">{s.closedAt ? new Date(s.closedAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' }) : '-'}</td>
                      <td className="px-3 py-2">{s.attendants.map((a) => a.name).join(', ') || s.cashierName}</td>
                      <td className="px-3 py-2">{short < 0 ? <Badge tone="danger">Cash short {formatKES(-short)}</Badge> : s.attendants.length ? <Badge tone="success">Cash balanced</Badge> : <Badge>Older shift</Badge>}</td>
                      <td className="px-3 py-2 text-right"><button type="button" className="text-sm font-semibold text-brand-700 hover:underline" onClick={() => setViewing(s.id)}>Details</button></td>
                    </tr>
                  );
                })}
                {history.filter((s) => s.status === 'CLOSED').length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-500">No closed shifts yet</td></tr>}
              </tbody>
            </table>
          </div>
        </Card>
      </section>

      {viewing && <ShiftDetails shiftId={viewing} onClose={() => setViewing(null)} />}
    </div>
  );
}

function ShiftDetails({ shiftId, onClose }: { shiftId: string; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ['shift-summary', shiftId], queryFn: () => api.get<ShiftSummary>(`/fuel-pump/shifts/${shiftId}/summary`) });
  return (
    <Modal title="Shift details" subtitle={data ? `${new Date(data.shift.openedAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}${data.shift.closedBy ? `, closed by ${data.shift.closedBy}` : ''}` : undefined} onClose={onClose} wide>
      {isLoading || !data ? <p className="text-sm text-gray-500">Loading...</p> : <ShiftSummaryView summary={data} />}
      {data?.shift.closeNotes && <p className="mt-3 text-sm text-gray-700"><span className="font-semibold">Notes:</span> {data.shift.closeNotes}</p>}
    </Modal>
  );
}

// ── Opening ────────────────────────────────────────────────────────────────

interface Row { include: boolean; attendant: string; opening: string; note: string }

function OpenShiftForm({ pumps }: { pumps: Pump[] }) {
  const qc = useQueryClient();
  const { user, storeId } = useFuelScope();
  const [attendants, setAttendants] = useState<string[]>([]);
  const [draft, setDraft] = useState('');
  const hoses = useMemo(() => pumps.flatMap((p) => p.nozzles.filter((n) => n.isActive).map((n) => ({ pump: p, nozzle: n }))), [pumps]);
  const [rows, setRows] = useState<Record<string, Row>>({});

  const rowOf = (id: string, nozzle: { totalizerLitres: number; lastReadingAt: string | null }): Row =>
    rows[id] ?? { include: true, attendant: '', opening: nozzle.lastReadingAt ? String(nozzle.totalizerLitres) : '', note: '' };
  const patch = (id: string, nozzle: { totalizerLitres: number; lastReadingAt: string | null }, p: Partial<Row>) => setRows((r) => ({ ...r, [id]: { ...rowOf(id, nozzle), ...p } }));

  const addAttendant = () => {
    const name = draft.trim();
    if (!name || attendants.some((a) => a.toLowerCase() === name.toLowerCase())) return;
    setAttendants([...attendants, name]);
    setDraft('');
  };

  const problems: string[] = [];
  const picked = hoses.filter(({ nozzle }) => rowOf(nozzle.id, nozzle).include);
  if (attendants.length === 0) problems.push('Add at least one attendant');
  if (picked.length === 0) problems.push('Include at least one nozzle');
  for (const { pump, nozzle } of picked) {
    const r = rowOf(nozzle.id, nozzle);
    const label = `Pump ${pump.pumpNumber} nozzle ${nozzle.nozzleNumber}`;
    const opening = parseLitres(r.opening);
    if (!r.attendant) problems.push(`${label}: choose the attendant`);
    if (opening === null) problems.push(`${label}: enter the meter reading`);
    else if (nozzle.lastReadingAt && Math.abs(opening - nozzle.totalizerLitres) > GAP_LITRES && !r.note.trim()) problems.push(`${label}: the meter closed at ${nozzle.totalizerLitres} last time, say why it reads differently`);
  }

  const open = useMutation({
    mutationFn: () => api.post('/fuel-pump/shifts/open', {
      storeId,
      cashierName: user?.name,
      attendants: attendants
        .map((name) => ({ name, nozzleIds: picked.filter(({ nozzle }) => rowOf(nozzle.id, nozzle).attendant === name).map(({ nozzle }) => nozzle.id) }))
        .filter((a) => a.nozzleIds.length > 0),
      readings: picked.map(({ nozzle }) => {
        const r = rowOf(nozzle.id, nozzle);
        return { nozzleId: nozzle.id, openingLitres: parseLitres(r.opening), note: r.note.trim() || undefined };
      }),
    }),
    onSuccess: () => {
      toast.success('Shift opened');
      for (const k of ['fuel-open-shift', 'fuel-shifts', 'fuel-pumps']) void qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (hoses.length === 0) {
    return <Card><EmptyState icon={<Plus className="w-6 h-6" />} title="Set up a pump first" description="A shift reads the meter of every nozzle. Add your grades, tanks and pumps under Setup." /></Card>;
  }

  return (
    <Card className="p-5 space-y-5">
      <div>
        <h2 className="text-lg font-bold text-gray-900">Open a shift</h2>
        <p className="text-sm text-gray-600">Read each pump meter and say who is on which nozzle. From now on every litre sold is the attendant's to account for.</p>
      </div>

      <div className="space-y-2">
        <div className="flex gap-2 items-end">
          <Input label="Attendants on this shift" placeholder="Name, then Add" value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAttendant(); } }} className="flex-1" />
          <Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={addAttendant} disabled={!draft.trim()}>Add</Button>
        </div>
        <div className="flex flex-wrap gap-2">
          {attendants.map((a) => (
            <span key={a} className="inline-flex items-center gap-1 bg-gray-100 rounded-full pl-3 pr-1 py-1 text-sm font-medium">
              {a}
              <button type="button" aria-label={`Remove ${a}`} className="w-6 h-6 rounded-full hover:bg-gray-200 flex items-center justify-center"
                onClick={() => { setAttendants(attendants.filter((x) => x !== a)); setRows((r) => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, v.attendant === a ? { ...v, attendant: '' } : v]))); }}>
                <X className="w-3.5 h-3.5" aria-hidden />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="overflow-x-auto -mx-1">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="text-gray-600 text-xs uppercase tracking-wide">
            <tr>
              <th className="text-left px-2 py-2 w-10"><span className="sr-only">On this shift</span></th>
              <th className="text-left px-2 py-2">Nozzle</th>
              <th className="text-left px-2 py-2">Attendant</th>
              <th className="text-left px-2 py-2">Meter reading (L)</th>
            </tr>
          </thead>
          <tbody>
            {hoses.map(({ pump, nozzle }) => {
              const r = rowOf(nozzle.id, nozzle);
              const opening = parseLitres(r.opening);
              const gap = nozzle.lastReadingAt && opening !== null && Math.abs(opening - nozzle.totalizerLitres) > GAP_LITRES;
              const label = `Pump ${pump.pumpNumber} nozzle ${nozzle.nozzleNumber}`;
              return (
                <tr key={nozzle.id} className="border-t align-top">
                  <td className="px-2 py-2"><input type="checkbox" className="w-5 h-5 mt-2" checked={r.include} aria-label={`${label} is on this shift`} onChange={(e) => patch(nozzle.id, nozzle, { include: e.target.checked })} /></td>
                  <td className="px-2 py-2"><p className="font-medium pt-2">{label}</p><p className="text-xs text-gray-600">{nozzle.grade.name}</p></td>
                  <td className="px-2 py-2">
                    <Select label={`Attendant for ${label}`} hideLabel value={r.attendant} disabled={!r.include} onChange={(e) => patch(nozzle.id, nozzle, { attendant: e.target.value })}>
                      <option value="">Choose</option>
                      {attendants.map((a) => <option key={a} value={a}>{a}</option>)}
                    </Select>
                  </td>
                  <td className="px-2 py-2 space-y-1.5">
                    <Input label={`Meter reading for ${label}`} hideLabel inputMode="decimal" disabled={!r.include} value={r.opening} onChange={(e) => patch(nozzle.id, nozzle, { opening: e.target.value })}
                      hint={nozzle.lastReadingAt ? `Closed at ${nozzle.totalizerLitres} last time` : 'First reading for this nozzle'} />
                    {gap && r.include && <Input label={`Why ${label} reads differently`} hideLabel placeholder="Why does it differ from the last close?" value={r.note} onChange={(e) => patch(nozzle.id, nozzle, { note: e.target.value })} />}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {problems.length > 0 && (
        <ul className="text-sm text-amber-900 bg-amber-50 rounded-lg px-4 py-3 list-disc list-inside space-y-0.5">
          {problems.slice(0, 4).map((p) => <li key={p}>{p}</li>)}
          {problems.length > 4 && <li>and {problems.length - 4} more</li>}
        </ul>
      )}
      <div className="flex justify-end"><Button size="lg" onClick={() => open.mutate()} loading={open.isPending} disabled={problems.length > 0}>Open shift</Button></div>
    </Card>
  );
}

// ── Open shift ─────────────────────────────────────────────────────────────

function LiveShift({ shift, isManager }: { shift: Shift; isManager: boolean }) {
  const qc = useQueryClient();
  const { prompt } = useDialog();
  const [closing, setClosing] = useState(false);
  const [closed, setClosed] = useState<ShiftSummary | null>(null);
  const { data: summary } = useQuery({ queryKey: ['shift-summary', shift.id], queryFn: () => api.get<ShiftSummary>(`/fuel-pump/shifts/${shift.id}/summary`), refetchInterval: 15000 });

  const test = useMutation({
    mutationFn: (body: { nozzleId: string; litres: number }) => api.post('/fuel-pump/tests', { ...body, reason: 'ROUTINE' }),
    onSuccess: () => { toast.success('Pump test recorded'); void qc.invalidateQueries({ queryKey: ['shift-summary'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const recordTest = async (nozzleId: string, label: string) => {
    const text = await prompt({ title: `Test ${label}`, message: 'Litres drawn to test the pump and poured back into the tank. They move the meter but are not a sale.', placeholder: 'Litres, e.g. 20', confirmLabel: 'Record test' });
    const n = text ? parseLitres(text) : null;
    if (text && (n === null || n <= 0)) { toast.error('Enter the litres as a number'); return; }
    if (n) test.mutate({ nozzleId, litres: n });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-gray-900">Shift in progress</h2>
          <p className="text-sm text-gray-600">Opened {new Date(shift.openedAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })} by {shift.cashierName}</p>
        </div>
        <Button variant="danger" onClick={() => setClosing(true)}>Close shift</Button>
      </div>
      {summary ? <ShiftSummaryView summary={summary} onTest={isManager ? (id, label) => void recordTest(id, label) : undefined} /> : <p className="text-sm text-gray-500">Loading...</p>}
      {closing && summary && <CloseShiftModal summary={summary} onClose={() => setClosing(false)} onClosed={(s) => { setClosing(false); setClosed(s); }} />}
      {closed && (
        <Modal title="Shift closed" onClose={() => setClosed(null)} wide>
          <ShiftSummaryView summary={closed} />
        </Modal>
      )}
    </div>
  );
}

function CloseShiftModal({ summary, onClose, onClosed }: { summary: ShiftSummary; onClose: () => void; onClosed: (s: ShiftSummary) => void }) {
  const qc = useQueryClient();
  const [meters, setMeters] = useState<Record<string, string>>({});
  const [cash, setCash] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');

  const unrecordedFor = (n: ShiftSummary['byNozzle'][number]) => {
    const closing = parseLitres(meters[n.nozzleId] ?? '');
    return closing === null ? null : Math.round((closing - n.openingLitres - n.soldLitres - n.testLitres) * 1000) / 1000;
  };

  const problems: string[] = [];
  for (const n of summary.byNozzle) {
    const closing = parseLitres(meters[n.nozzleId] ?? '');
    if (closing === null) problems.push(`Read pump ${n.pumpNumber} nozzle ${n.nozzleNumber}`);
    else if (closing < n.openingLitres) problems.push(`Pump ${n.pumpNumber} nozzle ${n.nozzleNumber} reads below where it opened`);
  }
  for (const a of summary.byAttendant) if (kesToCents(cash[a.attendantId] ?? '') === null) problems.push(`Enter the cash ${a.name} hands in (0 if none)`);

  const close = useMutation({
    mutationFn: () => api.post<ShiftSummary>(`/fuel-pump/shifts/${summary.shift.id}/close`, {
      readings: summary.byNozzle.map((n) => ({ nozzleId: n.nozzleId, closingLitres: parseLitres(meters[n.nozzleId] ?? '') })),
      attendants: summary.byAttendant.map((a) => ({ attendantId: a.attendantId, declaredCashCents: kesToCents(cash[a.attendantId] ?? '') })),
      notes: notes.trim() || undefined,
    }),
    onSuccess: (s) => {
      toast.success('Shift closed');
      for (const k of ['fuel-open-shift', 'fuel-shifts', 'fuel-pumps', 'shift-summary']) void qc.invalidateQueries({ queryKey: [k] });
      onClosed(s);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal title="Close shift" subtitle="Read every meter and count each attendant's cash. The differences are kept with the shift." onClose={onClose} wide>
      <div className="space-y-6">
        <section>
          <h3 className="font-semibold text-gray-900 mb-2">Meter readings</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead className="text-gray-600 text-xs uppercase tracking-wide">
                <tr><th className="text-left py-2">Nozzle</th><th className="text-right px-2">Sold + tested</th><th className="text-right px-2">Should read</th><th className="text-left px-2 w-44">Meter now (L)</th><th className="text-right px-2">Unrecorded</th></tr>
              </thead>
              <tbody>
                {summary.byNozzle.map((n) => {
                  const diff = unrecordedFor(n);
                  const meterNow = parseLitres(meters[n.nozzleId] ?? '');
                  const moved = meterNow === null ? 0 : meterNow - n.openingLitres;
                  const bad = diff !== null && Math.abs(diff) > Math.max(1, Math.abs(moved) * 0.002);
                  return (
                    <tr key={n.nozzleId} className="border-t align-top">
                      <td className="py-2 pr-2"><p className="font-medium">Pump {n.pumpNumber} nozzle {n.nozzleNumber}</p><p className="text-xs text-gray-600">{n.gradeName}</p></td>
                      <td className="px-2 py-2 text-right tabular-nums">{litres(n.soldLitres + n.testLitres)}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{litres(n.expectedClosingLitres)}</td>
                      <td className="px-2 py-2"><Input label={`Closing meter for pump ${n.pumpNumber} nozzle ${n.nozzleNumber}`} hideLabel inputMode="decimal" value={meters[n.nozzleId] ?? ''} onChange={(e) => setMeters({ ...meters, [n.nozzleId]: e.target.value })} /></td>
                      <td className={`px-2 py-2 text-right tabular-nums ${bad ? 'text-red-700 font-semibold' : ''}`}>{diff === null ? '-' : litres(diff)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section>
          <h3 className="font-semibold text-gray-900 mb-2">Cash handed in</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead className="text-gray-600 text-xs uppercase tracking-wide">
                <tr><th className="text-left py-2">Attendant</th><th className="text-right px-2">Cash sales</th><th className="text-left px-2 w-44">Counted (KES)</th><th className="text-right px-2">Difference</th></tr>
              </thead>
              <tbody>
                {summary.byAttendant.map((a) => {
                  const declared = kesToCents(cash[a.attendantId] ?? '');
                  const diff = declared === null ? null : declared - a.expectedCashCents;
                  return (
                    <tr key={a.attendantId} className="border-t align-top">
                      <td className="py-2 pr-2 font-medium">{a.name}</td>
                      <td className="px-2 py-2 text-right tabular-nums">{formatKES(a.expectedCashCents)}</td>
                      <td className="px-2 py-2"><Input label={`Cash handed in by ${a.name}`} hideLabel inputMode="decimal" placeholder={centsToInput(a.expectedCashCents)} value={cash[a.attendantId] ?? ''} onChange={(e) => setCash({ ...cash, [a.attendantId]: e.target.value })} /></td>
                      <td className={`px-2 py-2 text-right tabular-nums ${diff !== null && diff < 0 ? 'text-red-700 font-semibold' : ''}`}>{diff === null ? '-' : diff === 0 ? 'Balanced' : `${diff > 0 ? '+' : '-'}${formatKES(Math.abs(diff))}`}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <Textarea label="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        {problems.length > 0 && <p className="text-sm text-amber-900 bg-amber-50 rounded-lg px-4 py-2">{problems.slice(0, 3).join('. ')}{problems.length > 3 ? ` and ${problems.length - 3} more` : ''}</p>}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Keep shift open</Button>
          <Button variant="danger" onClick={() => close.mutate()} loading={close.isPending} disabled={problems.length > 0}>Close shift</Button>
        </div>
      </div>
    </Modal>
  );
}

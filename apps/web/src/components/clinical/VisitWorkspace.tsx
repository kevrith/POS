import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatKES } from '@pos/shared';
import { AlertTriangle, FileText, Pill, Printer, ShieldCheck, Stethoscope, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { allergyLine, bmi, vitalFlags, VISIT_STATUS_LABEL, type Diagnosis, type VisitDetail } from '../../lib/clinical';
import { isValidKraPin } from '../../lib/kraPin';
import type { CoverStanding } from '../../lib/cover';
import { CoverBadge, CoverCheckModal, useInsurers } from './CoverCheck';
import { LabTab } from './LabResults';
import { printHtml } from '../../lib/printHtml';
import { referralLetterHtml, sickNoteHtml } from '../../lib/visitPrint';
import { Badge, Button, Input, Select, Tabs, Textarea, type TabItem } from '../ui';
import { Modal } from '../../pages/fuel/Modal';
import { useDialog } from '../Dialog';

type Tab = 'triage' | 'consultation' | 'lab' | 'prescriptions' | 'billing';

const canConsult = (role?: string) => ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR'].includes(String(role));
const canBill = (role?: string) => ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'PHARMACIST'].includes(String(role));
const text = (n: number | null | undefined) => (n == null ? '' : String(n));

/** One visit, start to finish: vitals, the doctor's notes and diagnoses, prescriptions, charges and the bill. */
export default function VisitWorkspace({ visitId, onClose }: { visitId: string; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { prompt } = useDialog();
  const [tab, setTab] = useState<Tab | null>(null);

  const { data: visit, error } = useQuery<VisitDetail>({ queryKey: ['visit', visitId], queryFn: () => api.get(`/visits/${visitId}`), refetchOnWindowFocus: true });
  const { data: settings } = useQuery<{ name?: string }>({
    queryKey: ['biz-settings', user?.businessId],
    queryFn: () => api.get(`/business/${user?.businessId}/settings`),
    enabled: !!user?.businessId,
    staleTime: 5 * 60_000,
  });

  // Open on the step the visit is at.
  const natural: Tab = !visit ? 'triage' : visit.status === 'WAITING' ? 'triage' : visit.status === 'TRIAGED' || visit.status === 'IN_CONSULTATION' ? 'consultation' : 'billing';
  const current = tab ?? natural;

  const refresh = (v?: VisitDetail) => {
    if (v) qc.setQueryData(['visit', visitId], v);
    void qc.invalidateQueries({ queryKey: ['visit', visitId] });
    void qc.invalidateQueries({ queryKey: ['visits'] });
  };
  const act = useMutation({
    mutationFn: ({ path, method = 'post', body }: { path: string; method?: 'post' | 'patch'; body?: unknown }) => (method === 'post' ? api.post<VisitDetail>(`/visits/${visitId}/${path}`, body ?? {}) : api.patch<VisitDetail>(`/visits/${visitId}/${path}`, body ?? {})),
    onSuccess: (v) => refresh(v),
    onError: (e: Error) => toast.error(e.message),
  });

  const tabs = useMemo<Array<TabItem<Tab>>>(() => [
    { id: 'triage', label: 'Triage' },
    { id: 'consultation', label: 'Consultation' },
    { id: 'lab', label: 'Lab' },
    { id: 'prescriptions', label: 'Prescriptions', count: visit?.prescriptions.length },
    { id: 'billing', label: 'Billing', count: visit?.charges.length },
  ], [visit?.prescriptions.length, visit?.charges.length]);

  if (error) return <Modal title="Visit" onClose={onClose}><p className="text-sm text-red-700" role="alert">{(error as Error).message}</p></Modal>;
  if (!visit) return <Modal title="Visit" onClose={onClose}><p className="text-sm text-gray-500">Loading…</p></Modal>;

  const p = visit.patient;
  const closed = visit.status === 'COMPLETED' || visit.status === 'CANCELLED';
  const mine = !visit.doctorId || visit.doctorId === user?.id || ['OWNER', 'ADMIN', 'MANAGER'].includes(String(user?.role));
  const business = settings?.name ?? 'Clinic';

  return (
    <Modal wide title={`${p?.name ?? 'Patient'} · ${visit.visitNumber}`} subtitle={`${VISIT_STATUS_LABEL[visit.status]}${visit.doctorName ? ` · ${visit.doctorName}` : ''}${visit.complaint ? ` · ${visit.complaint}` : ''}`} onClose={onClose}>
      <div className="space-y-4">
        {p && p.allergies.length > 0 && (
          <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:bg-red-500/10 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Allergic to {allergyLine(p.allergies)}
          </p>
        )}
        {p && (p.pregnant || p.breastfeeding || p.conditions.length > 0) && (
          <p className="text-xs text-gray-600 dark:text-gray-300">{[p.pregnant && 'Pregnant', p.breastfeeding && 'Breastfeeding', p.conditions.length > 0 && `Conditions: ${p.conditions.join(', ')}`].filter(Boolean).join(' · ')}</p>
        )}

        <Tabs tabs={tabs} value={current} onChange={setTab} />

        {current === 'triage' && <TriageTab visit={visit} closed={closed} onSave={(body) => act.mutate({ path: 'vitals', method: 'patch', body })} busy={act.isPending} />}
        {current === 'consultation' && <ConsultationTab visit={visit} editable={visit.status === 'IN_CONSULTATION' && canConsult(user?.role) && mine} onSave={(body) => act.mutate({ path: 'consultation', method: 'patch', body })} busy={act.isPending}
          business={business} />}
        {current === 'lab' && <LabTab visitId={visit.id} closed={closed} canOrder={canConsult(user?.role)} business={business} onChanged={() => refresh()} />}
        {current === 'prescriptions' && <PrescriptionsTab visit={visit} closed={closed} />}
        {current === 'billing' && <BillingTab visit={visit} closed={closed || user?.role === 'NURSE'} canTakeMoney={canBill(user?.role)} onChanged={refresh} />}

        {!closed && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t pt-3 dark:border-gray-700">
            {(visit.status === 'WAITING' || visit.status === 'TRIAGED') && canConsult(user?.role) && (
              <Button icon={<Stethoscope className="w-4 h-4" />} loading={act.isPending} onClick={() => { act.mutate({ path: 'start' }); setTab('consultation'); }}>Take in to the doctor</Button>
            )}
            {visit.status === 'IN_CONSULTATION' && canConsult(user?.role) && mine && (
              <Button variant="success" loading={act.isPending} onClick={() => { act.mutate({ path: 'finish' }); setTab('billing'); }}>Finish consultation, send to billing</Button>
            )}
            {visit.status === 'READY_TO_BILL' && canConsult(user?.role) && (
              <Button variant="secondary" loading={act.isPending} onClick={() => { act.mutate({ path: 'reopen' }); setTab('consultation'); }}>Back to the doctor</Button>
            )}
            {user?.role !== 'NURSE' && <Button variant="secondary" icon={<X className="w-4 h-4" />} onClick={async () => {
              const reason = await prompt({ title: 'Cancel this visit', message: 'Nothing is billed. Say why (for example: the patient left).', placeholder: 'Reason', confirmLabel: 'Cancel visit' });
              if (reason && reason.trim()) act.mutate({ path: 'cancel', body: { reason: reason.trim() } });
            }}>Cancel visit</Button>}
          </div>
        )}
        {visit.status === 'CANCELLED' && <p className="text-sm text-gray-600">Cancelled: {visit.cancelReason}</p>}
      </div>
    </Modal>
  );
}

// ── Triage ───────────────────────────────────────────────────────────────────────────────────────────────────────────

function TriageTab({ visit, closed, onSave, busy }: { visit: VisitDetail; closed: boolean; onSave: (body: Record<string, unknown>) => void; busy: boolean }) {
  const [f, setF] = useState({
    temperatureC: text(visit.temperatureC), pulse: text(visit.pulse), respiratoryRate: text(visit.respiratoryRate), systolic: text(visit.systolic), diastolic: text(visit.diastolic),
    spo2: text(visit.spo2), weightKg: text(visit.weightKg ?? visit.patient?.weightKg), heightCm: text(visit.heightCm), bloodSugarMmol: text(visit.bloodSugarMmol), painScore: text(visit.painScore), triageNotes: visit.triageNotes ?? '',
  });
  useEffect(() => { /* a reload from the server replaces what is shown */
    setF({ temperatureC: text(visit.temperatureC), pulse: text(visit.pulse), respiratoryRate: text(visit.respiratoryRate), systolic: text(visit.systolic), diastolic: text(visit.diastolic), spo2: text(visit.spo2),
      weightKg: text(visit.weightKg ?? visit.patient?.weightKg), heightCm: text(visit.heightCm), bloodSugarMmol: text(visit.bloodSugarMmol), painScore: text(visit.painScore), triageNotes: visit.triageNotes ?? '' });
  }, [visit.temperatureC, visit.pulse, visit.respiratoryRate, visit.systolic, visit.diastolic, visit.spo2, visit.weightKg, visit.heightCm, visit.bloodSugarMmol, visit.painScore, visit.triageNotes, visit.patient?.weightKg]);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const n = (s: string) => (s.trim() === '' ? null : Number(s));
  const flags = vitalFlags({ temperatureC: n(f.temperatureC), pulse: n(f.pulse), respiratoryRate: n(f.respiratoryRate), systolic: n(f.systolic), diastolic: n(f.diastolic), spo2: n(f.spo2), bloodSugarMmol: n(f.bloodSugarMmol) }, visit.patient?.ageYears ?? null);
  const index = bmi(n(f.weightKg), n(f.heightCm));
  const bpHalf = (f.systolic.trim() === '') !== (f.diastolic.trim() === '');

  return (
    <form className="space-y-4" onSubmit={(e) => {
      e.preventDefault();
      onSave({ temperatureC: f.temperatureC, pulse: f.pulse, respiratoryRate: f.respiratoryRate, systolic: f.systolic, diastolic: f.diastolic, spo2: f.spo2, weightKg: f.weightKg, heightCm: f.heightCm, bloodSugarMmol: f.bloodSugarMmol, painScore: f.painScore, triageNotes: f.triageNotes });
    }}>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Input label="Temperature (°C)" inputMode="decimal" value={f.temperatureC} onChange={set('temperatureC')} disabled={closed} />
        <Input label="Pulse (a minute)" inputMode="numeric" value={f.pulse} onChange={set('pulse')} disabled={closed} />
        <Input label="Breathing (a minute)" inputMode="numeric" value={f.respiratoryRate} onChange={set('respiratoryRate')} disabled={closed} />
        <Input label="Oxygen (SpO2 %)" inputMode="numeric" value={f.spo2} onChange={set('spo2')} disabled={closed} />
        <Input label="BP top (systolic)" inputMode="numeric" value={f.systolic} onChange={set('systolic')} disabled={closed} />
        <Input label="BP bottom (diastolic)" inputMode="numeric" value={f.diastolic} onChange={set('diastolic')} disabled={closed} error={bpHalf ? 'Enter both numbers' : undefined} />
        <Input label="Weight (kg)" inputMode="decimal" value={f.weightKg} onChange={set('weightKg')} disabled={closed} />
        <Input label="Height (cm)" inputMode="decimal" value={f.heightCm} onChange={set('heightCm')} disabled={closed} hint={index ? `BMI ${index}` : undefined} />
        <Input label="Blood sugar (mmol/L)" inputMode="decimal" value={f.bloodSugarMmol} onChange={set('bloodSugarMmol')} disabled={closed} />
        <Input label="Pain (0 to 10)" inputMode="numeric" value={f.painScore} onChange={set('painScore')} disabled={closed} />
      </div>
      {flags.length > 0 && (
        <ul className="space-y-1" aria-label="Readings outside the usual range">
          {flags.map((x) => <li key={x.field}><Badge tone={x.level === 'ALERT' ? 'danger' : 'warning'}>{x.text}</Badge></li>)}
        </ul>
      )}
      <Textarea label="Triage notes" rows={2} value={f.triageNotes} onChange={set('triageNotes')} disabled={closed} />
      {visit.triagedBy && <p className="text-xs text-gray-500">Last taken by {visit.triagedBy}</p>}
      {!closed && <div className="flex justify-end"><Button type="submit" loading={busy} disabled={bpHalf}>Save vitals</Button></div>}
    </form>
  );
}

// ── Consultation ─────────────────────────────────────────────────────────────────────────────────────────────────────

function ConsultationTab({ visit, editable, onSave, busy, business }: { visit: VisitDetail; editable: boolean; onSave: (body: Record<string, unknown>) => void; busy: boolean; business: string }) {
  const [f, setF] = useState(() => ({ subjective: visit.subjective ?? '', objective: visit.objective ?? '', assessment: visit.assessment ?? '', plan: visit.plan ?? '', sickLeaveDays: text(visit.sickLeaveDays), sickLeaveNote: visit.sickLeaveNote ?? '',
    referralTo: visit.referralTo ?? '', referralNote: visit.referralNote ?? '', followUpDate: visit.followUpDate ? visit.followUpDate.slice(0, 10) : '' }));
  const [diagnoses, setDiagnoses] = useState<Diagnosis[]>(visit.diagnoses);
  const [q, setQ] = useState('');
  const { data: found = [] } = useQuery<Diagnosis[]>({ queryKey: ['diagnoses', q], queryFn: () => api.get(`/visits/diagnoses?q=${encodeURIComponent(q)}`), enabled: editable && q.trim().length >= 2, staleTime: 60_000 });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setF((s) => ({ ...s, [k]: e.target.value }));
  const add = (d: Diagnosis) => { setDiagnoses((list) => (list.some((x) => (x.code ?? x.label) === (d.code ?? d.label)) ? list : [...list, d])); setQ(''); };
  const sick = sickNoteHtml(business, visit);
  const referral = referralLetterHtml(business, visit);

  return (
    <div className="space-y-4">
      {!editable && <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-600 dark:bg-white/5 dark:text-gray-300">{visit.status === 'IN_CONSULTATION' ? `${visit.doctorName ?? 'Another doctor'} has this patient. Only they or a manager can change the notes.` : 'The notes are written once the patient is taken in to the doctor.'}</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Textarea label="History (what the patient says)" rows={3} value={f.subjective} onChange={set('subjective')} disabled={!editable} />
        <Textarea label="Examination (what you find)" rows={3} value={f.objective} onChange={set('objective')} disabled={!editable} />
        <Textarea label="Assessment" rows={2} value={f.assessment} onChange={set('assessment')} disabled={!editable} />
        <Textarea label="Plan" rows={2} value={f.plan} onChange={set('plan')} disabled={!editable} />
      </div>

      <div>
        <p className="mb-1 text-[13px] font-semibold text-gray-700 dark:text-gray-200">Diagnoses</p>
        {diagnoses.length === 0 && <p className="mb-2 text-xs text-gray-500">None yet. At least one is needed to finish the consultation.</p>}
        <ul className="mb-2 space-y-1.5">
          {diagnoses.map((d) => (
            <li key={d.code ?? d.label} className="flex flex-wrap items-center gap-2 rounded-lg bg-teal-50 px-3 py-1.5 text-sm text-teal-900 dark:bg-teal-500/10 dark:text-teal-100">
              <span className="min-w-0 flex-1">{d.code ? <span className="mr-1 font-mono text-xs">{d.code}</span> : null}{d.label}</span>
              {editable ? (
                <input aria-label={`ICD-11 code for ${d.label}`} placeholder="ICD-11 (SHA)" value={d.icd11 ?? ''} maxLength={10}
                  onChange={(e) => setDiagnoses((l) => l.map((x) => (x === d ? { ...x, icd11: e.target.value.toUpperCase() || undefined } : x)))}
                  className="h-8 w-28 rounded-md border bg-white px-2 font-mono text-xs dark:border-gray-600 dark:bg-gray-800" />
              ) : d.icd11 ? <span className="font-mono text-xs">{d.icd11}</span> : null}
              {editable && <button type="button" aria-label={`Remove ${d.label}`} onClick={() => setDiagnoses((l) => l.filter((x) => x !== d))}><X className="h-3.5 w-3.5" /></button>}
            </li>
          ))}
        </ul>
        {editable && (
          <div className="relative">
            <Input label="Add a diagnosis" hideLabel placeholder="Search by name or ICD-10 code, or type your own and press Enter" value={q} onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); if (q.trim()) add({ label: q.trim() }); } }} />
            {q.trim().length >= 2 && found.length > 0 && (
              <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800">
                {found.map((d) => <li key={d.code}><button type="button" onClick={() => add(d)} className="flex w-full justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-teal-50 dark:hover:bg-teal-900/30"><span>{d.label}</span><span className="font-mono text-xs text-gray-500">{d.code}</span></button></li>)}
              </ul>
            )}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Sick leave (days)" inputMode="numeric" value={f.sickLeaveDays} onChange={set('sickLeaveDays')} disabled={!editable} />
        <Input label="Follow-up on" type="date" value={f.followUpDate} onChange={set('followUpDate')} disabled={!editable} />
        <Input label="Refer to" value={f.referralTo} onChange={set('referralTo')} disabled={!editable} placeholder="A hospital or specialist" />
        <Input label="Note for the referral" value={f.referralNote} onChange={set('referralNote')} disabled={!editable} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2">
          {sick && <Button variant="secondary" size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => printHtml(sick)}>Sick note</Button>}
          {referral && <Button variant="secondary" size="sm" icon={<Printer className="w-4 h-4" />} onClick={() => printHtml(referral)}>Referral letter</Button>}
        </div>
        {editable && (
          <Button loading={busy} onClick={() => onSave({ ...f, diagnoses })}>Save notes</Button>
        )}
      </div>
    </div>
  );
}

// ── Prescriptions ────────────────────────────────────────────────────────────────────────────────────────────────────

function PrescriptionsTab({ visit, closed }: { visit: VisitDetail; closed: boolean }) {
  const medicines = (items: string) => { try { return (JSON.parse(items) as Array<{ name: string }>).map((i) => i.name).join(', '); } catch { return ''; } };
  return (
    <div className="space-y-3">
      {visit.prescriptions.length === 0 ? <p className="text-sm text-gray-500">No prescription has been written in this visit.</p> : (
        <ul className="divide-y rounded-lg border dark:divide-gray-700 dark:border-gray-700">
          {visit.prescriptions.map((rx) => (
            <li key={rx.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
              <div className="min-w-0"><p className="font-mono text-xs text-teal-600">{rx.prescriptionNumber}</p><p className="truncate">{medicines(rx.items)}</p></div>
              <Badge tone={rx.status === 'DISPENSED' ? 'success' : 'warning'}>{rx.status.toLowerCase()}</Badge>
            </li>
          ))}
        </ul>
      )}
      {!closed && (
        <a href={`/prescriptions?visit=${visit.id}&patient=${visit.patientId}`} className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold text-teal-700 hover:bg-teal-50 dark:border-gray-600 dark:text-teal-300">
          <Pill className="h-4 w-4" aria-hidden /> Write a prescription for this visit
        </a>
      )}
      <p className="text-xs text-gray-500">Medicines are paid for when the pharmacy dispenses them, not on the visit bill.</p>
    </div>
  );
}

// ── Billing ──────────────────────────────────────────────────────────────────────────────────────────────────────────

const METHODS = [['CASH', 'Cash'], ['MPESA', 'M-Pesa'], ['CARD', 'Card'], ['BANK', 'Bank']] as const;

function BillingTab({ visit, closed, canTakeMoney, onChanged }: { visit: VisitDetail; closed: boolean; canTakeMoney: boolean; onChanged: (v?: VisitDetail) => void }) {
  const user = useAuthStore((s) => s.user);
  const [itemId, setItemId] = useState('');
  const [paying, setPaying] = useState(false);
  const { data: services = [] } = useQuery<Array<{ id: string; name: string; type: string; retailPriceCents: number }>>({
    queryKey: ['visit-services', user?.businessId],
    queryFn: () => api.get(`/items?businessId=${user?.businessId}&storeId=${user?.storeId}&activeOnly=true`),
    enabled: !!user?.businessId && !closed,
    staleTime: 60_000,
    select: (all) => all.filter((i) => i.type === 'SERVICE' && i.retailPriceCents > 0),
  });
  const add = useMutation({
    mutationFn: () => api.post<VisitDetail>(`/visits/${visit.id}/charges`, { itemId }),
    onSuccess: (v) => { setItemId(''); onChanged(v); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({
    mutationFn: (chargeId: string) => api.patch<VisitDetail>(`/visits/${visit.id}/charges/${chargeId}/remove`, {}),
    onSuccess: (v) => onChanged(v),
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-3">
      {visit.charges.length === 0 ? <p className="text-sm text-gray-500">Nothing charged yet.</p> : (
        <ul className="divide-y rounded-lg border dark:divide-gray-700 dark:border-gray-700">
          {visit.charges.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span>{c.name}{c.quantity !== 1 ? ` x ${c.quantity}` : ''}</span>
              <span className="flex items-center gap-3 tabular-nums">{formatKES(c.totalCents)}
                {!closed && <button type="button" aria-label={`Remove ${c.name}`} className="text-gray-400 hover:text-red-600" onClick={() => remove.mutate(c.id)}><Trash2 className="h-4 w-4" /></button>}
              </span>
            </li>
          ))}
          <li className="flex justify-between px-3 py-2 text-sm font-bold"><span>Total</span><span className="tabular-nums">{formatKES(visit.totalCents)}</span></li>
        </ul>
      )}
      {!closed && (
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Select label="Add a service" value={itemId} onChange={(e) => setItemId(e.target.value)} hint={services.length === 0 ? 'Add services (consultation, lab tests) in Items & Stock with type Service' : undefined}>
              <option value="">Choose a service…</option>
              {services.map((s) => <option key={s.id} value={s.id}>{s.name} ({formatKES(s.retailPriceCents)})</option>)}
            </Select>
          </div>
          <Button onClick={() => add.mutate()} loading={add.isPending} disabled={!itemId}>Add</Button>
        </div>
      )}
      {visit.status === 'READY_TO_BILL' && canTakeMoney && (
        <div className="flex justify-end"><Button icon={<FileText className="w-4 h-4" />} onClick={() => setPaying(true)}>{visit.invoicing && visit.totalCents > 0 ? 'Take payment and complete' : 'Complete visit'}</Button></div>
      )}
      {visit.status === 'COMPLETED' && <p className="text-sm text-green-700">Completed{visit.saleId ? '. The charges were invoiced.' : '.'}</p>}
      {paying && <PayModal visit={visit} onClose={() => setPaying(false)} onDone={(v) => { setPaying(false); onChanged(v); }} />}
    </div>
  );
}

function PayModal({ visit, onClose, onDone }: { visit: VisitDetail; onClose: () => void; onDone: (v: VisitDetail) => void }) {
  const [method, setMethod] = useState<string>('CASH');
  const [tendered, setTendered] = useState('');
  const [ref, setRef] = useState('');
  const [pin, setPin] = useState('');
  const { data: insurers = [] } = useInsurers();
  const [insured, setInsured] = useState(false);
  const [providerId, setProviderId] = useState(visit.patient?.insuranceProviderId ?? '');
  const [member, setMember] = useState(visit.patient?.insuranceMemberNumber ?? '');
  const [sharePct, setSharePct] = useState('0');
  const [checking, setChecking] = useState(false);
  const insurer = insurers.find((i) => i.id === providerId);
  const invoicing = visit.invoicing && visit.totalCents > 0;
  // With an insurer paying part, the bill is at that insurer's prices where it has them.
  const { data: quote } = useQuery<{ listTotalCents: number; billTotalCents: number; adjusted: boolean; providerName: string }>({
    queryKey: ['cover', 'quote', visit.id, providerId],
    queryFn: () => api.get(`/cover/quote?visitId=${visit.id}&providerId=${providerId}`),
    enabled: insured && !!providerId,
  });
  const billTotal = insured && quote ? quote.billTotalCents : visit.totalCents;
  const pct = Math.min(99, Math.max(0, Math.floor(Number(sharePct) || 0)));
  const patientShare = insured ? Math.round((billTotal * pct) / 100) : visit.totalCents;
  const insurerShare = billTotal - patientShare;
  const collects = invoicing && patientShare > 0;
  const paying = Math.round((parseFloat(tendered) || 0) * 100) || patientShare;
  const pinBad = pin.trim() !== '' && !isValidKraPin(pin);
  const memberReady = member.trim().length > 0;
  const { data: found, refetch } = useQuery<{ standing: CoverStanding }>({
    queryKey: ['cover', 'standing', visit.id, providerId, member.trim()],
    queryFn: () => api.get(`/cover/standing?visitId=${visit.id}&providerId=${providerId}&memberNumber=${encodeURIComponent(member.trim())}`),
    enabled: insured && !!providerId && memberReady,
  });
  const standing: CoverStanding = found?.standing ?? 'NOT_CHECKED';
  const blocked = insured && (!providerId || !memberReady || (!!insurer?.requiresEligibility && standing !== 'ELIGIBLE'));
  const done = useMutation({
    mutationFn: () => api.post<{ visit: VisitDetail; receiptNumber?: string; claimId?: string | null }>(`/visits/${visit.id}/complete`, {
      ...(collects ? { payments: [{ method, amountCents: paying, ...(ref.trim() ? { reference: ref.trim() } : {}) }] } : {}),
      ...(invoicing ? { buyerKraPin: pin.trim() || undefined } : {}),
      ...(insured ? { insurance: { providerId, memberNumber: member.trim(), patientPct: pct } } : {}),
    }),
    onSuccess: (r) => {
      toast.success(`${r.receiptNumber ? `Visit completed. Receipt ${r.receiptNumber}` : 'Visit completed'}${r.claimId ? '. Claim raised' : ''}`);
      onDone(r.visit);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal title="Complete the visit" subtitle={invoicing ? `Total ${formatKES(visit.totalCents)}` : visit.totalCents > 0 ? 'Real sales are off, so no payment is taken here' : 'Nothing was charged'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); done.mutate(); }}>
        {visit.totalCents > 0 && (
          <div className="space-y-3 rounded-lg border px-3 py-3">
            <label className="flex items-center gap-2 text-sm font-semibold">
              <input type="checkbox" checked={insured} onChange={(e) => setInsured(e.target.checked)} />
              <ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden /> An insurer pays part of this bill
            </label>
            {insured && (
              <>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Select label="Insurer" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
                    <option value="">Choose an insurer…</option>
                    {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
                  </Select>
                  <Input label="Member number" value={member} onChange={(e) => setMember(e.target.value)} />
                  <Input label="Patient pays (%)" inputMode="numeric" value={sharePct} onChange={(e) => setSharePct(e.target.value)} hint="0 when the insurer pays everything" />
                </div>
                <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span className="flex items-center gap-2"><CoverBadge standing={standing} />
                    {insurer && !insurer.requiresEligibility && <span className="text-xs text-gray-500">This insurer does not need a check</span>}
                  </span>
                  <Button variant="secondary" size="sm" disabled={!providerId || !memberReady} onClick={() => setChecking(true)}>Record cover check</Button>
                </div>
                {blocked && providerId && memberReady && <p className="text-xs text-amber-700">Cover has to be confirmed before the insurer can be billed. Look the member up with the insurer, then record the result.</p>}
                {quote?.adjusted && <p className="text-xs text-blue-800">At {quote.providerName}'s prices the bill is {formatKES(quote.billTotalCents)} (list price {formatKES(quote.listTotalCents)}).</p>}
                <div className="flex justify-between text-sm"><span>Patient pays</span><span className="font-semibold tabular-nums">{formatKES(patientShare)}</span></div>
                <div className="flex justify-between text-sm text-blue-700"><span>Billed to the insurer</span><span className="font-semibold tabular-nums">{formatKES(insurerShare)}</span></div>
              </>
            )}
          </div>
        )}
        {collects && (
          <>
            <div className="flex flex-wrap gap-2">
              {METHODS.map(([m, label]) => (
                <button key={m} type="button" aria-pressed={method === m} onClick={() => setMethod(m)}
                  className={`h-10 rounded-lg border px-4 text-sm font-semibold ${method === m ? 'border-brand-600 bg-brand-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}>{label}</button>
              ))}
            </div>
            <Input label="Amount received" inputMode="decimal" value={tendered} onChange={(e) => setTendered(e.target.value)} placeholder={(patientShare / 100).toFixed(2)} />
            {(method === 'MPESA' || method === 'CARD') && <Input label={method === 'MPESA' ? 'M-Pesa code' : 'Card slip number'} value={ref} onChange={(e) => setRef(e.target.value)} />}
          </>
        )}
        {invoicing && <Input label="Buyer's KRA PIN (optional)" value={pin} onChange={(e) => setPin(e.target.value.toUpperCase())} placeholder="A012345678Z" error={pinBad ? 'A KRA PIN looks like A012345678Z or P051234567Z' : undefined} />}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={done.isPending} disabled={pinBad || blocked || (collects && paying < patientShare)}>{collects ? 'Take payment' : insured ? 'Bill the insurer and complete' : 'Complete'}</Button>
        </div>
      </form>
      {checking && <CoverCheckModal patientId={visit.patientId} visitId={visit.id} providerId={providerId} memberNumber={member} onClose={() => setChecking(false)} onDone={() => { setChecking(false); void refetch(); }} />}
    </Modal>
  );
}

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, FlaskConical, Pencil, Plus, Printer, Trash2 } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { labReportHtml, specimenLabelHtml } from '../lib/labPrint';
import { FLAG_LABEL, flagClass, needsAck, noSpecimen, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, orderHasCritical, rangeText, type LabItem, type LabOrder, type LabParameter, type LabTest } from '../lib/lab';
import { printHtml } from '../lib/printHtml';
import { Badge, Button, EmptyState, Input, PageHeader, Select, Tabs, type TabItem } from '../components/ui';
import { ResultTable } from '../components/clinical/LabResults';
import { Modal } from './fuel/Modal';
import { useDialog } from '../components/Dialog';

type Tab = 'worklist' | 'tests';
const isManager = (role?: string) => ['OWNER', 'ADMIN', 'MANAGER'].includes(String(role));

/** The lab's day: specimens to collect, results to enter, results to release, and (for a manager) the list of tests. */
export default function LabPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('worklist');
  const tabs: Array<TabItem<Tab>> = [{ id: 'worklist', label: 'Worklist' }, ...(isManager(user?.role) ? [{ id: 'tests' as Tab, label: 'Test list' }] : [])];
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader title="Laboratory" subtitle="Specimens, results and releasing them to the doctor" />
      <Tabs tabs={tabs} value={tab} onChange={setTab} />
      {tab === 'worklist' ? <Worklist /> : <TestList />}
    </div>
  );
}

// ── the worklist ─────────────────────────────────────────────────────────────────────────────────────────────────────

function Worklist() {
  const user = useAuthStore((s) => s.user);
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading } = useQuery<{ open: LabOrder[]; done: LabOrder[] }>({ queryKey: ['lab', 'board'], queryFn: () => api.get(`/lab/board${user?.storeId ? `?storeId=${user.storeId}` : ''}`), refetchInterval: 20_000 });
  const columns: Array<{ status: LabOrder['status']; orders: LabOrder[] }> = (['ORDERED', 'COLLECTED', 'RESULTED'] as const).map((status) => ({ status, orders: (data?.open ?? []).filter((o) => o.status === status) }));
  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  const overdue = data?.open.filter((o) => o.overdue).length ?? 0;
  if (!data || (data.open.length === 0 && data.done.length === 0)) return <EmptyState icon={<FlaskConical className="h-8 w-8" />} title="Nothing in the lab" description="Tests ordered by a doctor appear here." />;
  return (
    <div className="space-y-5">
      {overdue > 0 && <p role="status" className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-900">{overdue} {overdue === 1 ? 'order is' : 'orders are'} taking longer than the time set for the test. They are at the top of their columns.</p>}
      <div className="grid gap-4 lg:grid-cols-3">
        {columns.map((c) => (
          <section key={c.status} aria-label={ORDER_STATUS_LABEL[c.status]} className="rounded-xl border bg-gray-50 p-3 dark:border-gray-700 dark:bg-gray-900/30">
            <h2 className="mb-2 flex items-center justify-between text-sm font-bold">{ORDER_STATUS_LABEL[c.status]}<span className="text-gray-500">{c.orders.length}</span></h2>
            <ul className="space-y-2">
              {c.orders.map((o) => <li key={o.id}><OrderCard order={o} onOpen={() => setOpenId(o.id)} /></li>)}
              {c.orders.length === 0 && <li className="text-xs text-gray-500">None</li>}
            </ul>
          </section>
        ))}
      </div>
      {data.done.length > 0 && (
        <section>
          <h2 className="mb-2 text-sm font-bold">Released in the last day</h2>
          <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{data.done.map((o) => <li key={o.id}><OrderCard order={o} onOpen={() => setOpenId(o.id)} /></li>)}</ul>
        </section>
      )}
      {openId && <LabOrderModal id={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function OrderCard({ order, onOpen }: { order: LabOrder; onOpen: () => void }) {
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-lg border bg-white p-3 text-left shadow-sm hover:border-brand-400 dark:border-gray-700 dark:bg-gray-800">
      <span className="flex items-center justify-between gap-2">
        <span className="font-semibold">{order.patient?.name ?? 'Patient'}</span>
        <span className="flex gap-1">
          {order.priority === 'URGENT' && <Badge tone="danger">Urgent</Badge>}
          {order.overdue && <Badge tone="warning">Overdue</Badge>}
          {orderHasCritical(order) && <Badge tone="danger">{order.items.some(needsAck) ? 'Critical, not seen' : 'Critical'}</Badge>}
        </span>
      </span>
      <span className="block font-mono text-xs text-teal-700">{order.orderNumber}</span>
      <span className="mt-1 block text-xs text-gray-600">{order.items.map((i) => i.testName).join(', ')}</span>
      {order.clinicalNotes && <span className="mt-1 block text-xs italic text-gray-500">{order.clinicalNotes}</span>}
    </button>
  );
}

function LabOrderModal({ id, onClose }: { id: string; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const { prompt } = useDialog();
  const { data: o } = useQuery<LabOrder>({ queryKey: ['lab', 'order', id], queryFn: () => api.get(`/lab/orders/${id}`) });
  const { data: settings } = useQuery<{ name?: string }>({ queryKey: ['biz-settings', user?.businessId], queryFn: () => api.get(`/business/${user?.businessId}/settings`), enabled: !!user?.businessId, staleTime: 300_000 });
  const done = (order: LabOrder) => { qc.setQueryData(['lab', 'order', id], order); void qc.invalidateQueries({ queryKey: ['lab'] }); };
  const collect = useMutation({ mutationFn: () => api.post<LabOrder>(`/lab/orders/${id}/collect`, {}), onSuccess: done, onError: (e: Error) => toast.error(e.message) });
  const cancel = useMutation({ mutationFn: (reason: string) => api.post<LabOrder>(`/lab/orders/${id}/cancel`, { reason }), onSuccess: done, onError: (e: Error) => toast.error(e.message) });
  if (!o) return <Modal title="Lab order" onClose={onClose}><p className="text-sm text-gray-500">Loading…</p></Modal>;
  const report = labReportHtml(settings?.name ?? 'Laboratory', o);
  const label = specimenLabelHtml(o);
  const canCancel = o.status === 'ORDERED' && ['OWNER', 'ADMIN', 'MANAGER', 'DOCTOR'].includes(String(user?.role));
  return (
    <Modal wide title={`${o.patient?.name ?? 'Patient'} · ${o.orderNumber}`} subtitle={`${[o.patient?.ageYears != null && `${o.patient.ageYears} yrs`, o.patient?.sex === 'F' ? 'Female' : o.patient?.sex === 'M' ? 'Male' : null].filter(Boolean).join(', ')} · ordered by ${o.orderedByName}${o.visitNumber ? ` · visit ${o.visitNumber}` : ''}`} onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-2"><Badge tone={ORDER_STATUS_TONE[o.status]}>{ORDER_STATUS_LABEL[o.status]}</Badge>{o.priority === 'URGENT' && <Badge tone="danger">Urgent</Badge>}</span>
          <span className="flex gap-2">
            {label && o.status !== 'ORDERED' && <Button variant="secondary" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => printHtml(label)}>Print label</Button>}
            {report && <Button variant="secondary" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => printHtml(report)}>Print report</Button>}
            {canCancel && <Button variant="secondary" size="sm" onClick={async () => { const r = await prompt({ title: 'Cancel this order', message: 'The charges come off the visit. Say why.', placeholder: 'Reason', confirmLabel: 'Cancel order' }); if (r?.trim()) cancel.mutate(r.trim()); }}>Cancel order</Button>}
          </span>
        </div>
        {o.clinicalNotes && <p className="rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-900">Doctor's note: {o.clinicalNotes}</p>}
        {o.status === 'ORDERED' && (
          <div className="rounded-lg border px-3 py-3 text-sm">
            <p className="mb-2">{noSpecimen(o) ? 'No specimen is taken for this examination. Press when the patient is here and the examination can start. The images themselves are not kept in KASTRA: type the report.' : `Take the specimen (${[...new Set(o.items.map((i) => i.specimen.toLowerCase()).filter((s) => s !== 'none'))].join(', ')}), then press collected.`}</p>
            <Button loading={collect.isPending} icon={<Check className="h-4 w-4" />} onClick={() => collect.mutate()}>{noSpecimen(o) ? 'Patient attended' : 'Specimen collected'}</Button>
          </div>
        )}
        {o.status === 'CANCELLED' && <p className="text-sm text-gray-600">Cancelled: {o.cancelReason}</p>}
        {o.status !== 'ORDERED' && o.status !== 'CANCELLED' && o.items.map((i) => <ItemPanel key={i.id} order={o} item={i} onChanged={done} />)}
      </div>
    </Modal>
  );
}

function ItemPanel({ order, item, onChanged }: { order: LabOrder; item: LabItem; onChanged: (o: LabOrder) => void }) {
  const user = useAuthStore((s) => s.user);
  const { prompt } = useDialog();
  const sex = order.patient?.sex;
  const canEnter = ['OWNER', 'ADMIN', 'MANAGER', 'LAB_TECH'].includes(String(user?.role));
  const manager = isManager(user?.role);
  const canRelease = ['OWNER', 'ADMIN', 'MANAGER', 'LAB_TECH', 'DOCTOR'].includes(String(user?.role)) && (manager || (!!item.resultedById && item.resultedById !== user?.id));
  const [values, setValues] = useState<Record<string, string>>(() => Object.fromEntries(item.results.map((r) => [r.name, r.value])));
  const [comment, setComment] = useState(item.comment ?? '');
  const base = `/lab/orders/${order.id}/items/${item.id}`;
  const save = useMutation({ mutationFn: () => api.patch<LabOrder>(`${base}/results`, { values, comment: comment.trim() || undefined }), onSuccess: (o) => { onChanged(o); toast.success('Results saved'); }, onError: (e: Error) => toast.error(e.message) });
  const release = useMutation({ mutationFn: () => api.post<LabOrder>(`${base}/verify`, {}), onSuccess: (o) => { onChanged(o); toast.success('Released'); }, onError: (e: Error) => toast.error(e.message) });
  const reopen = useMutation({ mutationFn: (reason: string) => api.post<LabOrder>(`${base}/reopen`, { reason }), onSuccess: onChanged, onError: (e: Error) => toast.error(e.message) });
  const editing = item.status !== 'VERIFIED' && canEnter;

  return (
    <section className="rounded-lg border p-3 dark:border-gray-700" aria-label={item.testName}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="font-semibold">{item.testName}</h3>
        <Badge tone={item.status === 'VERIFIED' ? 'success' : item.status === 'RESULTED' ? 'warning' : 'neutral'}>{item.status === 'VERIFIED' ? 'Released' : item.status === 'RESULTED' ? 'Entered, to release' : 'Pending'}</Badge>
      </div>
      {item.amendedNote && <p className="mb-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-900">Sent back for correction: {item.amendedNote}</p>}
      {item.hasCritical && item.status !== 'PENDING' && <p className="mb-2 rounded bg-red-50 px-2 py-1 text-xs font-semibold text-red-800">{item.criticalAckAt ? `Critical result, seen by ${item.criticalAckBy}.` : 'Critical result: the clinicians have been notified. Tell the doctor now if they have not answered.'}</p>}
      {editing ? (
        <div className="space-y-3">
          <div className="space-y-2">
            {item.parameters.map((p, n) => <ValueField key={p.name} fieldId={`v-${item.id}-${n}`} param={p} sex={sex} age={order.patient?.ageYears} value={values[p.name] ?? ''} flag={item.results.find((r) => r.name === p.name)?.flag ?? null} onChange={(v) => setValues((s) => ({ ...s, [p.name]: v }))} />)}
          </div>
          <Input label="Comment (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button loading={save.isPending} disabled={Object.values(values).every((v) => v.trim() === '')} onClick={() => save.mutate()}>Save results</Button>
            {item.status === 'RESULTED' && canRelease && <Button variant="success" loading={release.isPending} onClick={() => release.mutate()}>Check and release</Button>}
          </div>
          {item.status === 'RESULTED' && !canRelease && <p className="text-xs text-gray-600">Entered by {item.resultedBy}. Someone else checks and releases it.</p>}
        </div>
      ) : (
        <>
          {item.results.length > 0 ? <ResultTable item={item} /> : <p className="text-sm text-gray-500">No results yet.</p>}
          {item.comment && <p className="mt-1 text-xs text-gray-600">Comment: {item.comment}</p>}
          <p className="mt-1 text-xs text-gray-500">{item.resultedBy ? `Entered by ${item.resultedBy}` : ''}{item.verifiedBy ? `, released by ${item.verifiedBy}` : ''}</p>
          {item.status === 'RESULTED' && canRelease && <div className="mt-2 flex justify-end"><Button variant="success" loading={release.isPending} onClick={() => release.mutate()}>Check and release</Button></div>}
          {item.status === 'VERIFIED' && manager && <div className="mt-2 flex justify-end"><Button variant="secondary" size="sm" onClick={async () => { const r = await prompt({ title: 'Send back for correction', message: 'The result is withdrawn from the doctor until it is entered and released again. Say why.', placeholder: 'Reason', confirmLabel: 'Send back' }); if (r?.trim()) reopen.mutate(r.trim()); }}>Send back for correction</Button></div>}
        </>
      )}
    </section>
  );
}

function ValueField({ fieldId, param, sex, age, value, flag, onChange }: { fieldId: string; param: LabParameter; sex: string | null | undefined; age?: number | null; value: string; flag: LabItem['results'][number]['flag']; onChange: (v: string) => void }) {
  const range = rangeText(param, sex, age);
  return (
    <div className="grid items-center gap-2 sm:grid-cols-[1fr_200px_160px]">
      <label htmlFor={fieldId} className="text-sm font-medium">{param.name}{param.unit ? <span className="ml-1 text-xs text-gray-500">({param.unit})</span> : null}</label>
      {param.kind === 'CHOICE' ? (
        <Select label={param.name} hideLabel id={fieldId} value={value} onChange={(e) => onChange(e.target.value)}>
          <option value="">Not done</option>
          {param.choices?.map((c) => <option key={c} value={c}>{c}</option>)}
        </Select>
      ) : (
        <Input label={param.name} hideLabel id={fieldId} inputMode={param.kind === 'NUMERIC' ? 'decimal' : undefined} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      <span className={`text-xs ${flagClass(flag)}`}>{range ? `Normal ${range}` : ''}{flag && flag !== 'NORMAL' ? `  ${FLAG_LABEL[flag]}` : ''}</span>
    </div>
  );
}

// ── the test list ────────────────────────────────────────────────────────────────────────────────────────────────────

function TestList() {
  const qc = useQueryClient();
  const { data: tests = [] } = useQuery<LabTest[]>({ queryKey: ['lab', 'tests', 'all'], queryFn: () => api.get('/lab/tests?all=1') });
  const [editing, setEditing] = useState<LabTest | 'new' | null>(null);
  const starter = useMutation({
    mutationFn: () => api.post<{ added: number }>('/lab/tests/starter', {}),
    onSuccess: (r) => { void qc.invalidateQueries({ queryKey: ['lab'] }); toast.success(r.added ? `${r.added} tests added` : 'Every common test is already in the list'); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="max-w-xl text-sm text-gray-600">The normal ranges here are what results are judged against. The common tests use general adult ranges: have your lab lead check them against your own methods.</p>
        <span className="flex gap-2">
          <Button variant="secondary" loading={starter.isPending} onClick={() => starter.mutate()}>Load common tests</Button>
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>New test</Button>
        </span>
      </div>
      {tests.length === 0 ? <EmptyState icon={<FlaskConical className="h-8 w-8" />} title="No tests yet" description="Load the common tests, or add your own." /> : (
        <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/40"><tr><th className="px-4 py-2">Test</th><th className="px-4 py-2">Measures</th><th className="px-4 py-2">Charged as</th><th className="px-4 py-2" /></tr></thead>
            <tbody>
              {tests.map((t) => (
                <tr key={t.id} className={`border-t dark:border-gray-700 ${t.isActive ? '' : 'opacity-50'}`}>
                  <td className="px-4 py-2 font-medium">{t.name}<div className="text-xs text-gray-500">{t.category.toLowerCase()} · {t.specimen.toLowerCase()}{t.code ? ` · ${t.code}` : ''}</div></td>
                  <td className="px-4 py-2 text-xs text-gray-600">{t.parameters.map((p) => p.name).join(', ')}</td>
                  <td className="px-4 py-2 text-xs">{t.itemName ?? <span className="text-amber-700">not charged</span>}</td>
                  <td className="px-4 py-2 text-right"><Button variant="secondary" size="sm" icon={<Pencil className="h-3.5 w-3.5" />} onClick={() => setEditing(t)}>Edit</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {editing && <TestForm test={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

const CATEGORIES = ['HAEMATOLOGY', 'CHEMISTRY', 'MICROBIOLOGY', 'PARASITOLOGY', 'SEROLOGY', 'URINALYSIS', 'IMAGING', 'OTHER'];
const SPECIMENS = ['BLOOD', 'URINE', 'STOOL', 'SWAB', 'SPUTUM', 'OTHER', 'NONE'];
interface Row { name: string; kind: LabParameter['kind']; unit: string; low: string; high: string; lowF: string; highF: string; lowC: string; highC: string; critLow: string; critHigh: string; choices: string; abnormal: string }
const blankRow = (): Row => ({ name: '', kind: 'NUMERIC', unit: '', low: '', high: '', lowF: '', highF: '', lowC: '', highC: '', critLow: '', critHigh: '', choices: '', abnormal: '' });
const toRow = (p: LabParameter): Row => ({ name: p.name, kind: p.kind, unit: p.unit ?? '', low: p.low?.toString() ?? '', high: p.high?.toString() ?? '', lowF: p.lowF?.toString() ?? '', highF: p.highF?.toString() ?? '', lowC: p.lowC?.toString() ?? '', highC: p.highC?.toString() ?? '', critLow: p.critLow?.toString() ?? '', critHigh: p.critHigh?.toString() ?? '', choices: p.choices?.join(', ') ?? '', abnormal: p.abnormal?.join(', ') ?? '' });
const list = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
const fromRow = (r: Row) => ({
  name: r.name.trim(), kind: r.kind, unit: r.unit.trim() || undefined,
  ...(r.kind === 'NUMERIC' ? { low: r.low, high: r.high, lowF: r.lowF, highF: r.highF, lowC: r.lowC, highC: r.highC, critLow: r.critLow, critHigh: r.critHigh } : {}),
  ...(r.kind === 'CHOICE' ? { choices: list(r.choices), abnormal: list(r.abnormal) } : {}),
});

function TestForm({ test, onClose }: { test: LabTest | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(test?.name ?? '');
  const [code, setCode] = useState(test?.code ?? '');
  const [category, setCategory] = useState(test?.category ?? 'OTHER');
  const [specimen, setSpecimen] = useState(test?.specimen ?? 'BLOOD');
  const [itemId, setItemId] = useState(test?.itemId ?? '');
  const [active, setActive] = useState(test?.isActive ?? true);
  const [rows, setRows] = useState<Row[]>(test ? test.parameters.map(toRow) : [blankRow()]);
  const user = useAuthStore((s) => s.user);
  const { data: services = [] } = useQuery<Array<{ id: string; name: string; type: string; retailPriceCents: number }>>({
    queryKey: ['visit-services', user?.businessId],
    queryFn: () => api.get(`/items?businessId=${user?.businessId}&storeId=${user?.storeId}&activeOnly=true`),
    select: (all) => all.filter((i) => i.type === 'SERVICE'),
    enabled: !!user?.businessId,
    staleTime: 60_000,
  });
  const set = (i: number, patch: Partial<Row>) => setRows((l) => l.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const save = useMutation({
    mutationFn: () => {
      const body = { name: name.trim(), code: code.trim() || null, category, specimen, itemId: itemId || null, isActive: active, parameters: rows.map(fromRow) };
      return test ? api.patch(`/lab/tests/${test.id}`, body) : api.post('/lab/tests', body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['lab'] }); toast.success('Test saved'); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal wide title={test ? `Edit ${test.name}` : 'New test'} subtitle="Orders already placed keep the ranges they were placed with" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Test name" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Short code (optional)" value={code} onChange={(e) => setCode(e.target.value)} />
          <Select label="Category" value={category} onChange={(e) => setCategory(e.target.value)}>{CATEGORIES.map((c) => <option key={c} value={c}>{c.toLowerCase()}</option>)}</Select>
          <Select label="Specimen" value={specimen} onChange={(e) => setSpecimen(e.target.value)}>{SPECIMENS.map((c) => <option key={c} value={c}>{c.toLowerCase()}</option>)}</Select>
          <Select label="Charged as (price list service)" value={itemId} onChange={(e) => setItemId(e.target.value)} hint="Pick the service the visit is charged for this test. None means not charged.">
            <option value="">Not charged</option>
            {services.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </Select>
          {test && <label className="flex items-center gap-2 self-end text-sm"><input type="checkbox" checked={active} onChange={(e) => setActive(e.target.checked)} /> Offered (untick to hide it from ordering)</label>}
        </div>
        <div className="space-y-2">
          <p className="text-[13px] font-semibold">What it measures</p>
          {rows.map((r, i) => (
            <div key={i} className="space-y-2 rounded-lg border p-3">
              <div className="grid gap-2 sm:grid-cols-[1fr_140px_100px_auto]">
                <Input label="Name" value={r.name} onChange={(e) => set(i, { name: e.target.value })} />
                <Select label="Result is" value={r.kind} onChange={(e) => set(i, { kind: e.target.value as Row['kind'] })}><option value="NUMERIC">a number</option><option value="CHOICE">one of a list</option><option value="TEXT">free text</option></Select>
                {r.kind === 'NUMERIC' ? <Input label="Unit" value={r.unit} onChange={(e) => set(i, { unit: e.target.value })} /> : <span />}
                <button type="button" aria-label={`Remove ${r.name || 'parameter'}`} disabled={rows.length === 1} className="self-end pb-2 text-gray-400 hover:text-red-600 disabled:opacity-30" onClick={() => setRows((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
              </div>
              {r.kind === 'NUMERIC' && (
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
                  <Input label="Normal low" inputMode="decimal" value={r.low} onChange={(e) => set(i, { low: e.target.value })} />
                  <Input label="Normal high" inputMode="decimal" value={r.high} onChange={(e) => set(i, { high: e.target.value })} />
                  <Input label="Female low" inputMode="decimal" value={r.lowF} onChange={(e) => set(i, { lowF: e.target.value })} />
                  <Input label="Female high" inputMode="decimal" value={r.highF} onChange={(e) => set(i, { highF: e.target.value })} />
                  <Input label="Child low (under 12)" inputMode="decimal" value={r.lowC} onChange={(e) => set(i, { lowC: e.target.value })} />
                  <Input label="Child high (under 12)" inputMode="decimal" value={r.highC} onChange={(e) => set(i, { highC: e.target.value })} />
                  <Input label="Critical below" inputMode="decimal" value={r.critLow} onChange={(e) => set(i, { critLow: e.target.value })} />
                  <Input label="Critical above" inputMode="decimal" value={r.critHigh} onChange={(e) => set(i, { critHigh: e.target.value })} />
                </div>
              )}
              {r.kind === 'CHOICE' && (
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input label="Choices (comma separated)" value={r.choices} onChange={(e) => set(i, { choices: e.target.value })} placeholder="Negative, Positive" />
                  <Input label="Abnormal choices" value={r.abnormal} onChange={(e) => set(i, { abnormal: e.target.value })} placeholder="Positive" />
                </div>
              )}
            </div>
          ))}
          <Button variant="secondary" size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setRows((l) => [...l, blankRow()])}>Add another thing to measure</Button>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending} disabled={!name.trim() || rows.some((r) => !r.name.trim())}>Save test</Button>
        </div>
      </form>
    </Modal>
  );
}


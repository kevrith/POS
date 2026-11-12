import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatKES } from '@pos/shared';
import { AlertTriangle, FlaskConical, Printer } from 'lucide-react';
import { api } from '../../lib/api';
import { FLAG_LABEL, flagClass, needsAck, ORDER_STATUS_LABEL, ORDER_STATUS_TONE, type LabItem, type LabOrder, type LabTest } from '../../lib/lab';
import { labReportHtml } from '../../lib/labPrint';
import { printHtml } from '../../lib/printHtml';
import { Badge, Button, Input, Textarea } from '../ui';
import { Modal } from '../../pages/fuel/Modal';

export function useLabTests() {
  return useQuery<LabTest[]>({ queryKey: ['lab', 'tests'], queryFn: () => api.get('/lab/tests'), staleTime: 60_000 });
}

/** The results of one test as a table: value, normal range, and a flag when it is outside it. */
export function ResultTable({ item }: { item: LabItem }) {
  return (
    <table className="w-full text-sm">
      <thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-1">Test</th><th>Result</th><th>Normal</th><th /></tr></thead>
      <tbody>
        {item.results.map((r) => (
          <tr key={r.name} className="border-t dark:border-gray-700">
            <td className="py-1.5">{r.name}</td>
            <td className={`tabular-nums ${flagClass(r.flag)}`}>{r.value} {r.unit}</td>
            <td className="text-xs text-gray-500">{r.low !== undefined || r.high !== undefined ? `${r.low ?? ''} - ${r.high ?? ''}` : ''}</td>
            <td className={`text-xs ${flagClass(r.flag)}`}>{r.flag && r.flag !== 'NORMAL' ? FLAG_LABEL[r.flag] : ''}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** The doctor's view of the lab inside a visit: what was ordered, where it is, and the results once released. */
export function LabTab({ visitId, closed, canOrder, business, onChanged }: { visitId: string; closed: boolean; canOrder: boolean; business: string; onChanged: () => void }) {
  const [ordering, setOrdering] = useState(false);
  const { data: orders = [], isLoading } = useQuery<LabOrder[]>({ queryKey: ['lab', 'visit', visitId], queryFn: () => api.get(`/lab/orders?visitId=${visitId}`), refetchInterval: 30_000 });
  const critical = orders.filter((o) => o.status !== 'CANCELLED' && o.items.some(needsAck));
  return (
    <div className="space-y-3">
      {critical.length > 0 && (
        <p role="alert" className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-semibold text-red-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> A critical result is in: {critical.flatMap((o) => o.items.filter(needsAck).map((i) => i.testName)).join(', ')}. See below.
        </p>
      )}
      {canOrder && !closed && <div className="flex justify-end"><Button icon={<FlaskConical className="h-4 w-4" />} onClick={() => setOrdering(true)}>Order tests</Button></div>}
      {isLoading ? <p className="text-sm text-gray-500">Loading…</p> : orders.length === 0 ? <p className="text-sm text-gray-500">No tests ordered for this visit.</p> : orders.map((o) => <OrderCard key={o.id} order={o} business={business} canAck={canOrder} />)}
      {ordering && <OrderTestsModal visitId={visitId} onClose={() => setOrdering(false)} onDone={() => { setOrdering(false); onChanged(); }} />}
    </div>
  );
}

function OrderCard({ order, business, canAck }: { order: LabOrder; business: string; canAck: boolean }) {
  const qc = useQueryClient();
  const ack = useMutation({
    mutationFn: (itemId: string) => api.post<LabOrder>(`/lab/orders/${order.id}/items/${itemId}/acknowledge`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['lab'] }); toast.success('Noted'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const report = labReportHtml(business, order);
  return (
    <div className="rounded-lg border p-3 dark:border-gray-700">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <p className="font-mono text-xs text-teal-700">{order.orderNumber}{order.priority === 'URGENT' ? ' · URGENT' : ''} · ordered by {order.orderedByName}</p>
        <span className="flex items-center gap-2">
          <Badge tone={ORDER_STATUS_TONE[order.status]}>{ORDER_STATUS_LABEL[order.status]}</Badge>
          {report && <Button variant="secondary" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => printHtml(report)}>Print</Button>}
        </span>
      </div>
      {order.status === 'CANCELLED' && <p className="text-sm text-gray-600">Cancelled: {order.cancelReason}</p>}
      <ul className="space-y-2">
        {order.items.map((i) => (
          <li key={i.id}>
            <p className="flex items-center justify-between text-sm font-semibold">{i.testName}
              {i.hasCritical && i.status !== 'PENDING' && (needsAck(i) && canAck
                ? <Button size="sm" variant="danger" loading={ack.isPending} onClick={() => ack.mutate(i.id)}>Critical: I have seen this</Button>
                : <Badge tone="danger">{i.criticalAckAt ? `Critical, seen by ${i.criticalAckBy}` : 'Critical'}</Badge>)}
            </p>
            {i.status === 'VERIFIED' ? (
              <>
                <ResultTable item={i} />
                {i.comment && <p className="mt-1 text-xs text-gray-600">Comment: {i.comment}</p>}
              </>
            ) : i.status === 'RESULTED' ? (
              <p className="text-xs text-amber-700">Result entered, waiting to be checked and released. It cannot be relied on yet.</p>
            ) : <p className="text-xs text-gray-500">{order.status === 'ORDERED' ? 'Waiting for the specimen to be taken.' : 'Specimen taken, result pending.'}</p>}
          </li>
        ))}
      </ul>
    </div>
  );
}

function OrderTestsModal({ visitId, onClose, onDone }: { visitId: string; onClose: () => void; onDone: () => void }) {
  const qc = useQueryClient();
  const { data: tests = [] } = useLabTests();
  const [picked, setPicked] = useState<string[]>([]);
  const [q, setQ] = useState('');
  const [urgent, setUrgent] = useState(false);
  const [notes, setNotes] = useState('');
  const shown = tests.filter((t) => `${t.name} ${t.code ?? ''} ${t.category}`.toLowerCase().includes(q.trim().toLowerCase()));
  const total = tests.filter((t) => picked.includes(t.id)).reduce((s, t) => s + (t.priceCents ?? 0), 0);
  const save = useMutation({
    mutationFn: () => api.post<LabOrder>('/lab/orders', { visitId, tests: picked, priority: urgent ? 'URGENT' : 'NORMAL', clinicalNotes: notes.trim() || undefined }),
    onSuccess: (o) => { void qc.invalidateQueries({ queryKey: ['lab'] }); toast.success(`Tests ordered (${o.orderNumber})`); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = (id: string) => setPicked((l) => (l.includes(id) ? l.filter((x) => x !== id) : [...l, id]));
  return (
    <Modal title="Order tests" subtitle="Each test with a price is added to the visit's bill" onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        {tests.length === 0 ? <p className="text-sm text-gray-600">No tests are set up yet. A manager can load the common tests in Lab, Test list.</p> : (
          <>
            <Input label="Find a test" hideLabel placeholder="Search by name or code" value={q} onChange={(e) => setQ(e.target.value)} />
            <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
              {shown.map((t) => (
                <li key={t.id}>
                  <label className="flex cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-gray-50">
                    <input type="checkbox" checked={picked.includes(t.id)} onChange={() => toggle(t.id)} />
                    <span className="flex-1">{t.name}<span className="ml-2 text-xs text-gray-500">{t.specimen === 'NONE' ? '' : t.specimen.toLowerCase()}</span></span>
                    <span className="text-xs tabular-nums text-gray-600">{t.priceCents ? formatKES(t.priceCents) : 'not charged'}</span>
                  </label>
                </li>
              ))}
              {shown.length === 0 && <li className="px-3 py-3 text-sm text-gray-500">No test matches.</li>}
            </ul>
          </>
        )}
        <Textarea label="Clinical notes for the lab (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} /> Urgent: do these first</label>
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm text-gray-600">{picked.length} chosen{total > 0 ? ` · ${formatKES(total)}` : ''}</span>
          <span className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>Cancel</Button>
            <Button type="submit" loading={save.isPending} disabled={picked.length === 0}>Order</Button>
          </span>
        </div>
      </form>
    </Modal>
  );
}


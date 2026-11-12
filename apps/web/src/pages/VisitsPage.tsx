import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, ClipboardList, Plus } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { VISIT_STATUS_LABEL, waitLabel, type Patient, type VisitRow, type VisitStatus } from '../lib/clinical';
import { Badge, Button, Card, EmptyState, ErrorState, Input, Select } from '../components/ui';
import { Modal } from './fuel/Modal';
import PatientPicker from '../components/clinical/PatientPicker';
import VisitWorkspace from '../components/clinical/VisitWorkspace';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

const COLUMNS: VisitStatus[] = ['WAITING', 'TRIAGED', 'IN_CONSULTATION', 'READY_TO_BILL'];

/** The clinic's day: who is waiting, who has had their vitals taken, who is with the doctor, who is ready to pay. */
export default function VisitsPage() {
  const user = useAuthStore((s) => s.user);
  const storeId = user?.storeId ?? '';
  const [openId, setOpenId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const { data, isLoading, error, refetch } = useQuery<{ open: VisitRow[]; closed: VisitRow[] }>({
    queryKey: ['visits', storeId],
    queryFn: () => api.get(`/visits?storeId=${storeId}`),
    enabled: !!storeId,
    refetchInterval: 20_000,
  });

  if (error) return <div className="p-4 md:p-6"><ErrorState error={error} onRetry={() => void refetch()} subject="the visit queue" /></div>;
  const open = data?.open ?? [];

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><ClipboardList className="w-6 h-6 text-teal-600" aria-hidden /> Visits</h1>
          <p className="text-sm text-gray-500">{open.length === 0 ? 'Nobody is waiting.' : `${open.length} open visit${open.length === 1 ? '' : 's'}`}</p>
        </div>
        <Button icon={<Plus className="w-4 h-4" />} onClick={() => setAdding(true)}>New visit</Button>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {COLUMNS.map((status) => {
          const rows = open.filter((v) => v.status === status);
          return (
            <section key={status} aria-label={VISIT_STATUS_LABEL[status]} className="rounded-xl bg-gray-50 dark:bg-white/5 p-3 min-h-[8rem]">
              <h2 className="mb-2 flex items-center justify-between text-sm font-semibold text-gray-700 dark:text-gray-200">
                {VISIT_STATUS_LABEL[status]} <span className="rounded-full bg-white px-2 py-0.5 text-xs text-gray-600 dark:bg-white/10 dark:text-gray-300">{rows.length}</span>
              </h2>
              <div className="space-y-2">
                {isLoading && <p className="text-xs text-gray-500">Loading…</p>}
                {rows.map((v) => <VisitCard key={v.id} visit={v} onOpen={() => setOpenId(v.id)} />)}
              </div>
            </section>
          );
        })}
      </div>

      <section aria-label="Finished today">
        <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">Finished in the last day</h2>
        {(data?.closed.length ?? 0) === 0 ? (
          <Card><EmptyState icon={<ClipboardList className="w-6 h-6" />} title="No finished visits yet" description="Completed and cancelled visits show here for a day." /></Card>
        ) : (
          <Card className="divide-y dark:divide-gray-700">
            {data!.closed.map((v) => (
              <button key={v.id} type="button" onClick={() => setOpenId(v.id)} className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm hover:bg-gray-50 dark:hover:bg-white/5">
                <span className="min-w-0 truncate"><span className="font-mono text-xs text-teal-600">{v.visitNumber}</span> <span className="font-medium text-gray-900 dark:text-white">{v.patient?.name ?? 'Patient'}</span></span>
                <Badge tone={v.status === 'COMPLETED' ? 'success' : 'neutral'}>{VISIT_STATUS_LABEL[v.status]}</Badge>
              </button>
            ))}
          </Card>
        )}
      </section>

      {adding && <NewVisitModal storeId={storeId} onClose={() => setAdding(false)} onCreated={(id) => { setAdding(false); setOpenId(id); }} />}
      {openId && <VisitWorkspace visitId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}

function VisitCard({ visit, onOpen }: { visit: VisitRow; onOpen: () => void }) {
  const p = visit.patient;
  return (
    <button type="button" onClick={onOpen} className="w-full rounded-lg border bg-white p-3 text-left shadow-sm hover:border-teal-400 focus:outline-none focus:ring-2 focus:ring-teal-500/40 dark:border-gray-700 dark:bg-gray-800">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate font-semibold text-gray-900 dark:text-white">{p?.name ?? 'Patient'}</p>
        {visit.priority === 'URGENT' && <Badge tone="danger">Urgent</Badge>}
      </div>
      <p className="text-xs text-gray-500">{[visit.visitNumber, p?.ageYears != null ? `${p.ageYears} yrs` : null, p?.sex === 'F' ? 'F' : p?.sex === 'M' ? 'M' : null].filter(Boolean).join(' · ')}</p>
      {visit.complaint && <p className="mt-1 line-clamp-2 text-sm text-gray-700 dark:text-gray-200">{visit.complaint}</p>}
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-gray-500">
        <span>Waiting {waitLabel(visit.createdAt)}</span>
        {visit.doctorName && <span>· {visit.doctorName}</span>}
        {p && p.allergies.length > 0 && <span className="inline-flex items-center gap-1 font-medium text-red-700 dark:text-red-300"><AlertTriangle className="h-3 w-3" aria-hidden /> Allergies</span>}
      </div>
    </button>
  );
}

function NewVisitModal({ storeId, onClose, onCreated }: { storeId: string; onClose: () => void; onCreated: (id: string) => void }) {
  const qc = useQueryClient();
  const [patient, setPatient] = useState<Patient | null>(null);
  const [complaint, setComplaint] = useState('');
  const [priority, setPriority] = useState('NORMAL');
  const create = useMutation({
    mutationFn: () => api.post<{ id: string; visitNumber: string }>('/visits', { storeId, patientId: patient?.id, complaint: complaint.trim() || undefined, priority }),
    onSuccess: (v) => { toast.success(`${patient?.name} is in the queue (${v.visitNumber})`); void qc.invalidateQueries({ queryKey: ['visits'] }); onCreated(v.id); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal title="New visit" subtitle="Put a patient in the queue" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); if (patient) create.mutate(); }}>
        <PatientPicker value={patient} onChange={setPatient} />
        <Input label="What they came for (optional)" value={complaint} onChange={(e) => setComplaint(e.target.value)} placeholder="Fever and cough for three days" />
        <Select label="Priority" value={priority} onChange={(e) => setPriority(e.target.value)}>
          <option value="NORMAL">Normal</option>
          <option value="URGENT">Urgent: seen first</option>
        </Select>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={create.isPending} disabled={!patient}>Add to the queue</Button>
        </div>
      </form>
    </Modal>
  );
}

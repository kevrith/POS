import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { MessageSquare, PhoneCall } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { Badge, Button, Card, EmptyState } from '../ui';

interface FollowUp {
  id: string; visitNumber: string; followUpDate: string; daysOverdue: number; complaint: string | null; doctorName: string | null;
  diagnoses: Array<{ label: string }>;
  patient: { id: string; name: string; patientNumber: string; phone: string | null } | null;
}
interface FollowUps { overdue: FollowUp[]; today: FollowUp[]; soon: FollowUp[] }

const dayLabel = (iso: string) => new Date(iso).toLocaleDateString('en-KE', { timeZone: 'Africa/Nairobi', weekday: 'short', day: 'numeric', month: 'short' });

/** Patients the doctor asked to come back, who have not yet: reach them by SMS or a call, and tick them off. */
export function useFollowUpCount() {
  const user = useAuthStore((s) => s.user);
  const { data } = useQuery<FollowUps>({ queryKey: ['follow-ups', user?.storeId], queryFn: () => api.get(`/visits/follow-ups?storeId=${user?.storeId ?? ''}`), enabled: !!user?.storeId, refetchInterval: 120_000 });
  return (data?.overdue.length ?? 0) + (data?.today.length ?? 0);
}

export default function FollowUpsPanel() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const canReach = ['OWNER', 'ADMIN', 'MANAGER', 'CASHIER', 'PHARMACIST'].includes(String(user?.role));
  const { data, isLoading } = useQuery<FollowUps>({ queryKey: ['follow-ups', user?.storeId], queryFn: () => api.get(`/visits/follow-ups?storeId=${user?.storeId ?? ''}`), enabled: !!user?.storeId });
  const done = () => void qc.invalidateQueries({ queryKey: ['follow-ups'] });
  const remind = useMutation({ mutationFn: (id: string) => api.post(`/visits/${id}/follow-up/remind`, {}), onSuccess: () => { toast.success('Reminder sent'); done(); }, onError: (e: Error) => toast.error(e.message) });
  const reached = useMutation({ mutationFn: (id: string) => api.post(`/visits/${id}/follow-up/contacted`, {}), onSuccess: () => { toast.success('Marked as reached'); done(); }, onError: (e: Error) => toast.error(e.message) });

  if (isLoading) return <p className="text-sm text-gray-500">Loading…</p>;
  const groups: Array<{ key: keyof FollowUps; title: string; rows: FollowUp[] }> = [
    { key: 'overdue', title: 'Overdue', rows: data?.overdue ?? [] },
    { key: 'today', title: 'Due today', rows: data?.today ?? [] },
    { key: 'soon', title: 'Coming up (next 14 days)', rows: data?.soon ?? [] },
  ];
  if (groups.every((g) => g.rows.length === 0)) return <Card><EmptyState icon={<PhoneCall className="h-6 w-6" />} title="No follow-ups to chase" description="When a doctor sets a follow-up date on a visit, the patient appears here until they have been reached or have come back." /></Card>;
  return (
    <div className="space-y-5">
      {groups.filter((g) => g.rows.length > 0).map((g) => (
        <section key={g.key} aria-label={g.title}>
          <h2 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-200">{g.title} <span className="text-gray-500">({g.rows.length})</span></h2>
          <Card className="divide-y dark:divide-gray-700">
            {g.rows.map((f) => (
              <div key={f.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900 dark:text-white">{f.patient?.name ?? 'Patient'} <span className="font-mono text-xs text-teal-600">{f.patient?.patientNumber}</span></p>
                  <p className="text-xs text-gray-500">{f.patient?.phone ?? 'No phone on record'} · seen {f.visitNumber}{f.doctorName ? ` by ${f.doctorName}` : ''}</p>
                  <p className="text-sm text-gray-700 dark:text-gray-200">{f.diagnoses.length ? f.diagnoses.map((d) => d.label).join('; ') : f.complaint ?? ''}</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone={g.key === 'overdue' ? 'danger' : g.key === 'today' ? 'warning' : 'neutral'}>{g.key === 'overdue' ? `${f.daysOverdue} day${f.daysOverdue === 1 ? '' : 's'} late` : dayLabel(f.followUpDate)}</Badge>
                  {canReach && (
                    <>
                      <Button size="sm" variant="secondary" icon={<MessageSquare className="h-4 w-4" />} disabled={!f.patient?.phone} loading={remind.isPending && remind.variables === f.id} onClick={() => remind.mutate(f.id)}>Send SMS</Button>
                      <Button size="sm" variant="secondary" icon={<PhoneCall className="h-4 w-4" />} loading={reached.isPending && reached.variables === f.id} onClick={() => reached.mutate(f.id)}>Mark reached</Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </Card>
        </section>
      ))}
    </div>
  );
}

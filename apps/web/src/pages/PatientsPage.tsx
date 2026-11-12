import { PatientCover } from '../components/clinical/CoverCheck';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Pencil, Plus, Search, UserCheck, UserX, Users } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { allergyLine, canApproveAlone, type Patient } from '../lib/clinical';
import PatientFormModal from '../components/clinical/PatientFormModal';

interface RxRow { id: string; prescriptionNumber: string; status: string; doctorName: string; diagnosis: string | null; items: string; createdAt: string; lastFillDate: string | null }
type PatientDetail = Patient & { prescriptions: RxRow[] };

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-200',
  DISPENSED: 'bg-green-100 text-green-800 dark:bg-green-500/20 dark:text-green-200',
  CANCELLED: 'bg-gray-100 text-gray-600 dark:bg-gray-600/40 dark:text-gray-300',
  REFERRED_EXTERNAL: 'bg-blue-100 text-blue-800 dark:bg-blue-500/20 dark:text-blue-200',
};

const medicines = (items: string) => {
  try { return (JSON.parse(items) as Array<{ name: string }>).map((i) => i.name).join(', '); } catch { return ''; }
};

/** Everyone the clinic or pharmacy treats: one record each, with their allergies, history and prescriptions. */
export default function PatientsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Patient | 'new' | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const manager = canApproveAlone(user?.role);

  const { data: patients = [], isLoading } = useQuery<Patient[]>({
    queryKey: ['patients', q, showInactive],
    queryFn: () => api.get(`/patients?q=${encodeURIComponent(q)}&limit=100${showInactive ? '&includeInactive=true' : ''}`),
  });
  const { data: detail } = useQuery<PatientDetail>({
    queryKey: ['patient', selectedId],
    queryFn: () => api.get(`/patients/${selectedId}`),
    enabled: !!selectedId,
  });
  const { data: visits = [] } = useQuery<Array<{ id: string; visitNumber: string; createdAt: string; status: string; complaint: string | null; doctorName: string | null; diagnoses: Array<{ code?: string; label: string }> }>>({
    queryKey: ['patient-visits', selectedId],
    queryFn: () => api.get(`/visits/patient/${selectedId}`),
    enabled: !!selectedId,
  });
  const { data: unlinked = [] } = useQuery<RxRow[]>({
    queryKey: ['patient-unlinked', selectedId],
    queryFn: () => api.get(`/patients/${selectedId}/unlinked-history`),
    enabled: !!selectedId && manager,
  });

  const adopt = useMutation({
    mutationFn: () => api.post<{ linked: number }>(`/patients/${selectedId}/adopt-prescriptions`, { prescriptionIds: unlinked.map((r) => r.id) }),
    onSuccess: (r) => {
      toast.success(`${r.linked} earlier prescription${r.linked === 1 ? '' : 's'} added to this record`);
      void qc.invalidateQueries({ queryKey: ['patient', selectedId] });
      void qc.invalidateQueries({ queryKey: ['patient-unlinked', selectedId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleActive = useMutation({
    mutationFn: (p: Patient) => api.patch<Patient>(`/patients/${p.id}/active`, { active: !p.isActive }),
    onSuccess: (p) => {
      toast.success(p.isActive ? `${p.name} is active again` : `${p.name} is switched off`);
      void qc.invalidateQueries({ queryKey: ['patients'] });
      void qc.invalidateQueries({ queryKey: ['patient', p.id] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2"><Users className="w-6 h-6 text-teal-600" aria-hidden /> Patients</h1>
          <p className="text-sm text-gray-500">One record per person: allergies, conditions and every prescription.</p>
        </div>
        <button onClick={() => setEditing('new')} className="inline-flex items-center gap-2 rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white hover:bg-teal-700">
          <Plus className="w-4 h-4" aria-hidden /> Register patient
        </button>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
        <section aria-label="Patient list" className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, phone, ID or PT number" aria-label="Search patients"
              className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white" />
          </div>
          {manager && (
            <label className="flex items-center gap-2 text-xs text-gray-500"><input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} /> Show switched-off records</label>
          )}
          <div className="divide-y rounded-xl border bg-white dark:divide-gray-700 dark:border-gray-700 dark:bg-gray-800">
            {isLoading && <p className="p-4 text-sm text-gray-500">Loading…</p>}
            {!isLoading && patients.length === 0 && <p className="p-4 text-sm text-gray-500">{q ? 'No patient matches that.' : 'No patients yet. Register the first one.'}</p>}
            {patients.map((p) => (
              <button key={p.id} onClick={() => setSelectedId(p.id)}
                className={`flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-teal-50 dark:hover:bg-teal-900/20 ${selectedId === p.id ? 'bg-teal-50 dark:bg-teal-900/20' : ''}`}>
                <div className="min-w-0">
                  <p className="truncate font-medium text-gray-900 dark:text-white">{p.name}{!p.isActive && <span className="ml-2 text-xs text-gray-400">(switched off)</span>}</p>
                  <p className="truncate text-xs text-gray-500">{[p.patientNumber, p.phone, p.ageYears != null ? `${p.ageYears} yrs` : null].filter(Boolean).join(' · ')}</p>
                </div>
                {p.allergies.length > 0 && <span className="shrink-0 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800 dark:bg-red-500/20 dark:text-red-200">{p.allergies.length} allerg{p.allergies.length === 1 ? 'y' : 'ies'}</span>}
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Patient record">
          {!detail ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-gray-500 dark:border-gray-600">Choose a patient to see their record.</div>
          ) : (
            <div className="space-y-4 rounded-xl border bg-white p-5 dark:border-gray-700 dark:bg-gray-800">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white">{detail.name}</h2>
                  <p className="font-mono text-xs text-teal-600">{detail.patientNumber}</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(detail)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700"><Pencil className="w-3.5 h-3.5" aria-hidden /> Edit</button>
                  {manager && (
                    <button onClick={() => toggleActive.mutate(detail)} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
                      {detail.isActive ? <><UserX className="w-3.5 h-3.5" aria-hidden /> Switch off</> : <><UserCheck className="w-3.5 h-3.5" aria-hidden /> Switch on</>}
                    </button>
                  )}
                </div>
              </div>

              {detail.allergies.length > 0 ? (
                <p className="flex items-start gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm font-medium text-red-800 dark:bg-red-500/10 dark:text-red-200">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Allergic to {allergyLine(detail.allergies)}
                </p>
              ) : <p className="text-sm text-gray-500">No allergies recorded.</p>}

              <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                {[
                  ['Age', detail.ageYears != null ? `${detail.ageYears} years` : null],
                  ['Sex', detail.sex === 'F' ? 'Female' : detail.sex === 'M' ? 'Male' : detail.sex === 'O' ? 'Other' : null],
                  ['Weight', detail.weightKg ? `${detail.weightKg} kg` : null],
                  ['Blood group', detail.bloodGroup],
                  ['Phone', detail.phone],
                  ['ID', detail.idNumber],
                  ['Pregnancy', [detail.pregnant && 'Pregnant', detail.breastfeeding && 'Breastfeeding'].filter(Boolean).join(', ') || null],
                  ['Conditions', detail.conditions.join(', ') || null],
                  ['Next of kin', [detail.nextOfKinName, detail.nextOfKinPhone].filter(Boolean).join(' · ') || null],
                ].filter(([, v]) => v).map(([k, v]) => (
                  <div key={k as string}><dt className="text-xs text-gray-500">{k}</dt><dd className="text-gray-900 dark:text-white">{v}</dd></div>
                ))}
              </dl>
              <PatientCover patientId={detail.id} providerId={detail.insuranceProviderId} memberNumber={detail.insuranceMemberNumber} />

              {detail.notes && <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700 dark:bg-gray-700/40 dark:text-gray-200">{detail.notes}</p>}

              {manager && unlinked.length > 0 && (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
                  <span>{unlinked.length} earlier prescription{unlinked.length === 1 ? '' : 's'} with this name look like theirs.</span>
                  <button onClick={() => adopt.mutate()} disabled={adopt.isPending} className="rounded-md border border-amber-400 px-2.5 py-1 text-xs font-medium hover:bg-amber-100 disabled:opacity-50 dark:hover:bg-amber-500/20">Add them to this record</button>
                </div>
              )}

              {visits.length > 0 && (
                <div>
                  <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Visits</h3>
                  <ul className="divide-y rounded-lg border dark:divide-gray-700 dark:border-gray-700">
                    {visits.slice(0, 8).map((v) => (
                      <li key={v.id} className="px-3 py-2 text-sm">
                        <p className="font-mono text-xs text-teal-600">{v.visitNumber} · {new Date(v.createdAt).toLocaleDateString('en-KE')}{v.doctorName ? ` · ${v.doctorName}` : ''}</p>
                        <p className="text-gray-800 dark:text-gray-100">{v.diagnoses.length ? v.diagnoses.map((d) => d.label).join('; ') : v.complaint ?? 'No notes'}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div>
                <h3 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">Prescriptions</h3>
                {detail.prescriptions.length === 0 ? <p className="text-sm text-gray-500">None yet.</p> : (
                  <ul className="divide-y rounded-lg border dark:divide-gray-700 dark:border-gray-700">
                    {detail.prescriptions.map((rx) => (
                      <li key={rx.id} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                        <div className="min-w-0">
                          <p className="font-mono text-xs text-teal-600">{rx.prescriptionNumber} · {new Date(rx.createdAt).toLocaleDateString('en-KE')}</p>
                          <p className="truncate text-gray-800 dark:text-gray-100">{medicines(rx.items) || 'No medicines listed'}</p>
                          <p className="truncate text-xs text-gray-500">{rx.doctorName}{rx.diagnosis ? ` · ${rx.diagnosis}` : ''}</p>
                        </div>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[rx.status] ?? ''}`}>{rx.status.replace('_', ' ').toLowerCase()}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {editing && (
        <PatientFormModal patient={editing === 'new' ? null : editing} onClose={() => setEditing(null)}
          onSaved={(p) => { setEditing(null); setSelectedId(p.id); }} />
      )}
    </div>
  );
}

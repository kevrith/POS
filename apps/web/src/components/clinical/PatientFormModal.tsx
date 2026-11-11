import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { AlertTriangle, Plus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import type { Allergy, Patient } from '../../lib/clinical';

const INPUT = 'w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white';
const LABEL = 'block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1';

interface FormState {
  name: string; phone: string; email: string; dateOfBirth: string; sex: string; idNumber: string; address: string;
  weightKg: string; bloodGroup: string; pregnant: boolean; breastfeeding: boolean;
  nextOfKinName: string; nextOfKinPhone: string; insuranceProviderId: string; insuranceMemberNumber: string; notes: string;
  allergies: Allergy[]; conditions: string[];
}

const blank = (): FormState => ({
  name: '', phone: '', email: '', dateOfBirth: '', sex: '', idNumber: '', address: '', weightKg: '', bloodGroup: '', pregnant: false, breastfeeding: false,
  nextOfKinName: '', nextOfKinPhone: '', insuranceProviderId: '', insuranceMemberNumber: '', notes: '', allergies: [], conditions: [],
});

const fromPatient = (p: Patient): FormState => ({
  name: p.name, phone: p.phone ?? '', email: p.email ?? '', dateOfBirth: p.dateOfBirth ? p.dateOfBirth.slice(0, 10) : '', sex: p.sex ?? '', idNumber: p.idNumber ?? '',
  address: p.address ?? '', weightKg: p.weightKg != null ? String(p.weightKg) : '', bloodGroup: p.bloodGroup ?? '', pregnant: p.pregnant, breastfeeding: p.breastfeeding,
  nextOfKinName: p.nextOfKinName ?? '', nextOfKinPhone: p.nextOfKinPhone ?? '', insuranceProviderId: p.insuranceProviderId ?? '', insuranceMemberNumber: p.insuranceMemberNumber ?? '',
  notes: p.notes ?? '', allergies: p.allergies, conditions: p.conditions,
});

/** The body to send: a blank optional field clears it, so every field is always sent on an edit. */
export function patientBody(f: FormState) {
  return {
    name: f.name.trim(), phone: f.phone.trim(), email: f.email.trim(), dateOfBirth: f.dateOfBirth, sex: f.sex, idNumber: f.idNumber.trim(), address: f.address.trim(),
    weightKg: f.weightKg.trim() === '' ? null : Number(f.weightKg), bloodGroup: f.bloodGroup, pregnant: f.sex === 'M' ? false : f.pregnant, breastfeeding: f.sex === 'M' ? false : f.breastfeeding,
    nextOfKinName: f.nextOfKinName.trim(), nextOfKinPhone: f.nextOfKinPhone.trim(), insuranceProviderId: f.insuranceProviderId, insuranceMemberNumber: f.insuranceMemberNumber.trim(),
    notes: f.notes.trim(), allergies: f.allergies, conditions: f.conditions,
  };
}

/** Register a patient or change their record. Allergies are what the dispensing check reads, so they are first-class here. */
export default function PatientFormModal({ patient, onClose, onSaved }: { patient?: Patient | null; onClose: () => void; onSaved: (p: Patient) => void }) {
  const businessId = useAuthStore((s) => s.user?.businessId) ?? '';
  const qc = useQueryClient();
  const [f, setF] = useState<FormState>(() => (patient ? fromPatient(patient) : blank()));
  const [allergy, setAllergy] = useState<Allergy>({ substance: '', reaction: '' });
  const [condition, setCondition] = useState('');
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((s) => ({ ...s, [k]: v }));

  const { data: providers = [] } = useQuery<Array<{ id: string; name: string; isActive: boolean }>>({
    queryKey: ['pharmacy-providers', businessId],
    queryFn: () => api.get(`/pharmacy/providers?businessId=${businessId}`),
    enabled: !!businessId,
    staleTime: 60_000,
  });

  // While registering someone new, look for a record that may already be them (same ID, phone or name).
  const [probe, setProbe] = useState({ name: '', phone: '', idNumber: '' });
  useEffect(() => {
    if (patient) return;
    const t = setTimeout(() => setProbe({ name: f.name, phone: f.phone, idNumber: f.idNumber }), 400);
    return () => clearTimeout(t);
  }, [patient, f.name, f.phone, f.idNumber]);
  const probing = !patient && (probe.idNumber.trim() !== '' || probe.phone.trim() !== '' || probe.name.trim().length >= 3);
  const { data: matches = [] } = useQuery<Patient[]>({
    queryKey: ['patient-match', probe],
    queryFn: () => api.get(`/patients/match?name=${encodeURIComponent(probe.name)}&phone=${encodeURIComponent(probe.phone)}&idNumber=${encodeURIComponent(probe.idNumber)}`),
    enabled: probing,
  });

  const save = useMutation({
    mutationFn: () => (patient ? api.patch<Patient>(`/patients/${patient.id}`, patientBody(f)) : api.post<Patient>('/patients', patientBody(f))),
    onSuccess: (p) => {
      void qc.invalidateQueries({ queryKey: ['patients'] });
      void qc.invalidateQueries({ queryKey: ['patient', p.id] });
      toast.success(patient ? 'Patient updated' : `Registered ${p.name} (${p.patientNumber})`);
      onSaved(p);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const addAllergy = () => {
    const substance = allergy.substance.trim();
    if (!substance) return;
    set('allergies', [...f.allergies.filter((a) => a.substance.toLowerCase() !== substance.toLowerCase()), { substance, ...(allergy.reaction?.trim() ? { reaction: allergy.reaction.trim() } : {}) }]);
    setAllergy({ substance: '', reaction: '' });
  };
  const addCondition = () => {
    const c = condition.trim();
    if (c && !f.conditions.some((x) => x.toLowerCase() === c.toLowerCase())) set('conditions', [...f.conditions, c]);
    setCondition('');
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[60] p-4" role="dialog" aria-modal="true" aria-label={patient ? 'Edit patient' : 'Register patient'}>
      <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[92vh] flex flex-col">
        <div className="p-5 border-b dark:border-gray-700 flex items-center justify-between">
          <h2 className="text-lg font-bold text-gray-900 dark:text-white">{patient ? `Edit ${patient.name}` : 'Register a patient'}</h2>
          <button onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 overflow-y-auto space-y-5 flex-1">
          {!patient && matches.length > 0 && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
              <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="w-4 h-4" /> This may already be registered</p>
              <ul className="mt-1.5 space-y-1">
                {matches.map((m) => (
                  <li key={m.id} className="flex items-center justify-between gap-2">
                    <span>{m.patientNumber} · {m.name}{m.phone ? ` · ${m.phone}` : ''}{m.idNumber ? ` · ID ${m.idNumber}` : ''}</span>
                    <button type="button" onClick={() => onSaved(m)} className="shrink-0 rounded-md border border-amber-400 px-2 py-0.5 text-xs font-medium hover:bg-amber-100 dark:hover:bg-amber-500/20">Use this one</button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <section className="grid grid-cols-2 gap-3">
            <div className="col-span-2"><label className={LABEL} htmlFor="pf-name">Full name *</label><input id="pf-name" className={INPUT} value={f.name} onChange={(e) => set('name', e.target.value)} /></div>
            <div><label className={LABEL} htmlFor="pf-phone">Phone</label><input id="pf-phone" className={INPUT} value={f.phone} onChange={(e) => set('phone', e.target.value)} placeholder="0712 345 678" /></div>
            <div><label className={LABEL} htmlFor="pf-id">ID / passport number</label><input id="pf-id" className={INPUT} value={f.idNumber} onChange={(e) => set('idNumber', e.target.value)} /></div>
            <div><label className={LABEL} htmlFor="pf-dob">Date of birth</label><input id="pf-dob" type="date" className={INPUT} value={f.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} /></div>
            <div>
              <label className={LABEL} htmlFor="pf-sex">Sex</label>
              <select id="pf-sex" className={INPUT} value={f.sex} onChange={(e) => set('sex', e.target.value)}>
                <option value="">Not stated</option><option value="F">Female</option><option value="M">Male</option><option value="O">Other</option>
              </select>
            </div>
            <div><label className={LABEL} htmlFor="pf-wt">Weight (kg)</label><input id="pf-wt" type="number" min="0" step="0.1" className={INPUT} value={f.weightKg} onChange={(e) => set('weightKg', e.target.value)} /></div>
            <div>
              <label className={LABEL} htmlFor="pf-bg">Blood group</label>
              <select id="pf-bg" className={INPUT} value={f.bloodGroup} onChange={(e) => set('bloodGroup', e.target.value)}>
                <option value="">Unknown</option>{['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'].map((b) => <option key={b}>{b}</option>)}
              </select>
            </div>
            {f.sex !== 'M' && (
              <div className="col-span-2 flex gap-5 text-sm text-gray-700 dark:text-gray-200">
                <label className="flex items-center gap-2"><input type="checkbox" checked={f.pregnant} onChange={(e) => set('pregnant', e.target.checked)} /> Pregnant</label>
                <label className="flex items-center gap-2"><input type="checkbox" checked={f.breastfeeding} onChange={(e) => set('breastfeeding', e.target.checked)} /> Breastfeeding</label>
              </div>
            )}
          </section>

          <section>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Allergies</p>
            <p className="text-xs text-gray-500 mb-2">A medicine, or a family such as penicillin or NSAIDs. Every prescription is checked against this list.</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {f.allergies.length === 0 && <span className="text-xs text-gray-400">No known allergies recorded</span>}
              {f.allergies.map((a) => (
                <span key={a.substance} className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-500/20 dark:text-red-200">
                  {a.substance}{a.reaction ? ` (${a.reaction})` : ''}
                  <button type="button" aria-label={`Remove ${a.substance}`} onClick={() => set('allergies', f.allergies.filter((x) => x.substance !== a.substance))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className={INPUT} placeholder="Allergic to…" aria-label="Allergic to" value={allergy.substance} onChange={(e) => setAllergy({ ...allergy, substance: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAllergy(); } }} />
              <input className={INPUT} placeholder="Reaction (optional)" aria-label="Reaction" value={allergy.reaction ?? ''} onChange={(e) => setAllergy({ ...allergy, reaction: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addAllergy(); } }} />
              <button type="button" onClick={addAllergy} className="shrink-0 rounded-lg border px-3 text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700" aria-label="Add allergy"><Plus className="w-4 h-4" /></button>
            </div>
          </section>

          <section>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Conditions</p>
            <div className="flex flex-wrap gap-2 mb-2">
              {f.conditions.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 rounded-full bg-teal-100 px-2.5 py-1 text-xs font-medium text-teal-800 dark:bg-teal-500/20 dark:text-teal-200">
                  {c}<button type="button" aria-label={`Remove ${c}`} onClick={() => set('conditions', f.conditions.filter((x) => x !== c))}><X className="w-3 h-3" /></button>
                </span>
              ))}
            </div>
            <div className="flex gap-2">
              <input className={INPUT} placeholder="Hypertension, diabetes, asthma…" aria-label="Add condition" value={condition} onChange={(e) => setCondition(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCondition(); } }} />
              <button type="button" onClick={addCondition} className="shrink-0 rounded-lg border px-3 text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700" aria-label="Add condition"><Plus className="w-4 h-4" /></button>
            </div>
          </section>

          <section className="grid grid-cols-2 gap-3">
            <div><label className={LABEL} htmlFor="pf-nok">Next of kin</label><input id="pf-nok" className={INPUT} value={f.nextOfKinName} onChange={(e) => set('nextOfKinName', e.target.value)} /></div>
            <div><label className={LABEL} htmlFor="pf-nokp">Next of kin phone</label><input id="pf-nokp" className={INPUT} value={f.nextOfKinPhone} onChange={(e) => set('nextOfKinPhone', e.target.value)} /></div>
            <div>
              <label className={LABEL} htmlFor="pf-ins">Insurer</label>
              <select id="pf-ins" className={INPUT} value={f.insuranceProviderId} onChange={(e) => set('insuranceProviderId', e.target.value)}>
                <option value="">None</option>{providers.filter((p) => p.isActive).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div><label className={LABEL} htmlFor="pf-mem">Member number</label><input id="pf-mem" className={INPUT} value={f.insuranceMemberNumber} onChange={(e) => set('insuranceMemberNumber', e.target.value)} /></div>
            <div className="col-span-2"><label className={LABEL} htmlFor="pf-addr">Address</label><input id="pf-addr" className={INPUT} value={f.address} onChange={(e) => set('address', e.target.value)} /></div>
            <div className="col-span-2"><label className={LABEL} htmlFor="pf-notes">Notes</label><textarea id="pf-notes" rows={2} className={INPUT} value={f.notes} onChange={(e) => set('notes', e.target.value)} /></div>
          </section>
        </div>

        <div className="p-4 border-t dark:border-gray-700 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50 dark:border-gray-600 dark:text-gray-300">Cancel</button>
          <button onClick={() => save.mutate()} disabled={!f.name.trim() || save.isPending} className="px-6 py-2 text-sm bg-teal-600 text-white rounded-lg font-medium hover:bg-teal-700 disabled:opacity-50">
            {save.isPending ? 'Saving…' : patient ? 'Save changes' : 'Register patient'}
          </button>
        </div>
      </div>
    </div>
  );
}

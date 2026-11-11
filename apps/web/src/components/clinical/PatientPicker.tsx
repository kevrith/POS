import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertTriangle, Search, UserPlus, X } from 'lucide-react';
import { api } from '../../lib/api';
import { allergyLine, type Patient } from '../../lib/clinical';
import PatientFormModal from './PatientFormModal';

/** Pick the patient a prescription is for (or register them), and see their allergies right away. */
export default function PatientPicker({ value, onChange }: { value: Patient | null; onChange: (p: Patient | null) => void }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [registering, setRegistering] = useState(false);
  const { data: results = [] } = useQuery<Patient[]>({
    queryKey: ['patients', 'pick', q],
    queryFn: () => api.get(`/patients?q=${encodeURIComponent(q)}&limit=8`),
    enabled: open && q.trim().length >= 2,
  });

  if (value) {
    return (
      <div className="rounded-xl border p-3 dark:border-gray-600" data-testid="chosen-patient">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-semibold text-gray-900 dark:text-white">{value.name} <span className="font-mono text-xs text-teal-600">{value.patientNumber}</span></p>
            <p className="text-xs text-gray-500">
              {[value.ageYears != null ? `${value.ageYears} yrs` : null, value.sex === 'F' ? 'Female' : value.sex === 'M' ? 'Male' : null, value.weightKg ? `${value.weightKg} kg` : null, value.phone].filter(Boolean).join(' · ')}
            </p>
          </div>
          <button type="button" onClick={() => onChange(null)} aria-label="Choose a different patient" className="p-1 text-gray-400 hover:text-gray-600"><X className="w-4 h-4" /></button>
        </div>
        {value.allergies.length > 0 ? (
          <p className="mt-2 flex items-start gap-1.5 rounded-lg bg-red-50 px-2.5 py-1.5 text-sm font-medium text-red-800 dark:bg-red-500/10 dark:text-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden /> Allergic to {allergyLine(value.allergies)}
          </p>
        ) : (
          <p className="mt-2 text-xs text-gray-400">No allergies recorded</p>
        )}
        {(value.pregnant || value.breastfeeding) && <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-300">{[value.pregnant && 'Pregnant', value.breastfeeding && 'Breastfeeding'].filter(Boolean).join(' · ')}</p>}
        {value.conditions.length > 0 && <p className="mt-1 text-xs text-gray-500">Conditions: {value.conditions.join(', ')}</p>}
      </div>
    );
  }

  return (
    <div className="relative">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" aria-hidden />
          <input
            value={q}
            onChange={(e) => { setQ(e.target.value); setOpen(true); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
            placeholder="Find a patient by name, phone, ID or PT number"
            aria-label="Find a patient"
            className="w-full rounded-lg border py-2 pl-9 pr-3 text-sm focus:ring-2 focus:ring-teal-500 dark:border-gray-600 dark:bg-gray-700 dark:text-white"
          />
        </div>
        <button type="button" onClick={() => setRegistering(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-3 text-sm font-medium hover:bg-gray-50 dark:border-gray-600 dark:hover:bg-gray-700">
          <UserPlus className="h-4 w-4" aria-hidden /> New patient
        </button>
      </div>
      {open && q.trim().length >= 2 && (
        <div className="absolute left-0 right-0 top-full z-10 mt-1 max-h-56 overflow-y-auto rounded-lg border bg-white shadow-xl dark:border-gray-600 dark:bg-gray-800">
          {results.length === 0 && <p className="px-3 py-2 text-sm text-gray-500">No patient found. Use New patient to register them.</p>}
          {results.map((p) => (
            <button key={p.id} type="button" onMouseDown={() => { onChange(p); setQ(''); setOpen(false); }}
              className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-teal-50 dark:hover:bg-teal-900/30">
              <span className="font-medium text-gray-900 dark:text-white">{p.name}</span>
              <span className="shrink-0 text-xs text-gray-500">{p.patientNumber}{p.phone ? ` · ${p.phone}` : ''}</span>
            </button>
          ))}
        </div>
      )}
      {registering && <PatientFormModal onClose={() => setRegistering(false)} onSaved={(p) => { setRegistering(false); onChange(p); }} />}
    </div>
  );
}

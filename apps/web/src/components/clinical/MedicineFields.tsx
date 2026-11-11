import { Pill } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';

interface ListedDrug { id: string; genericName: string; brandName: string | null; strength: string | null; dosageForm: string | null; scheduleClass: string | null }

export interface MedicineForm {
  genericName: string;
  strength: string;
  dosageForm: string;
  drugClass: string;
  scheduleClass: string;
  requiresPrescription: boolean;
}

export const emptyMedicine: MedicineForm = { genericName: '', strength: '', dosageForm: '', drugClass: '', scheduleClass: '', requiresPrescription: false };

/** The medicine details an item needs before the pharmacy checks (allergy, dose, controlled drugs, prescription-only) can work. */
export const medicineFromItem = (item: Record<string, unknown>): MedicineForm => ({
  genericName: String(item.genericName ?? ''),
  strength: String(item.strength ?? ''),
  dosageForm: String(item.dosageForm ?? ''),
  drugClass: String(item.drugClass ?? ''),
  scheduleClass: String(item.scheduleClass ?? ''),
  requiresPrescription: item.requiresPrescription === true,
});

/** What goes in the request. Blank text is sent as blank so an edit can clear it. */
export const medicineBody = (m: MedicineForm) => ({
  genericName: m.genericName.trim(),
  strength: m.strength.trim(),
  dosageForm: m.dosageForm.trim(),
  drugClass: m.drugClass.trim(),
  scheduleClass: m.scheduleClass,
  requiresPrescription: m.requiresPrescription,
});

const INPUT = 'w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white';

export default function MedicineFields({ value, onChange }: { value: MedicineForm; onChange: (m: MedicineForm) => void }) {
  const set = <K extends keyof MedicineForm>(k: K, v: MedicineForm[K]) => onChange({ ...value, [k]: v });
  const businessId = useAuthStore((st) => st.user?.businessId) ?? '';
  const { data: listed = [] } = useQuery<ListedDrug[]>({
    queryKey: ['pharmacy-drugs', businessId, ''],
    queryFn: () => api.get(`/pharmacy/drugs?businessId=${businessId}`),
    enabled: !!businessId,
    staleTime: 5 * 60_000,
  });
  const fill = (id: string) => {
    const d = listed.find((x) => x.id === id);
    if (!d) return;
    onChange({
      ...value,
      genericName: d.genericName,
      strength: d.strength ?? value.strength,
      dosageForm: d.dosageForm ? d.dosageForm.charAt(0) + d.dosageForm.slice(1).toLowerCase() : value.dosageForm,
      scheduleClass: d.scheduleClass && d.scheduleClass !== 'OTC' ? d.scheduleClass : value.scheduleClass,
    });
  };
  return (
    <fieldset className="rounded-xl border border-teal-200 p-3 space-y-3 dark:border-teal-500/30">
      <legend className="flex items-center gap-1.5 px-1 text-sm font-semibold text-teal-700 dark:text-teal-300"><Pill className="h-4 w-4" aria-hidden /> Medicine details</legend>
      {listed.length > 0 && (
        <select aria-label="Fill from the drug list" className={INPUT} value="" onChange={(e) => fill(e.target.value)}>
          <option value="">Fill from the drug list…</option>
          {listed.map((d) => <option key={d.id} value={d.id}>{d.genericName}{d.strength ? ` ${d.strength}` : ''}{d.brandName ? ` (${d.brandName})` : ''}</option>)}
        </select>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="med-generic">Generic name</label>
          <input id="med-generic" className={INPUT} value={value.genericName} onChange={(e) => set('genericName', e.target.value)} placeholder="Amoxicillin" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="med-strength">Strength</label>
          <input id="med-strength" className={INPUT} value={value.strength} onChange={(e) => set('strength', e.target.value)} placeholder="500mg  or  125mg/5ml" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="med-form">Form</label>
          <input id="med-form" className={INPUT} value={value.dosageForm} onChange={(e) => set('dosageForm', e.target.value)} placeholder="Capsule, syrup, injection" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="med-class">Drug class</label>
          <input id="med-class" className={INPUT} value={value.drugClass} onChange={(e) => set('drugClass', e.target.value)} placeholder="Penicillin, NSAID, statin" />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1" htmlFor="med-schedule">Controlled schedule</label>
          <select id="med-schedule" className={INPUT} value={value.scheduleClass} onChange={(e) => set('scheduleClass', e.target.value)}>
            <option value="">Not controlled</option>
            <option value="II">Schedule II</option>
            <option value="III">Schedule III</option>
            <option value="IV">Schedule IV</option>
            <option value="V">Schedule V</option>
          </select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-gray-700 dark:text-gray-200">
          <input type="checkbox" checked={value.requiresPrescription} onChange={(e) => set('requiresPrescription', e.target.checked)} />
          Needs a prescription
        </label>
      </div>
      <p className="text-xs text-gray-500">
        The generic name and class let the system check allergies and interactions. A controlled drug goes on the register whenever it is dispensed.
        A medicine that needs a prescription cannot be sold on the till without a manager's approval.
      </p>
    </fieldset>
  );
}

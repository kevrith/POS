import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import {
  Pill, AlertTriangle, Shield, FileText, Plus, Trash2,
  RefreshCw, TrendingUp, BookOpen, Pencil, Check, X, Tag,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import TariffModal from '../components/clinical/Tariff';
import { printBarcodeLabel } from '../lib/printer';
import { printHtml } from '../lib/printHtml';
import DispenseModal from '../components/DispenseModal';

type Tab = 'drugs' | 'interactions' | 'refill-queue' | 'controlled-log' | 'providers' | 'claims' | 'labels';

const SEV_COLOR: Record<string, string> = {
  MILD: 'bg-green-100 text-green-700',
  MODERATE: 'bg-amber-100 text-amber-700',
  SEVERE: 'bg-red-100 text-red-700',
  CONTRAINDICATED: 'bg-red-200 text-red-900 font-bold',
};

const EMPTY_DRUG = { genericName: '', brandName: '', strength: '', dosageForm: 'TABLET', category: 'OTHER', scheduleClass: 'OTC', defaultInstructions: '', maxDailyDose: '', unit: 'mg', contraindicationsText: '' };

export default function PharmacyPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('drugs');
  const [tariffOf, setTariffOf] = useState<{ id: string; name: string } | null>(null);

  // ── Drug Catalogue ──
  const [drugSearch, setDrugSearch] = useState('');
  const { data: drugs = [] } = useQuery({
    queryKey: ['pharmacy-drugs', businessId, drugSearch],
    queryFn: () => api.get<any[]>(`/pharmacy/drugs?businessId=${businessId}${drugSearch ? `&search=${encodeURIComponent(drugSearch)}` : ''}`),
    enabled: tab === 'drugs' || tab === 'labels',
  });
  const [drugForm, setDrugForm] = useState({ ...EMPTY_DRUG });
  const [showDrugForm, setShowDrugForm] = useState(false);
  const [editDrug, setEditDrug] = useState<any>(null);
  const createDrug = useMutation({
    mutationFn: (d: any) => api.post('/pharmacy/drugs', { ...d, businessId, maxDailyDose: d.maxDailyDose === '' ? undefined : Number(d.maxDailyDose) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pharmacy-drugs'] }); setShowDrugForm(false); setDrugForm({ ...EMPTY_DRUG }); },
  });
  const updateDrug = useMutation({
    mutationFn: ({ id, genericName, brandName, strength, dosageForm, category, scheduleClass, defaultInstructions, maxDailyDose, unit, contraindicationsText }: any) =>
      api.patch(`/pharmacy/drugs/${id}`, { genericName, brandName, strength, dosageForm, category, scheduleClass, defaultInstructions, unit, contraindicationsText, maxDailyDose: maxDailyDose === '' || maxDailyDose == null ? null : Number(maxDailyDose) }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pharmacy-drugs'] }); setEditDrug(null); },
  });
  const [starterMsg, setStarterMsg] = useState('');
  const loadStarter = useMutation({
    mutationFn: () => api.post<{ interactionsAdded: number; drugsAdded: number }>('/pharmacy/starter-data', {}),
    onSuccess: (r) => {
      setStarterMsg(r.interactionsAdded + r.drugsAdded === 0 ? 'Everything in the starter list is already here.' : `Added ${r.drugsAdded} drugs and ${r.interactionsAdded} interactions. Ask your pharmacist to review them.`);
      void qc.invalidateQueries({ queryKey: ['pharmacy-drugs'] });
      void qc.invalidateQueries({ queryKey: ['pharmacy-interactions'] });
    },
    onError: (e: Error) => setStarterMsg(e.message),
  });
  const deleteDrug = useMutation({
    mutationFn: (id: string) => api.delete(`/pharmacy/drugs/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pharmacy-drugs'] }),
  });

  // ── Drug Interactions ──
  const { data: interactions = [] } = useQuery({
    queryKey: ['pharmacy-interactions', businessId],
    queryFn: () => api.get<any[]>(`/pharmacy/interactions?businessId=${businessId}`),
    enabled: tab === 'interactions',
  });
  const [intForm, setIntForm] = useState({ drug1Name: '', drug2Name: '', severity: 'MODERATE', description: '' });
  const createInt = useMutation({
    mutationFn: (d: any) => api.post('/pharmacy/interactions', d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pharmacy-interactions'] }); setIntForm({ drug1Name: '', drug2Name: '', severity: 'MODERATE', description: '' }); },
  });
  const deleteInt = useMutation({
    mutationFn: (id: string) => api.delete(`/pharmacy/interactions/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pharmacy-interactions'] }),
  });

  // ── Refill Queue ──
  const { data: refillQueue = [] } = useQuery({
    queryKey: ['pharmacy-refill-queue', businessId],
    queryFn: () => api.get<any[]>(`/prescriptions/refill-queue?businessId=${businessId}`),
    enabled: tab === 'refill-queue',
    refetchInterval: 60000,
  });
  const [refilling, setRefilling] = useState<{ id: string; prescriptionNumber: string; patientName: string } | null>(null);

  // ── Controlled Substance Log ──
  const [logStart, setLogStart] = useState('');
  const [logEnd, setLogEnd] = useState('');
  const { data: controlledLog = [], refetch: refetchLog } = useQuery({
    queryKey: ['pharmacy-controlled-log', businessId, logStart, logEnd],
    queryFn: () => {
      let url = `/prescriptions/controlled-log?businessId=${businessId}`;
      if (logStart) url += `&startDate=${logStart}`;
      if (logEnd) url += `&endDate=${logEnd}`;
      return api.get<any[]>(url);
    },
    enabled: tab === 'controlled-log',
  });
  const [showLogForm, setShowLogForm] = useState(false);
  const [logForm, setLogForm] = useState({
    itemName: '', scheduleClass: 'II', quantityDispensed: '', unit: 'units',
    patientName: '', patientIdNumber: '', prescriberName: '', prescriberLicense: '',
    dispensedBy: user?.name ?? '', notes: '',
  });
  const addLog = useMutation({
    mutationFn: (d: any) => api.post('/prescriptions/controlled-log', { ...d, businessId }),
    onSuccess: () => { void refetchLog(); setShowLogForm(false); setLogForm({ itemName: '', scheduleClass: 'II', quantityDispensed: '', unit: 'units', patientName: '', patientIdNumber: '', prescriberName: '', prescriberLicense: '', dispensedBy: user?.name ?? '', notes: '' }); },
  });

  // ── Insurance Providers ──
  const { data: providers = [] } = useQuery({
    queryKey: ['pharmacy-providers', businessId],
    queryFn: () => api.get<any[]>(`/pharmacy/providers?businessId=${businessId}`),
    enabled: tab === 'providers' || tab === 'claims',
  });
  const [provForm, setProvForm] = useState({ name: '', code: '', contactPhone: '', contactEmail: '', kind: 'PRIVATE', requiresEligibility: true });
  const createProv = useMutation({
    mutationFn: (d: any) => api.post('/pharmacy/providers', { ...d, businessId }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['pharmacy-providers'] }); setProvForm({ name: '', code: '', contactPhone: '', contactEmail: '', kind: 'PRIVATE', requiresEligibility: true }); },
  });
  const toggleProv = useMutation({
    mutationFn: ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.patch(`/pharmacy/providers/${id}`, { isActive }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['pharmacy-providers'] }),
  });

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'drugs', label: 'Drug List', icon: <BookOpen className="w-4 h-4" /> },
    { id: 'interactions', label: 'Drug Interactions', icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'refill-queue', label: 'Refill Queue', icon: <RefreshCw className="w-4 h-4" /> },
    { id: 'controlled-log', label: 'Controlled Substances', icon: <Shield className="w-4 h-4" /> },
    { id: 'providers', label: 'Insurance Providers', icon: <FileText className="w-4 h-4" /> },
    { id: 'claims', label: 'Claims', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'labels', label: 'Drug Labels', icon: <Tag className="w-4 h-4" /> },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <div className="flex items-center gap-2">
        <Pill className="w-6 h-6 text-blue-600" />
        <h1 className="text-2xl font-bold">Pharmacy Management</h1>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b overflow-x-auto [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.id ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── Drug Catalogue ── */}
      {tab === 'drugs' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <input
                className="w-full border rounded px-3 py-1.5 text-sm pl-8"
                placeholder="Search by generic or brand name..."
                value={drugSearch}
                onChange={(e) => setDrugSearch(e.target.value)}
              />
              <BookOpen className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            </div>
            <button onClick={() => setShowDrugForm(true)} className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium flex items-center gap-1">
              <Plus className="w-4 h-4" />Add Drug
            </button>
            <button onClick={() => loadStarter.mutate()} disabled={loadStarter.isPending} className="border px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50" title="Adds common drugs with their daily limits and cautions, and common drug interactions. Anything you already have is left alone.">
              {loadStarter.isPending ? 'Loading…' : 'Load starter list'}
            </button>
          </div>
          {starterMsg && <p className="text-sm text-gray-600" role="status">{starterMsg}</p>}
          <p className="text-xs text-gray-500">
            This one list feeds the safety check at dispensing: the <b>maximum a day</b> and <b>cautions</b> below are used for dose and pregnancy checks, and the brand name is read as its generic.
            The starter list is common, general information: have your pharmacist review it and set controlled schedules to match your licence.
          </p>

          {showDrugForm && (
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-sm">Add Drug to Catalogue</h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Generic name *"
                  value={drugForm.genericName} onChange={(e) => setDrugForm({ ...drugForm, genericName: e.target.value })} />
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Brand name"
                  value={drugForm.brandName} onChange={(e) => setDrugForm({ ...drugForm, brandName: e.target.value })} />
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Strength (e.g. 500mg)"
                  value={drugForm.strength} onChange={(e) => setDrugForm({ ...drugForm, strength: e.target.value })} />
                <select className="border rounded px-3 py-1.5 text-sm" value={drugForm.dosageForm}
                  onChange={(e) => setDrugForm({ ...drugForm, dosageForm: e.target.value })}>
                  {['TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'DROPS', 'OTHER'].map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
                <select className="border rounded px-3 py-1.5 text-sm" value={drugForm.category}
                  onChange={(e) => setDrugForm({ ...drugForm, category: e.target.value })}>
                  {['ANTIBIOTIC', 'ANALGESIC', 'ANTIMALARIA', 'ANTIHISTAMINE', 'ANTIFUNGAL', 'OTHER'].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <select className="border rounded px-3 py-1.5 text-sm" value={drugForm.scheduleClass}
                  onChange={(e) => setDrugForm({ ...drugForm, scheduleClass: e.target.value })} aria-label="OTC (Over the Counter)">
                  <option value="OTC">OTC (Over the Counter)</option>
                  {['II', 'III', 'IV', 'V'].map((s) => <option key={s} value={s}>Schedule {s}</option>)}
                </select>
              </div>
              <input className="border rounded px-3 py-1.5 text-sm w-full" placeholder="Default dispensing instructions (optional)"
                value={drugForm.defaultInstructions} onChange={(e) => setDrugForm({ ...drugForm, defaultInstructions: e.target.value })} />
              <div className="grid grid-cols-3 gap-3">
                <input className="border rounded px-3 py-1.5 text-sm" type="number" min="0" placeholder="Maximum a day (adult)" aria-label="Maximum a day"
                  value={drugForm.maxDailyDose} onChange={(e) => setDrugForm({ ...drugForm, maxDailyDose: e.target.value })} />
                <select className="border rounded px-3 py-1.5 text-sm" value={drugForm.unit} aria-label="Unit of the daily maximum" onChange={(e) => setDrugForm({ ...drugForm, unit: e.target.value })}>
                  {['mg', 'g', 'mcg'].map((u) => <option key={u} value={u}>{u}</option>)}
                </select>
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Cautions (pregnancy, conditions…)" aria-label="Cautions"
                  value={drugForm.contraindicationsText} onChange={(e) => setDrugForm({ ...drugForm, contraindicationsText: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => createDrug.mutate(drugForm)} disabled={!drugForm.genericName || createDrug.isPending}
                  className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">Save Drug</button>
                <button onClick={() => setShowDrugForm(false)} className="border px-4 py-1.5 rounded text-sm">Cancel</button>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Generic Name</th>
                  <th className="text-left px-4 py-2">Brand</th>
                  <th className="text-left px-4 py-2">Strength</th>
                  <th className="text-left px-4 py-2">Form</th>
                  <th className="text-left px-4 py-2">Category</th>
                  <th className="text-left px-4 py-2">Schedule</th>
                  <th className="text-left px-4 py-2">Max a day</th>
                  <th className="text-left px-4 py-2">Instructions</th>
                  <th className="px-4 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {drugs.map((drug: any) => (
                  <tr key={drug.id} className="border-t hover:bg-gray-50">
                    {editDrug?.id === drug.id ? (
                      <>
                        <td className="px-4 py-2">
                          <input className="border rounded px-2 py-1 text-xs w-32" value={editDrug.genericName}
                            onChange={(e) => setEditDrug({ ...editDrug, genericName: e.target.value })} />
                        </td>
                        <td className="px-4 py-2">
                          <input className="border rounded px-2 py-1 text-xs w-28" value={editDrug.brandName ?? ''}
                            onChange={(e) => setEditDrug({ ...editDrug, brandName: e.target.value })} />
                        </td>
                        <td className="px-4 py-2">
                          <input className="border rounded px-2 py-1 text-xs w-20" value={editDrug.strength ?? ''}
                            onChange={(e) => setEditDrug({ ...editDrug, strength: e.target.value })} />
                        </td>
                        <td className="px-4 py-2">
                          <select className="border rounded px-2 py-1 text-xs" value={editDrug.dosageForm ?? 'OTHER'}
                            onChange={(e) => setEditDrug({ ...editDrug, dosageForm: e.target.value })}>
                            {['TABLET', 'CAPSULE', 'SYRUP', 'INJECTION', 'CREAM', 'DROPS', 'OTHER'].map((f) => <option key={f} value={f}>{f}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select className="border rounded px-2 py-1 text-xs" value={editDrug.category ?? 'OTHER'}
                            onChange={(e) => setEditDrug({ ...editDrug, category: e.target.value })}>
                            {['ANTIBIOTIC', 'ANALGESIC', 'ANTIMALARIA', 'ANTIHISTAMINE', 'ANTIFUNGAL', 'OTHER'].map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <select className="border rounded px-2 py-1 text-xs" value={editDrug.scheduleClass ?? 'OTC'}
                            onChange={(e) => setEditDrug({ ...editDrug, scheduleClass: e.target.value })} aria-label="OTC">
                            <option value="OTC">OTC</option>
                            {['II', 'III', 'IV', 'V'].map((s) => <option key={s} value={s}>Sch {s}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <input className="border rounded px-2 py-1 text-xs w-20" type="number" min="0" aria-label="Maximum a day" value={editDrug.maxDailyDose ?? ''}
                              onChange={(e) => setEditDrug({ ...editDrug, maxDailyDose: e.target.value })} />
                            <select className="border rounded px-1 py-1 text-xs" aria-label="Unit" value={editDrug.unit ?? 'mg'} onChange={(e) => setEditDrug({ ...editDrug, unit: e.target.value })}>
                              {['mg', 'g', 'mcg'].map((u) => <option key={u} value={u}>{u}</option>)}
                            </select>
                          </div>
                          <input className="mt-1 border rounded px-2 py-1 text-xs w-full" placeholder="Cautions" aria-label="Cautions" value={editDrug.contraindicationsText ?? ''}
                            onChange={(e) => setEditDrug({ ...editDrug, contraindicationsText: e.target.value })} />
                        </td>
                        <td className="px-4 py-2">
                          <input className="border rounded px-2 py-1 text-xs w-40" value={editDrug.defaultInstructions ?? ''}
                            onChange={(e) => setEditDrug({ ...editDrug, defaultInstructions: e.target.value })} />
                        </td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <button onClick={() => updateDrug.mutate(editDrug)} disabled={updateDrug.isPending}
                              className="text-green-600 hover:text-green-800" aria-label="Confirm"><Check className="w-4 h-4" /></button>
                            <button onClick={() => setEditDrug(null)} className="text-gray-400 hover:text-gray-600" aria-label="Close"><X className="w-4 h-4" /></button>
                          </div>
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-4 py-2 font-medium">{drug.genericName}</td>
                        <td className="px-4 py-2 text-gray-600">{drug.brandName ?? '—'}</td>
                        <td className="px-4 py-2 text-gray-600">{drug.strength ?? '—'}</td>
                        <td className="px-4 py-2">
                          <span className="bg-blue-50 text-blue-700 px-1.5 py-0.5 rounded text-xs">{drug.dosageForm ?? '—'}</span>
                        </td>
                        <td className="px-4 py-2 text-gray-600 text-xs">{drug.category ?? '—'}</td>
                        <td className="px-4 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${drug.scheduleClass === 'OTC' ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                            {drug.scheduleClass === 'OTC' ? 'OTC' : `Sch ${drug.scheduleClass}`}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-xs text-gray-700" title={drug.contraindicationsText ?? undefined}>
                          {drug.maxDailyDose ? `${drug.maxDailyDose} ${drug.unit ?? 'mg'}` : '—'}
                          {drug.contraindicationsText && <span className="block max-w-[10rem] truncate text-gray-400">{drug.contraindicationsText}</span>}
                        </td>
                        <td className="px-4 py-2 text-gray-500 text-xs max-w-xs truncate">{drug.defaultInstructions ?? '—'}</td>
                        <td className="px-4 py-2">
                          <div className="flex gap-1">
                            <button onClick={() => setEditDrug({ ...drug })} className="text-blue-500 hover:text-blue-700" aria-label="Edit">
                              <Pencil className="w-4 h-4" />
                            </button>
                            <button onClick={() => deleteDrug.mutate(drug.id)} className="text-red-500 hover:text-red-700" aria-label="Delete">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
                {drugs.length === 0 && (
                  <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No drugs on the list{drugSearch ? ` matching "${drugSearch}"` : '. Add drugs to get started.'}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Drug Interactions ── */}
      {tab === 'interactions' && (
        <div className="space-y-4">
          {/* Add form */}
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Add Drug Interaction</h3>
            <div className="grid grid-cols-2 gap-3">
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Drug 1 name" value={intForm.drug1Name} onChange={(e) => setIntForm({ ...intForm, drug1Name: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Drug 2 name" value={intForm.drug2Name} onChange={(e) => setIntForm({ ...intForm, drug2Name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <select className="border rounded px-3 py-1.5 text-sm" value={intForm.severity} onChange={(e) => setIntForm({ ...intForm, severity: e.target.value })} aria-label="Mild">
                <option value="MILD">Mild</option>
                <option value="MODERATE">Moderate</option>
                <option value="SEVERE">Severe</option>
                <option value="CONTRAINDICATED">Contraindicated</option>
              </select>
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Description / clinical note" value={intForm.description} onChange={(e) => setIntForm({ ...intForm, description: e.target.value })} />
            </div>
            <button
              onClick={() => createInt.mutate({ ...intForm, businessId })}
              disabled={!intForm.drug1Name || !intForm.drug2Name || !intForm.description || createInt.isPending}
              className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50"
            >
              <Plus className="w-4 h-4 inline mr-1" />Add Interaction
            </button>
          </div>

          {/* Table */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Drug 1</th>
                  <th className="text-left px-4 py-2">Drug 2</th>
                  <th className="text-left px-4 py-2">Severity</th>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {interactions.map((it: any) => (
                  <tr key={it.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{it.drug1Name}</td>
                    <td className="px-4 py-2 font-medium">{it.drug2Name}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${SEV_COLOR[it.severity] ?? ''}`}>{it.severity}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-600 max-w-xs truncate">{it.description}</td>
                    <td className="px-4 py-2">
                      <button onClick={() => deleteInt.mutate(it.id)} className="text-red-500 hover:text-red-700" aria-label="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
                {interactions.length === 0 && (
                  <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No interactions recorded</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Refill Queue ── */}
      {tab === 'refill-queue' && (
        <div className="space-y-3">
          <p className="text-sm text-gray-500">Prescriptions with remaining refills that are due or overdue today.</p>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Rx #</th>
                  <th className="text-left px-4 py-2">Patient</th>
                  <th className="text-left px-4 py-2">Doctor</th>
                  <th className="text-left px-4 py-2">Refills Left</th>
                  <th className="text-left px-4 py-2">Next Fill Due</th>
                  <th className="px-4 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {refillQueue.map((rx: any) => (
                  <tr key={rx.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-mono text-xs">{rx.prescriptionNumber}</td>
                    <td className="px-4 py-2 font-medium">{rx.patientName}</td>
                    <td className="px-4 py-2 text-gray-600">{rx.doctorName}</td>
                    <td className="px-4 py-2">
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">
                        {Math.max(0, rx.refillsAllowed + 1 - rx.refillsUsed)} remaining
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-600">
                      {rx.nextFillDate ? new Date(rx.nextFillDate).toLocaleDateString() : '—'}
                    </td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => setRefilling(rx)}
                        className="bg-green-600 text-white px-3 py-1 rounded text-xs font-medium"
                      >
                        <RefreshCw className="w-3 h-3 inline mr-1" />Process Refill
                      </button>
                    </td>
                  </tr>
                ))}
                {refillQueue.length === 0 && (
                  <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No refills due</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Controlled Substance Log ── */}
      {tab === 'controlled-log' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={logStart} onChange={(e) => setLogStart(e.target.value)} placeholder="From" aria-label="Date" />
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={logEnd} onChange={(e) => setLogEnd(e.target.value)} placeholder="To" aria-label="Start date" />
            <button onClick={() => void refetchLog()} className="bg-gray-100 px-3 py-1.5 rounded text-sm">Filter</button>
            <button onClick={() => setShowLogForm(true)} className="ml-auto bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium">
              <Plus className="w-4 h-4 inline mr-1" />Log Dispensing
            </button>
          </div>

          {showLogForm && (
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-sm">Log Controlled Substance Dispensing</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Drug / item name" value={logForm.itemName} onChange={(e) => setLogForm({ ...logForm, itemName: e.target.value })} />
                <select className="border rounded px-3 py-1.5 text-sm" value={logForm.scheduleClass} onChange={(e) => setLogForm({ ...logForm, scheduleClass: e.target.value })} aria-label="Schedule {s}">
                  {['II', 'III', 'IV', 'V'].map((s) => <option key={s} value={s}>Schedule {s}</option>)}
                </select>
                <div className="flex gap-2">
                  <input className="border rounded px-3 py-1.5 text-sm w-24" type="number" placeholder="Qty" value={logForm.quantityDispensed} onChange={(e) => setLogForm({ ...logForm, quantityDispensed: e.target.value })} />
                  <input className="border rounded px-3 py-1.5 text-sm flex-1" placeholder="Unit (tablets, ml...)" value={logForm.unit} onChange={(e) => setLogForm({ ...logForm, unit: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Patient name" value={logForm.patientName} onChange={(e) => setLogForm({ ...logForm, patientName: e.target.value })} />
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Patient ID / National ID" value={logForm.patientIdNumber} onChange={(e) => setLogForm({ ...logForm, patientIdNumber: e.target.value })} />
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Dispensed by" value={logForm.dispensedBy} onChange={(e) => setLogForm({ ...logForm, dispensedBy: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Prescriber name" value={logForm.prescriberName} onChange={(e) => setLogForm({ ...logForm, prescriberName: e.target.value })} />
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Prescriber license #" value={logForm.prescriberLicense} onChange={(e) => setLogForm({ ...logForm, prescriberLicense: e.target.value })} />
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Notes (optional)" value={logForm.notes} onChange={(e) => setLogForm({ ...logForm, notes: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => addLog.mutate({ ...logForm, quantityDispensed: parseFloat(logForm.quantityDispensed) || 0 })}
                  disabled={!logForm.itemName || !logForm.patientName || !logForm.prescriberName || addLog.isPending}
                  className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                >
                  Save Entry
                </button>
                <button onClick={() => setShowLogForm(false)} className="px-4 py-1.5 rounded text-sm border">Cancel</button>
              </div>
            </div>
          )}

          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Date/Time</th>
                  <th className="text-left px-4 py-2">Drug</th>
                  <th className="text-left px-4 py-2">Schedule</th>
                  <th className="text-left px-4 py-2">Qty</th>
                  <th className="text-left px-4 py-2">Patient</th>
                  <th className="text-left px-4 py-2">Prescriber</th>
                  <th className="text-left px-4 py-2">Dispensed By</th>
                </tr>
              </thead>
              <tbody>
                {controlledLog.map((entry: any) => (
                  <tr key={entry.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-600 text-xs">{new Date(entry.dispensedAt).toLocaleString()}</td>
                    <td className="px-4 py-2 font-medium">{entry.itemName}</td>
                    <td className="px-4 py-2"><span className="bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full text-xs">Schedule {entry.scheduleClass}</span></td>
                    <td className="px-4 py-2">{entry.quantityDispensed} {entry.unit}</td>
                    <td className="px-4 py-2">{entry.patientName}{entry.patientIdNumber ? <span className="text-gray-400 ml-1 text-xs">({entry.patientIdNumber})</span> : ''}</td>
                    <td className="px-4 py-2 text-gray-600">{entry.prescriberName}</td>
                    <td className="px-4 py-2 text-gray-600">{entry.dispensedBy}</td>
                  </tr>
                ))}
                {controlledLog.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No entries found</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── Insurance Providers ── */}
      {tab === 'providers' && (
        <div className="space-y-4">
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Add Insurance Provider</h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Provider name" value={provForm.name} onChange={(e) => setProvForm({ ...provForm, name: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Code (e.g. NHIF)" value={provForm.code} onChange={(e) => setProvForm({ ...provForm, code: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Contact phone" value={provForm.contactPhone} onChange={(e) => setProvForm({ ...provForm, contactPhone: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Contact email" value={provForm.contactEmail} onChange={(e) => setProvForm({ ...provForm, contactEmail: e.target.value })} />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <select className="border rounded px-3 py-1.5 text-sm" value={provForm.kind} onChange={(e) => setProvForm({ ...provForm, kind: e.target.value })} aria-label="Type of insurer">
                <option value="PRIVATE">Private insurer</option>
                <option value="SHA">SHA (Social Health Authority)</option>
                <option value="CORPORATE">Corporate scheme</option>
                <option value="OTHER">Other</option>
              </select>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={provForm.requiresEligibility} onChange={(e) => setProvForm({ ...provForm, requiresEligibility: e.target.checked })} />
                Confirm cover before billing this insurer
              </label>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => createProv.mutate(provForm)}
                disabled={!provForm.name || !provForm.code || createProv.isPending}
                className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50"
              >
                <Plus className="w-4 h-4 inline mr-1" />Add Provider
              </button>
              {!providers.some((p: any) => p.kind === 'SHA') && (
                <button
                  onClick={() => createProv.mutate({ name: 'Social Health Authority', code: 'SHA', contactPhone: '', contactEmail: '', kind: 'SHA', requiresEligibility: true })}
                  disabled={createProv.isPending}
                  className="border border-blue-600 text-blue-700 px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50"
                >
                  Add Social Health Authority (SHA)
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {providers.map((p: any) => (
              <div key={p.id} className={`bg-white border rounded-lg p-4 ${!p.isActive ? 'opacity-50' : ''}`}>
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold">{p.name}</p>
                    <p className="text-xs text-gray-500 font-mono">{p.code}{p.kind && p.kind !== 'PRIVATE' ? ` · ${p.kind}` : ''}</p>
                    {p.contactPhone && <p className="text-sm text-gray-600 mt-1">{p.contactPhone}</p>}
                    {p.contactEmail && <p className="text-sm text-gray-500">{p.contactEmail}</p>}
                  </div>
                  {['OWNER', 'ADMIN', 'MANAGER'].includes(String(user?.role)) && <button onClick={() => setTariffOf({ id: p.id, name: p.name })} className="mr-2 text-xs px-2 py-1 rounded-full font-medium border border-blue-200 text-blue-700 hover:bg-blue-50">Prices</button>}
                  <button
                    onClick={() => toggleProv.mutate({ id: p.id, isActive: !p.isActive })}
                    className={`text-xs px-2 py-1 rounded-full font-medium ${p.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}
                  >
                    {p.isActive ? 'Active' : 'Inactive'}
                  </button>
                </div>
              </div>
            ))}
            {providers.length === 0 && <p className="text-gray-400 text-sm col-span-3 text-center py-8">No providers added</p>}
          </div>
        </div>
      )}

      {/* ── Insurance Claims: moved to its own page ── */}
      {tab === 'claims' && (
        <div className="rounded-lg border bg-white p-6 text-sm">
          <p className="mb-3 text-gray-700">Claims now have their own page, with what each insurer owes, how long it has been owed, and what is holding each claim back.</p>
          <Link to="/claims" className="inline-flex rounded bg-blue-600 px-4 py-1.5 font-medium text-white">Open Insurance Claims</Link>
        </div>
      )}

      {/* ── Drug Labels Tab ── */}
      {tab === 'labels' && (
        <DrugLabelsTab drugs={drugs} businessName={user?.businessId ?? 'Pharmacy'} />
      )}

      {tariffOf && <TariffModal provider={tariffOf} onClose={() => setTariffOf(null)} />}
      {refilling && <DispenseModal rx={refilling} mode="refill" onClose={() => setRefilling(null)} />}
    </div>
  );
}

// ─── Drug Labels Tab ──────────────────────────────────────────────────────────

function DrugLabelsTab({ drugs, businessName }: { drugs: any[]; businessName: string }) {
  const [selected, setSelected] = useState<any | null>(null);
  const [copies, setCopies] = useState(1);
  const [customPatient, setCustomPatient] = useState('');
  const [customDose, setCustomDose] = useState('');
  const [customQty, setCustomQty] = useState('');
  const [search, setSearch] = useState('');

  const filtered = drugs.filter((d) =>
    d.genericName?.toLowerCase().includes(search.toLowerCase()) ||
    d.brandName?.toLowerCase().includes(search.toLowerCase()),
  );

  const handlePrint = () => {
    if (!selected) return;
    const labelName = [
      selected.brandName ?? selected.genericName,
      selected.strength,
      selected.dosageForm,
    ].filter(Boolean).join(' ');

    // Print the barcode/item label
    void printBarcodeLabel({
      itemName: labelName,
      barcode: selected.barcode ?? selected.id.slice(0, 12).toUpperCase(),
      priceCents: selected.sellingPriceCents ?? 0,
      businessName,
      sku: selected.sku ?? selected.scheduleClass,
    });

    // Also open a dispensing label popup
    const html = buildDispensingLabelHTML({
      drugName: labelName,
      patient: customPatient,
      dose: customDose || selected.defaultInstructions || '',
      qty: customQty,
      businessName,
      dispensedDate: new Date().toLocaleDateString('en-KE'),
      scheduleClass: selected.scheduleClass,
    });
    printHtml(html, 400);
  };

  return (
    <div className="space-y-4 max-w-2xl">
      <div className="bg-white rounded-xl border p-5 space-y-4">
        <h3 className="font-semibold text-gray-800">Print Drug / Dispensing Label</h3>
        <input
          type="text" placeholder="Search drug..."
          value={search} onChange={(e) => setSearch(e.target.value)}
          className="w-full border rounded-lg px-3 py-2 text-sm"
        />
        <div className="max-h-48 overflow-y-auto border rounded-lg divide-y">
          {filtered.slice(0, 30).map((d) => (
            <button
              key={d.id}
              onClick={() => setSelected(d)}
              className={`w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors ${
                selected?.id === d.id ? 'bg-blue-50 font-semibold text-blue-700' : 'text-gray-800'
              }`}
            >
              <span className="font-medium">{d.brandName ?? d.genericName}</span>
              {d.strength && <span className="ml-2 text-gray-500">{d.strength}</span>}
              {d.dosageForm && <span className="ml-2 text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{d.dosageForm}</span>}
              {d.scheduleClass && d.scheduleClass !== 'OTC' && (
                <span className="ml-2 text-xs bg-red-100 text-red-700 px-1.5 py-0.5 rounded">{d.scheduleClass}</span>
              )}
            </button>
          ))}
          {filtered.length === 0 && <p className="px-4 py-6 text-center text-gray-400 text-sm">No drugs found</p>}
        </div>

        {selected && (
          <div className="border rounded-xl p-4 bg-gray-50 space-y-3">
            <p className="font-semibold text-gray-800">
              {selected.brandName ?? selected.genericName} {selected.strength}
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Patient Name</label>
                <input
                  type="text" value={customPatient}
                  onChange={(e) => setCustomPatient(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Qty Dispensed</label>
                <input
                  type="text" value={customQty}
                  onChange={(e) => setCustomQty(e.target.value)}
                  placeholder="e.g. 30 tablets"
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div className="col-span-2">
                <label className="block text-xs font-medium text-gray-600 mb-1">Dosage Instructions</label>
                <input
                  type="text" value={customDose}
                  onChange={(e) => setCustomDose(e.target.value)}
                  placeholder={selected.defaultInstructions || 'e.g. Take 1 tablet twice daily after meals'}
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Copies</label>
                <input
                  type="number" min={1} max={10} value={copies}
                  onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))}
                  className="w-24 border rounded-lg px-3 py-2 text-sm"
                />
              </div>
            </div>
            <button
              onClick={handlePrint}
              className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold hover:bg-blue-700"
            >
              <Tag className="w-4 h-4" /> Print Label
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function buildDispensingLabelHTML(opts: {
  drugName: string; patient: string; dose: string; qty: string;
  businessName: string; dispensedDate: string; scheduleClass?: string;
}): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Drug Label</title>
<style>
  @media print { @page { margin:0; size:100mm 50mm; } body { margin:0; } }
  body { font-family: Arial, sans-serif; font-size: 9pt; width:100mm; padding:3mm; box-sizing:border-box; }
  .header { display:flex; justify-content:space-between; align-items:center; border-bottom:1px solid #000; padding-bottom:2mm; margin-bottom:2mm; }
  .biz { font-weight:bold; font-size:10pt; }
  .date { font-size:7pt; color:#555; }
  .drug { font-weight:bold; font-size:11pt; margin-bottom:1mm; }
  .row { display:flex; justify-content:space-between; font-size:8pt; margin-bottom:0.5mm; }
  .schedule { display:inline-block; background:#fee2e2; color:#991b1b; font-size:7pt; font-weight:bold; padding:1px 4px; border-radius:3px; }
  .dose { font-size:8pt; color:#531BB8; font-style:italic; margin-top:1mm; }
</style></head><body>
<div class="header"><span class="biz">${opts.businessName}</span><span class="date">${opts.dispensedDate}</span></div>
<div class="drug">${opts.drugName}${opts.scheduleClass && opts.scheduleClass !== 'OTC' ? ` <span class="schedule">${opts.scheduleClass}</span>` : ''}</div>
${opts.patient ? `<div class="row"><span>Patient:</span><span><b>${opts.patient}</b></span></div>` : ''}
${opts.qty ? `<div class="row"><span>Qty:</span><span>${opts.qty}</span></div>` : ''}
${opts.dose ? `<div class="dose">Sig: ${opts.dose}</div>` : ''}
</body></html>`;
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { Plus, Pill, CheckCircle, XCircle, Clock, Search, Printer } from 'lucide-react';

interface RxItem {
  itemId?: string;
  name: string;
  qty: number;
  instructions?: string;
}

interface Prescription {
  id: string;
  prescriptionNumber: string;
  patientName: string;
  patientPhone?: string;
  patientDOB?: string;
  doctorName: string;
  doctorLicense?: string;
  diagnosis?: string;
  items: string; // JSON
  status: string;
  notes?: string;
  dispensedAt?: string;
  dispensedBy?: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  DISPENSED: 'bg-green-100 text-green-700',
  PARTIAL: 'bg-blue-100 text-blue-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Clock className="w-3.5 h-3.5" />,
  DISPENSED: <CheckCircle className="w-3.5 h-3.5" />,
  CANCELLED: <XCircle className="w-3.5 h-3.5" />,
};

export default function PrescriptionsPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId;
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('ALL');
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [selected, setSelected] = useState<Prescription | null>(null);

  const [form, setForm] = useState({
    patientName: '',
    patientPhone: '',
    patientDOB: '',
    doctorName: '',
    doctorLicense: '',
    diagnosis: '',
    notes: '',
    items: [{ name: '', qty: 1, instructions: '' }] as RxItem[],
  });

  const { data: prescriptions = [] } = useQuery<Prescription[]>({
    queryKey: ['prescriptions', businessId, storeId, statusFilter],
    queryFn: () => api.get(`/prescriptions?businessId=${businessId}&storeId=${storeId}&status=${statusFilter}`),
    enabled: !!businessId && !!storeId,
    refetchInterval: 30000,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/prescriptions', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['prescriptions'] });
      setShowCreate(false);
      resetForm();
    },
  });

  const dispenseMutation = useMutation({
    mutationFn: ({ id, dispensedBy }: { id: string; dispensedBy: string }) =>
      api.patch(`/prescriptions/${id}/dispense`, { dispensedBy }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['prescriptions'] }); setSelected(null); },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/prescriptions/${id}/cancel`, {}),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['prescriptions'] }); setSelected(null); },
  });

  const resetForm = () => setForm({
    patientName: '', patientPhone: '', patientDOB: '', doctorName: '',
    doctorLicense: '', diagnosis: '', notes: '',
    items: [{ name: '', qty: 1, instructions: '' }],
  });

  const filtered = prescriptions.filter((rx) =>
    search
      ? rx.patientName.toLowerCase().includes(search.toLowerCase()) ||
        rx.prescriptionNumber.toLowerCase().includes(search.toLowerCase()) ||
        rx.doctorName.toLowerCase().includes(search.toLowerCase())
      : true
  );

  const counts = {
    ALL: prescriptions.length,
    PENDING: prescriptions.filter((r) => r.status === 'PENDING').length,
    DISPENSED: prescriptions.filter((r) => r.status === 'DISPENSED').length,
    CANCELLED: prescriptions.filter((r) => r.status === 'CANCELLED').length,
  };

  const handleDispense = (rx: Prescription) => {
    dispenseMutation.mutate({ id: rx.id, dispensedBy: user?.name ?? 'Staff' });
  };

  const handlePrintDispense = (rx: Prescription) => {
    const items: RxItem[] = JSON.parse(rx.items || '[]');
    const win = window.open('', '_blank', 'width=400,height=600');
    if (!win) return;
    win.document.write(`<html><head><title>Prescription ${rx.prescriptionNumber}</title>
    <style>body{font-family:monospace;font-size:12px;padding:8px}h2{text-align:center}table{width:100%}td{padding:2px 4px}</style>
    </head><body>
    <h2>PRESCRIPTION</h2>
    <p><b>${rx.prescriptionNumber}</b> &mdash; ${new Date(rx.createdAt).toLocaleDateString()}</p>
    <hr/><p><b>Patient:</b> ${rx.patientName}${rx.patientPhone ? ` | ${rx.patientPhone}` : ''}</p>
    <p><b>Doctor:</b> ${rx.doctorName}${rx.doctorLicense ? ` (${rx.doctorLicense})` : ''}</p>
    ${rx.diagnosis ? `<p><b>Diagnosis:</b> ${rx.diagnosis}</p>` : ''}
    <hr/><b>Items:</b><table>${items.map((i) => `<tr><td>${i.name}</td><td>x${i.qty}</td><td>${i.instructions ?? ''}</td></tr>`).join('')}</table>
    ${rx.notes ? `<hr/><p><i>${rx.notes}</i></p>` : ''}
    </body></html>`);
    win.document.close();
    win.print();
    win.close();
  };

  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER' || user?.role === 'CASHIER';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Pill className="w-5 h-5 text-blue-600" /> Prescription Queue
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{counts.PENDING} pending</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Prescription
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)}
            placeholder="Search patient, RX number, doctor…"
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-800 dark:border-gray-600 dark:text-white" />
        </div>
        <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
          {(['ALL', 'PENDING', 'DISPENSED', 'CANCELLED'] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${statusFilter === s ? 'bg-white dark:bg-gray-700 shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
              {s} <span className="ml-1 opacity-60">({counts[s] ?? 0})</span>
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="space-y-2">
        {filtered.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-12 text-center text-gray-400">
            <Pill className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No prescriptions {statusFilter !== 'ALL' ? `with status ${statusFilter}` : 'found'}</p>
          </div>
        )}
        {filtered.map((rx) => {
          const items: RxItem[] = (() => { try { return JSON.parse(rx.items); } catch { return []; } })();
          return (
            <div key={rx.id} onClick={() => setSelected(rx)}
              className="bg-white dark:bg-gray-800 rounded-xl shadow p-4 cursor-pointer hover:shadow-md transition-shadow flex items-center justify-between gap-4">
              <div className="flex items-start gap-4 flex-1 min-w-0">
                <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                  <Pill className="w-5 h-5 text-blue-600" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-sm font-semibold text-blue-700 dark:text-blue-400">{rx.prescriptionNumber}</span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[rx.status] ?? ''}`}>
                      {STATUS_ICONS[rx.status]} {rx.status}
                    </span>
                  </div>
                  <p className="font-medium text-gray-900 dark:text-white mt-0.5">{rx.patientName}</p>
                  <p className="text-sm text-gray-500">Dr. {rx.doctorName}{rx.diagnosis ? ` · ${rx.diagnosis}` : ''}</p>
                </div>
              </div>
              <div className="text-right flex-shrink-0">
                <p className="text-sm font-medium text-gray-700 dark:text-gray-300">{items.length} item{items.length !== 1 ? 's' : ''}</p>
                <p className="text-xs text-gray-400 mt-0.5">{new Date(rx.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Detail Modal */}
      {selected && (() => {
        const items: RxItem[] = (() => { try { return JSON.parse(selected.items); } catch { return []; } })();
        return (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl">
              <div className="p-6 border-b dark:border-gray-700 flex items-center justify-between">
                <div>
                  <p className="font-mono text-sm text-blue-600">{selected.prescriptionNumber}</p>
                  <h2 className="text-lg font-bold text-gray-900 dark:text-white mt-0.5">{selected.patientName}</h2>
                </div>
                <span className={`px-3 py-1 rounded-full text-sm font-medium ${STATUS_COLORS[selected.status] ?? ''}`}>{selected.status}</span>
              </div>
              <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selected.patientPhone && <div><span className="text-gray-500">Phone:</span> <span className="font-medium">{selected.patientPhone}</span></div>}
                  {selected.patientDOB && <div><span className="text-gray-500">DOB:</span> <span className="font-medium">{selected.patientDOB}</span></div>}
                  <div><span className="text-gray-500">Doctor:</span> <span className="font-medium">Dr. {selected.doctorName}</span></div>
                  {selected.doctorLicense && <div><span className="text-gray-500">License:</span> <span className="font-medium">{selected.doctorLicense}</span></div>}
                  {selected.diagnosis && <div className="col-span-2"><span className="text-gray-500">Diagnosis:</span> <span className="font-medium">{selected.diagnosis}</span></div>}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Prescription Items:</p>
                  <div className="space-y-1.5">
                    {items.map((item, i) => (
                      <div key={i} className="flex items-start gap-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg p-2.5">
                        <div className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center flex-shrink-0">{i + 1}</div>
                        <div className="flex-1 min-w-0">
                          <p className="font-medium text-sm text-gray-900 dark:text-white">{item.name} × {item.qty}</p>
                          {item.instructions && <p className="text-xs text-gray-500 italic mt-0.5">{item.instructions}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                {selected.notes && (
                  <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-3 text-sm text-amber-700 dark:text-amber-300">
                    <p className="font-medium mb-0.5">Notes</p>
                    <p>{selected.notes}</p>
                  </div>
                )}
                {selected.dispensedAt && (
                  <p className="text-xs text-gray-400">Dispensed {new Date(selected.dispensedAt).toLocaleString()} by {selected.dispensedBy}</p>
                )}
              </div>
              <div className="p-4 border-t dark:border-gray-700 flex gap-2 justify-between">
                <button onClick={() => handlePrintDispense(selected)} className="flex items-center gap-1.5 px-3 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">
                  <Printer className="w-4 h-4" /> Print
                </button>
                <div className="flex gap-2">
                  {selected.status === 'PENDING' && canManage && (
                    <>
                      <button onClick={() => cancelMutation.mutate(selected.id)} disabled={cancelMutation.isPending}
                        className="px-4 py-2 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50">
                        Cancel
                      </button>
                      <button onClick={() => handleDispense(selected)} disabled={dispenseMutation.isPending}
                        className="px-4 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium disabled:opacity-50">
                        {dispenseMutation.isPending ? 'Dispensing…' : '✓ Dispense'}
                      </button>
                    </>
                  )}
                  <button onClick={() => setSelected(null)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">
                    Close
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
            <div className="p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">New Prescription</h2>
            </div>
            <div className="p-6 overflow-y-auto space-y-5 flex-1">
              {/* Patient */}
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Patient Information</p>
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Patient Name *</label>
                    <input value={form.patientName} onChange={(e) => setForm((f) => ({ ...f, patientName: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Full name" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
                    <input value={form.patientPhone} onChange={(e) => setForm((f) => ({ ...f, patientPhone: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0712 345 678" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Date of Birth</label>
                    <input type="date" value={form.patientDOB} onChange={(e) => setForm((f) => ({ ...f, patientDOB: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                </div>
              </div>
              {/* Doctor */}
              <div>
                <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Prescribing Doctor</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Doctor Name *</label>
                    <input value={form.doctorName} onChange={(e) => setForm((f) => ({ ...f, doctorName: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Dr. John Mwangi" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">License No.</label>
                    <input value={form.doctorLicense} onChange={(e) => setForm((f) => ({ ...f, doctorLicense: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="KMB/12345" />
                  </div>
                  <div className="col-span-2">
                    <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Diagnosis</label>
                    <input value={form.diagnosis} onChange={(e) => setForm((f) => ({ ...f, diagnosis: e.target.value }))}
                      className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="e.g. Hypertension, Malaria" />
                  </div>
                </div>
              </div>
              {/* Items */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-700 dark:text-gray-300">Prescription Items</p>
                  <button onClick={() => setForm((f) => ({ ...f, items: [...f.items, { name: '', qty: 1, instructions: '' }] }))}
                    className="text-xs text-blue-600 hover:underline">+ Add Item</button>
                </div>
                <div className="space-y-2">
                  {form.items.map((item, i) => (
                    <div key={i} className="grid grid-cols-12 gap-2 items-start">
                      <input value={item.name} onChange={(e) => setForm((f) => { const items = [...f.items]; items[i] = { ...items[i], name: e.target.value }; return { ...f, items }; })}
                        className="col-span-5 px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Drug name" />
                      <input type="number" min="1" value={item.qty} onChange={(e) => setForm((f) => { const items = [...f.items]; items[i] = { ...items[i], qty: Number(e.target.value) }; return { ...f, items }; })}
                        className="col-span-2 px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white text-center" placeholder="Qty" />
                      <input value={item.instructions ?? ''} onChange={(e) => setForm((f) => { const items = [...f.items]; items[i] = { ...items[i], instructions: e.target.value }; return { ...f, items }; })}
                        className="col-span-4 px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Instructions" />
                      <button onClick={() => setForm((f) => ({ ...f, items: f.items.filter((_, idx) => idx !== i) }))}
                        className="col-span-1 p-2 text-red-400 hover:text-red-600 text-lg leading-none">×</button>
                    </div>
                  ))}
                </div>
              </div>
              {/* Notes */}
              <div>
                <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
                <textarea value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} rows={2}
                  className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Additional notes…" />
              </div>
            </div>
            <div className="p-4 border-t dark:border-gray-700 flex gap-2 justify-end">
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => createMutation.mutate({ businessId, storeId, ...form })}
                disabled={!form.patientName || !form.doctorName || form.items.some((i) => !i.name) || createMutation.isPending}
                className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {createMutation.isPending ? 'Creating…' : 'Create Prescription'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { formatKES } from '@pos/shared';
import { Plus, Truck, MapPin, User, Clock, CheckCircle, XCircle, Package } from 'lucide-react';

interface DeliveryOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddress: string;
  driverId?: string;
  scheduledAt?: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  status: string;
  deliveryFeeCents: number;
  notes?: string;
  createdAt: string;
}

const STATUS_COLORS: Record<string, string> = {
  PENDING: 'bg-gray-100 text-gray-600',
  ASSIGNED: 'bg-blue-100 text-blue-700',
  IN_TRANSIT: 'bg-amber-100 text-amber-700',
  DELIVERED: 'bg-green-100 text-green-700',
  FAILED: 'bg-red-100 text-red-600',
  CANCELLED: 'bg-gray-100 text-gray-400',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  PENDING: <Clock className="w-3.5 h-3.5" />,
  ASSIGNED: <User className="w-3.5 h-3.5" />,
  IN_TRANSIT: <Truck className="w-3.5 h-3.5" />,
  DELIVERED: <CheckCircle className="w-3.5 h-3.5" />,
  FAILED: <XCircle className="w-3.5 h-3.5" />,
  CANCELLED: <XCircle className="w-3.5 h-3.5" />,
};

export default function DeliveryPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId;
  const qc = useQueryClient();
  const [tab, setTab] = useState<'PENDING' | 'ASSIGNED' | 'IN_TRANSIT' | 'DELIVERED' | 'ALL'>('PENDING');
  const [showCreate, setShowCreate] = useState(false);
  const [assignTarget, setAssignTarget] = useState<DeliveryOrder | null>(null);
  const [selectedDriver, setSelectedDriver] = useState('');

  const [form, setForm] = useState({
    customerName: '',
    customerPhone: '',
    deliveryAddress: '',
    driverId: '',
    scheduledAt: '',
    deliveryFeeCents: 0,
    notes: '',
  });

  const { data: deliveries = [] } = useQuery<DeliveryOrder[]>({
    queryKey: ['deliveries', businessId, storeId, tab],
    queryFn: () => api.get(`/delivery?businessId=${businessId}&storeId=${storeId}&status=${tab}`),
    enabled: !!businessId,
    refetchInterval: 30000,
  });

  const { data: users = [] } = useQuery<Array<{ id: string; name: string; role: string }>>({
    queryKey: ['business-users', businessId],
    queryFn: () => api.get(`/business/${businessId}/users`),
    enabled: !!businessId,
  });

  const createMutation = useMutation({
    mutationFn: (data: any) => api.post('/delivery', data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['deliveries'] }); setShowCreate(false); resetForm(); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, ...data }: any) => api.patch(`/delivery/${id}`, data),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['deliveries'] }); },
  });

  const assignMutation = useMutation({
    mutationFn: ({ id, driverId }: { id: string; driverId: string }) =>
      api.patch(`/delivery/${id}/assign`, { driverId, businessId }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['deliveries'] }); setAssignTarget(null); setSelectedDriver(''); },
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/delivery/${id}`),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['deliveries'] }); },
  });

  const resetForm = () => setForm({ customerName: '', customerPhone: '', deliveryAddress: '', driverId: '', scheduledAt: '', deliveryFeeCents: 0, notes: '' });

  const handlePrint = (d: DeliveryOrder) => {
    const win = window.open('', '_blank', 'width=400,height=500');
    if (!win) return;
    const driverName = users.find((u) => u.id === d.driverId)?.name ?? 'Unassigned';
    win.document.write(`<html><head><title>Delivery Note ${d.orderNumber}</title>
    <style>body{font-family:monospace;font-size:12px;padding:12px}h2{text-align:center}hr{margin:8px 0}</style>
    </head><body>
    <h2>DELIVERY NOTE</h2>
    <p><b>${d.orderNumber}</b></p>
    <hr/><p><b>Customer:</b> ${d.customerName}${d.customerPhone ? ` | ${d.customerPhone}` : ''}</p>
    <p><b>Address:</b> ${d.deliveryAddress}</p>
    <hr/><p><b>Driver:</b> ${driverName}</p>
    ${d.scheduledAt ? `<p><b>Scheduled:</b> ${new Date(d.scheduledAt).toLocaleString()}</p>` : ''}
    ${d.deliveryFeeCents > 0 ? `<p><b>Delivery Fee:</b> ${formatKES(d.deliveryFeeCents)}</p>` : ''}
    ${d.notes ? `<hr/><p>${d.notes}</p>` : ''}
    <hr/><p style="margin-top:24px">Received by: _____________________ Date: _________</p>
    </body></html>`);
    win.document.close();
    win.onafterprint = () => win.close();
    win.print();
  };

  const canManage = user?.role === 'OWNER' || user?.role === 'MANAGER';
  // Prefer users with DRIVER role; fall back to all staff if none are designated
  const designatedDrivers = users.filter((u) => u.role === 'DRIVER');
  const drivers = designatedDrivers.length > 0 ? designatedDrivers : users.filter((u) => u.role !== 'KITCHEN');
  const usingFallbackDrivers = designatedDrivers.length === 0;

  const TABS = [
    { id: 'PENDING', label: 'Pending' },
    { id: 'ASSIGNED', label: 'Assigned' },
    { id: 'IN_TRANSIT', label: 'In Transit' },
    { id: 'DELIVERED', label: 'Delivered' },
    { id: 'ALL', label: 'All' },
  ] as const;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
            <Truck className="w-5 h-5 text-blue-600" /> Delivery Management
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">{deliveries.length} order{deliveries.length !== 1 ? 's' : ''}</p>
        </div>
        {canManage && (
          <button onClick={() => setShowCreate(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
            <Plus className="w-4 h-4" /> New Delivery
          </button>
        )}
      </div>

      {/* Status tabs */}
      <div className="flex gap-1 bg-gray-100 dark:bg-gray-800 rounded-lg p-1 w-fit">
        {TABS.map((t) => (
          <button key={t.id} onClick={() => setTab(t.id as any)}
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${tab === t.id ? 'bg-white dark:bg-gray-700 shadow text-blue-600' : 'text-gray-500 hover:text-gray-700'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Cards */}
      <div className="space-y-3">
        {deliveries.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow p-12 text-center text-gray-400">
            <Truck className="w-10 h-10 mx-auto mb-3 opacity-30" />
            <p>No {tab !== 'ALL' ? tab.toLowerCase() : ''} deliveries</p>
          </div>
        )}
        {deliveries.map((d) => {
          const driverName = users.find((u) => u.id === d.driverId)?.name;
          return (
            <div key={d.id} className="bg-white dark:bg-gray-800 rounded-xl shadow p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3 flex-1 min-w-0">
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center flex-shrink-0">
                    <Package className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="font-mono text-sm font-semibold text-blue-700 dark:text-blue-400">{d.orderNumber}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[d.status] ?? ''}`}>
                        {STATUS_ICONS[d.status]} {d.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="font-medium text-gray-900 dark:text-white">{d.customerName}{d.customerPhone ? ` · ${d.customerPhone}` : ''}</p>
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5"><MapPin className="w-3.5 h-3.5 flex-shrink-0" /> {d.deliveryAddress}</p>
                    {driverName && <p className="text-sm text-gray-500 flex items-center gap-1"><User className="w-3.5 h-3.5" /> Driver: {driverName}</p>}
                    {d.scheduledAt && <p className="text-xs text-gray-400 mt-0.5"><Clock className="w-3 h-3 inline mr-1" />{new Date(d.scheduledAt).toLocaleString()}</p>}
                    {d.deliveryFeeCents > 0 && <p className="text-xs text-gray-400">Fee: {formatKES(d.deliveryFeeCents)}</p>}
                  </div>
                </div>
                {canManage && (
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button onClick={() => handlePrint(d)} className="px-3 py-1.5 text-xs border rounded-lg text-gray-600 hover:bg-gray-50">Print</button>
                    {d.status === 'PENDING' && (
                      <button onClick={() => { setAssignTarget(d); setSelectedDriver(d.driverId ?? ''); }}
                        className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium">Assign</button>
                    )}
                    {d.status === 'ASSIGNED' && (
                      <button onClick={() => updateMutation.mutate({ id: d.id, status: 'IN_TRANSIT' })}
                        className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium">Pick Up</button>
                    )}
                    {d.status === 'IN_TRANSIT' && (
                      <button onClick={() => updateMutation.mutate({ id: d.id, status: 'DELIVERED' })}
                        className="px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium">Deliver</button>
                    )}
                    {['PENDING', 'ASSIGNED'].includes(d.status) && (
                      <button onClick={() => { if (confirm('Cancel delivery?')) cancelMutation.mutate(d.id); }}
                        className="px-3 py-1.5 text-xs border border-red-300 text-red-600 rounded-lg hover:bg-red-50">Cancel</button>
                    )}
                  </div>
                )}
              </div>
              {d.notes && <p className="text-xs text-gray-400 italic mt-2 border-t pt-2 dark:border-gray-700">{d.notes}</p>}
            </div>
          );
        })}
      </div>

      {/* Assign Driver Modal */}
      {assignTarget && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="p-6">
              <h3 className="font-bold text-gray-900 dark:text-white mb-1">Assign Driver — {assignTarget.orderNumber}</h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">Destination: {assignTarget.deliveryAddress}</p>
              {usingFallbackDrivers && (
                <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg px-3 py-2 mb-3">
                  No users with <strong>DRIVER</strong> role found — showing all staff. To designate official drivers, set their role to "Driver" in Settings → Users.
                </p>
              )}
              <select value={selectedDriver} onChange={(e) => setSelectedDriver(e.target.value)}
                className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white mb-4">
                <option value="">Select driver…</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name} — {d.role}</option>)}
              </select>
              <div className="flex gap-2 justify-end">
                <button onClick={() => setAssignTarget(null)} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
                <button onClick={() => assignMutation.mutate({ id: assignTarget.id, driverId: selectedDriver })}
                  disabled={!selectedDriver || assignMutation.isPending}
                  className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                  {assignMutation.isPending ? 'Assigning…' : 'Assign Driver'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Create Modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-lg shadow-2xl">
            <div className="p-6 border-b dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">New Delivery Order</h2>
            </div>
            <div className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Customer Name *</label>
                  <input value={form.customerName} onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Phone</label>
                  <input value={form.customerPhone} onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Delivery Fee (KES)</label>
                  <input type="number" min="0" step="50" value={form.deliveryFeeCents / 100}
                    onChange={(e) => setForm((f) => ({ ...f, deliveryFeeCents: Math.round(Number(e.target.value) * 100) }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="0" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Delivery Address *</label>
                  <textarea value={form.deliveryAddress} onChange={(e) => setForm((f) => ({ ...f, deliveryAddress: e.target.value }))} rows={2}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Street, area, city" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Driver (optional)</label>
                  <select value={form.driverId} onChange={(e) => setForm((f) => ({ ...f, driverId: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                    <option value="">Assign later</option>
                    {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Scheduled Time</label>
                  <input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">Notes</label>
                  <input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white" placeholder="Special instructions…" />
                </div>
              </div>
            </div>
            <div className="p-4 border-t dark:border-gray-700 flex gap-2 justify-end">
              <button onClick={() => { setShowCreate(false); resetForm(); }} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
              <button onClick={() => createMutation.mutate({
                businessId, storeId,
                ...form,
                driverId: form.driverId || undefined,
                scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
              })}
                disabled={!form.customerName || !form.deliveryAddress || createMutation.isPending}
                className="px-6 py-2 text-sm bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50">
                {createMutation.isPending ? 'Creating…' : 'Create Delivery'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

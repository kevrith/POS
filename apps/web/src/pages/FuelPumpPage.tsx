import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { formatKES } from '@pos/shared';
import {
  Fuel, Plus, Zap, ZapOff, BarChart3, List, Settings,
  Droplets, Truck, Clock, Building2, ArrowDownCircle, ArrowUpCircle, Usb,
} from 'lucide-react';
import {
  connectPumpController, disconnectPumpController, isPumpControllerConnected,
  authorizePump as hwAuthorizePump, stopPump as hwStopPump,
  getPumpTransaction, isSerialAvailable,
  type PumpControllerConfig, type PumpProtocol,
} from '../lib/fuelPumpController';

type Tab = 'pumps' | 'grades' | 'tanks' | 'shifts' | 'fleet' | 'sales' | 'stats';

const STATUS_COLOR: Record<string, string> = {
  IDLE: 'bg-gray-100 text-gray-600',
  AUTHORIZED: 'bg-green-100 text-green-700',
  DISPENSING: 'bg-blue-100 text-blue-700',
  SUSPENDED: 'bg-red-100 text-red-700',
};

const PAYMENT_METHODS = ['CASH', 'MPESA', 'CARD', 'FLEET', 'CREDIT'];

export default function FuelPumpPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';
  const qc = useQueryClient();
  const [tab, setTab] = useState<Tab>('pumps');

  // ── Hardware pump controller (Web Serial) ─────────────────────────────────
  const [hwConnected, setHwConnected] = useState(isPumpControllerConnected());
  const [hwProtocol, setHwProtocol] = useState<PumpProtocol>('GILBARCO');
  const [hwConnecting, setHwConnecting] = useState(false);
  const [hwError, setHwError] = useState('');

  const hwConfig: PumpControllerConfig = { protocol: hwProtocol };

  const handleHwConnect = async () => {
    setHwConnecting(true);
    setHwError('');
    try {
      await connectPumpController(hwConfig);
      setHwConnected(true);
    } catch (err: any) {
      setHwError(err.message ?? 'Connection failed');
    } finally {
      setHwConnecting(false);
    }
  };

  const handleHwDisconnect = async () => {
    await disconnectPumpController();
    setHwConnected(false);
  };

  // After a pump is authorized via hardware, poll for transaction completion
  const handleHwAuthorize = async (pump: any) => {
    if (hwConnected) {
      try {
        await hwAuthorizePump(pump.pumpNumber, hwConfig);
      } catch { /* fall through to API */ }
    }
    authorizePump.mutate(pump.id);
  };

  const handleHwStop = async (pump: any) => {
    if (hwConnected) {
      try {
        await hwStopPump(pump.pumpNumber, hwConfig);
        // Read transaction data from controller and pre-fill the sale form
        const txn = await getPumpTransaction(pump.pumpNumber, hwConfig);
        setSaleForm({
          pumpId: pump.id,
          gradeId: pump.gradeId,
          litresDispensed: txn.litresDispensed.toFixed(3),
          vehiclePlate: '',
          paymentMethod: 'CASH',
          paymentRef: '',
          fleetAccountId: '',
        });
      } catch { /* fall through to API */ }
    }
    stopPump.mutate(pump.id);
  };

  // ── Grades ────────────────────────────────────────────────────────────────
  const { data: grades = [] } = useQuery({
    queryKey: ['fuel-grades', businessId, storeId],
    queryFn: () => api.get<any[]>(`/fuel-pump/grades?businessId=${businessId}&storeId=${storeId}`),
  });
  const [gradeForm, setGradeForm] = useState({ name: '', code: '', pricePerLitreCents: '' });
  const [editGrade, setEditGrade] = useState<any>(null);
  const createGrade = useMutation({
    mutationFn: (d: any) => api.post('/fuel-pump/grades', d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fuel-grades'] });
      setGradeForm({ name: '', code: '', pricePerLitreCents: '' });
    },
  });
  const updateGrade = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/fuel-pump/grades/${id}`, d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['fuel-grades'] }); setEditGrade(null); },
  });

  // ── Pumps ─────────────────────────────────────────────────────────────────
  const { data: pumps = [] } = useQuery({
    queryKey: ['fuel-pumps', businessId, storeId],
    queryFn: () => api.get<any[]>(`/fuel-pump/pumps?businessId=${businessId}&storeId=${storeId}`),
    refetchInterval: 10000,
  });
  const [pumpForm, setPumpForm] = useState({ pumpNumber: '', label: '', gradeId: '', nozzleCount: '1' });
  const createPump = useMutation({
    mutationFn: (d: any) => api.post('/fuel-pump/pumps', d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['fuel-pumps'] }); setPumpForm({ pumpNumber: '', label: '', gradeId: '', nozzleCount: '1' }); },
  });
  const authorizePump = useMutation({
    mutationFn: (id: string) => api.post(`/fuel-pump/pumps/${id}/authorize`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['fuel-pumps'] }),
  });
  const stopPump = useMutation({
    mutationFn: (id: string) => api.post(`/fuel-pump/pumps/${id}/stop`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['fuel-pumps'] }),
  });

  // ── Sale recording ────────────────────────────────────────────────────────
  const [saleForm, setSaleForm] = useState({
    pumpId: '', gradeId: '', litresDispensed: '', vehiclePlate: '', paymentMethod: 'CASH', paymentRef: '', fleetAccountId: '',
  });
  const recordSale = useMutation({
    mutationFn: (d: any) => api.post('/fuel-pump/sales', d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['fuel-pumps'] });
      void qc.invalidateQueries({ queryKey: ['fuel-sales'] });
      void qc.invalidateQueries({ queryKey: ['fuel-stats'] });
      setSaleForm({ pumpId: '', gradeId: '', litresDispensed: '', vehiclePlate: '', paymentMethod: 'CASH', paymentRef: '', fleetAccountId: '' });
    },
  });

  // ── Tanks ─────────────────────────────────────────────────────────────────
  const { data: tanks = [] } = useQuery({
    queryKey: ['fuel-tanks', businessId, storeId],
    queryFn: () => api.get<any[]>(`/fuel-pump/tanks?businessId=${businessId}&storeId=${storeId}`),
    enabled: tab === 'tanks',
  });
  const [tankForm, setTankForm] = useState({ tankNumber: '', label: '', gradeId: '', capacityLitres: '', minLevelLitres: '500' });
  const createTank = useMutation({
    mutationFn: (d: any) => api.post('/fuel-pump/tanks', d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['fuel-tanks'] }); setTankForm({ tankNumber: '', label: '', gradeId: '', capacityLitres: '', minLevelLitres: '500' }); },
  });
  const updateTank = useMutation({
    mutationFn: ({ id, ...d }: any) => api.patch(`/fuel-pump/tanks/${id}`, d),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['fuel-tanks'] }),
  });
  const [dippingForm, setDippingForm] = useState({ tankId: '', litres: '', recordedBy: user?.name ?? '', notes: '' });
  const recordDipping = useMutation({
    mutationFn: (d: any) => api.post('/fuel-pump/tanks/dipping', d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['fuel-tanks'] }); setDippingForm({ tankId: '', litres: '', recordedBy: user?.name ?? '', notes: '' }); },
  });
  const [deliveryForm, setDeliveryForm] = useState({ tankId: '', litresDelivered: '', supplierName: '', docketNumber: '', deliveredBy: '', notes: '' });
  const recordDelivery = useMutation({
    mutationFn: (d: any) => api.post('/fuel-pump/tanks/delivery', d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['fuel-tanks'] }); setDeliveryForm({ tankId: '', litresDelivered: '', supplierName: '', docketNumber: '', deliveredBy: '', notes: '' }); },
  });

  // ── Shifts ────────────────────────────────────────────────────────────────
  const { data: shifts = [] } = useQuery({
    queryKey: ['fuel-shifts', businessId, storeId],
    queryFn: () => api.get<any[]>(`/fuel-pump/shifts?businessId=${businessId}&storeId=${storeId}`),
    enabled: tab === 'shifts',
  });
  const { data: openShift } = useQuery({
    queryKey: ['fuel-open-shift', businessId, storeId],
    queryFn: () => api.get<any>(`/fuel-pump/shifts/open?businessId=${businessId}&storeId=${storeId}`),
    enabled: tab === 'shifts',
  });
  const [shiftOpenForm, setShiftOpenForm] = useState({ cashierName: user?.name ?? '', readings: pumps.map((p: any) => ({ pumpId: p.id, openingLitres: '' })) });
  const [closingReadings, setClosingReadings] = useState<Record<string, string>>({});
  const openShiftMut = useMutation({
    mutationFn: (d: any) => api.post('/fuel-pump/shifts/open', d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['fuel-shifts'] }); void qc.invalidateQueries({ queryKey: ['fuel-open-shift'] }); },
  });
  const closeShiftMut = useMutation({
    mutationFn: ({ id, readings }: { id: string; readings: any[] }) => api.post(`/fuel-pump/shifts/${id}/close`, { readings }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['fuel-shifts'] }); void qc.invalidateQueries({ queryKey: ['fuel-open-shift'] }); setClosingReadings({}); },
  });

  // ── Fleet ─────────────────────────────────────────────────────────────────
  const { data: fleetAccounts = [] } = useQuery({
    queryKey: ['fleet-accounts', businessId],
    queryFn: () => api.get<any[]>(`/fuel-pump/fleet?businessId=${businessId}`),
    enabled: tab === 'fleet',
  });
  const [fleetForm, setFleetForm] = useState({ companyName: '', contactName: '', contactPhone: '', contactEmail: '', creditLimitCents: '' });
  const createFleet = useMutation({
    mutationFn: (d: any) => api.post('/fuel-pump/fleet', d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['fleet-accounts'] }); setFleetForm({ companyName: '', contactName: '', contactPhone: '', contactEmail: '', creditLimitCents: '' }); },
  });
  const [selectedFleet, setSelectedFleet] = useState<any>(null);
  const { data: fleetTx = [] } = useQuery({
    queryKey: ['fleet-tx', selectedFleet?.id],
    queryFn: () => api.get<any[]>(`/fuel-pump/fleet/${selectedFleet.id}/transactions`),
    enabled: !!selectedFleet,
  });
  const [paymentForm, setPaymentForm] = useState({ amountCents: '', reference: '', description: '' });
  const recordPayment = useMutation({
    mutationFn: ({ id, ...d }: any) => api.post(`/fuel-pump/fleet/${id}/payment`, d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['fleet-accounts'] }); void qc.invalidateQueries({ queryKey: ['fleet-tx'] }); setPaymentForm({ amountCents: '', reference: '', description: '' }); },
  });

  // ── Sales list ────────────────────────────────────────────────────────────
  const [filterPump, setFilterPump] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const { data: sales = [] } = useQuery({
    queryKey: ['fuel-sales', businessId, storeId, filterPump, startDate, endDate],
    queryFn: () => {
      let url = `/fuel-pump/sales?businessId=${businessId}&storeId=${storeId}`;
      if (filterPump) url += `&pumpId=${filterPump}`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      return api.get<any[]>(url);
    },
    enabled: tab === 'sales',
  });

  // ── Stats ─────────────────────────────────────────────────────────────────
  const { data: stats } = useQuery({
    queryKey: ['fuel-stats', businessId, storeId, startDate, endDate],
    queryFn: () => {
      let url = `/fuel-pump/stats?businessId=${businessId}&storeId=${storeId}`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      return api.get<any>(url);
    },
    enabled: tab === 'stats',
  });

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'pumps', label: 'Pump Control', icon: <Fuel className="w-4 h-4" /> },
    { id: 'grades', label: 'Fuel Grades', icon: <Settings className="w-4 h-4" /> },
    { id: 'tanks', label: 'Tanks', icon: <Droplets className="w-4 h-4" /> },
    { id: 'shifts', label: 'Shifts', icon: <Clock className="w-4 h-4" /> },
    { id: 'fleet', label: 'Fleet Accounts', icon: <Building2 className="w-4 h-4" /> },
    { id: 'sales', label: 'Sales Log', icon: <List className="w-4 h-4" /> },
    { id: 'stats', label: 'Statistics', icon: <BarChart3 className="w-4 h-4" /> },
  ];

  return (
    <div className="p-6 space-y-4">
      {/* Header */}
      <div className="flex items-center gap-2">
        <Fuel className="w-6 h-6 text-orange-600" />
        <h1 className="text-2xl font-bold">Fuel Station Management</h1>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 border-b overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${
              tab === t.id ? 'border-orange-600 text-orange-600' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      {/* ── PUMP CONTROL ── */}
      {tab === 'pumps' && (
        <div className="space-y-4">
          {/* Hardware controller connection panel */}
          {isSerialAvailable() && (
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Usb className="w-4 h-4 text-gray-500" />
                  <h3 className="font-semibold text-sm">Pump Controller (Serial)</h3>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    hwConnected ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                  }`}>
                    {hwConnected ? 'Connected' : 'Not connected'}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <select
                    value={hwProtocol}
                    onChange={(e) => setHwProtocol(e.target.value as PumpProtocol)}
                    disabled={hwConnected}
                    className="border rounded px-2 py-1 text-xs disabled:opacity-50"
                  >
                    <option value="GILBARCO">Gilbarco GVR</option>
                    <option value="WAYNE">Wayne Dresser</option>
                    <option value="TOKHEIM">Tokheim</option>
                    <option value="IFSF">IFSF Generic</option>
                  </select>
                  {hwConnected ? (
                    <button
                      onClick={() => void handleHwDisconnect()}
                      className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded border border-red-200 hover:bg-red-200"
                    >
                      Disconnect
                    </button>
                  ) : (
                    <button
                      onClick={() => void handleHwConnect()}
                      disabled={hwConnecting}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                      {hwConnecting ? 'Connecting…' : 'Connect'}
                    </button>
                  )}
                </div>
              </div>
              {hwError && <p className="text-xs text-red-600">{hwError}</p>}
              {hwConnected && (
                <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                  ✓ Hardware connected — Authorize/Stop buttons now send commands directly to the {hwProtocol} controller. Litres are read automatically after dispensing.
                </p>
              )}
            </div>
          )}
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Add Pump</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Pump #" type="number"
                value={pumpForm.pumpNumber} onChange={(e) => setPumpForm({ ...pumpForm, pumpNumber: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Label (optional)"
                value={pumpForm.label} onChange={(e) => setPumpForm({ ...pumpForm, label: e.target.value })} />
              <select className="border rounded px-3 py-1.5 text-sm" value={pumpForm.gradeId}
                onChange={(e) => setPumpForm({ ...pumpForm, gradeId: e.target.value })}>
                <option value="">Select grade</option>
                {grades.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Nozzles" type="number"
                value={pumpForm.nozzleCount} onChange={(e) => setPumpForm({ ...pumpForm, nozzleCount: e.target.value })} />
            </div>
            <button
              onClick={() => createPump.mutate({ ...pumpForm, businessId, storeId, pumpNumber: parseInt(pumpForm.pumpNumber), nozzleCount: parseInt(pumpForm.nozzleCount) })}
              disabled={!pumpForm.pumpNumber || !pumpForm.gradeId || createPump.isPending}
              className="bg-orange-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
              <Plus className="w-4 h-4 inline mr-1" />Add Pump
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pumps.map((pump: any) => (
              <div key={pump.id} className="bg-white border rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-bold text-lg">Pump {pump.pumpNumber}</p>
                    {pump.label && <p className="text-sm text-gray-500">{pump.label}</p>}
                    <p className="text-sm text-gray-600 mt-1">{pump.grade?.name} — {formatKES(pump.grade?.pricePerLitreCents ?? 0)}/L</p>
                  </div>
                  <span className={`text-xs px-2 py-1 rounded-full font-medium ${STATUS_COLOR[pump.status] ?? ''}`}>
                    {pump.status}
                  </span>
                </div>
                <div className="flex gap-2">
                  {pump.status === 'IDLE' && (
                    <button onClick={() => void handleHwAuthorize(pump)} disabled={authorizePump.isPending}
                      className="flex-1 bg-green-600 text-white py-1.5 rounded text-sm font-medium flex items-center justify-center gap-1">
                      <Zap className="w-4 h-4" />Authorize
                    </button>
                  )}
                  {pump.status !== 'IDLE' && (
                    <button onClick={() => void handleHwStop(pump)} disabled={stopPump.isPending}
                      className="flex-1 bg-red-600 text-white py-1.5 rounded text-sm font-medium flex items-center justify-center gap-1">
                      <ZapOff className="w-4 h-4" />Stop
                    </button>
                  )}
                </div>
                {pump.status === 'AUTHORIZED' && (
                  <div className="border-t pt-3 space-y-2">
                    <p className="text-xs font-semibold text-gray-500 uppercase">Record Dispensing</p>
                    <div className="grid grid-cols-2 gap-2">
                      <input className="border rounded px-2 py-1 text-sm" placeholder="Litres" type="number" step="0.01"
                        value={saleForm.pumpId === pump.id ? saleForm.litresDispensed : ''}
                        onChange={(e) => setSaleForm({ ...saleForm, pumpId: pump.id, gradeId: pump.gradeId, litresDispensed: e.target.value })} />
                      <input className="border rounded px-2 py-1 text-sm" placeholder="Plate (opt)"
                        value={saleForm.pumpId === pump.id ? saleForm.vehiclePlate : ''}
                        onChange={(e) => setSaleForm({ ...saleForm, pumpId: pump.id, gradeId: pump.gradeId, vehiclePlate: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <select className="border rounded px-2 py-1 text-sm"
                        value={saleForm.pumpId === pump.id ? saleForm.paymentMethod : 'CASH'}
                        onChange={(e) => setSaleForm({ ...saleForm, pumpId: pump.id, gradeId: pump.gradeId, paymentMethod: e.target.value })}>
                        {PAYMENT_METHODS.map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      {saleForm.paymentMethod === 'FLEET' && saleForm.pumpId === pump.id ? (
                        <select className="border rounded px-2 py-1 text-sm"
                          value={saleForm.fleetAccountId}
                          onChange={(e) => setSaleForm({ ...saleForm, fleetAccountId: e.target.value })}>
                          <option value="">Select fleet account</option>
                          {fleetAccounts.map((fa: any) => <option key={fa.id} value={fa.id}>{fa.companyName}</option>)}
                        </select>
                      ) : (
                        <input className="border rounded px-2 py-1 text-sm" placeholder="Ref (opt)"
                          value={saleForm.pumpId === pump.id ? saleForm.paymentRef : ''}
                          onChange={(e) => setSaleForm({ ...saleForm, pumpId: pump.id, gradeId: pump.gradeId, paymentRef: e.target.value })} />
                      )}
                    </div>
                    {saleForm.pumpId === pump.id && saleForm.litresDispensed && (
                      <p className="text-sm font-semibold text-orange-700">
                        Total: {formatKES(Math.round(parseFloat(saleForm.litresDispensed) * (pump.grade?.pricePerLitreCents ?? 0)))}
                      </p>
                    )}
                    <button
                      onClick={() => recordSale.mutate({
                        businessId, storeId, pumpId: pump.id, gradeId: pump.gradeId,
                        cashierId: user?.id,
                        litresDispensed: parseFloat(saleForm.litresDispensed) || 0,
                        pricePerLitreCents: pump.grade?.pricePerLitreCents ?? 0,
                        vehiclePlate: saleForm.vehiclePlate || undefined,
                        paymentMethod: saleForm.paymentMethod,
                        paymentRef: saleForm.paymentRef || undefined,
                        fleetAccountId: saleForm.fleetAccountId || undefined,
                      })}
                      disabled={!saleForm.litresDispensed || saleForm.pumpId !== pump.id || recordSale.isPending}
                      className="w-full bg-orange-600 text-white py-1.5 rounded text-sm font-medium disabled:opacity-50">
                      Complete Sale
                    </button>
                  </div>
                )}
              </div>
            ))}
            {pumps.length === 0 && (
              <p className="text-gray-400 text-sm col-span-3 text-center py-12">No pumps configured. Add a fuel grade first, then add pumps.</p>
            )}
          </div>
        </div>
      )}

      {/* ── FUEL GRADES ── */}
      {tab === 'grades' && (
        <div className="space-y-4">
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Add Fuel Grade</h3>
            <div className="grid grid-cols-3 gap-3">
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Name (e.g. Petrol 91)"
                value={gradeForm.name} onChange={(e) => setGradeForm({ ...gradeForm, name: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Code (e.g. P91)"
                value={gradeForm.code} onChange={(e) => setGradeForm({ ...gradeForm, code: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Price per litre (KES cents)" type="number"
                value={gradeForm.pricePerLitreCents} onChange={(e) => setGradeForm({ ...gradeForm, pricePerLitreCents: e.target.value })} />
            </div>
            <button
              onClick={() => createGrade.mutate({ ...gradeForm, businessId, storeId, pricePerLitreCents: parseInt(gradeForm.pricePerLitreCents) })}
              disabled={!gradeForm.name || !gradeForm.code || !gradeForm.pricePerLitreCents || createGrade.isPending}
              className="bg-orange-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
              <Plus className="w-4 h-4 inline mr-1" />Add Grade
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {grades.map((g: any) => (
              <div key={g.id} className={`bg-white border rounded-lg p-4 ${!g.isActive ? 'opacity-50' : ''}`}>
                {editGrade?.id === g.id ? (
                  <div className="space-y-2">
                    <input className="border rounded px-3 py-1.5 text-sm w-full" placeholder="Name"
                      value={editGrade.name} onChange={(e) => setEditGrade({ ...editGrade, name: e.target.value })} />
                    <input className="border rounded px-3 py-1.5 text-sm w-full" placeholder="Price/L (cents)" type="number"
                      value={editGrade.pricePerLitreCents} onChange={(e) => setEditGrade({ ...editGrade, pricePerLitreCents: parseInt(e.target.value) })} />
                    <div className="flex gap-2">
                      <button onClick={() => updateGrade.mutate(editGrade)} disabled={updateGrade.isPending}
                        className="flex-1 bg-orange-600 text-white py-1 rounded text-sm">Save</button>
                      <button onClick={() => setEditGrade(null)} className="flex-1 border py-1 rounded text-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{g.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{g.code}</p>
                      <p className="text-lg font-bold text-orange-600 mt-1">{formatKES(g.pricePerLitreCents)}<span className="text-sm font-normal text-gray-500">/L</span></p>
                    </div>
                    <div className="flex flex-col gap-1 items-end">
                      <button onClick={() => updateGrade.mutate({ id: g.id, isActive: !g.isActive })}
                        className={`text-xs px-2 py-1 rounded-full font-medium ${g.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {g.isActive ? 'Active' : 'Inactive'}
                      </button>
                      <button onClick={() => setEditGrade({ ...g })} className="text-xs text-blue-600 hover:underline">Edit price</button>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {grades.length === 0 && <p className="text-gray-400 text-sm col-span-3 text-center py-8">No fuel grades configured</p>}
          </div>
        </div>
      )}

      {/* ── TANKS ── */}
      {tab === 'tanks' && (
        <div className="space-y-4">
          {/* Add tank */}
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Add Storage Tank</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Tank #" type="number"
                value={tankForm.tankNumber} onChange={(e) => setTankForm({ ...tankForm, tankNumber: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Label (optional)"
                value={tankForm.label} onChange={(e) => setTankForm({ ...tankForm, label: e.target.value })} />
              <select className="border rounded px-3 py-1.5 text-sm" value={tankForm.gradeId}
                onChange={(e) => setTankForm({ ...tankForm, gradeId: e.target.value })}>
                <option value="">Select grade</option>
                {grades.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Capacity (L)" type="number"
                value={tankForm.capacityLitres} onChange={(e) => setTankForm({ ...tankForm, capacityLitres: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Min level (L)" type="number"
                value={tankForm.minLevelLitres} onChange={(e) => setTankForm({ ...tankForm, minLevelLitres: e.target.value })} />
            </div>
            <button onClick={() => createTank.mutate({
              ...tankForm, businessId, storeId,
              tankNumber: parseInt(tankForm.tankNumber),
              capacityLitres: parseFloat(tankForm.capacityLitres),
              minLevelLitres: parseFloat(tankForm.minLevelLitres),
            })} disabled={!tankForm.tankNumber || !tankForm.gradeId || !tankForm.capacityLitres || createTank.isPending}
              className="bg-orange-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
              <Plus className="w-4 h-4 inline mr-1" />Add Tank
            </button>
          </div>

          {/* Tank grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {tanks.map((tank: any) => {
              const pct = tank.capacityLitres > 0 ? (tank.currentLitres / tank.capacityLitres) * 100 : 0;
              const isLow = tank.currentLitres <= tank.minLevelLitres;
              const barColor = isLow ? 'bg-red-500' : pct < 30 ? 'bg-amber-400' : 'bg-green-500';
              return (
                <div key={tank.id} className={`bg-white border rounded-lg p-4 space-y-3 ${isLow ? 'border-red-300' : ''}`}>
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-bold">Tank {tank.tankNumber}{tank.label ? ` — ${tank.label}` : ''}</p>
                      <p className="text-xs text-gray-500">{tank.grade?.name}</p>
                    </div>
                    {isLow && <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full font-medium">LOW</span>}
                  </div>
                  {/* Level bar */}
                  <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                      <span>{tank.currentLitres.toFixed(0)} L</span>
                      <span>{tank.capacityLitres.toFixed(0)} L capacity</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-4 overflow-hidden">
                      <div className={`h-4 rounded-full transition-all ${barColor}`} style={{ width: `${Math.min(100, pct).toFixed(1)}%` }} />
                    </div>
                    <p className="text-xs text-right mt-1 text-gray-500">{pct.toFixed(1)}% full</p>
                  </div>
                  <div className="flex gap-2 pt-1 border-t">
                    <button onClick={() => setDippingForm({ ...dippingForm, tankId: tank.id })}
                      className="flex-1 text-xs bg-blue-50 text-blue-700 px-2 py-1.5 rounded border border-blue-200 hover:bg-blue-100">
                      <Droplets className="w-3 h-3 inline mr-1" />Dipping
                    </button>
                    <button onClick={() => setDeliveryForm({ ...deliveryForm, tankId: tank.id })}
                      className="flex-1 text-xs bg-green-50 text-green-700 px-2 py-1.5 rounded border border-green-200 hover:bg-green-100">
                      <Truck className="w-3 h-3 inline mr-1" />Delivery
                    </button>
                    <button onClick={() => updateTank.mutate({ id: tank.id, isActive: false })}
                      className="text-xs bg-gray-50 text-gray-600 px-2 py-1.5 rounded border hover:bg-gray-100">
                      Disable
                    </button>
                  </div>
                </div>
              );
            })}
            {tanks.length === 0 && <p className="text-gray-400 text-sm col-span-3 text-center py-12">No tanks configured</p>}
          </div>

          {/* Dipping form */}
          {dippingForm.tankId && (
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-sm">Record Dipping (Manual Level Reading) — Tank {tanks.find((t: any) => t.id === dippingForm.tankId)?.tankNumber}</h3>
              <div className="grid grid-cols-3 gap-3">
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Litres (actual reading)" type="number" step="0.1"
                  value={dippingForm.litres} onChange={(e) => setDippingForm({ ...dippingForm, litres: e.target.value })} />
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Recorded by"
                  value={dippingForm.recordedBy} onChange={(e) => setDippingForm({ ...dippingForm, recordedBy: e.target.value })} />
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Notes (optional)"
                  value={dippingForm.notes} onChange={(e) => setDippingForm({ ...dippingForm, notes: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => recordDipping.mutate({ businessId, tankId: dippingForm.tankId, litres: parseFloat(dippingForm.litres), recordedBy: dippingForm.recordedBy, notes: dippingForm.notes || undefined })}
                  disabled={!dippingForm.litres || !dippingForm.recordedBy || recordDipping.isPending}
                  className="bg-blue-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">Save Dipping</button>
                <button onClick={() => setDippingForm({ tankId: '', litres: '', recordedBy: user?.name ?? '', notes: '' })} className="border px-4 py-1.5 rounded text-sm">Cancel</button>
              </div>
            </div>
          )}

          {/* Delivery form */}
          {deliveryForm.tankId && (
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-sm">Record Fuel Delivery — Tank {tanks.find((t: any) => t.id === deliveryForm.tankId)?.tankNumber}</h3>
              <div className="grid grid-cols-3 gap-3">
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Litres delivered" type="number" step="0.1"
                  value={deliveryForm.litresDelivered} onChange={(e) => setDeliveryForm({ ...deliveryForm, litresDelivered: e.target.value })} />
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Supplier name"
                  value={deliveryForm.supplierName} onChange={(e) => setDeliveryForm({ ...deliveryForm, supplierName: e.target.value })} />
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Docket number"
                  value={deliveryForm.docketNumber} onChange={(e) => setDeliveryForm({ ...deliveryForm, docketNumber: e.target.value })} />
                <input className="border rounded px-3 py-1.5 text-sm" placeholder="Delivered by"
                  value={deliveryForm.deliveredBy} onChange={(e) => setDeliveryForm({ ...deliveryForm, deliveredBy: e.target.value })} />
                <input className="border rounded px-3 py-1.5 text-sm col-span-2" placeholder="Notes (optional)"
                  value={deliveryForm.notes} onChange={(e) => setDeliveryForm({ ...deliveryForm, notes: e.target.value })} />
              </div>
              <div className="flex gap-2">
                <button onClick={() => recordDelivery.mutate({
                  businessId, tankId: deliveryForm.tankId,
                  litresDelivered: parseFloat(deliveryForm.litresDelivered),
                  supplierName: deliveryForm.supplierName || undefined,
                  docketNumber: deliveryForm.docketNumber || undefined,
                  deliveredBy: deliveryForm.deliveredBy || undefined,
                  notes: deliveryForm.notes || undefined,
                })} disabled={!deliveryForm.litresDelivered || recordDelivery.isPending}
                  className="bg-green-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">Save Delivery</button>
                <button onClick={() => setDeliveryForm({ tankId: '', litresDelivered: '', supplierName: '', docketNumber: '', deliveredBy: '', notes: '' })} className="border px-4 py-1.5 rounded text-sm">Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SHIFTS ── */}
      {tab === 'shifts' && (
        <div className="space-y-4">
          {/* Current open shift */}
          {openShift ? (
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-green-800">Shift OPEN — {openShift.cashierName}</p>
                  <p className="text-sm text-green-600">Opened: {new Date(openShift.openedAt).toLocaleString()}</p>
                </div>
                <span className="bg-green-100 text-green-700 px-3 py-1 rounded-full text-sm font-medium">OPEN</span>
              </div>
              {/* Closing readings */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Enter Closing Meter Readings:</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {openShift.readings.map((r: any) => {
                    const pump = pumps.find((p: any) => p.id === r.pumpId);
                    return (
                      <div key={r.id} className="space-y-1">
                        <label className="text-xs text-gray-500">Pump {pump?.pumpNumber ?? r.pumpId} (open: {r.openingLitres}L)</label>
                        <input type="number" step="0.01" className="border rounded px-2 py-1 text-sm w-full" placeholder="Closing L"
                          value={closingReadings[r.pumpId] ?? ''}
                          onChange={(e) => setClosingReadings({ ...closingReadings, [r.pumpId]: e.target.value })} />
                      </div>
                    );
                  })}
                </div>
              </div>
              <button onClick={() => closeShiftMut.mutate({
                id: openShift.id,
                readings: openShift.readings.map((r: any) => ({ pumpId: r.pumpId, closingLitres: parseFloat(closingReadings[r.pumpId] ?? '0') || 0 })),
              })} disabled={closeShiftMut.isPending}
                className="bg-red-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
                Close Shift
              </button>
            </div>
          ) : (
            <div className="bg-white border rounded-lg p-4 space-y-3">
              <h3 className="font-semibold text-sm">Open New Shift</h3>
              <div>
                <label className="block text-xs text-gray-500 mb-1">Cashier Name</label>
                <input className="border rounded px-3 py-1.5 text-sm w-full max-w-xs"
                  value={shiftOpenForm.cashierName} onChange={(e) => setShiftOpenForm({ ...shiftOpenForm, cashierName: e.target.value })} />
              </div>
              {pumps.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Opening Meter Readings:</p>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    {pumps.map((pump: any) => {
                      const idx = shiftOpenForm.readings.findIndex((r: any) => r.pumpId === pump.id);
                      const reading = idx >= 0 ? shiftOpenForm.readings[idx] : { pumpId: pump.id, openingLitres: '' };
                      return (
                        <div key={pump.id} className="space-y-1">
                          <label className="text-xs text-gray-500">Pump {pump.pumpNumber}</label>
                          <input type="number" step="0.01" className="border rounded px-2 py-1 text-sm w-full" placeholder="Opening L"
                            value={reading.openingLitres}
                            onChange={(e) => {
                              const newReadings = [...shiftOpenForm.readings];
                              if (idx >= 0) newReadings[idx] = { pumpId: pump.id, openingLitres: e.target.value };
                              else newReadings.push({ pumpId: pump.id, openingLitres: e.target.value });
                              setShiftOpenForm({ ...shiftOpenForm, readings: newReadings });
                            }} />
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
              <button onClick={() => openShiftMut.mutate({
                businessId, storeId, cashierId: user?.id, cashierName: shiftOpenForm.cashierName,
                readings: shiftOpenForm.readings.filter((r: any) => r.openingLitres).map((r: any) => ({ pumpId: r.pumpId, openingLitres: parseFloat(r.openingLitres) || 0 })),
              })} disabled={!shiftOpenForm.cashierName || openShiftMut.isPending}
                className="bg-orange-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
                Open Shift
              </button>
            </div>
          )}

          {/* Shift history */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <p className="px-4 py-2 text-sm font-semibold bg-gray-50 border-b">Shift History (last 20)</p>
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Cashier</th>
                  <th className="text-left px-4 py-2">Opened</th>
                  <th className="text-left px-4 py-2">Closed</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Pump Readings</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s: any) => (
                  <tr key={s.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{s.cashierName}</td>
                    <td className="px-4 py-2 text-gray-600 text-xs">{new Date(s.openedAt).toLocaleString()}</td>
                    <td className="px-4 py-2 text-gray-600 text-xs">{s.closedAt ? new Date(s.closedAt).toLocaleString() : '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.status === 'OPEN' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                        {s.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2 flex-wrap">
                        {s.readings.map((r: any) => {
                          const pump = pumps.find((p: any) => p.id === r.pumpId);
                          const dispensed = r.closingLitres != null ? (r.closingLitres - r.openingLitres).toFixed(2) : '—';
                          return (
                            <span key={r.id} className="text-xs bg-blue-50 text-blue-700 px-2 py-0.5 rounded">
                              P{pump?.pumpNumber ?? '?'}: {r.openingLitres}→{r.closingLitres ?? '?'}L ({dispensed}L)
                            </span>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
                {shifts.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-gray-400">No shifts recorded</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── FLEET ACCOUNTS ── */}
      {tab === 'fleet' && (
        <div className="space-y-4">
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Add Fleet Account</h3>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Company name"
                value={fleetForm.companyName} onChange={(e) => setFleetForm({ ...fleetForm, companyName: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Contact name"
                value={fleetForm.contactName} onChange={(e) => setFleetForm({ ...fleetForm, contactName: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Contact phone"
                value={fleetForm.contactPhone} onChange={(e) => setFleetForm({ ...fleetForm, contactPhone: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Contact email"
                value={fleetForm.contactEmail} onChange={(e) => setFleetForm({ ...fleetForm, contactEmail: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Credit limit (KES cents)" type="number"
                value={fleetForm.creditLimitCents} onChange={(e) => setFleetForm({ ...fleetForm, creditLimitCents: e.target.value })} />
            </div>
            <button onClick={() => createFleet.mutate({ ...fleetForm, businessId, creditLimitCents: parseInt(fleetForm.creditLimitCents) || 0 })}
              disabled={!fleetForm.companyName || createFleet.isPending}
              className="bg-orange-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
              <Plus className="w-4 h-4 inline mr-1" />Add Account
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {fleetAccounts.map((fa: any) => {
              const isNegative = fa.balanceCents < 0;
              return (
                <div key={fa.id} className="bg-white border rounded-lg p-4 space-y-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{fa.companyName}</p>
                      {fa.contactName && <p className="text-sm text-gray-600">{fa.contactName}</p>}
                      {fa.contactPhone && <p className="text-xs text-gray-400">{fa.contactPhone}</p>}
                    </div>
                    <div className="text-right">
                      <p className={`text-sm font-bold ${isNegative ? 'text-red-600' : 'text-green-600'}`}>
                        {isNegative ? 'Owes: ' : 'Bal: '}{formatKES(Math.abs(fa.balanceCents))}
                      </p>
                      <p className="text-xs text-gray-400">Limit: {formatKES(fa.creditLimitCents)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 pt-2 border-t">
                    <button onClick={() => setSelectedFleet(fa)}
                      className="flex-1 text-xs bg-blue-50 text-blue-700 px-2 py-1.5 rounded border border-blue-200 hover:bg-blue-100">
                      View Transactions
                    </button>
                  </div>
                </div>
              );
            })}
            {fleetAccounts.length === 0 && <p className="text-gray-400 text-sm col-span-3 text-center py-8">No fleet accounts added</p>}
          </div>

          {/* Fleet transactions modal */}
          {selectedFleet && (
            <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
              <div className="bg-white rounded-xl w-full max-w-2xl shadow-2xl">
                <div className="p-4 border-b flex items-center justify-between">
                  <div>
                    <h2 className="font-bold text-lg">{selectedFleet.companyName}</h2>
                    <p className={`text-sm font-medium ${selectedFleet.balanceCents < 0 ? 'text-red-600' : 'text-green-600'}`}>
                      Balance: {formatKES(Math.abs(selectedFleet.balanceCents))} {selectedFleet.balanceCents < 0 ? '(owes)' : '(credit)'}
                    </p>
                  </div>
                  <button onClick={() => setSelectedFleet(null)} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
                </div>
                <div className="p-4 space-y-3">
                  {/* Record payment */}
                  <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                    <p className="text-sm font-medium text-green-800">Record Payment</p>
                    <div className="grid grid-cols-3 gap-2">
                      <input className="border rounded px-3 py-1.5 text-sm" placeholder="Amount (KES cents)" type="number"
                        value={paymentForm.amountCents} onChange={(e) => setPaymentForm({ ...paymentForm, amountCents: e.target.value })} />
                      <input className="border rounded px-3 py-1.5 text-sm" placeholder="Reference"
                        value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
                      <button onClick={() => recordPayment.mutate({ id: selectedFleet.id, businessId, amountCents: parseInt(paymentForm.amountCents) || 0, reference: paymentForm.reference || undefined })}
                        disabled={!paymentForm.amountCents || recordPayment.isPending}
                        className="bg-green-600 text-white px-3 py-1.5 rounded text-sm font-medium disabled:opacity-50">
                        <ArrowUpCircle className="w-4 h-4 inline mr-1" />Record
                      </button>
                    </div>
                  </div>
                  {/* Transactions table */}
                  <div className="max-h-64 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50 text-gray-600 sticky top-0">
                        <tr>
                          <th className="text-left px-3 py-2">Date</th>
                          <th className="text-left px-3 py-2">Type</th>
                          <th className="text-right px-3 py-2">Amount</th>
                          <th className="text-left px-3 py-2">Ref</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fleetTx.map((tx: any) => (
                          <tr key={tx.id} className="border-t">
                            <td className="px-3 py-1.5 text-gray-500 text-xs">{new Date(tx.createdAt).toLocaleString()}</td>
                            <td className="px-3 py-1.5">
                              <span className={`flex items-center gap-1 text-xs font-medium ${tx.type === 'CHARGE' ? 'text-red-600' : 'text-green-600'}`}>
                                {tx.type === 'CHARGE' ? <ArrowDownCircle className="w-3 h-3" /> : <ArrowUpCircle className="w-3 h-3" />}
                                {tx.type}
                              </span>
                            </td>
                            <td className="px-3 py-1.5 text-right font-medium">{formatKES(tx.amountCents)}</td>
                            <td className="px-3 py-1.5 text-gray-500 text-xs">{tx.reference ?? tx.description ?? '—'}</td>
                          </tr>
                        ))}
                        {fleetTx.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-gray-400">No transactions</td></tr>}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── SALES LOG ── */}
      {tab === 'sales' && (
        <div className="space-y-3">
          <div className="flex gap-2 flex-wrap items-center">
            <select className="border rounded px-3 py-1.5 text-sm" value={filterPump} onChange={(e) => setFilterPump(e.target.value)}>
              <option value="">All Pumps</option>
              {pumps.map((p: any) => <option key={p.id} value={p.id}>Pump {p.pumpNumber}</option>)}
            </select>
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Date/Time</th>
                  <th className="text-left px-4 py-2">Pump</th>
                  <th className="text-left px-4 py-2">Grade</th>
                  <th className="text-left px-4 py-2">Litres</th>
                  <th className="text-left px-4 py-2">Price/L</th>
                  <th className="text-left px-4 py-2">Total</th>
                  <th className="text-left px-4 py-2">Payment</th>
                  <th className="text-left px-4 py-2">Plate</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((s: any) => (
                  <tr key={s.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 text-gray-500 text-xs">{new Date(s.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-2 font-medium">Pump {s.pump?.pumpNumber}</td>
                    <td className="px-4 py-2">{s.grade?.name}</td>
                    <td className="px-4 py-2">{s.litresDispensed.toFixed(2)} L</td>
                    <td className="px-4 py-2">{formatKES(s.pricePerLitreCents)}</td>
                    <td className="px-4 py-2 font-semibold">{formatKES(s.totalCents)}</td>
                    <td className="px-4 py-2">
                      <span className="bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full text-xs">{s.paymentMethod}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500">{s.vehiclePlate ?? '—'}</td>
                  </tr>
                ))}
                {sales.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-gray-400">No sales found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── STATISTICS ── */}
      {tab === 'stats' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center">
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
          {stats && (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="bg-white border rounded-lg p-4">
                  <p className="text-sm text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-bold text-orange-600">{formatKES(stats.totalRevenueCents)}</p>
                </div>
                <div className="bg-white border rounded-lg p-4">
                  <p className="text-sm text-gray-500">Total Litres</p>
                  <p className="text-2xl font-bold">{(stats.totalLitres ?? 0).toFixed(2)} L</p>
                </div>
                <div className="bg-white border rounded-lg p-4">
                  <p className="text-sm text-gray-500">Transactions</p>
                  <p className="text-2xl font-bold">{stats.totalTransactions}</p>
                </div>
              </div>
              <div className="bg-white border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 text-gray-600">
                    <tr>
                      <th className="text-left px-4 py-2">Grade</th>
                      <th className="text-right px-4 py-2">Litres</th>
                      <th className="text-right px-4 py-2">Transactions</th>
                      <th className="text-right px-4 py-2">Revenue</th>
                    </tr>
                  </thead>
                  <tbody>
                    {stats.byGrade.map((g: any) => (
                      <tr key={g.gradeId} className="border-t">
                        <td className="px-4 py-2 font-medium">{g.gradeName}</td>
                        <td className="px-4 py-2 text-right">{g.litres.toFixed(2)} L</td>
                        <td className="px-4 py-2 text-right">{g.transactions}</td>
                        <td className="px-4 py-2 text-right font-semibold">{formatKES(g.revenueCents)}</td>
                      </tr>
                    ))}
                    {stats.byGrade.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-gray-400">No data</td></tr>}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {!stats && <p className="text-gray-400 text-center py-8">Loading statistics...</p>}
        </div>
      )}
    </div>
  );
}

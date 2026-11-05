import { useState, useEffect, useRef, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { PageHeader, Tabs } from '../components/ui';
import { useAuthStore } from '../stores/auth';
import { useDialog } from '../components/Dialog';
import { formatKES } from '@pos/shared';
import { toast } from 'sonner';
import type { ReceiptData } from '../lib/printer';
import { buildDirectSaleReceipt } from '../lib/directSaleReceipt';
import DirectSaleReceiptModal from '../components/DirectSaleReceiptModal';
import { autoPrintReceipt, printErrorMessage } from '../lib/receiptPrint';
import {
  Fuel, Plus, Zap, ZapOff, BarChart3, List, Settings,
  Droplets, Truck, Clock, Building2, ArrowDownCircle, ArrowUpCircle, Usb, Wifi, WifiOff,
  Wrench, AlertTriangle, CheckCircle, ChevronDown, ChevronRight,
} from 'lucide-react';
import {
  connectPumpController, disconnectPumpController, isPumpControllerConnected,
  authorizePump as hwAuthorizePump, stopPump as hwStopPump,
  getPumpTransaction, isSerialAvailable,
  type PumpControllerConfig, type PumpProtocol,
} from '../lib/fuelPumpController';
import { io, type Socket } from 'socket.io-client';

type ConnectionMode = 'serial' | 'tcp';

type Tab = 'pumps' | 'grades' | 'tanks' | 'shifts' | 'fleet' | 'sales' | 'stats' | 'variance' | 'maintenance';

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

  // ── Connection mode: RS-232 Serial or TCP/IP ──────────────────────────────
  const [connMode, setConnMode] = useState<ConnectionMode>('serial');

  // ── Web Serial (RS-232 via USB adapter) ───────────────────────────────────
  const [hwConnected, setHwConnected] = useState(isPumpControllerConnected());
  const [hwProtocol, setHwProtocol] = useState<PumpProtocol>('GILBARCO');
  const [hwConnecting, setHwConnecting] = useState(false);
  const [hwError, setHwError] = useState('');
  const hwConfig: PumpControllerConfig = { protocol: hwProtocol };

  const handleHwConnect = async () => {
    setHwConnecting(true); setHwError('');
    try { await connectPumpController(hwConfig); setHwConnected(true); }
    catch (err: any) { setHwError(err.message ?? 'Connection failed'); }
    finally { setHwConnecting(false); }
  };
  const handleHwDisconnect = async () => { await disconnectPumpController(); setHwConnected(false); };

  // ── TCP/IP (pump controller on LAN, bridged via NestJS WebSocket) ─────────
  const [tcpHost, setTcpHost] = useState('192.168.1.100');
  const [tcpPort, setTcpPort] = useState('10001');
  const [tcpProtocol, setTcpProtocol] = useState<PumpProtocol>('GILBARCO');
  const [tcpConnected, setTcpConnected] = useState(false);
  const [tcpConnecting, setTcpConnecting] = useState(false);
  const [tcpError, setTcpError] = useState('');
  // Live pump statuses received from WebSocket (pumpNumber → status)
  const [livePumpStatus, setLivePumpStatus] = useState<Record<number, { status: string; litresDispensed: number; totalCents: number }>>({});
  const socketRef = useRef<Socket | null>(null);
  // Polling interval ref for DISPENSING pumps
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Connect WebSocket to the NestJS fuel-pump namespace
  const handleTcpConnect = useCallback(async () => {
    if (socketRef.current?.connected) return;
    setTcpConnecting(true); setTcpError('');
    const sock = io('/fuel-pump', { path: '/socket.io', transports: ['websocket'] });
    socketRef.current = sock;

    sock.on('connected', () => {
      setTcpConnected(true); setTcpConnecting(false);
    });
    sock.on('disconnected', () => { setTcpConnected(false); });
    sock.on('error', (e: { message: string }) => {
      setTcpError(e.message); setTcpConnecting(false);
    });
    sock.on('pump_status', (data: { pumpNumber: number; status: string; litresDispensed: number; totalCents: number }) => {
      setLivePumpStatus((prev) => ({ ...prev, [data.pumpNumber]: data }));
    });
    sock.on('transaction', (data: { pumpNumber: number; litresDispensed: number; pricePerLitreCents: number; totalCents: number; pumpId?: string; gradeId?: string }) => {
      // Auto-fill sale form when pump finishes dispensing
      setSaleForm((prev) => ({
        ...prev,
        litresDispensed: data.litresDispensed.toFixed(3),
        paymentMethod: prev.paymentMethod || 'CASH',
      }));
      setLivePumpStatus((prev) => ({ ...prev, [data.pumpNumber]: { status: 'IDLE', litresDispensed: data.litresDispensed, totalCents: data.totalCents } }));
      void qc.invalidateQueries({ queryKey: ['fuel-pumps'] });
    });

    // Tell backend to open TCP connection to pump controller
    sock.emit('tcp_connect', { host: tcpHost, port: parseInt(tcpPort), protocol: tcpProtocol, businessId, storeId });
  }, [tcpHost, tcpPort, tcpProtocol, businessId, storeId, qc]);

  const handleTcpDisconnect = useCallback(() => {
    socketRef.current?.emit('tcp_disconnect', { businessId, storeId });
    socketRef.current?.disconnect();
    socketRef.current = null;
    setTcpConnected(false);
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }, [businessId, storeId]);

  // Poll status every 3 s for pumps that are AUTHORIZED or DISPENSING
  useEffect(() => {
    if (!tcpConnected || !socketRef.current) { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } return; }
    pollRef.current = setInterval(() => {
      const sock = socketRef.current;
      if (!sock) return;
      (pumps as any[]).forEach((pump: any) => {
        if (['AUTHORIZED', 'DISPENSING'].includes(pump.status)) {
          sock.emit('status', { businessId, storeId, pumpNumber: pump.pumpNumber });
        }
      });
    }, 3000);
    return () => { if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; } };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tcpConnected, businessId, storeId]);

  // Cleanup on unmount
  useEffect(() => () => { handleTcpDisconnect(); }, [handleTcpDisconnect]);

  // ── Unified authorize/stop handlers ───────────────────────────────────────
  const handleHwAuthorize = async (pump: any) => {
    if (connMode === 'tcp' && tcpConnected && socketRef.current) {
      socketRef.current.emit('authorize', { businessId, storeId, pumpNumber: pump.pumpNumber });
    } else if (connMode === 'serial' && hwConnected) {
      try { await hwAuthorizePump(pump.pumpNumber, hwConfig); } catch { /* fall through */ }
    }
    authorizePump.mutate(pump.id);
  };

  const handleHwStop = async (pump: any) => {
    if (connMode === 'tcp' && tcpConnected && socketRef.current) {
      socketRef.current.emit('stop', { businessId, storeId, pumpNumber: pump.pumpNumber });
      // Request transaction data from controller
      socketRef.current.emit('transaction', { businessId, storeId, pumpNumber: pump.pumpNumber });
    } else if (connMode === 'serial' && hwConnected) {
      try {
        await hwStopPump(pump.pumpNumber, hwConfig);
        const txn = await getPumpTransaction(pump.pumpNumber, hwConfig);
        setSaleForm({ pumpId: pump.id, gradeId: pump.gradeId, litresDispensed: txn.litresDispensed.toFixed(3), vehiclePlate: '', paymentMethod: 'CASH', paymentRef: '', fleetAccountId: '', customerId: '' });
      } catch { /* fall through */ }
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
    pumpId: '', gradeId: '', litresDispensed: '', vehiclePlate: '', paymentMethod: 'CASH', paymentRef: '', fleetAccountId: '', customerId: '',
  });

  // Credit goes to a registered customer who can be billed.
  const { data: creditCustomers = [] } = useQuery<Array<{ id: string; name: string }>>({
    queryKey: ['fuel-credit-customers', businessId],
    queryFn: () => api.get(`/businesses/${businessId}/customers`),
    enabled: !!businessId && saleForm.paymentMethod === 'CREDIT',
    staleTime: 60_000,
  });
  const { data: bizSettings } = useQuery<{ name?: string; receiptHeader?: string; receiptFooter?: string }>({
    queryKey: ['biz-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 5 * 60_000,
  });

  // The receipt of the last sale, when this business records fuel takings as sales.
  const [fuelReceipt, setFuelReceipt] = useState<ReceiptData | null>(null);
  const recordSale = useMutation({
    mutationFn: (d: any) => api.post<any>('/fuel-pump/sales', d),
    onSuccess: (res) => {
      void qc.invalidateQueries({ queryKey: ['fuel-pumps'] });
      void qc.invalidateQueries({ queryKey: ['fuel-sales'] });
      void qc.invalidateQueries({ queryKey: ['fuel-stats'] });
      setSaleForm({ pumpId: '', gradeId: '', litresDispensed: '', vehiclePlate: '', paymentMethod: 'CASH', paymentRef: '', fleetAccountId: '', customerId: '' });
      const receipt = buildDirectSaleReceipt(res ?? {}, {
        businessName: bizSettings?.name, cashierName: user?.name ?? 'Attendant', receiptHeader: bizSettings?.receiptHeader,
        receiptFooter: bizSettings?.receiptFooter, fallbackName: 'Fuel station',
      });
      if (receipt) {
        setFuelReceipt(receipt);
        // Print straight away when this terminal is set to; otherwise the receipt window has a Print button.
        void autoPrintReceipt(receipt, false).catch((err) => toast.error(`Auto-print failed: ${printErrorMessage(err)}`));
      }
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
  const [fleetForm, setFleetForm] = useState({ companyName: '', contactName: '', contactPhone: '', contactEmail: '', kraPin: '', creditLimitCents: '' });
  const createFleet = useMutation({
    mutationFn: (d: any) => api.post('/fuel-pump/fleet', d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['fleet-accounts'] }); setFleetForm({ companyName: '', contactName: '', contactPhone: '', contactEmail: '', kraPin: '', creditLimitCents: '' }); },
  });
  const [selectedFleet, setSelectedFleet] = useState<any>(null);
  const { data: fleetTx = [] } = useQuery({
    queryKey: ['fleet-tx', selectedFleet?.id],
    queryFn: () => api.get<any[]>(`/fuel-pump/fleet/${selectedFleet.id}/transactions`),
    enabled: !!selectedFleet,
  });
  const [paymentForm, setPaymentForm] = useState({ amountCents: '', reference: '', description: '', method: 'CASH' });
  const recordPayment = useMutation({
    mutationFn: ({ id, ...d }: any) => api.post(`/fuel-pump/fleet/${id}/payment`, d),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['fleet-accounts'] }); void qc.invalidateQueries({ queryKey: ['fleet-tx'] }); setPaymentForm({ amountCents: '', reference: '', description: '', method: 'CASH' }); },
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

  // A manager takes a sale back: the litres return to the tank, a fleet account is credited, an invoice is voided.
  const { prompt } = useDialog();
  const canVoid = ['OWNER', 'ADMIN', 'MANAGER'].includes(String(user?.role));
  const voidSaleMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => api.post(`/fuel-pump/sales/${id}/void`, { reason }),
    onSuccess: () => {
      toast.success('Sale voided');
      void qc.invalidateQueries({ queryKey: ['fuel-sales'] });
      void qc.invalidateQueries({ queryKey: ['fuel-tanks'] });
      void qc.invalidateQueries({ queryKey: ['fuel-stats'] });
      void qc.invalidateQueries({ queryKey: ['fleet-accounts'] });
    },
    onError: (err: Error) => toast.error(err.message),
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

  // ── Variance Report ────────────────────────────────────────────────────────
  const { data: varianceData, isLoading: varianceLoading } = useQuery({
    queryKey: ['fuel-variance', businessId, storeId, startDate, endDate],
    queryFn: () => {
      let url = `/fuel-pump/variance?businessId=${businessId}&storeId=${storeId}`;
      if (startDate) url += `&startDate=${startDate}`;
      if (endDate) url += `&endDate=${endDate}`;
      return api.get<any[]>(url);
    },
    enabled: tab === 'variance',
  });

  // ── Maintenance ────────────────────────────────────────────────────────────
  const [maintForm, setMaintForm] = useState({ pumpId: '', type: 'SERVICE', description: '', technicianName: '', costCents: 0, status: 'COMPLETED', notes: '' });
  const [maintFilter, setMaintFilter] = useState('');
  const { data: maintenanceLogs, refetch: refetchMaint } = useQuery({
    queryKey: ['fuel-maintenance', businessId, maintFilter],
    queryFn: () => {
      let url = `/fuel-pump/maintenance?businessId=${businessId}`;
      if (maintFilter) url += `&pumpId=${maintFilter}`;
      return api.get<any[]>(url);
    },
    enabled: tab === 'maintenance',
  });

  const createMaintMutation = useMutation({
    mutationFn: (dto: any) => api.post('/fuel-pump/maintenance', dto),
    onSuccess: () => { void refetchMaint(); setMaintForm({ pumpId: '', type: 'SERVICE', description: '', technicianName: '', costCents: 0, status: 'COMPLETED', notes: '' }); },
  });

  // ── Shift Summary ──────────────────────────────────────────────────────────
  const [expandedShift, setExpandedShift] = useState<string | null>(null);
  const { data: shiftSummary } = useQuery({
    queryKey: ['shift-summary', expandedShift],
    queryFn: () => api.get<any>(`/fuel-pump/shifts/${expandedShift}/summary`),
    enabled: !!expandedShift,
  });

  const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'pumps', label: 'Pump Control', icon: <Fuel className="w-4 h-4" /> },
    { id: 'grades', label: 'Fuel Grades', icon: <Settings className="w-4 h-4" /> },
    { id: 'tanks', label: 'Tanks', icon: <Droplets className="w-4 h-4" /> },
    { id: 'shifts', label: 'Shifts', icon: <Clock className="w-4 h-4" /> },
    { id: 'fleet', label: 'Fleet Accounts', icon: <Building2 className="w-4 h-4" /> },
    { id: 'sales', label: 'Sales Log', icon: <List className="w-4 h-4" /> },
    { id: 'stats', label: 'Statistics', icon: <BarChart3 className="w-4 h-4" /> },
    { id: 'variance', label: 'Variance Report', icon: <AlertTriangle className="w-4 h-4" /> },
    { id: 'maintenance', label: 'Maintenance', icon: <Wrench className="w-4 h-4" /> },
  ];

  return (
    <div className="p-3 sm:p-6 space-y-4">
      <PageHeader title="Fuel Station Management" icon={<Fuel className="w-5 h-5" />} />

      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {/* ── PUMP CONTROL ── */}
      {tab === 'pumps' && (
        <div className="space-y-4">
          {/* Pump Controller Connection Panel */}
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <div className="flex items-center gap-3">
              <h3 className="font-semibold text-sm">Pump Controller</h3>
              {/* Mode toggle */}
              <div className="flex rounded border overflow-hidden text-xs">
                <button
                  onClick={() => setConnMode('serial')}
                  className={`flex items-center gap-1 px-3 py-1 ${connMode === 'serial' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                >
                  <Usb className="w-3 h-3" /> RS-232 / USB
                </button>
                <button
                  onClick={() => setConnMode('tcp')}
                  className={`flex items-center gap-1 px-3 py-1 ${connMode === 'tcp' ? 'bg-blue-600 text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'}`}
                >
                  <Wifi className="w-3 h-3" /> TCP / LAN
                </button>
              </div>
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                (connMode === 'serial' ? hwConnected : tcpConnected)
                  ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
              }`}>
                {(connMode === 'serial' ? hwConnected : tcpConnected) ? 'Connected' : 'Not connected'}
              </span>
            </div>

            {connMode === 'serial' && (
              <div className="flex items-center gap-2 flex-wrap">
                <select value={hwProtocol} onChange={(e) => setHwProtocol(e.target.value as PumpProtocol)}
                  disabled={hwConnected} className="border rounded px-2 py-1 text-xs disabled:opacity-50" aria-label="Gilbarco GVR">
                  <option value="GILBARCO">Gilbarco GVR</option>
                  <option value="WAYNE">Wayne Dresser</option>
                  <option value="TOKHEIM">Tokheim</option>
                  <option value="IFSF">IFSF Generic</option>
                </select>
                {!isSerialAvailable() && <span className="text-xs text-amber-600">Web Serial requires Chrome/Edge 89+</span>}
                {hwConnected
                  ? <button onClick={() => void handleHwDisconnect()} className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded border border-red-200 hover:bg-red-200">Disconnect</button>
                  : <button onClick={() => void handleHwConnect()} disabled={hwConnecting || !isSerialAvailable()}
                      className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50">
                      {hwConnecting ? 'Connecting…' : 'Connect Serial'}
                    </button>
                }
                {hwError && <span className="text-xs text-red-600">{hwError}</span>}
              </div>
            )}

            {connMode === 'tcp' && (
              <div className="space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <input value={tcpHost} onChange={(e) => setTcpHost(e.target.value)} disabled={tcpConnected}
                    placeholder="Controller IP (e.g. 192.168.1.100)"
                    className="border rounded px-2 py-1 text-xs w-full sm:w-52 disabled:opacity-50" />
                  <input value={tcpPort} onChange={(e) => setTcpPort(e.target.value)} disabled={tcpConnected}
                    placeholder="Port" className="border rounded px-2 py-1 text-xs w-20 disabled:opacity-50" />
                  <select value={tcpProtocol} onChange={(e) => setTcpProtocol(e.target.value as PumpProtocol)}
                    disabled={tcpConnected} className="border rounded px-2 py-1 text-xs disabled:opacity-50" aria-label="Gilbarco GVR (10001)">
                    <option value="GILBARCO">Gilbarco GVR (10001)</option>
                    <option value="WAYNE">Wayne Dresser (10002)</option>
                    <option value="IFSF">IFSF/Tokheim (5555)</option>
                  </select>
                  {tcpConnected
                    ? <button onClick={handleTcpDisconnect} className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded border border-red-200 hover:bg-red-200 flex items-center gap-1"><WifiOff className="w-3 h-3" />Disconnect</button>
                    : <button onClick={() => void handleTcpConnect()} disabled={tcpConnecting}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1">
                        <Wifi className="w-3 h-3" />{tcpConnecting ? 'Connecting…' : 'Connect TCP'}
                      </button>
                  }
                  {tcpError && <span className="text-xs text-red-600">{tcpError}</span>}
                </div>
                {tcpConnected && (
                  <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                    ✓ TCP connected to {tcpHost}:{tcpPort} ({tcpProtocol}) — pump status polls every 3 s; litres auto-filled when dispensing completes.
                  </p>
                )}
                {/* Live pump status badges */}
                {tcpConnected && Object.keys(livePumpStatus).length > 0 && (
                  <div className="flex gap-2 flex-wrap">
                    {Object.entries(livePumpStatus).map(([pn, s]) => (
                      <span key={pn} className={`text-xs px-2 py-0.5 rounded-full font-medium ${STATUS_COLOR[s.status] ?? 'bg-gray-100 text-gray-600'}`}>
                        Pump {pn}: {s.status}{s.litresDispensed > 0 ? ` ${s.litresDispensed.toFixed(2)}L` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {(hwConnected || tcpConnected) && (
              <p className="text-xs text-green-700 bg-green-50 rounded px-2 py-1">
                ✓ Controller active — Authorize/Stop send hardware commands; litres are read automatically after dispensing.
              </p>
            )}
          </div>
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Add Pump</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Pump #" type="number"
                value={pumpForm.pumpNumber} onChange={(e) => setPumpForm({ ...pumpForm, pumpNumber: e.target.value })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Label (optional)"
                value={pumpForm.label} onChange={(e) => setPumpForm({ ...pumpForm, label: e.target.value })} />
              <select className="border rounded px-3 py-1.5 text-sm" value={pumpForm.gradeId}
                onChange={(e) => setPumpForm({ ...pumpForm, gradeId: e.target.value })} aria-label="Select grade">
                <option value="">Select grade</option>
                {grades.map((g: any) => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Nozzles" type="number"
                value={pumpForm.nozzleCount} onChange={(e) => setPumpForm({ ...pumpForm, nozzleCount: e.target.value })} />
            </div>
            <button
              onClick={() => createPump.mutate({ ...pumpForm, businessId, storeId, pumpNumber: parseInt(pumpForm.pumpNumber), nozzleCount: parseInt(pumpForm.nozzleCount) })}
              disabled={!pumpForm.pumpNumber || !pumpForm.gradeId || createPump.isPending}
              className="bg-brand-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
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
                          onChange={(e) => setSaleForm({ ...saleForm, fleetAccountId: e.target.value })} aria-label="Select fleet account">
                          <option value="">Select fleet account</option>
                          {fleetAccounts.map((fa: any) => <option key={fa.id} value={fa.id}>{fa.companyName}</option>)}
                        </select>
                      ) : saleForm.paymentMethod === 'CREDIT' && saleForm.pumpId === pump.id ? (
                        <select className="border rounded px-2 py-1 text-sm"
                          value={saleForm.customerId}
                          onChange={(e) => setSaleForm({ ...saleForm, customerId: e.target.value })} aria-label="Select customer">
                          <option value="">Select customer</option>
                          {creditCustomers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      ) : (
                        <input className="border rounded px-2 py-1 text-sm" placeholder="Ref (opt)"
                          value={saleForm.pumpId === pump.id ? saleForm.paymentRef : ''}
                          onChange={(e) => setSaleForm({ ...saleForm, pumpId: pump.id, gradeId: pump.gradeId, paymentRef: e.target.value })} />
                      )}
                    </div>
                    {saleForm.pumpId === pump.id && saleForm.litresDispensed && (
                      <p className="text-sm font-semibold text-brand-700">
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
                        customerId: saleForm.paymentMethod === 'CREDIT' ? saleForm.customerId || undefined : undefined,
                      })}
                      disabled={!saleForm.litresDispensed || saleForm.pumpId !== pump.id || recordSale.isPending
                        || (saleForm.paymentMethod === 'CREDIT' && !saleForm.customerId)
                        || (saleForm.paymentMethod === 'FLEET' && !saleForm.fleetAccountId)}
                      className="w-full bg-brand-600 text-white py-1.5 rounded text-sm font-medium disabled:opacity-50">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
              className="bg-brand-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
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
                        className="flex-1 bg-brand-600 text-white py-1 rounded text-sm">Save</button>
                      <button onClick={() => setEditGrade(null)} className="flex-1 border py-1 rounded text-sm">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold">{g.name}</p>
                      <p className="text-xs text-gray-500 font-mono">{g.code}</p>
                      <p className="text-lg font-bold text-brand-600 mt-1">{formatKES(g.pricePerLitreCents)}<span className="text-sm font-normal text-gray-500">/L</span></p>
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
                onChange={(e) => setTankForm({ ...tankForm, gradeId: e.target.value })} aria-label="Select grade">
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
              className="bg-brand-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
                className="bg-brand-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
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
                  <th className="text-left px-4 py-2">Summary</th>
                </tr>
              </thead>
              <tbody>
                {shifts.map((s: any) => (
                  <>
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
                      <td className="px-4 py-2">
                        {s.status === 'CLOSED' && (
                          <button
                            onClick={() => setExpandedShift(expandedShift === s.id ? null : s.id)}
                            className="flex items-center gap-1 text-xs text-blue-600 hover:underline"
                          >
                            {expandedShift === s.id ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            X-Report
                          </button>
                        )}
                      </td>
                    </tr>
                    {expandedShift === s.id && shiftSummary && (
                      <tr key={`${s.id}-summary`} className="bg-brand-50">
                        <td colSpan={6} className="px-6 py-4">
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-3">
                            <div className="bg-white rounded p-3 text-center border">
                              <p className="text-xs text-gray-500">Total Revenue</p>
                              <p className="font-bold text-brand-600">{formatKES(shiftSummary.totalRevenueCents)}</p>
                            </div>
                            <div className="bg-white rounded p-3 text-center border">
                              <p className="text-xs text-gray-500">Total Litres</p>
                              <p className="font-bold">{(shiftSummary.totalLitres ?? 0).toFixed(2)} L</p>
                            </div>
                            <div className="bg-white rounded p-3 text-center border">
                              <p className="text-xs text-gray-500">Transactions</p>
                              <p className="font-bold">{shiftSummary.totalTransactions}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-4">
                            <div>
                              <p className="text-xs font-semibold text-gray-600 mb-1">By Pump</p>
                              <table className="w-full text-xs border rounded overflow-hidden">
                                <thead className="bg-gray-100">
                                  <tr><th className="px-2 py-1 text-left">Pump</th><th className="px-2 py-1 text-right">Litres</th><th className="px-2 py-1 text-right">Revenue</th></tr>
                                </thead>
                                <tbody>
                                  {shiftSummary.byPump.map((p: any) => (
                                    <tr key={p.pumpId} className="border-t">
                                      <td className="px-2 py-1">{p.pumpLabel || `P${p.pumpNumber}`}</td>
                                      <td className="px-2 py-1 text-right">{p.litres.toFixed(2)} L</td>
                                      <td className="px-2 py-1 text-right font-medium">{formatKES(p.revenueCents)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-gray-600 mb-1">By Payment</p>
                              <table className="w-full text-xs border rounded overflow-hidden">
                                <thead className="bg-gray-100">
                                  <tr><th className="px-2 py-1 text-left">Method</th><th className="px-2 py-1 text-right">Txns</th><th className="px-2 py-1 text-right">Amount</th></tr>
                                </thead>
                                <tbody>
                                  {shiftSummary.byPayment.map((p: any) => (
                                    <tr key={p.method} className="border-t">
                                      <td className="px-2 py-1 font-medium">{p.method}</td>
                                      <td className="px-2 py-1 text-right">{p.count}</td>
                                      <td className="px-2 py-1 text-right">{formatKES(p.totalCents)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                ))}
                {shifts.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">No shifts recorded</td></tr>}
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
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="KRA PIN (for invoices)"
                value={fleetForm.kraPin} onChange={(e) => setFleetForm({ ...fleetForm, kraPin: e.target.value.toUpperCase() })} />
              <input className="border rounded px-3 py-1.5 text-sm" placeholder="Credit limit (KES cents)" type="number"
                value={fleetForm.creditLimitCents} onChange={(e) => setFleetForm({ ...fleetForm, creditLimitCents: e.target.value })} />
            </div>
            <button onClick={() => createFleet.mutate({ ...fleetForm, businessId, creditLimitCents: parseInt(fleetForm.creditLimitCents) || 0 })}
              disabled={!fleetForm.companyName || createFleet.isPending}
              className="bg-brand-600 text-white px-4 py-1.5 rounded text-sm font-medium disabled:opacity-50">
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
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      <input className="border rounded px-3 py-1.5 text-sm" placeholder="Amount (KES cents)" type="number"
                        value={paymentForm.amountCents} onChange={(e) => setPaymentForm({ ...paymentForm, amountCents: e.target.value })} />
                      <select className="border rounded px-2 py-1.5 text-sm" value={paymentForm.method} onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}>
                        {['CASH', 'MPESA', 'CARD', 'BANK'].map((m) => <option key={m} value={m}>{m}</option>)}
                      </select>
                      <input className="border rounded px-3 py-1.5 text-sm" placeholder="Reference"
                        value={paymentForm.reference} onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })} />
                      <button onClick={() => recordPayment.mutate({ id: selectedFleet.id, businessId, amountCents: parseInt(paymentForm.amountCents) || 0, method: paymentForm.method, reference: paymentForm.reference || undefined })}
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
            <select className="border rounded px-3 py-1.5 text-sm" value={filterPump} onChange={(e) => setFilterPump(e.target.value)} aria-label="Filter by pumps">
              <option value="">All Pumps</option>
              {pumps.map((p: any) => <option key={p.id} value={p.id}>Pump {p.pumpNumber}</option>)}
            </select>
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Date" />
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="Start date" />
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
                  {canVoid && <th className="px-4 py-2"></th>}
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
                    {canVoid && (
                      <td className="px-4 py-2 text-right">
                        {s.status === 'VOIDED' ? (
                          <span className="text-xs text-gray-400">Voided</span>
                        ) : (
                          <button
                            disabled={voidSaleMutation.isPending}
                            onClick={async () => {
                              const reason = await prompt({ title: 'Void this sale', message: 'The litres go back into the tank and any invoice is cancelled.', placeholder: 'Reason', confirmLabel: 'Void sale' });
                              if (reason) voidSaleMutation.mutate({ id: s.id, reason });
                            }}
                            className="text-xs text-red-600 hover:underline disabled:opacity-50"
                          >
                            Void
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
                {sales.length === 0 && <tr><td colSpan={9} className="px-4 py-8 text-center text-gray-400">No sales found</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── STATISTICS ── */}
      {tab === 'stats' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center">
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Date" />
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="Start date" />
          </div>
          {stats && (
            <>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-white border rounded-lg p-4">
                  <p className="text-sm text-gray-500">Total Revenue</p>
                  <p className="text-2xl font-bold text-brand-600">{formatKES(stats.totalRevenueCents)}</p>
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

      {/* ── VARIANCE REPORT ── */}
      {tab === 'variance' && (
        <div className="space-y-4">
          <div className="flex gap-2 items-center flex-wrap">
            <span className="text-sm text-gray-600 font-medium">Date Range:</span>
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label="Date" />
            <input type="date" className="border rounded px-3 py-1.5 text-sm" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label="Start date" />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm text-amber-800">
            <strong>Variance Report</strong> — Compares fuel dispensed (from sales) vs dipping readings to detect shrinkage, leaks, or meter errors. Variance &gt;1% triggers an ALERT.
          </div>
          {varianceLoading && <p className="text-gray-400 text-center py-8">Calculating variance...</p>}
          {varianceData && (
            <div className="bg-white border rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr>
                    <th className="text-left px-4 py-2">Tank</th>
                    <th className="text-left px-4 py-2">Grade</th>
                    <th className="text-right px-4 py-2">Opening (L)</th>
                    <th className="text-right px-4 py-2">Delivered (L)</th>
                    <th className="text-right px-4 py-2">Dispensed (L)</th>
                    <th className="text-right px-4 py-2">Expected Closing (L)</th>
                    <th className="text-right px-4 py-2">Actual Closing (L)</th>
                    <th className="text-right px-4 py-2">Variance (L)</th>
                    <th className="text-right px-4 py-2">Variance %</th>
                    <th className="text-center px-4 py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {varianceData.map((row: any) => (
                    <tr key={row.tankId} className={`border-t ${row.status === 'ALERT' ? 'bg-red-50' : ''}`}>
                      <td className="px-4 py-3 font-medium">{row.label}</td>
                      <td className="px-4 py-3">{row.gradeName}</td>
                      <td className="px-4 py-3 text-right">{row.openingLitres.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-green-700">{row.deliveredLitres.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right text-blue-700">{row.dispensedLitres.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{row.expectedClosingLitres.toFixed(2)}</td>
                      <td className="px-4 py-3 text-right">{row.actualClosingLitres.toFixed(2)}</td>
                      <td className={`px-4 py-3 text-right font-semibold ${row.varianceLitres < 0 ? 'text-red-600' : row.varianceLitres > 0 ? 'text-green-600' : ''}`}>
                        {row.varianceLitres > 0 ? '+' : ''}{row.varianceLitres.toFixed(2)}
                      </td>
                      <td className={`px-4 py-3 text-right font-semibold ${row.variancePct < 0 ? 'text-red-600' : ''}`}>
                        {row.variancePct > 0 ? '+' : ''}{row.variancePct.toFixed(2)}%
                      </td>
                      <td className="px-4 py-3 text-center">
                        {row.status === 'ALERT' ? (
                          <span className="flex items-center justify-center gap-1 text-red-600 text-xs font-semibold">
                            <AlertTriangle className="w-3.5 h-3.5" /> ALERT
                          </span>
                        ) : (
                          <span className="flex items-center justify-center gap-1 text-green-600 text-xs font-semibold">
                            <CheckCircle className="w-3.5 h-3.5" /> OK
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                  {varianceData.length === 0 && (
                    <tr><td colSpan={10} className="px-4 py-8 text-center text-gray-400">No tank data found. Add tanks and record dippings to generate variance report.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── MAINTENANCE LOG ── */}
      {tab === 'maintenance' && (
        <div className="space-y-4">
          {/* Add maintenance record */}
          <div className="bg-white border rounded-lg p-4 space-y-3">
            <h3 className="font-semibold text-sm">Log Maintenance Activity</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <select
                className="border rounded px-3 py-1.5 text-sm"
                value={maintForm.pumpId}
                onChange={(e) => setMaintForm({ ...maintForm, pumpId: e.target.value })} aria-label="Select Pump">
                <option value="">Select Pump</option>
                {(pumps ?? []).map((p: any) => (
                  <option key={p.id} value={p.id}>Pump {p.pumpNumber}{p.label ? ` — ${p.label}` : ''}</option>
                ))}
              </select>
              <select
                className="border rounded px-3 py-1.5 text-sm"
                value={maintForm.type}
                onChange={(e) => setMaintForm({ ...maintForm, type: e.target.value })}
              >
                {['SERVICE', 'REPAIR', 'CALIBRATION', 'INSPECTION', 'EMERGENCY'].map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
              <input
                className="border rounded px-3 py-1.5 text-sm"
                placeholder="Technician name"
                value={maintForm.technicianName}
                onChange={(e) => setMaintForm({ ...maintForm, technicianName: e.target.value })}
              />
              <input
                className="border rounded px-3 py-1.5 text-sm"
                placeholder="Cost (KES)"
                type="number"
                value={maintForm.costCents / 100 || ''}
                onChange={(e) => setMaintForm({ ...maintForm, costCents: Math.round(parseFloat(e.target.value) * 100) || 0 })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <input
                className="border rounded px-3 py-1.5 text-sm col-span-2 md:col-span-1"
                placeholder="Description (required)"
                value={maintForm.description}
                onChange={(e) => setMaintForm({ ...maintForm, description: e.target.value })}
              />
              <select
                className="border rounded px-3 py-1.5 text-sm"
                value={maintForm.status}
                onChange={(e) => setMaintForm({ ...maintForm, status: e.target.value })}
              >
                {['COMPLETED', 'SCHEDULED', 'IN_PROGRESS', 'CANCELLED'].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>
            <textarea
              className="border rounded px-3 py-1.5 text-sm w-full"
              placeholder="Notes (optional)"
              rows={2}
              value={maintForm.notes}
              onChange={(e) => setMaintForm({ ...maintForm, notes: e.target.value })}
            />
            <button
              onClick={() => {
                if (!maintForm.pumpId || !maintForm.description) return;
                createMaintMutation.mutate({ ...maintForm, businessId });
              }}
              disabled={!maintForm.pumpId || !maintForm.description || createMaintMutation.isPending}
              className="px-4 py-1.5 bg-brand-600 text-white rounded text-sm hover:bg-brand-700 disabled:opacity-50"
            >
              {createMaintMutation.isPending ? 'Saving...' : 'Log Maintenance'}
            </button>
          </div>

          {/* Filter by pump */}
          <div className="flex gap-2 items-center">
            <span className="text-sm text-gray-600">Filter by pump:</span>
            <select
              className="border rounded px-3 py-1.5 text-sm"
              value={maintFilter}
              onChange={(e) => setMaintFilter(e.target.value)} aria-label="Filter by pumps">
              <option value="">All Pumps</option>
              {(pumps ?? []).map((p: any) => (
                <option key={p.id} value={p.id}>Pump {p.pumpNumber}{p.label ? ` — ${p.label}` : ''}</option>
              ))}
            </select>
          </div>

          {/* Maintenance log table */}
          <div className="bg-white border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left px-4 py-2">Pump</th>
                  <th className="text-left px-4 py-2">Type</th>
                  <th className="text-left px-4 py-2">Description</th>
                  <th className="text-left px-4 py-2">Technician</th>
                  <th className="text-right px-4 py-2">Cost</th>
                  <th className="text-left px-4 py-2">Status</th>
                  <th className="text-left px-4 py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {(maintenanceLogs ?? []).map((log: any) => (
                  <tr key={log.id} className="border-t hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">
                      P{log.pump?.pumpNumber ?? '?'}{log.pump?.label ? ` — ${log.pump.label}` : ''}
                    </td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                        log.type === 'EMERGENCY' ? 'bg-red-100 text-red-700'
                        : log.type === 'REPAIR' ? 'bg-orange-100 text-orange-700'
                        : log.type === 'CALIBRATION' ? 'bg-purple-100 text-purple-700'
                        : log.type === 'INSPECTION' ? 'bg-blue-100 text-blue-700'
                        : 'bg-green-100 text-green-700'
                      }`}>{log.type}</span>
                    </td>
                    <td className="px-4 py-2 max-w-xs truncate">{log.description}</td>
                    <td className="px-4 py-2 text-gray-600">{log.technicianName ?? '—'}</td>
                    <td className="px-4 py-2 text-right font-medium">{log.costCents > 0 ? formatKES(log.costCents) : '—'}</td>
                    <td className="px-4 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs ${
                        log.status === 'COMPLETED' ? 'bg-green-100 text-green-700'
                        : log.status === 'IN_PROGRESS' ? 'bg-blue-100 text-blue-700'
                        : log.status === 'SCHEDULED' ? 'bg-yellow-100 text-yellow-700'
                        : 'bg-gray-100 text-gray-500'
                      }`}>{log.status}</span>
                    </td>
                    <td className="px-4 py-2 text-gray-500 text-xs">{new Date(log.startedAt).toLocaleString()}</td>
                  </tr>
                ))}
                {(maintenanceLogs ?? []).length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-gray-400">No maintenance records yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Receipt of the sale just made: shown only when this business records fuel takings as sales */}
      {fuelReceipt && (
        <DirectSaleReceiptModal receipt={fuelReceipt} onClose={() => setFuelReceipt(null)} quantityLabel={(q) => `${q.toFixed(3)} L`} />
      )}
    </div>
  );
}

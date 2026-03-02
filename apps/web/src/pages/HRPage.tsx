import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Clock, Calendar, AlertCircle, TrendingUp, LayoutGrid,
  Loader2, RefreshCw, LogIn, LogOut, X, Plus, Trash2, Edit2,
  Trophy, Award,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  userId: string;
  businessId: string;
  commissionRate: number;
  commissionBasis: string;
  salesTargetCents?: number;
  startDate?: string;
  employmentType: string;
  user: { name: string; email: string; role: string };
}

interface BizUser {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  storeId: string;
  clockIn: string;
  clockOut?: string;
  isLate: boolean;
  shiftDate: string;
  employee?: { user: { name: string; role: string } };
}

interface EmployeeStats {
  daysWorked: number;
  daysLate: number;
  leaveDays: number;
}

interface Leave {
  id: string;
  employeeId: string;
  type: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: string;
  approvedBy?: string;
  createdAt: string;
}

interface PendingLeave extends Leave {
  employee: { user: { name: string; role: string } };
}

interface CommissionRow {
  employeeId: string;
  employeeName: string;
  commissionRate: number;
  salesCount: number;
  totalSalesCents: number;
  commissionCents: number;
}

interface Shift {
  id: string;
  businessId: string;
  storeId: string;
  employeeId: string;
  startTime: string;
  endTime: string;
  dayOfWeek: number;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uuid() { return crypto.randomUUID(); }

const LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'EMERGENCY'];

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const ROLE_COLORS: Record<string, string> = {
  OWNER: 'bg-purple-100 text-purple-800',
  MANAGER: 'bg-blue-100 text-blue-800',
  CASHIER: 'bg-green-100 text-green-800',
  WAITER: 'bg-orange-100 text-orange-800',
  KITCHEN: 'bg-red-100 text-red-800',
};

function fmtTime(dt: string) {
  return new Date(dt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });
}

function fmtDate(dt: string) {
  return new Date(dt).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function hoursWorked(clockIn: string, clockOut?: string): string {
  if (!clockOut) return 'In progress';
  const ms = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function fmt(cents: number) {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ─── Leave Request Modal ──────────────────────────────────────────────────────

interface LeaveModalProps {
  employeeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function LeaveModal({ employeeId, onClose, onSuccess }: LeaveModalProps) {
  const [form, setForm] = useState({ type: 'ANNUAL', startDate: '', endDate: '', reason: '' });
  const [error, setError] = useState('');

  const submit = useMutation({
    mutationFn: () =>
      api.post('/hr/leave', {
        employeeId,
        type: form.type,
        startDate: form.startDate,
        endDate: form.endDate,
        reason: form.reason || undefined,
      }),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Request Leave</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input type="date" value={form.endDate} min={form.startDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
            <textarea value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} rows={2}
              className="w-full border rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>
        <div className="border-t px-6 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">Cancel</button>
          <button onClick={() => submit.mutate()} disabled={!form.startDate || !form.endDate || submit.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2">
            {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            Submit
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Shift Modal ──────────────────────────────────────────────────────────

interface AddShiftModalProps {
  businessId: string;
  storeId: string;
  employees: Employee[];
  onClose: () => void;
  onSuccess: () => void;
  onShiftError?: (msg: string) => void;
}

function AddShiftModal({ businessId, storeId, employees, onClose, onSuccess, onShiftError }: AddShiftModalProps) {
  const [form, setForm] = useState({
    employeeId: '',
    dayOfWeek: 1,
    startTime: '08:00',
    endTime: '17:00',
  });
  const [error, setError] = useState('');

  const create = useMutation({
    mutationFn: () =>
      api.post('/hr/shifts', {
        businessId,
        storeId,
        employeeId: form.employeeId,
        dayOfWeek: form.dayOfWeek,
        startTime: form.startTime,
        endTime: form.endTime,
      }),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.toLowerCase().includes('overlap')) {
        const overlapMsg = 'This shift overlaps with an existing shift for this employee on the same day.';
        setError(overlapMsg);
        onShiftError?.(overlapMsg);
      } else {
        setError(msg);
        onShiftError?.(msg);
      }
    },
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Add Shift</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee *</label>
            <select value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">Select employee...</option>
              {employees.map((e) => (
                <option key={e.id} value={e.id}>{e.user.name} ({e.user.role})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Day of Week *</label>
            <select value={form.dayOfWeek} onChange={(e) => setForm({ ...form, dayOfWeek: Number(e.target.value) })}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              {DAY_NAMES.map((day, i) => <option key={i} value={i}>{day}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Time *</label>
              <input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Time *</label>
              <input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            </div>
          </div>
        </div>
        <div className="border-t px-6 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">Cancel</button>
          <button onClick={() => create.mutate()} disabled={!form.employeeId || create.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2">
            {create.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            Save Shift
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── My Shift Card ────────────────────────────────────────────────────────────

interface MyShiftCardProps {
  employeeId: string;
  storeId: string;
}

function MyShiftCard({ employeeId, storeId }: MyShiftCardProps) {
  const qc = useQueryClient();
  const today = new Date().toISOString().split('T')[0];

  const { data: todayAttendance = [], refetch } = useQuery<AttendanceRecord[]>({
    queryKey: ['my-attendance-today', employeeId, today],
    queryFn: () =>
      api.get<AttendanceRecord[]>(`/hr/attendance/${employeeId}?startDate=${today}&endDate=${today}`),
    enabled: !!employeeId,
    refetchInterval: 30000,
  });

  const activeRecord = todayAttendance.find((r) => !r.clockOut);

  const clockIn = useMutation({
    mutationFn: () =>
      api.post('/hr/attendance/clock-in', {
        offlineId: uuid(),
        employeeId,
        storeId,
        clockIn: new Date().toISOString(),
        shiftDate: today,
      }),
    onSuccess: () => { void refetch(); void qc.invalidateQueries({ queryKey: ['all-attendance'] }); },
  });

  const clockOut = useMutation({
    mutationFn: (recordId: string) =>
      api.patch(`/hr/attendance/${recordId}/clock-out`, { clockOut: new Date().toISOString() }),
    onSuccess: () => { void refetch(); void qc.invalidateQueries({ queryKey: ['all-attendance'] }); },
  });

  const now = new Date();
  const timeStr = now.toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' });

  return (
    <div className={`rounded-2xl p-5 text-white ${activeRecord ? 'bg-gradient-to-r from-green-600 to-green-700' : 'bg-gradient-to-r from-gray-600 to-gray-700'}`}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="font-bold text-lg">{activeRecord ? 'Shift Active' : 'Not Clocked In'}</div>
          <div className="text-sm opacity-80">{timeStr} • {fmtDate(today)}</div>
        </div>
        <Clock className="w-8 h-8 opacity-80" />
      </div>

      {activeRecord && (
        <div className="bg-white/20 rounded-xl p-3 mb-4 flex items-center justify-between">
          <div>
            <div className="text-sm opacity-80">Clocked in at</div>
            <div className="font-bold text-lg">{fmtTime(activeRecord.clockIn)}</div>
          </div>
          <div className="text-right">
            <div className="text-sm opacity-80">Duration</div>
            <div className="font-bold">{hoursWorked(activeRecord.clockIn)}</div>
          </div>
        </div>
      )}

      {todayAttendance.filter((r) => r.clockOut).map((r) => (
        <div key={r.id} className="bg-white/10 rounded-xl p-3 mb-2 flex items-center justify-between text-sm">
          <span>{fmtTime(r.clockIn)} → {r.clockOut ? fmtTime(r.clockOut) : '—'}</span>
          <span className="font-semibold">{hoursWorked(r.clockIn, r.clockOut)}</span>
        </div>
      ))}

      {activeRecord ? (
        <button onClick={() => clockOut.mutate(activeRecord.id)} disabled={clockOut.isPending}
          className="w-full py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-40">
          {clockOut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
          Clock Out
        </button>
      ) : (
        <button onClick={() => clockIn.mutate()} disabled={clockIn.isPending}
          className="w-full py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-40">
          {clockIn.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
          Clock In
        </button>
      )}
    </div>
  );
}

// ─── Commission Edit Modal ────────────────────────────────────────────────────

const COMMISSION_BASIS_LABELS: Record<string, string> = {
  SALES_VALUE: 'Sales Value (%)',
  TRANSACTION_COUNT: 'Per Transaction (KES)',
  GROSS_MARGIN: 'Gross Margin (%)',
};

interface CommissionEditModalProps {
  employee: Employee;
  businessId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function CommissionEditModal({ employee, businessId, onClose, onSuccess }: CommissionEditModalProps) {
  const [rate, setRate] = useState(employee.commissionRate);
  const [basis, setBasis] = useState(employee.commissionBasis ?? 'SALES_VALUE');
  const [error, setError] = useState('');

  const update = useMutation({
    mutationFn: () =>
      api.patch(`/hr/employees/${employee.id}?businessId=${businessId}`, {
        commissionRate: rate,
        commissionBasis: basis,
      }),
    onSuccess: () => { onSuccess(); onClose(); },
    onError: (err) => setError(err instanceof Error ? err.message : 'Failed'),
  });

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Commission Settings</h2>
            <p className="text-sm text-gray-500">{employee.user.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X className="w-5 h-5 text-gray-500" /></button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Commission Basis</label>
            <select value={basis} onChange={(e) => setBasis(e.target.value)}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
              {Object.entries(COMMISSION_BASIS_LABELS).map(([val, label]) => (
                <option key={val} value={val}>{label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {basis === 'TRANSACTION_COUNT' ? 'Amount per Transaction (KES)' : 'Rate (%)'}
            </label>
            <input type="number" min={0} max={basis === 'TRANSACTION_COUNT' ? 100000 : 100}
              step={basis === 'TRANSACTION_COUNT' ? 1 : 0.1}
              value={rate} onChange={(e) => setRate(Number(e.target.value))}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
            <p className="text-xs text-gray-400 mt-1">
              {basis === 'SALES_VALUE' && 'Percentage of total sale value'}
              {basis === 'GROSS_MARGIN' && 'Percentage of gross margin (revenue - cost)'}
              {basis === 'TRANSACTION_COUNT' && 'Fixed amount per completed transaction'}
            </p>
          </div>
        </div>
        <div className="border-t px-6 py-4 flex gap-3">
          <button onClick={onClose} className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium">Cancel</button>
          <button onClick={() => update.mutate()} disabled={update.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2">
            {update.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Add Employee Modal ───────────────────────────────────────────────────────

function AddEmployeeModal({ businessId, availableUsers, onClose, onSuccess }: {
  businessId: string;
  availableUsers: BizUser[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const qc = useQueryClient();
  const [userId, setUserId] = useState('');
  const [idNumber, setIdNumber] = useState('');
  const [employmentType, setEmploymentType] = useState('PERMANENT');
  const [commissionRate, setCommissionRate] = useState('0');
  const [salesTarget, setSalesTarget] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().substring(0, 10));
  const [emergencyContact, setEmergencyContact] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: () => api.post(`/hr/employees?businessId=${businessId}`, {
      userId, idNumber: idNumber || undefined, employmentType,
      commissionRate: parseFloat(commissionRate) || 0,
      salesTargetCents: salesTarget ? Math.round(parseFloat(salesTarget) * 100) : 0,
      startDate, emergencyContact: emergencyContact || undefined,
    }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['employees'] }); onSuccess(); },
    onError: (e: Error) => setError(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6 space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-lg font-bold">Add Employee</h2>
          <button onClick={onClose}><X className="w-5 h-5 text-gray-400" /></button>
        </div>
        {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded">{error}</div>}
        {availableUsers.length === 0 && (
          <p className="text-sm text-amber-600 bg-amber-50 p-3 rounded">
            All users already have employee records. Add more users in Settings → Users first.
          </p>
        )}
        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">User *</label>
            <select value={userId} onChange={e => setUserId(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
              <option value="">Select user…</option>
              {availableUsers.map(u => <option key={u.id} value={u.id}>{u.name} ({u.role})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">ID Number</label>
              <input value={idNumber} onChange={e => setIdNumber(e.target.value)} placeholder="National ID" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Employment Type</label>
              <select value={employmentType} onChange={e => setEmploymentType(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm">
                <option value="PERMANENT">Permanent</option>
                <option value="CONTRACT">Contract</option>
                <option value="CASUAL">Casual</option>
                <option value="INTERN">Intern</option>
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Commission Rate (%)</label>
              <input type="number" step="0.1" min="0" value={commissionRate} onChange={e => setCommissionRate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Sales Target (KES)</label>
              <input type="number" min="0" value={salesTarget} onChange={e => setSalesTarget(e.target.value)} placeholder="0" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Emergency Contact</label>
              <input value={emergencyContact} onChange={e => setEmergencyContact(e.target.value)} placeholder="Name: 07XXXXXXXX" className="w-full border rounded-lg px-3 py-2 text-sm" />
            </div>
          </div>
        </div>
        <div className="flex gap-3 pt-2">
          <button onClick={onClose} className="flex-1 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50">Cancel</button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!userId || mutation.isPending}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Saving…' : 'Add Employee'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'employees' | 'attendance' | 'leave' | 'commissions' | 'shifts' | 'performance';

export default function HRPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('overview');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [showAddShiftModal, setShowAddShiftModal] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);

  const now = new Date();
  const [commFrom, setCommFrom] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`);
  const [commTo, setCommTo] = useState(now.toISOString().split('T')[0]);

  // Performance tab state
  const [perfMonth, setPerfMonth] = useState(now.getMonth() + 1);
  const [perfYear, setPerfYear] = useState(now.getFullYear());

  // Leave balance state
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [currentYear] = useState(now.getFullYear());

  // Allocate leave modal state
  const [showAllocateModal, setShowAllocateModal] = useState(false);
  const [allocLeaveType, setAllocLeaveType] = useState('ANNUAL');
  const [allocDays, setAllocDays] = useState(21);

  // Shift overlap error
  const [shiftError, setShiftError] = useState('');

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';
  const userId = user?.id ?? '';

  const [showAddEmployee, setShowAddEmployee] = useState(false);

  const { data: employees = [], isLoading: empLoading, refetch: refetchEmps } = useQuery<Employee[]>({
    queryKey: ['employees', businessId],
    queryFn: () => api.get<Employee[]>(`/hr/employees?businessId=${businessId}`),
    enabled: !!businessId,
  });

  // Users without employee records — available to link as employees
  const { data: bizUsers = [] } = useQuery<BizUser[]>({
    queryKey: ['biz-users', businessId],
    queryFn: () => api.get<BizUser[]>(`/business/${businessId}/users`),
    enabled: !!businessId && showAddEmployee,
  });

  const myEmployee = employees.find((e) => e.userId === userId);

  const { data: allAttendance = [], isLoading: attLoading, refetch: refetchAtt } = useQuery<AttendanceRecord[]>({
    queryKey: ['all-attendance', businessId, storeId, attendanceDate],
    queryFn: () =>
      api.get<AttendanceRecord[]>(`/hr/attendance?businessId=${businessId}&storeId=${storeId}&date=${attendanceDate}`),
    enabled: !!businessId && !!storeId && tab === 'attendance',
  });

  const month = now.getMonth() + 1;
  const year = now.getFullYear();

  const { data: myStats } = useQuery<EmployeeStats | null>({
    queryKey: ['my-stats', myEmployee?.id, month, year],
    queryFn: () =>
      myEmployee?.id
        ? api.get<EmployeeStats>(`/hr/stats/${myEmployee.id}?month=${month}&year=${year}`)
        : Promise.resolve(null),
    enabled: !!myEmployee?.id,
  });

  const { data: myLeaves = [], refetch: refetchLeaves } = useQuery<Leave[]>({
    queryKey: ['my-leaves', myEmployee?.id],
    queryFn: () =>
      myEmployee?.id ? api.get<Leave[]>(`/hr/leave/${myEmployee.id}`) : Promise.resolve([]),
    enabled: !!myEmployee?.id && tab === 'leave',
  });

  const isManager = user?.role === 'OWNER' || user?.role === 'MANAGER';

  const { data: pendingLeaves = [] } = useQuery<PendingLeave[]>({
    queryKey: ['pending-leaves', businessId],
    queryFn: () => api.get<PendingLeave[]>(`/hr/leave?businessId=${businessId}`),
    enabled: !!businessId && tab === 'leave' && isManager,
  });

  const approveLeave = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.patch(`/hr/leave/${id}/approve`, { approvedBy: user?.id ?? '' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pending-leaves'] });
      void qc.invalidateQueries({ queryKey: ['my-leaves'] });
    },
  });

  const rejectLeave = useMutation({
    mutationFn: ({ id }: { id: string }) =>
      api.patch(`/hr/leave/${id}/reject`, { approvedBy: user?.id ?? '' }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['pending-leaves'] });
      void qc.invalidateQueries({ queryKey: ['my-leaves'] });
    },
  });

  const { data: commissions = [], isLoading: commLoading } = useQuery<CommissionRow[]>({
    queryKey: ['commissions', businessId, commFrom, commTo],
    queryFn: () =>
      api.get<CommissionRow[]>(
        `/reports/commissions?businessId=${businessId}&startDate=${commFrom}T00:00:00Z&endDate=${commTo}T23:59:59Z`,
      ),
    enabled: !!businessId && tab === 'commissions',
  });

  const { data: shifts = [], isLoading: shiftsLoading, refetch: refetchShifts } = useQuery<Shift[]>({
    queryKey: ['shifts', businessId, storeId],
    queryFn: () =>
      api.get<Shift[]>(`/hr/shifts?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId && tab === 'shifts',
  });

  const deleteShift = useMutation({
    mutationFn: (id: string) => api.delete(`/hr/shifts/${id}?businessId=${businessId}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['shifts'] }),
  });

  // Performance query
  const { data: performanceData = [] } = useQuery<any[]>({
    queryKey: ['hr-performance', businessId, perfMonth, perfYear],
    queryFn: () => api.get(`/hr/performance?businessId=${businessId}&month=${perfMonth}&year=${perfYear}`),
    enabled: !!businessId && tab === 'performance',
  });

  // Leave balances query
  const { data: leaveBalances = [] } = useQuery<any[]>({
    queryKey: ['leave-balances', selectedEmployee, currentYear],
    queryFn: () => api.get(`/hr/leave-balance?employeeId=${selectedEmployee}&year=${currentYear}`),
    enabled: !!selectedEmployee,
  });

  // Allocate leave mutation
  const allocateLeaveMutation = useMutation({
    mutationFn: (data: any) => api.post('/hr/leave-balance', data),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['leave-balances'] });
      setShowAllocateModal(false);
    },
  });

  const tabs: Array<{ id: Tab; label: string; icon: React.ComponentType<{ className?: string }> }> = [
    { id: 'overview', label: 'Overview', icon: Users },
    { id: 'employees', label: 'Team', icon: Users },
    { id: 'attendance', label: 'Attendance', icon: Clock },
    { id: 'leave', label: 'Leave', icon: Calendar },
    { id: 'commissions', label: 'Commissions', icon: TrendingUp },
    { id: 'shifts', label: 'Shifts', icon: LayoutGrid },
    { id: 'performance', label: 'Performance', icon: Award },
  ];

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Human Resources</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {employees.length} employees
              {myEmployee && <span className="ml-2 text-green-600 font-medium">• Your record is active</span>}
            </p>
          </div>
          <button onClick={() => { void refetchEmps(); void refetchAtt(); }}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg">
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 mt-3 overflow-x-auto">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${
                tab === id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}>
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">

        {/* ── Overview ── */}
        {tab === 'overview' && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl border p-4">
                <p className="text-xs font-medium text-gray-500 uppercase mb-1">Total Employees</p>
                <p className="text-2xl font-bold text-gray-800">{employees.length}</p>
              </div>
              {myStats && (
                <>
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Days Worked (Month)</p>
                    <p className="text-2xl font-bold text-green-600">{myStats.daysWorked}</p>
                  </div>
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Days Late</p>
                    <p className={`text-2xl font-bold ${myStats.daysLate > 0 ? 'text-red-600' : 'text-gray-400'}`}>
                      {myStats.daysLate}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Leave Days Used</p>
                    <p className="text-2xl font-bold text-orange-600">{myStats.leaveDays}</p>
                  </div>
                </>
              )}
            </div>

            {myEmployee ? (
              <MyShiftCard employeeId={myEmployee.id} storeId={storeId} />
            ) : (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="font-semibold text-amber-800">No Employee Record Found</p>
                <p className="text-sm text-amber-600 mt-1">Your account doesn't have an employee record. Contact your manager.</p>
              </div>
            )}

            {myEmployee && (
              <div className="bg-white rounded-2xl border p-5 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">Leave Requests</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Request time off or vacation</p>
                </div>
                <button onClick={() => setShowLeaveModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm">
                  <Plus className="w-4 h-4" />
                  Request Leave
                </button>
              </div>
            )}
          </>
        )}

        {/* ── Team Tab ── */}
        {tab === 'employees' && (
          <>
            {isManager && (
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setShowAddEmployee(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
                >
                  <Plus className="w-4 h-4" /> Add Employee
                </button>
              </div>
            )}
            {empLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-20">
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium text-lg">No employee records</p>
                <p className="text-gray-400 text-sm mt-2">Click "Add Employee" above to link a user as an employee</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Employee</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Role</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">Type</th>
                      <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Commission</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden sm:table-cell">Start Date</th>
                      <th className="w-12" />
                    </tr>
                  </thead>
                  <tbody>
                    {employees.map((emp) => (
                      <tr key={emp.id} className="border-t hover:bg-gray-50 transition-colors">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-800">{emp.user.name}</div>
                          <div className="text-xs text-gray-400">{emp.user.email}</div>
                        </td>
                        <td className="px-4 py-4">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ROLE_COLORS[emp.user.role] ?? 'bg-gray-100 text-gray-600'}`}>
                            {emp.user.role}
                          </span>
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 hidden md:table-cell">{emp.employmentType}</td>
                        <td className="px-4 py-4 text-right">
                          {emp.commissionRate > 0 ? (
                            <div>
                              <div className="font-semibold text-gray-800">
                                {emp.commissionBasis === 'TRANSACTION_COUNT'
                                  ? `KES ${emp.commissionRate}/txn`
                                  : `${emp.commissionRate}%`}
                              </div>
                              <div className="text-xs text-gray-400">
                                {emp.commissionBasis === 'SALES_VALUE' ? 'of sales' :
                                 emp.commissionBasis === 'GROSS_MARGIN' ? 'of margin' : 'per txn'}
                              </div>
                            </div>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 hidden sm:table-cell">
                          {emp.startDate ? fmtDate(emp.startDate) : '—'}
                        </td>
                        <td className="px-4 py-4">
                          {isManager && (
                            <button onClick={() => setEditingEmployee(emp)}
                              className="p-1.5 rounded-lg hover:bg-blue-50 text-gray-400 hover:text-blue-600 transition-colors">
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Attendance Tab ── */}
        {tab === 'attendance' && (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
                <input type="date" value={attendanceDate} onChange={(e) => setAttendanceDate(e.target.value)}
                  className="border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div className="flex gap-3">
                <div className="text-center bg-white border rounded-xl px-4 py-2">
                  <div className="text-2xl font-bold text-green-600">{allAttendance.filter((r) => !r.clockOut).length}</div>
                  <div className="text-xs text-gray-500">Clocked In</div>
                </div>
                <div className="text-center bg-white border rounded-xl px-4 py-2">
                  <div className="text-2xl font-bold text-blue-600">{allAttendance.filter((r) => r.clockOut).length}</div>
                  <div className="text-xs text-gray-500">Completed</div>
                </div>
                <div className="text-center bg-white border rounded-xl px-4 py-2">
                  <div className="text-2xl font-bold text-red-500">{allAttendance.filter((r) => r.isLate).length}</div>
                  <div className="text-xs text-gray-500">Late</div>
                </div>
              </div>
            </div>

            {attLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : allAttendance.length === 0 ? (
              <div className="text-center py-20">
                <Clock className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">No records for {fmtDate(attendanceDate)}</p>
              </div>
            ) : (
              <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Employee</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Clock In</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Clock Out</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Hours</th>
                      <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allAttendance.map((rec) => (
                      <tr key={rec.id} className="border-t">
                        <td className="px-6 py-4">
                          <div className="font-semibold text-gray-800">{rec.employee?.user.name ?? rec.employeeId.slice(0, 8)}</div>
                          <div className="text-xs text-gray-400">{rec.employee?.user.role ?? ''}</div>
                        </td>
                        <td className="px-4 py-4 text-center text-sm font-mono text-gray-700">{fmtTime(rec.clockIn)}</td>
                        <td className="px-4 py-4 text-center text-sm font-mono text-gray-700">
                          {rec.clockOut ? fmtTime(rec.clockOut) : <span className="text-green-600 font-semibold text-xs">Active</span>}
                        </td>
                        <td className="px-4 py-4 text-center text-sm text-gray-600">{hoursWorked(rec.clockIn, rec.clockOut)}</td>
                        <td className="px-4 py-4 text-center">
                          {rec.isLate
                            ? <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">Late</span>
                            : <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">On Time</span>
                          }
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

        {/* ── Leave Tab ── */}
        {tab === 'leave' && (
          <>
            {/* Manager: Pending Approvals Section */}
            {isManager && pendingLeaves.length > 0 && (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <h2 className="font-semibold text-gray-700">Pending Approvals</h2>
                  <span className="text-xs bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-semibold">{pendingLeaves.length}</span>
                </div>
                {pendingLeaves.map((leave) => {
                  const days = Math.ceil((new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / 86400000) + 1;
                  return (
                    <div key={leave.id} className="bg-amber-50 border border-amber-200 rounded-2xl p-5">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-gray-800">{leave.employee.user.name}</span>
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{leave.type}</span>
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{days} day{days !== 1 ? 's' : ''}</span>
                          </div>
                          <div className="text-sm text-gray-500 mt-1">{fmtDate(leave.startDate)} → {fmtDate(leave.endDate)}</div>
                          {leave.reason && <p className="text-sm text-gray-600 mt-1">{leave.reason}</p>}
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <button
                            onClick={() => approveLeave.mutate({ id: leave.id })}
                            disabled={approveLeave.isPending}
                            className="px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => rejectLeave.mutate({ id: leave.id })}
                            disabled={rejectLeave.isPending}
                            className="px-3 py-1.5 bg-red-600 hover:bg-red-700 text-white rounded-lg text-xs font-medium"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div className="border-t pt-4 mt-2" />
              </div>
            )}

            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">My Leave Requests</h2>
              <div className="flex items-center gap-2">
                {isManager && (
                  <button onClick={() => setShowAllocateModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-medium text-sm">
                    <Plus className="w-4 h-4" />
                    Allocate Leave
                  </button>
                )}
                {myEmployee && (
                  <button onClick={() => setShowLeaveModal(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm">
                    <Plus className="w-4 h-4" />
                    New Request
                  </button>
                )}
              </div>
            </div>

            {/* Employee selector for leave balances (managers see all employees) */}
            {isManager && employees.length > 0 && (
              <div className="flex items-center gap-3">
                <label className="text-sm font-medium text-gray-600 whitespace-nowrap">View balances for:</label>
                <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
                  className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                  <option value="">Select employee...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.user.name} ({e.user.role})</option>
                  ))}
                </select>
              </div>
            )}

            {/* Leave balance chips */}
            {selectedEmployee && leaveBalances.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-2">
                {leaveBalances.map((lb: any) => (
                  <div key={lb.id} className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg px-3 py-2 text-xs min-w-[120px]">
                    <span className="font-medium text-blue-700 dark:text-blue-300">{lb.leaveType}</span>
                    <span className="text-gray-600 dark:text-gray-400 ml-2">{lb.usedDays}/{lb.allocatedDays} days</span>
                    <div className="w-full bg-gray-200 rounded-full h-1 mt-1">
                      <div className="bg-blue-500 h-1 rounded-full" style={{ width: `${Math.min(100, (lb.usedDays / lb.allocatedDays) * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {!myEmployee ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="font-semibold text-amber-800">No Employee Record</p>
              </div>
            ) : myLeaves.length === 0 ? (
              <div className="text-center py-20">
                <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">No leave requests</p>
                <button onClick={() => setShowLeaveModal(true)}
                  className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium">
                  Request Leave
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {myLeaves.map((leave) => {
                  const days = Math.ceil((new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / 86400000) + 1;
                  const statusColor = leave.status === 'APPROVED'
                    ? 'bg-green-100 text-green-700'
                    : leave.status === 'REJECTED'
                    ? 'bg-red-100 text-red-700'
                    : 'bg-amber-100 text-amber-700';
                  return (
                    <div key={leave.id} className="bg-white rounded-2xl border p-5 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800">{leave.type} Leave</span>
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">{days} day{days !== 1 ? 's' : ''}</span>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${statusColor}`}>{leave.status}</span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">{fmtDate(leave.startDate)} → {fmtDate(leave.endDate)}</div>
                        {leave.reason && <p className="text-sm text-gray-600 mt-1">{leave.reason}</p>}
                      </div>
                      <div className="text-xs text-gray-400">{fmtDate(leave.createdAt)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {/* ── Commissions Tab ── */}
        {tab === 'commissions' && (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">From</label>
                <input type="date" value={commFrom} onChange={(e) => setCommFrom(e.target.value)}
                  className="border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">To</label>
                <input type="date" value={commTo} onChange={(e) => setCommTo(e.target.value)}
                  className="border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500" />
              </div>
            </div>

            {commLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : commissions.length === 0 ? (
              <div className="text-center py-20">
                <TrendingUp className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">No commission data for this period</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Total Commissions</p>
                    <p className="text-xl font-bold text-blue-600">
                      {fmt(commissions.reduce((s, c) => s + c.commissionCents, 0))}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Total Sales</p>
                    <p className="text-xl font-bold text-green-600">
                      {fmt(commissions.reduce((s, c) => s + c.totalSalesCents, 0))}
                    </p>
                  </div>
                  <div className="bg-white rounded-xl border p-4">
                    <p className="text-xs font-medium text-gray-500 uppercase mb-1">Transactions</p>
                    <p className="text-xl font-bold text-gray-800">
                      {commissions.reduce((s, c) => s + c.salesCount, 0)}
                    </p>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border overflow-hidden shadow-sm">
                  <table className="w-full">
                    <thead className="bg-gray-50 border-b">
                      <tr>
                        <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase">Employee</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Rate</th>
                        <th className="text-center px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Sales</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Total Sales</th>
                        <th className="text-right px-4 py-3 text-xs font-semibold text-gray-500 uppercase">Commission Earned</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commissions
                        .sort((a, b) => b.commissionCents - a.commissionCents)
                        .map((c) => (
                          <tr key={c.employeeId} className="border-t hover:bg-gray-50">
                            <td className="px-6 py-4 font-semibold text-gray-800">{c.employeeName}</td>
                            <td className="px-4 py-4 text-center text-sm text-gray-600">{c.commissionRate}%</td>
                            <td className="px-4 py-4 text-center text-sm text-gray-600">{c.salesCount}</td>
                            <td className="px-4 py-4 text-right text-sm text-gray-700">{fmt(c.totalSalesCents)}</td>
                            <td className="px-4 py-4 text-right font-bold text-green-700">{fmt(c.commissionCents)}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}

        {/* ── Shifts Tab ── */}
        {tab === 'shifts' && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">Shift Schedule</h2>
              <button onClick={() => { setShiftError(''); setShowAddShiftModal(true); }}
                className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm">
                <Plus className="w-4 h-4" />
                Add Shift
              </button>
            </div>

            {shiftError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-start gap-2">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <span>{shiftError}</span>
                <button onClick={() => setShiftError('')} className="ml-auto text-red-400 hover:text-red-600">
                  <X className="w-4 h-4" />
                </button>
              </div>
            )}

            {shiftsLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : shifts.length === 0 ? (
              <div className="text-center py-20">
                <LayoutGrid className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">No shifts scheduled</p>
                <p className="text-sm text-gray-400 mt-1">Add shifts to build your team schedule</p>
                <button onClick={() => setShowAddShiftModal(true)}
                  className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium">
                  Add First Shift
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {DAY_NAMES.map((dayName, dayIndex) => {
                  const dayShifts = shifts.filter((s) => s.dayOfWeek === dayIndex);
                  if (dayShifts.length === 0) return null;
                  return (
                    <div key={dayIndex} className="bg-white rounded-2xl border overflow-hidden shadow-sm">
                      <div className="bg-gray-50 border-b px-6 py-3">
                        <h3 className="font-bold text-gray-700">{dayName}</h3>
                      </div>
                      <div className="divide-y">
                        {dayShifts.map((shift) => {
                          const emp = employees.find((e) => e.id === shift.employeeId);
                          return (
                            <div key={shift.id} className="px-6 py-4 flex items-center justify-between">
                              <div className="flex items-center gap-3">
                                <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center text-blue-700 font-bold text-sm">
                                  {emp?.user.name.slice(0, 2).toUpperCase() ?? '??'}
                                </div>
                                <div>
                                  <p className="font-semibold text-gray-800">{emp?.user.name ?? 'Unknown'}</p>
                                  <p className="text-xs text-gray-500">{emp?.user.role ?? ''}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-4">
                                <div className="text-center">
                                  <p className="text-sm font-bold text-gray-700 font-mono">
                                    {shift.startTime} – {shift.endTime}
                                  </p>
                                </div>
                                <button
                                  onClick={() => deleteShift.mutate(shift.id)}
                                  disabled={deleteShift.isPending}
                                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                  title="Delete shift"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
        {/* ── Performance Tab ── */}
        {tab === 'performance' && (
          <div className="space-y-4">
            {/* Month/Year selector */}
            <div className="flex gap-3 items-center">
              <select value={perfMonth} onChange={e => setPerfMonth(+e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                  <option key={m} value={m}>{new Date(2024, m - 1).toLocaleDateString('en', { month: 'long' })}</option>
                ))}
              </select>
              <select value={perfYear} onChange={e => setPerfYear(+e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500">
                {[2024, 2025, 2026].map(y => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">Team Revenue</p>
                <p className="text-2xl font-bold text-gray-800 dark:text-white mt-1">
                  {fmt(performanceData.reduce((s, e) => s + (e.totalSalesCents ?? 0), 0))}
                </p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">Top Performer</p>
                <div className="flex items-center gap-2 mt-1">
                  {performanceData.find(e => e.isTopPerformer) && (
                    <Trophy className="w-5 h-5 text-yellow-500 flex-shrink-0" />
                  )}
                  <p className="text-xl font-bold text-gray-800 dark:text-white truncate">
                    {performanceData.find(e => e.isTopPerformer)?.employeeName ?? '—'}
                  </p>
                </div>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
                <p className="text-sm text-gray-500 dark:text-gray-400">Avg Attainment</p>
                <p className="text-xl font-bold text-gray-800 dark:text-white mt-1">
                  {(() => {
                    const withTarget = performanceData.filter(e => e.targetAttainmentPct !== null && e.targetAttainmentPct !== undefined);
                    if (!withTarget.length) return '—';
                    return `${Math.round(withTarget.reduce((s, e) => s + (e.targetAttainmentPct ?? 0), 0) / withTarget.length)}%`;
                  })()}
                </p>
              </div>
            </div>

            {/* Performance table */}
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-gray-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-gray-600 dark:text-gray-300">Employee</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Sales</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Target</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Attainment</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Commission</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Days</th>
                    <th className="px-4 py-3 text-right font-medium text-gray-600 dark:text-gray-300">Streak</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {performanceData.map(emp => (
                    <tr key={emp.employeeId} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900 dark:text-white">
                        {emp.isTopPerformer && (
                          <Trophy className="inline w-4 h-4 text-yellow-500 mr-1 -mt-0.5" />
                        )}
                        {emp.employeeName}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {fmt(emp.totalSalesCents ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {emp.salesTargetCents ? fmt(emp.salesTargetCents) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right">
                        {emp.targetAttainmentPct !== null && emp.targetAttainmentPct !== undefined ? (
                          <span className={`font-medium ${
                            emp.targetAttainmentPct >= 100
                              ? 'text-green-600'
                              : emp.targetAttainmentPct >= 50
                              ? 'text-yellow-600'
                              : 'text-red-600'
                          }`}>
                            {emp.targetAttainmentPct}%
                          </span>
                        ) : '—'}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {fmt(emp.commissionCents ?? 0)}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {emp.daysWorked ?? 0}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 dark:text-gray-300">
                        {emp.attendanceStreak ?? 0}d
                      </td>
                    </tr>
                  ))}
                  {performanceData.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-8 text-center text-gray-400">
                        No performance data for this period
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

      </div>

      {/* Modals */}
      {showLeaveModal && myEmployee && (
        <LeaveModal
          employeeId={myEmployee.id}
          onClose={() => setShowLeaveModal(false)}
          onSuccess={() => void refetchLeaves()}
        />
      )}

      {showAddEmployee && (
        <AddEmployeeModal
          businessId={businessId}
          availableUsers={bizUsers.filter(u => !employees.some(e => e.userId === u.id))}
          onClose={() => setShowAddEmployee(false)}
          onSuccess={() => { setShowAddEmployee(false); void refetchEmps(); }}
        />
      )}

      {showAddShiftModal && (
        <AddShiftModal
          businessId={businessId}
          storeId={storeId}
          employees={employees}
          onClose={() => setShowAddShiftModal(false)}
          onSuccess={() => void refetchShifts()}
          onShiftError={(msg) => { setShiftError(msg); setShowAddShiftModal(false); }}
        />
      )}

      {editingEmployee && (
        <CommissionEditModal
          employee={editingEmployee}
          businessId={businessId}
          onClose={() => setEditingEmployee(null)}
          onSuccess={() => void refetchEmps()}
        />
      )}

      {/* Allocate Leave Modal */}
      {showAllocateModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">Allocate Leave</h2>
              <button onClick={() => setShowAllocateModal(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Employee *</label>
                <select value={selectedEmployee} onChange={e => setSelectedEmployee(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  <option value="">Select employee...</option>
                  {employees.map(e => (
                    <option key={e.id} value={e.id}>{e.user.name} ({e.user.role})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Leave Type *</label>
                <select value={allocLeaveType} onChange={e => setAllocLeaveType(e.target.value)}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                  {LEAVE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Days Allocated *</label>
                <input type="number" min={1} max={365} value={allocDays} onChange={e => setAllocDays(Number(e.target.value))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
              </div>
            </div>
            <div className="border-t dark:border-gray-700 px-6 py-4 flex gap-3">
              <button onClick={() => setShowAllocateModal(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 font-medium">
                Cancel
              </button>
              <button
                onClick={() => allocateLeaveMutation.mutate({
                  employeeId: selectedEmployee,
                  leaveType: allocLeaveType,
                  allocatedDays: allocDays,
                  year: currentYear,
                })}
                disabled={!selectedEmployee || allocateLeaveMutation.isPending}
                className="flex-1 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2">
                {allocateLeaveMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
                Allocate
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

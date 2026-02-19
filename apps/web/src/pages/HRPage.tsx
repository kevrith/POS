import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users, Clock, Calendar, AlertCircle,
  Loader2, RefreshCw, LogIn, LogOut, ChevronRight, X, Plus,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Employee {
  id: string;
  userId: string;
  businessId: string;
  commissionRate: number;
  salesTargetCents?: number;
  startDate?: string;
  employmentType: string;
  user: { name: string; email: string; role: string };
}

interface AttendanceRecord {
  id: string;
  employeeId: string;
  storeId: string;
  clockIn: string;
  clockOut?: string;
  isLate: boolean;
  shiftDate: string;
  employee?: {
    user: { name: string; role: string };
  };
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
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function uuid() {
  return crypto.randomUUID();
}

const LEAVE_TYPES = ['ANNUAL', 'SICK', 'MATERNITY', 'PATERNITY', 'UNPAID', 'EMERGENCY'];

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

// ─── Leave Request Modal ──────────────────────────────────────────────────────

interface LeaveModalProps {
  employeeId: string;
  onClose: () => void;
  onSuccess: () => void;
}

function LeaveModal({ employeeId, onClose, onSuccess }: LeaveModalProps) {
  const [form, setForm] = useState({
    type: 'ANNUAL',
    startDate: '',
    endDate: '',
    reason: '',
  });
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
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4" /> {error}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Leave Type</label>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
            >
              {LEAVE_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={form.startDate}
                onChange={(e) => setForm({ ...form, startDate: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">End Date</label>
              <input
                type="date"
                value={form.endDate}
                min={form.startDate}
                onChange={(e) => setForm({ ...form, endDate: e.target.value })}
                className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason (optional)</label>
            <textarea
              value={form.reason}
              onChange={(e) => setForm({ ...form, reason: e.target.value })}
              rows={2}
              className="w-full border rounded-xl px-3 py-2 text-sm resize-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="border-t px-6 py-4 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50 font-medium"
          >
            Cancel
          </button>
          <button
            onClick={() => submit.mutate()}
            disabled={!form.startDate || !form.endDate || submit.isPending}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {submit.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            Submit
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
      api.get<AttendanceRecord[]>(
        `/hr/attendance/${employeeId}?startDate=${today}&endDate=${today}`,
      ),
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
        <button
          onClick={() => clockOut.mutate(activeRecord.id)}
          disabled={clockOut.isPending}
          className="w-full py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
        >
          {clockOut.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
          Clock Out
        </button>
      ) : (
        <button
          onClick={() => clockIn.mutate()}
          disabled={clockIn.isPending}
          className="w-full py-3 bg-white/20 hover:bg-white/30 text-white font-bold rounded-xl flex items-center justify-center gap-2 transition-colors disabled:opacity-40"
        >
          {clockIn.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
          Clock In
        </button>
      )}
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

type Tab = 'overview' | 'employees' | 'attendance' | 'leave';

export default function HRPage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('overview');
  const [showLeaveModal, setShowLeaveModal] = useState(false);
  const [attendanceDate, setAttendanceDate] = useState(new Date().toISOString().split('T')[0]);

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';
  const userId = user?.id ?? '';

  const { data: employees = [], isLoading: empLoading, refetch: refetchEmps } = useQuery<Employee[]>({
    queryKey: ['employees', businessId],
    queryFn: () => api.get<Employee[]>(`/hr/employees?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const myEmployee = employees.find((e) => e.userId === userId);

  const { data: allAttendance = [], isLoading: attLoading, refetch: refetchAtt } = useQuery<AttendanceRecord[]>({
    queryKey: ['all-attendance', businessId, storeId, attendanceDate],
    queryFn: () =>
      api.get<AttendanceRecord[]>(
        `/hr/attendance?businessId=${businessId}&storeId=${storeId}&date=${attendanceDate}`,
      ),
    enabled: !!businessId && !!storeId && tab === 'attendance',
  });

  const now = new Date();
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
      myEmployee?.id
        ? api.get<Leave[]>(`/hr/leave/${myEmployee.id}`)
        : Promise.resolve([]),
    enabled: !!myEmployee?.id && tab === 'leave',
  });

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
          <button
            onClick={() => { void refetchEmps(); void refetchAtt(); }}
            className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <RefreshCw className="w-5 h-5" />
          </button>
        </div>

        <div className="flex gap-1 mt-3">
          {([
            { id: 'overview' as const, label: 'Overview', Icon: Users },
            { id: 'employees' as const, label: 'Team', Icon: Users },
            { id: 'attendance' as const, label: 'Attendance', Icon: Clock },
            { id: 'leave' as const, label: 'Leave', Icon: Calendar },
          ]).map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                tab === id ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
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
                <p className="text-sm text-amber-600 mt-1">
                  Your account doesn't have an employee record. Contact your manager.
                </p>
              </div>
            )}

            {myEmployee && (
              <div className="bg-white rounded-2xl border p-5 flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-gray-800">Leave Requests</h3>
                  <p className="text-sm text-gray-500 mt-0.5">Request time off or vacation</p>
                </div>
                <button
                  onClick={() => setShowLeaveModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm"
                >
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
            {empLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
              </div>
            ) : employees.length === 0 ? (
              <div className="text-center py-20">
                <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium text-lg">No employee records</p>
                <p className="text-sm text-gray-400 mt-1">
                  Employee records are created when users register with the business
                </p>
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
                        <td className="px-4 py-4 text-sm text-gray-600 hidden md:table-cell">
                          {emp.employmentType}
                        </td>
                        <td className="px-4 py-4 text-right font-semibold text-gray-800">
                          {emp.commissionRate > 0 ? `${emp.commissionRate}%` : '—'}
                        </td>
                        <td className="px-4 py-4 text-sm text-gray-600 hidden sm:table-cell">
                          {emp.startDate ? fmtDate(emp.startDate) : '—'}
                        </td>
                        <td className="px-4 py-4">
                          <ChevronRight className="w-4 h-4 text-gray-400" />
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
                <input
                  type="date"
                  value={attendanceDate}
                  onChange={(e) => setAttendanceDate(e.target.value)}
                  className="border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div className="flex gap-3">
                <div className="text-center bg-white border rounded-xl px-4 py-2">
                  <div className="text-2xl font-bold text-green-600">
                    {allAttendance.filter((r) => !r.clockOut).length}
                  </div>
                  <div className="text-xs text-gray-500">Clocked In</div>
                </div>
                <div className="text-center bg-white border rounded-xl px-4 py-2">
                  <div className="text-2xl font-bold text-blue-600">
                    {allAttendance.filter((r) => r.clockOut).length}
                  </div>
                  <div className="text-xs text-gray-500">Completed</div>
                </div>
                <div className="text-center bg-white border rounded-xl px-4 py-2">
                  <div className="text-2xl font-bold text-red-500">
                    {allAttendance.filter((r) => r.isLate).length}
                  </div>
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
                          <div className="font-semibold text-gray-800">
                            {rec.employee?.user.name ?? rec.employeeId.slice(0, 8)}
                          </div>
                          <div className="text-xs text-gray-400">{rec.employee?.user.role ?? ''}</div>
                        </td>
                        <td className="px-4 py-4 text-center text-sm font-mono text-gray-700">
                          {fmtTime(rec.clockIn)}
                        </td>
                        <td className="px-4 py-4 text-center text-sm font-mono text-gray-700">
                          {rec.clockOut ? fmtTime(rec.clockOut) : (
                            <span className="text-green-600 font-semibold text-xs">Active</span>
                          )}
                        </td>
                        <td className="px-4 py-4 text-center text-sm text-gray-600">
                          {hoursWorked(rec.clockIn, rec.clockOut)}
                        </td>
                        <td className="px-4 py-4 text-center">
                          {rec.isLate ? (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full font-semibold">Late</span>
                          ) : (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full font-semibold">On Time</span>
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

        {/* ── Leave Tab ── */}
        {tab === 'leave' && (
          <>
            <div className="flex items-center justify-between">
              <h2 className="font-semibold text-gray-700">Leave Requests</h2>
              {myEmployee && (
                <button
                  onClick={() => setShowLeaveModal(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm"
                >
                  <Plus className="w-4 h-4" />
                  New Request
                </button>
              )}
            </div>

            {!myEmployee ? (
              <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 text-center">
                <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                <p className="font-semibold text-amber-800">No Employee Record</p>
                <p className="text-sm text-amber-600 mt-1">You need an employee record to request leave.</p>
              </div>
            ) : myLeaves.length === 0 ? (
              <div className="text-center py-20">
                <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <p className="text-gray-500 font-medium">No leave requests</p>
                <button
                  onClick={() => setShowLeaveModal(true)}
                  className="mt-4 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium"
                >
                  Request Leave
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {myLeaves.map((leave) => {
                  const days = Math.ceil(
                    (new Date(leave.endDate).getTime() - new Date(leave.startDate).getTime()) / 86400000,
                  ) + 1;
                  return (
                    <div key={leave.id} className="bg-white rounded-2xl border p-5 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-gray-800">{leave.type} Leave</span>
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">
                            {days} day{days !== 1 ? 's' : ''}
                          </span>
                        </div>
                        <div className="text-sm text-gray-500 mt-1">
                          {fmtDate(leave.startDate)} → {fmtDate(leave.endDate)}
                        </div>
                        {leave.reason && (
                          <p className="text-sm text-gray-600 mt-1">{leave.reason}</p>
                        )}
                      </div>
                      <div className="text-xs text-gray-400">{fmtDate(leave.createdAt)}</div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {showLeaveModal && myEmployee && (
        <LeaveModal
          employeeId={myEmployee.id}
          onClose={() => setShowLeaveModal(false)}
          onSuccess={() => void refetchLeaves()}
        />
      )}
    </div>
  );
}

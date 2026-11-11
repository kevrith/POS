import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Loader2, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatKES } from '@pos/shared';
import { api } from '../../lib/api';
import { nairobiDay } from '../../lib/nairobiDay';
import { hoursLabel, type Stylist, type WorkingHours } from '../../lib/salon';

interface TeamData { stylists: Stylist[]; others?: Array<{ userId: string; name: string; role: string }> }
interface Earning { staffId: string; name: string; services: number; revenueCents: number; commissionRate: number | null; commissionBasis: string | null; commissionCents: number | null }

const DAYS: Array<[keyof WorkingHours, string]> = [['1', 'Mon'], ['2', 'Tue'], ['3', 'Wed'], ['4', 'Thu'], ['5', 'Fri'], ['6', 'Sat'], ['0', 'Sun']];

function HoursEditor({ value, onChange }: { value: WorkingHours; onChange: (h: WorkingHours) => void }) {
  return (
    <div className="space-y-1.5">
      {DAYS.map(([d, label]) => {
        const range = value[d];
        return (
          <div key={d} className="flex items-center gap-2 text-sm">
            <label className="flex w-16 items-center gap-1.5">
              <input type="checkbox" checked={!!range} aria-label={`Works on ${label}`}
                onChange={(e) => { const next = { ...value }; if (e.target.checked) next[d] = ['09:00', '18:00']; else delete next[d]; onChange(next); }} />
              {label}
            </label>
            {range ? (
              <>
                <input type="time" value={range[0]} aria-label={`${label} start`} onChange={(e) => onChange({ ...value, [d]: [e.target.value, range[1]] })} className="rounded-lg border px-2 py-1 dark:border-gray-600 dark:bg-gray-700" />
                <span className="text-gray-400">to</span>
                <input type="time" value={range[1]} aria-label={`${label} end`} onChange={(e) => onChange({ ...value, [d]: [range[0], e.target.value] })} className="rounded-lg border px-2 py-1 dark:border-gray-600 dark:bg-gray-700" />
              </>
            ) : <span className="text-xs text-gray-400">Day off</span>}
          </div>
        );
      })}
    </div>
  );
}

/** For a manager: who takes appointments and when they work, and what each earned from the services they performed. */
export default function TeamModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<TeamData>({ queryKey: ['salon-team'], queryFn: () => api.get<TeamData>('/appointments/staff') });
  const [range, setRange] = useState<'today' | 'month'>('month');
  const today = nairobiDay();
  const from = range === 'today' ? today : `${today.slice(0, 7)}-01`;
  const { data: earnings = [] } = useQuery<Earning[]>({ queryKey: ['salon-earnings', from, today], queryFn: () => api.get<Earning[]>(`/appointments/earnings?from=${from}&to=${today}`) });

  const [editing, setEditing] = useState<{ userId: string; hours: WorkingHours } | null>(null);
  const [adding, setAdding] = useState('');

  const save = useMutation({
    mutationFn: (v: { userId: string; active?: boolean; workingHours?: WorkingHours }) => api.put(`/appointments/staff/${v.userId}`, { active: v.active, workingHours: v.workingHours }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['salon-team'] }); void qc.invalidateQueries({ queryKey: ['salon-staff'] }); setEditing(null); setAdding(''); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label="Team" className="flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-2xl dark:bg-gray-800">
        <div className="flex items-start justify-between border-b p-5 dark:border-gray-700">
          <div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-white">Team</h2>
            <p className="text-sm text-gray-500">Who takes appointments, and when. Someone with no hours set can be booked at any time.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-full p-1.5 text-gray-500 hover:bg-gray-100"><X className="h-5 w-5" /></button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto p-5 text-sm">
          {isLoading && <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-gray-400" aria-label="Loading" /></div>}

          {data && (
            <section aria-label="Stylists" className="space-y-2">
              {data.stylists.length === 0 && <p className="text-gray-500">No one is set up yet. Add a team member below.</p>}
              {data.stylists.map((s) => (
                <div key={s.userId} className="rounded-xl border p-3 dark:border-gray-700">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="font-semibold">{s.name} {!s.active && <span className="ml-1 rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">Off</span>}</p>
                      <p className="text-xs text-gray-500">{hoursLabel(s.workingHours)}</p>
                    </div>
                    <div className="flex gap-2">
                      <button onClick={() => setEditing(editing?.userId === s.userId ? null : { userId: s.userId, hours: s.workingHours })} className="rounded-lg border px-3 py-1 text-xs font-medium text-blue-700 hover:bg-blue-50">Hours</button>
                      <button onClick={() => save.mutate({ userId: s.userId, active: !s.active })} disabled={save.isPending} className="rounded-lg border px-3 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">{s.active ? 'Switch off' : 'Switch on'}</button>
                    </div>
                  </div>
                  {editing?.userId === s.userId && (
                    <div className="mt-3 space-y-3 border-t pt-3 dark:border-gray-700">
                      <HoursEditor value={editing.hours} onChange={(h) => setEditing({ userId: s.userId, hours: h })} />
                      <button onClick={() => save.mutate({ userId: s.userId, workingHours: editing.hours })} disabled={save.isPending} className="rounded-lg bg-blue-600 px-4 py-1.5 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">Save hours</button>
                    </div>
                  )}
                </div>
              ))}
              {(data.others?.length ?? 0) > 0 && (
                <div className="flex gap-2">
                  <select value={adding} onChange={(e) => setAdding(e.target.value)} aria-label="Add a team member" className="flex-1 rounded-lg border px-3 py-2 dark:border-gray-600 dark:bg-gray-700">
                    <option value="">Add a team member who takes appointments...</option>
                    {data.others!.map((o) => <option key={o.userId} value={o.userId}>{o.name} ({o.role.toLowerCase()})</option>)}
                  </select>
                  <button onClick={() => adding && save.mutate({ userId: adding, active: true })} disabled={!adding || save.isPending} className="rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50">Add</button>
                </div>
              )}
            </section>
          )}

          <section aria-label="Earnings" className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="font-semibold">What each earned from the services they performed</p>
              <div className="flex rounded-lg border p-0.5 text-xs">
                {(['today', 'month'] as const).map((r) => <button key={r} onClick={() => setRange(r)} className={`rounded-md px-2.5 py-1 ${range === r ? 'bg-gray-900 text-white' : 'text-gray-600'}`}>{r === 'today' ? 'Today' : 'This month'}</button>)}
              </div>
            </div>
            {earnings.length === 0 ? <p className="text-gray-500">Nothing yet. A service counts here once the visit is completed with the stylist named on it.</p> : (
              <table className="w-full text-left text-sm">
                <thead className="text-xs uppercase tracking-wide text-gray-500"><tr><th className="py-1">Stylist</th><th className="text-right">Services</th><th className="text-right">Revenue</th><th className="text-right">Commission</th></tr></thead>
                <tbody className="divide-y dark:divide-gray-700">
                  {earnings.map((e) => (
                    <tr key={e.staffId}>
                      <td className="py-1.5 font-medium">{e.name}</td>
                      <td className="text-right">{e.services}</td>
                      <td className="text-right">{formatKES(e.revenueCents)}</td>
                      <td className="text-right">{e.commissionCents == null ? <span className="text-xs text-gray-400">no rate in Staff and HR</span> : formatKES(e.commissionCents)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <p className="text-xs text-gray-500">Commission uses each person's rate in Staff and HR. Payroll adds it to their pay.</p>
          </section>
        </div>
      </div>
    </div>
  );
}

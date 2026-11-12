import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatKES } from '@pos/shared';
import { Download, Stethoscope } from 'lucide-react';
import { api } from '../lib/api';
import { downloadCsv } from '../lib/csv';
import { diagnosesCsv, formatMinutes, presetRange, type ClinicReport, type Preset } from '../lib/clinicReports';
import { Button, Card, CardBody, CardHeader, EmptyState, ErrorState, Input, PageHeader, Segmented, StatTile } from '../components/ui';

const PRESETS: Array<{ id: Preset | 'custom'; label: string }> = [{ id: 'today', label: 'Today' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: 'month', label: 'This month' }];

/** A horizontal bar for one figure out of the largest in its list. One colour: the length is the information. */
function Bar({ value, max }: { value: number; max: number }) {
  return (
    <span className="block h-2 w-full rounded-full bg-gray-100 dark:bg-white/10" aria-hidden>
      <span className="block h-2 rounded-full bg-brand-600" style={{ width: `${max > 0 && value > 0 ? Math.max(2, Math.round((value / max) * 100)) : 0}%` }} />
    </span>
  );
}

/** The clinic's figures for a period: who came and when, how long they waited, what they had, what each doctor did, and what it earned. */
export default function ClinicReportsPage() {
  const [range, setRange] = useState(() => presetRange('30d'));
  const [preset, setPreset] = useState<Preset | 'custom'>('30d');
  const { data, error, isLoading, refetch } = useQuery<ClinicReport>({
    queryKey: ['clinic-report', range.from, range.to],
    queryFn: () => api.get(`/clinic/reports/summary?from=${range.from}&to=${range.to}`),
    enabled: range.from !== '' && range.to !== '' && range.from <= range.to,
  });
  const pick = (p: Preset | 'custom') => { setPreset(p); if (p !== 'custom') setRange(presetRange(p)); };
  const valid = range.from <= range.to;

  const exportDiagnoses = () => { if (data) downloadCsv(`diagnoses-${data.range.from}-to-${data.range.to}.csv`, diagnosesCsv(data.diagnoses)); };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader title="Clinic reports" subtitle="Patients, diagnoses, waiting times, doctors and takings for a period" />
      <div className="flex flex-wrap items-end gap-3">
        <Segmented items={PRESETS} value={preset} onChange={pick} />
        <Input label="From" type="date" value={range.from} max={range.to} onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, from: e.target.value })); }} />
        <Input label="To" type="date" value={range.to} min={range.from} onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, to: e.target.value })); }} />
      </div>
      {!valid && <p role="alert" className="text-sm text-red-700">The start date is after the end date.</p>}
      {error ? <ErrorState error={error} subject="the clinic report" onRetry={() => void refetch()} /> : isLoading || !data ? <p className="text-sm text-gray-500">Loading…</p> : <Report data={data} onExport={exportDiagnoses} />}
    </div>
  );
}

function Report({ data, onExport }: { data: ClinicReport; onExport: () => void }) {
  const maxDay = Math.max(1, ...data.perDay.map((d) => d.total));
  const maxDx = Math.max(1, ...data.diagnoses.map((d) => d.total));
  const maxDoc = Math.max(1, ...data.doctors.map((d) => d.seen));
  if (data.totals.visits === 0) return <EmptyState icon={<Stethoscope className="h-8 w-8" />} title="No visits in this period" description="Choose a longer period, or come back once patients have been seen." />;
  return (
    <div className="space-y-5">
      {data.truncated && <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-900">This period has more than 20,000 visits, so these figures cover only the first 20,000. Choose a shorter period.</p>}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Visits" value={data.totals.visits} note={`${data.totals.urgent} urgent`} />
        <StatTile label="Completed" value={data.totals.completed} note={`${data.totals.cancelled} cancelled, ${data.totals.open} still open`} />
        <StatTile label="Patients" value={data.demographics.patients} note="seen once each" />
        <StatTile label="Services charged" value={formatKES(data.revenue.totalCents)} note="completed visits" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Wait to triage" value={formatMinutes(data.waits.toTriage.avg)} note={`average of ${data.waits.toTriage.n} visits`} />
        <StatTile label="Wait to see the doctor" value={formatMinutes(data.waits.toDoctor.avg)} note={`average of ${data.waits.toDoctor.n} visits`} />
        <StatTile label="Consultation" value={formatMinutes(data.waits.consultation.avg)} note={`average of ${data.waits.consultation.n} visits`} />
      </div>

      <Card>
        <CardHeader title="Visits per day" />
        <CardBody>
          <ul className="space-y-1.5">
            {data.perDay.map((d) => (
              <li key={d.date} className="grid grid-cols-[88px_1fr_120px] items-center gap-3 text-sm">
                <span className="tabular-nums text-gray-600">{new Date(`${d.date}T12:00:00+03:00`).toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                <Bar value={d.total} max={maxDay} />
                <span className="text-right tabular-nums">{d.total}{d.total > 0 ? <span className="text-xs text-gray-500"> ({d.completed} done)</span> : null}</span>
              </li>
            ))}
          </ul>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Diagnoses" actions={data.diagnoses.length > 0 ? <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={onExport}>Download CSV</Button> : undefined} />
        <CardBody>
          {data.diagnoses.length === 0 ? <p className="text-sm text-gray-500">No finished consultations with a diagnosis in this period.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-1 pr-3">Diagnosis</th><th className="pr-3">Code</th><th className="w-40 pr-3" /><th className="pr-3 text-right">Visits</th><th className="pr-3 text-right">Under 5</th><th className="text-right">5 and over</th></tr></thead>
                <tbody>
                  {data.diagnoses.map((d) => (
                    <tr key={d.key} className="border-t dark:border-gray-700">
                      <td className="py-1.5 pr-3">{d.label}</td>
                      <td className="pr-3 font-mono text-xs text-gray-500">{[d.code, d.icd11].filter(Boolean).join(' / ')}</td>
                      <td className="pr-3"><Bar value={d.total} max={maxDx} /></td>
                      <td className="pr-3 text-right tabular-nums font-semibold">{d.total}</td>
                      <td className="pr-3 text-right tabular-nums">{d.under5}</td>
                      <td className="text-right tabular-nums">{d.fiveAndOver}{d.unknownAge > 0 ? <span className="text-xs text-gray-500"> (+{d.unknownAge} age unknown)</span> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardBody>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Doctors" />
          <CardBody>
            {data.doctors.length === 0 ? <p className="text-sm text-gray-500">No patient was taken in to a doctor in this period.</p> : (
              <ul className="space-y-3">
                {data.doctors.map((d) => (
                  <li key={d.doctorId ?? d.doctorName}>
                    <p className="flex justify-between text-sm font-semibold"><span>{d.doctorName}</span><span className="tabular-nums">{d.seen} patients seen</span></p>
                    <Bar value={d.seen} max={maxDoc} />
                    <p className="mt-1 text-xs text-gray-600">{d.completed} completed · {d.patients} different people · consultation {formatMinutes(d.avgConsultMinutes)} · patients waited {formatMinutes(d.avgWaitMinutes)}</p>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Who came" />
          <CardBody>
            <p className="mb-3 text-sm">Women {data.demographics.sex.F} · Men {data.demographics.sex.M}{data.demographics.sex.other > 0 ? ` · Not recorded ${data.demographics.sex.other}` : ''}</p>
            <ul className="space-y-1.5">
              {data.demographics.ageBands.map((b) => (
                <li key={b.band} className="grid grid-cols-[70px_1fr_40px] items-center gap-3 text-sm">
                  <span className="text-gray-600">{b.band === 'Unknown' ? 'Age not known' : `${b.band} yrs`}</span>
                  <Bar value={b.count} max={Math.max(1, ...data.demographics.ageBands.map((x) => x.count))} />
                  <span className="text-right tabular-nums">{b.count}</span>
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardHeader title="Services charged" />
          <CardBody>
            {data.revenue.services.length === 0 ? <p className="text-sm text-gray-500">Nothing was charged on completed visits.</p> : (
              <table className="w-full text-sm">
                <tbody>
                  {data.revenue.services.map((s) => <tr key={s.name} className="border-t first:border-t-0 dark:border-gray-700"><td className="py-1.5">{s.name}</td><td className="text-right tabular-nums text-gray-600">x {s.count}</td><td className="text-right tabular-nums font-semibold">{formatKES(s.totalCents)}</td></tr>)}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Laboratory" />
          <CardBody>
            {data.lab.tests.length === 0 ? <p className="text-sm text-gray-500">No tests were ordered in this period.</p> : (
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-gray-500"><tr><th className="py-1">Test</th><th className="text-right">Ordered</th><th className="text-right">Released</th><th className="text-right">Critical</th><th className="text-right">Avg time</th></tr></thead>
                <tbody>
                  {data.lab.tests.map((t) => (
                    <tr key={t.testName} className="border-t dark:border-gray-700">
                      <td className="py-1.5">{t.testName}</td><td className="text-right tabular-nums">{t.ordered}</td><td className="text-right tabular-nums">{t.released}</td>
                      <td className={`text-right tabular-nums ${t.critical > 0 ? 'font-semibold text-red-700' : ''}`}>{t.critical}</td>
                      <td className="text-right tabular-nums">{t.avgTurnaroundHours === null ? '-' : `${t.avgTurnaroundHours} h`}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      </div>
    </div>
  );
}

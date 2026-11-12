import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatKES } from '@pos/shared';
import { Download, Printer, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { downloadCsv } from '../lib/csv';
import { presetRange, type Preset } from '../lib/clinicReports';
import {
  controlledCsv, controlledHtml, day, dispensingCsv, dispensingHtml, disposalCsv, disposalHtml, patientBundleHtml,
  type ControlledRegister, type DispensingRegister, type DisposalRegister, type PatientBundle,
} from '../lib/compliance';
import type { Patient } from '../lib/clinical';
import { printHtml } from '../lib/printHtml';
import { Button, EmptyState, ErrorState, Input, PageHeader, Segmented, Tabs, type TabItem } from '../components/ui';
import PatientPicker from '../components/clinical/PatientPicker';

type Tab = 'controlled' | 'dispensing' | 'disposal' | 'patient';
const PRESETS: Array<{ id: Preset | 'custom'; label: string }> = [{ id: 'today', label: 'Today' }, { id: '7d', label: '7 days' }, { id: '30d', label: '30 days' }, { id: 'month', label: 'This month' }];
const TABS: Array<TabItem<Tab>> = [{ id: 'controlled', label: 'Controlled drugs' }, { id: 'dispensing', label: 'Dispensing' }, { id: 'disposal', label: 'Disposals' }, { id: 'patient', label: 'Patient data request' }];

/**
 * The records an inspector or a patient may ask for, laid out for filing: the controlled-drugs register, the dispensing register,
 * what was written off, and everything held about one patient. They are exports of what KASTRA holds, not official forms.
 */
export default function CompliancePage() {
  const user = useAuthStore((s) => s.user);
  const [tab, setTab] = useState<Tab>('controlled');
  const [range, setRange] = useState(() => presetRange('30d'));
  const [preset, setPreset] = useState<Preset | 'custom'>('30d');
  const { data: settings } = useQuery<{ name?: string }>({ queryKey: ['biz-settings', user?.businessId], queryFn: () => api.get(`/business/${user?.businessId}/settings`), enabled: !!user?.businessId, staleTime: 300_000 });
  const business = settings?.name ?? 'Pharmacy';
  const valid = range.from <= range.to;
  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader title="Compliance records" subtitle="Registers for inspection and a patient's data for an access request" />
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {tab !== 'patient' && (
        <div className="flex flex-wrap items-end gap-3">
          <Segmented items={PRESETS} value={preset} onChange={(p) => { setPreset(p); if (p !== 'custom') setRange(presetRange(p)); }} />
          <Input label="From" type="date" value={range.from} max={range.to} onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, from: e.target.value })); }} />
          <Input label="To" type="date" value={range.to} min={range.from} onChange={(e) => { setPreset('custom'); setRange((r) => ({ ...r, to: e.target.value })); }} />
        </div>
      )}
      {tab === 'controlled' && <Controlled range={range} valid={valid} business={business} />}
      {tab === 'dispensing' && <Dispensing range={range} valid={valid} business={business} />}
      {tab === 'disposal' && <Disposals range={range} valid={valid} business={business} />}
      {tab === 'patient' && <PatientRequest business={business} />}
    </div>
  );
}

type Range = { from: string; to: string };

function Toolbar({ count, truncated, onCsv, onPrint }: { count: number; truncated: boolean; onCsv: () => void; onPrint: () => void }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-gray-600">{count} {count === 1 ? 'entry' : 'entries'}{truncated ? ' (the first 20,000: choose a shorter period)' : ''}</p>
      <span className="flex gap-2">
        <Button variant="secondary" size="sm" icon={<Download className="h-4 w-4" />} onClick={onCsv} disabled={count === 0}>Download CSV</Button>
        <Button variant="secondary" size="sm" icon={<Printer className="h-4 w-4" />} onClick={onPrint} disabled={count === 0}>Print</Button>
      </span>
    </div>
  );
}

const th = 'px-3 py-2 text-left text-xs uppercase text-gray-500';
const Table = ({ children }: { children: React.ReactNode }) => <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-700 dark:bg-gray-800"><table className="w-full text-sm">{children}</table></div>;

function useRegister<T>(path: string, range: Range, valid: boolean) {
  return useQuery<T>({ queryKey: ['compliance', path, range.from, range.to], queryFn: () => api.get(`/compliance/${path}?from=${range.from}&to=${range.to}`), enabled: valid });
}

function Controlled({ range, valid, business }: { range: Range; valid: boolean; business: string }) {
  const { data, error, isLoading, refetch } = useRegister<ControlledRegister>('controlled-register', range, valid);
  if (error) return <ErrorState error={error} subject="the register" onRetry={() => void refetch()} />;
  if (isLoading || !data) return <p className="text-sm text-gray-500">Loading…</p>;
  return (
    <div className="space-y-4">
      <Toolbar count={data.entries.length} truncated={data.truncated} onCsv={() => downloadCsv(`controlled-drugs-${data.period.from}-to-${data.period.to}.csv`, controlledCsv(data))} onPrint={() => printHtml(controlledHtml(business, data))} />
      {data.summary.length > 0 && (
        <Table>
          <thead className="bg-gray-50 dark:bg-gray-900/40"><tr><th className={th}>Medicine</th><th className={th}>Schedule</th><th className={`${th} text-right`}>Entries</th><th className={`${th} text-right`}>Dispensed</th><th className={`${th} text-right`}>Stock now</th></tr></thead>
          <tbody>{data.summary.map((s) => <tr key={s.itemName} className="border-t dark:border-gray-700"><td className="px-3 py-2 font-medium">{s.itemName}</td><td className="px-3 py-2">{s.scheduleClass ?? 'not listed'}</td><td className="px-3 py-2 text-right tabular-nums">{s.entries}</td><td className="px-3 py-2 text-right tabular-nums">{s.dispensed}</td><td className="px-3 py-2 text-right tabular-nums">{s.onHand ?? '-'}</td></tr>)}</tbody>
        </Table>
      )}
      {data.entries.length === 0 ? <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="No entries in this period" description="A controlled drug is entered when it is dispensed. Stock set to a schedule (II to V) in Items shows above." /> : (
        <Table>
          <thead className="bg-gray-50 dark:bg-gray-900/40"><tr><th className={th}>Date</th><th className={th}>Medicine</th><th className={`${th} text-right`}>Quantity</th><th className={th}>Patient</th><th className={th}>Prescriber</th><th className={th}>Dispensed by</th></tr></thead>
          <tbody>{data.entries.map((e, i) => (
            <tr key={i} className="border-t dark:border-gray-700">
              <td className="px-3 py-2 whitespace-nowrap">{day(e.date)}</td><td className="px-3 py-2">{e.itemName} <span className="text-xs text-gray-500">({e.scheduleClass})</span></td>
              <td className="px-3 py-2 text-right tabular-nums">{e.quantity} {e.unit}</td><td className="px-3 py-2">{e.patientName}{e.patientIdNumber ? <span className="block text-xs text-gray-500">ID {e.patientIdNumber}</span> : null}</td>
              <td className="px-3 py-2">{e.prescriberName}{e.prescriberLicense ? <span className="block text-xs text-gray-500">{e.prescriberLicense}</span> : null}</td><td className="px-3 py-2">{e.dispensedBy}</td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </div>
  );
}

function Dispensing({ range, valid, business }: { range: Range; valid: boolean; business: string }) {
  const { data, error, isLoading, refetch } = useRegister<DispensingRegister>('dispensing-register', range, valid);
  if (error) return <ErrorState error={error} subject="the register" onRetry={() => void refetch()} />;
  if (isLoading || !data) return <p className="text-sm text-gray-500">Loading…</p>;
  return (
    <div className="space-y-4">
      <Toolbar count={data.entries.length} truncated={data.truncated} onCsv={() => downloadCsv(`dispensing-${data.period.from}-to-${data.period.to}.csv`, dispensingCsv(data))} onPrint={() => printHtml(dispensingHtml(business, data))} />
      {data.entries.length === 0 ? <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="Nothing dispensed in this period" description="Prescriptions appear here on the date of their latest fill." /> : (
        <Table>
          <thead className="bg-gray-50 dark:bg-gray-900/40"><tr><th className={th}>Date</th><th className={th}>Rx</th><th className={th}>Patient</th><th className={th}>Prescriber</th><th className={th}>Medicines</th><th className={`${th} text-right`}>Fills</th></tr></thead>
          <tbody>{data.entries.map((e) => (
            <tr key={e.prescriptionNumber} className="border-t dark:border-gray-700">
              <td className="px-3 py-2 whitespace-nowrap">{day(e.date)}</td><td className="px-3 py-2 font-mono text-xs">{e.prescriptionNumber}</td><td className="px-3 py-2">{e.patientName}</td>
              <td className="px-3 py-2">{e.prescriberName}</td><td className="px-3 py-2">{e.medicines}</td><td className="px-3 py-2 text-right tabular-nums">{e.fills}</td>
            </tr>
          ))}</tbody>
        </Table>
      )}
    </div>
  );
}

function Disposals({ range, valid, business }: { range: Range; valid: boolean; business: string }) {
  const { data, error, isLoading, refetch } = useRegister<DisposalRegister>('disposal-register', range, valid);
  if (error) return <ErrorState error={error} subject="the register" onRetry={() => void refetch()} />;
  if (isLoading || !data) return <p className="text-sm text-gray-500">Loading…</p>;
  return (
    <div className="space-y-4">
      <Toolbar count={data.entries.length} truncated={data.truncated} onCsv={() => downloadCsv(`disposals-${data.period.from}-to-${data.period.to}.csv`, disposalCsv(data))} onPrint={() => printHtml(disposalHtml(business, data))} />
      {data.entries.length === 0 ? <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="Nothing written off in this period" description="Expired, damaged and recalled stock written off in Batch & Expiry appears here." /> : (
        <>
          <Table>
            <thead className="bg-gray-50 dark:bg-gray-900/40"><tr><th className={th}>Date</th><th className={th}>Item</th><th className={`${th} text-right`}>Quantity</th><th className={`${th} text-right`}>Cost</th><th className={th}>Reason</th><th className={th}>Authorised by</th></tr></thead>
            <tbody>{data.entries.map((e, i) => (
              <tr key={i} className="border-t dark:border-gray-700">
                <td className="px-3 py-2 whitespace-nowrap">{day(e.date)}</td><td className="px-3 py-2">{e.itemName}{e.notes ? <span className="block text-xs text-gray-500">{e.notes}</span> : null}</td>
                <td className="px-3 py-2 text-right tabular-nums">{e.quantity}</td><td className="px-3 py-2 text-right tabular-nums">{formatKES(e.costCents)}</td><td className="px-3 py-2">{e.reason}</td><td className="px-3 py-2">{e.authorizedBy ?? ''}</td>
              </tr>
            ))}</tbody>
          </Table>
          <p className="text-sm font-semibold">Written off at cost in this period: {formatKES(data.totalCostCents)}</p>
        </>
      )}
    </div>
  );
}

function PatientRequest({ business }: { business: string }) {
  const [patient, setPatient] = useState<Patient | null>(null);
  const [busy, setBusy] = useState(false);
  const fetchBundle = async () => api.get<PatientBundle>(`/compliance/patients/${patient?.id}/export`);
  const run = async (what: 'file' | 'print') => {
    if (!patient) return;
    setBusy(true);
    try {
      const b = await fetchBundle();
      if (what === 'print') printHtml(patientBundleHtml(business, b));
      else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob([JSON.stringify(b, null, 2)], { type: 'application/json' }));
        a.download = `${b.patient.patientNumber}-data.json`;
        a.click();
        URL.revokeObjectURL(a.href);
      }
      toast.success('Prepared. This export is recorded on the audit log.');
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-xl space-y-4">
      <p className="text-sm text-gray-600">A patient may ask what is held about them. Check who is asking first: this is health information. Each export is recorded on the audit log with your name and the time.</p>
      <PatientPicker value={patient} onChange={setPatient} />
      <div className="flex flex-wrap gap-2">
        <Button icon={<Download className="h-4 w-4" />} disabled={!patient} loading={busy} onClick={() => void run('file')}>Download all data (file)</Button>
        <Button variant="secondary" icon={<Printer className="h-4 w-4" />} disabled={!patient || busy} onClick={() => void run('print')}>Print a readable copy</Button>
      </div>
    </div>
  );
}

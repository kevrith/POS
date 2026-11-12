import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatKES } from '@pos/shared';
import { Printer, RotateCw, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { claimSummaryHtml } from '../lib/claimPrint';
import { AGE_BUCKETS_LABEL, CLAIM_STATUS_LABEL, type AgingRow, type ClaimDetail, type ClaimRow } from '../lib/cover';
import { printHtml } from '../lib/printHtml';
import { Badge, Button, EmptyState, Input, PageHeader, Select, type BadgeTone } from '../components/ui';
import { Modal } from './fuel/Modal';
import { useInsurers } from '../components/clinical/CoverCheck';
import { useDialog } from '../components/Dialog';
import ShaConnectionCard from '../components/clinical/ShaConnection';

const TONE: Record<ClaimRow['status'], BadgeTone> = { SUBMITTED: 'brand', APPROVED: 'warning', PAID: 'success', REJECTED: 'danger', VOIDED: 'neutral' };

/**
 * Money the insurers owe: what is outstanding and for how long, and for each claim what still stands in the way of sending it.
 * Sending itself is done in the insurer's portal today; this page keeps the record and the follow-up.
 */
export default function ClaimsPage() {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [status, setStatus] = useState('');
  const [providerId, setProviderId] = useState('');
  const [q, setQ] = useState('');
  const [openId, setOpenId] = useState<string | null>(null);
  const { data: insurers = [] } = useInsurers();
  const params = new URLSearchParams({ ...(status && { status }), ...(providerId && { providerId }), ...(q.trim() && { q: q.trim() }) }).toString();
  const { data: claims = [], isLoading } = useQuery<ClaimRow[]>({ queryKey: ['cover', 'claims', params], queryFn: () => api.get(`/cover/claims?${params}`) });
  const { data: settings } = useQuery<{ name?: string }>({ queryKey: ['biz-settings', user?.businessId], queryFn: () => api.get(`/business/${user?.businessId}/settings`), enabled: !!user?.businessId });
  const { data: aging = [] } = useQuery<AgingRow[]>({ queryKey: ['cover', 'aging'], queryFn: () => api.get('/cover/claims/aging') });
  const owed = aging.reduce((sum, r) => sum + r.totalCents, 0);
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['cover'] }); };

  return (
    <div className="space-y-5 p-4 sm:p-6">
      <PageHeader title="Insurance claims" subtitle={owed > 0 ? `${formatKES(owed)} is owed by insurers` : 'What insurers owe, and what is holding each claim back'} />

      {['OWNER', 'ADMIN', 'MANAGER'].includes(String(user?.role)) && <ShaConnectionCard />}

      {aging.length > 0 && (
        <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/40">
              <tr><th className="px-4 py-2">Insurer</th>{Object.values(AGE_BUCKETS_LABEL).map((l) => <th key={l} className="px-4 py-2 text-right">{l}</th>)}<th className="px-4 py-2 text-right">Owed</th></tr>
            </thead>
            <tbody>
              {aging.map((r) => (
                <tr key={r.providerId} className="border-t dark:border-gray-700">
                  <td className="px-4 py-2 font-medium">{r.providerName} <span className="text-xs text-gray-500">({r.count})</span></td>
                  {(Object.keys(AGE_BUCKETS_LABEL) as Array<keyof typeof AGE_BUCKETS_LABEL>).map((b) => <td key={b} className={`px-4 py-2 text-right tabular-nums ${b === '90+' && r.buckets[b] > 0 ? 'font-semibold text-red-700' : ''}`}>{r.buckets[b] ? formatKES(r.buckets[b]) : '-'}</td>)}
                  <td className="px-4 py-2 text-right font-semibold tabular-nums">{formatKES(r.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Select label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All</option>
          {(['SUBMITTED', 'APPROVED', 'PAID', 'REJECTED'] as const).map((s) => <option key={s} value={s}>{CLAIM_STATUS_LABEL[s]}</option>)}
        </Select>
        <Select label="Insurer" value={providerId} onChange={(e) => setProviderId(e.target.value)}>
          <option value="">All</option>
          {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
        <Input label="Search" placeholder="Patient, member or claim number" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {isLoading ? <p className="text-sm text-gray-500">Loading…</p> : claims.length === 0 ? (
        <EmptyState icon={<ShieldCheck className="h-8 w-8" />} title="No claims" description="A claim appears here when an insurer pays part of a visit bill or a prescription." />
      ) : (
        <div className="overflow-x-auto rounded-xl border bg-white dark:border-gray-700 dark:bg-gray-800">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500 dark:bg-gray-900/40">
              <tr><th className="px-4 py-2">Patient</th><th className="px-4 py-2">Insurer</th><th className="px-4 py-2 text-right">Billed</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Age</th><th className="px-4 py-2">Holding it back</th></tr>
            </thead>
            <tbody>
              {claims.map((c) => (
                <tr key={c.id} className="cursor-pointer border-t hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-700/40" onClick={() => setOpenId(c.id)}>
                  <td className="px-4 py-2"><button type="button" className="text-left font-medium text-brand-700 hover:underline" onClick={() => setOpenId(c.id)}>{c.patientName}</button><div className="font-mono text-xs text-gray-500">{c.memberNumber ?? 'No member number'}</div></td>
                  <td className="px-4 py-2">{c.providerName}</td>
                  <td className="px-4 py-2 text-right tabular-nums">{formatKES(c.billedCents)}</td>
                  <td className="px-4 py-2"><Badge tone={TONE[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</Badge></td>
                  <td className={`px-4 py-2 tabular-nums ${(c.ageDays ?? 0) > 60 ? 'font-semibold text-red-700' : ''}`}>{c.ageDays == null ? '-' : `${c.ageDays}d`}</td>
                  <td className="px-4 py-2 text-xs text-amber-800">{c.problems.length === 0 ? (['SUBMITTED', 'APPROVED'].includes(c.status) ? <span className="text-green-700">Ready</span> : '') : c.problems.join('; ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {openId && <ClaimModal id={openId} business={settings?.name ?? 'Clinic'} onClose={() => setOpenId(null)} onChanged={refresh} />}
    </div>
  );
}

function ClaimModal({ id, business, onClose, onChanged }: { id: string; business: string; onClose: () => void; onChanged: () => void }) {
  const { prompt } = useDialog();
  const qc = useQueryClient();
  const { data: c } = useQuery<ClaimDetail>({ queryKey: ['cover', 'claim', id], queryFn: () => api.get(`/cover/claims/${id}`) });
  const [resubmitting, setResubmitting] = useState(false);
  const move = useMutation({
    mutationFn: (body: Record<string, unknown>) => api.patch(`/pharmacy/claims/${id}`, body),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['cover'] }); onChanged(); },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!c) return <Modal title="Claim" onClose={onClose}><p className="text-sm text-gray-500">Loading…</p></Modal>;
  const open = c.status === 'SUBMITTED' || c.status === 'APPROVED';
  const canResubmit = c.status === 'REJECTED' && !c.resubmittedToId;
  const ask = async (title: string, message: string, placeholder: string) => (await prompt({ title, message, placeholder, confirmLabel: 'Save' }))?.trim();

  return (
    <Modal title={`Claim for ${c.patientName}`} subtitle={`${c.providerName} · member ${c.memberNumber ?? 'not recorded'}`} onClose={onClose} wide>
      <div className="space-y-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={TONE[c.status]}>{CLAIM_STATUS_LABEL[c.status]}</Badge>
          {c.claimNumber && <span className="font-mono text-xs">Claim no. {c.claimNumber}</span>}
          {c.preauthNumber && <span className="font-mono text-xs">Pre-auth {c.preauthNumber}</span>}
        </div>
        {open && c.problems.length > 0 && (
          <ul className="list-disc rounded-lg bg-amber-50 px-6 py-2 text-amber-900">{c.problems.map((p) => <li key={p}>{p}</li>)}</ul>
        )}
        {c.rejectionReason && <p className="rounded-lg bg-red-50 px-3 py-2 text-red-800">Rejected: {c.rejectionReason}</p>}
        {c.resubmittedToId && <p className="rounded-lg bg-blue-50 px-3 py-2 text-blue-900">This claim was sent again as a new claim. Find it in the list.</p>}
        {c.resubmittedFromId && <p className="rounded-lg bg-blue-50 px-3 py-2 text-blue-900">Sent again after an earlier rejection. If the insurer pays it, the money is recovered income: the earlier rejection already wrote the amount off.</p>}
        {c.diagnoses.length > 0 && (
          <div><h3 className="mb-1 font-semibold">Diagnoses</h3>
            <ul className="space-y-0.5">{c.diagnoses.map((d) => <li key={d.code ?? d.label}>{d.label} <span className="font-mono text-xs text-gray-500">{[d.code && `ICD-10 ${d.code}`, d.icd11 && `ICD-11 ${d.icd11}`].filter(Boolean).join(' · ')}</span></li>)}</ul></div>
        )}
        <div><h3 className="mb-1 font-semibold">Services and medicines</h3>
          {c.lines.length === 0 ? <p className="text-gray-500">None recorded.</p> : (
            <ul className="divide-y rounded-lg border">{c.lines.map((l, i) => <li key={i} className="flex justify-between px-3 py-1.5"><span>{l.name}{l.quantity !== 1 ? ` x ${l.quantity}` : ''}</span><span className="tabular-nums">{formatKES(l.totalCents)}</span></li>)}</ul>
          )}
        </div>
        <div className="flex justify-between font-semibold"><span>Billed to the insurer ({100 - c.copayPct}% of the bill)</span><span className="tabular-nums">{formatKES(c.billedCents)}</span></div>
        {c.status !== 'SUBMITTED' && <div className="flex justify-between"><span>Approved</span><span className="tabular-nums">{formatKES(c.approvedCents)}</span></div>}
        {c.status === 'PAID' && <div className="flex justify-between text-green-700"><span>Paid</span><span className="tabular-nums">{formatKES(c.paidCents)}</span></div>}

        <div className="flex flex-wrap justify-between gap-2 border-t pt-3">
          <span className="flex gap-2">
            <Button variant="secondary" size="sm" icon={<Printer className="h-4 w-4" />} onClick={() => printHtml(claimSummaryHtml(business, c))}>Print claim</Button>
            {canResubmit && <Button size="sm" icon={<RotateCw className="h-4 w-4" />} onClick={() => setResubmitting(true)}>Correct and send again</Button>}
          </span>
          {open && (
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={async () => { const v = await ask('Claim number', 'The reference the insurer gave when the claim was entered in their system.', 'Reference'); if (v !== undefined) move.mutate({ claimNumber: v }); }}>Set claim number</Button>
              <Button variant="secondary" size="sm" onClick={async () => { const v = await ask('Pre-authorisation number', 'Only if the insurer approved this treatment in advance.', 'Pre-auth number'); if (v !== undefined) move.mutate({ preauthNumber: v }); }}>Set pre-auth</Button>
              {c.status === 'SUBMITTED' && <Button size="sm" loading={move.isPending} onClick={() => move.mutate({ status: 'APPROVED', approvedCents: c.billedCents })}>Insurer approved</Button>}
              {c.status === 'APPROVED' && (
                <Button size="sm" loading={move.isPending} onClick={async () => {
                  const v = await ask('Amount received', `The insurer approved ${formatKES(c.approvedCents)}. Enter what actually arrived, in shillings.`, (c.approvedCents / 100).toFixed(2));
                  if (v === undefined) return;
                  const cents = v === '' ? c.approvedCents : Math.round(parseFloat(v) * 100);
                  if (!Number.isFinite(cents) || cents < 0) { toast.error('Enter an amount'); return; }
                  move.mutate({ status: 'PAID', paidCents: cents });
                }}>Payment received</Button>
              )}
              <Button variant="danger" size="sm" onClick={async () => { const v = await ask('Reject claim', 'Why did the insurer refuse it?', 'Reason'); if (v) move.mutate({ status: 'REJECTED', rejectionReason: v }); }}>Insurer rejected</Button>
            </div>
          )}
        </div>
      </div>
      {resubmitting && <ResubmitModal claim={c} onClose={() => setResubmitting(false)} onDone={() => { setResubmitting(false); onChanged(); void qc.invalidateQueries({ queryKey: ['cover'] }); }} />}
    </Modal>
  );
}

/** Fix what the insurer objected to and send the claim again as a new one. */
function ResubmitModal({ claim, onClose, onDone }: { claim: ClaimDetail; onClose: () => void; onDone: () => void }) {
  const [member, setMember] = useState(claim.memberNumber ?? '');
  const [preauth, setPreauth] = useState(claim.preauthNumber ?? '');
  const [dx, setDx] = useState(claim.diagnoses.map((d) => ({ ...d, icd11: d.icd11 ?? '' })));
  const send = useMutation({
    mutationFn: () => api.post(`/cover/claims/${claim.id}/resubmit`, { memberNumber: member.trim(), preauthNumber: preauth.trim(), diagnoses: dx.map((d) => ({ label: d.label, ...(d.code ? { code: d.code } : {}), ...(d.icd11.trim() ? { icd11: d.icd11.trim() } : {}) })) }),
    onSuccess: () => { toast.success('Sent again as a new claim'); onDone(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal title="Correct and send again" subtitle={claim.rejectionReason ? `Rejected: ${claim.rejectionReason}` : 'Fix what the insurer objected to'} onClose={onClose}>
      <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); send.mutate(); }}>
        <Input label="Member number" value={member} onChange={(e) => setMember(e.target.value)} />
        <Input label="Pre-authorisation number (if one was given)" value={preauth} onChange={(e) => setPreauth(e.target.value)} />
        {dx.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-[13px] font-semibold">Diagnoses</p>
            {dx.map((d, i) => (
              <div key={i} className="flex items-center gap-2 text-sm"><span className="flex-1">{d.label}{d.code ? <span className="ml-1 font-mono text-xs text-gray-500">{d.code}</span> : null}</span>
                <input aria-label={`ICD-11 code for ${d.label}`} placeholder="ICD-11" maxLength={10} value={d.icd11} onChange={(e) => setDx((l) => l.map((x, j) => (j === i ? { ...x, icd11: e.target.value.toUpperCase() } : x)))} className="h-9 w-28 rounded-md border px-2 font-mono text-xs" /></div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-600">The old claim stays as a record. The new one starts as billed. The rejection already wrote the amount off, so if the insurer pays the new claim it is booked as recovered income.</p>
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={send.isPending}>Send again</Button></div>
      </form>
    </Modal>
  );
}

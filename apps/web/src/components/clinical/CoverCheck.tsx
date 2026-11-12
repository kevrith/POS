import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ShieldCheck } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { COVER_LABEL, COVER_TONE, SHA_ID_TYPES, type CoverCheck, type CoverStanding, type InsuranceProvider, type ShaResult } from '../../lib/cover';
import { Badge, Button, Input, Select, Textarea } from '../ui';
import { Modal } from '../../pages/fuel/Modal';

/** The insurers this business has set up and switched on. */
export function useInsurers() {
  const businessId = useAuthStore((s) => s.user)?.businessId;
  return useQuery<InsuranceProvider[]>({
    queryKey: ['pharmacy-providers', businessId],
    queryFn: () => api.get<InsuranceProvider[]>(`/pharmacy/providers?businessId=${businessId}`),
    select: (all) => all.filter((p) => p.isActive),
    enabled: !!businessId,
    staleTime: 60_000,
  });
}

export function CoverBadge({ standing }: { standing: CoverStanding }) {
  return <Badge tone={COVER_TONE[standing]} icon={<ShieldCheck className="h-3 w-3" aria-hidden />}>{COVER_LABEL[standing]}</Badge>;
}

const RESULTS: Array<[CheckResult, string, string]> = [
  ['ELIGIBLE', 'Eligible', 'The insurer confirmed this member is covered'],
  ['NOT_ELIGIBLE', 'Not eligible', 'The insurer says this member is not covered'],
  ['UNAVAILABLE', 'Could not check', 'The insurer\'s system was down or gave no answer'],
];
type CheckResult = 'ELIGIBLE' | 'NOT_ELIGIBLE' | 'UNAVAILABLE';

/**
 * Write down the answer to "is this patient's insurance good?". Someone looks it up (the insurer's portal, the card, a phone
 * call) and records the result here; it is kept with their name and the time, and the visit's bill relies on it.
 */
export function CoverCheckModal({ patientId, visitId, providerId, memberNumber, onClose, onDone }: {
  patientId: string; visitId?: string; providerId?: string; memberNumber?: string; onClose: () => void; onDone: (c?: CoverCheck) => void;
}) {
  const qc = useQueryClient();
  const { data: insurers = [] } = useInsurers();
  const [provider, setProvider] = useState(providerId ?? '');
  const [member, setMember] = useState(memberNumber ?? '');
  const [status, setStatus] = useState<CheckResult | ''>('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const insurer = insurers.find((i) => i.id === provider);
  const { data: shaStatus } = useQuery<{ configured: boolean; enabled: boolean }>({ queryKey: ['cover', 'sha-status'], queryFn: () => api.get('/cover/sha/status'), enabled: insurer?.kind === 'SHA', staleTime: 60_000 });
  const [idType, setIdType] = useState<string>('National ID');
  const [idNumber, setIdNumber] = useState('');
  const [sha, setSha] = useState<ShaResult | null>(null);
  const ask = useMutation({
    mutationFn: () => api.post<ShaResult>('/cover/sha/eligibility', { patientId, visitId, providerId: provider, identificationType: idType, identificationNumber: (idNumber || member).trim() }),
    onSuccess: (r) => {
      setSha(r);
      if (r.recorded) { void qc.invalidateQueries({ queryKey: ['cover'] }); toast.success(r.status === 'ELIGIBLE' ? 'SHA confirms cover' : r.status === 'NOT_ELIGIBLE' ? 'SHA says not eligible' : 'SHA answered: please read it'); }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const save = useMutation({
    mutationFn: () => api.post<CoverCheck>('/cover/checks', { patientId, visitId, providerId: provider, memberNumber: member.trim(), status, reference: reference.trim() || undefined, notes: notes.trim() || undefined }),
    onSuccess: (c) => {
      void qc.invalidateQueries({ queryKey: ['cover'] });
      toast.success(c.status === 'ELIGIBLE' ? 'Cover confirmed' : 'Result recorded');
      onDone(c);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal title="Check insurance cover" subtitle="Look the member up with the insurer, then record what they said" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Select label="Insurer" value={provider} onChange={(e) => { setProvider(e.target.value); setSha(null); }} hint={insurers.length === 0 ? 'Add the insurer first in Pharmacy, Insurance Providers' : undefined}>
          <option value="">Choose an insurer…</option>
          {insurers.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </Select>
        <Input label="Member number" value={member} onChange={(e) => setMember(e.target.value)} />
        {insurer?.kind === 'SHA' && (
          <div className="space-y-3 rounded-lg border border-blue-200 bg-blue-50/50 p-3">
            {shaStatus?.enabled ? (
              <>
                <p className="text-sm font-semibold">Ask SHA now</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Select label="Identified by" value={idType} onChange={(e) => setIdType(e.target.value)}>{SHA_ID_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}</Select>
                  <Input label="Identifier" value={idNumber} onChange={(e) => setIdNumber(e.target.value)} placeholder={member || 'ID or number'} />
                </div>
                <Button variant="secondary" loading={ask.isPending} disabled={!(idNumber || member).trim()} onClick={() => ask.mutate()}>Check with SHA</Button>
                {sha && (
                  <div role="status" className="rounded-lg bg-white p-3 text-sm">
                    {sha.recorded ? (
                      <>
                        <p className="mb-1 flex items-center gap-2"><CoverBadge standing={sha.status === 'UNAVAILABLE' ? 'UNAVAILABLE' : (sha.status as CoverStanding)} /> {sha.fullName ?? ''}{sha.memberCrNumber ? <span className="font-mono text-xs text-gray-500">CR {sha.memberCrNumber}</span> : null}</p>
                        <p className="text-gray-700">{sha.summary}</p>
                        {sha.message && <p className="mt-1 text-amber-800">{sha.message}</p>}
                        {sha.schemes && sha.schemes.length > 0 && <ul className="mt-1 text-xs text-gray-600">{sha.schemes.map((s) => <li key={s.name}>{s.name}: {s.status || 'no status'}{s.endDate ? `, to ${s.endDate}` : ''}</li>)}</ul>}
                        {sha.status !== 'UNAVAILABLE' && <div className="mt-2 flex justify-end"><Button size="sm" onClick={() => onDone()}>Done</Button></div>}
                      </>
                    ) : <p className="text-red-800">{sha.message}</p>}
                  </div>
                )}
              </>
            ) : <p className="text-sm text-gray-700">SHA is not connected for this business yet. An owner or manager can connect it under <b>Insurance Claims, SHA connection</b>. Until then, look the member up and record the result below.</p>}
          </div>
        )}
        <fieldset>
          <legend className="mb-1 text-[13px] font-semibold text-gray-700">What did the insurer say?</legend>
          <div className="grid gap-2">
            {RESULTS.map(([value, label, hint]) => (
              <label key={value} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2 text-sm ${status === value ? 'border-brand-600 bg-brand-50' : 'hover:bg-gray-50'}`}>
                <input type="radio" name="cover-result" className="mt-1" checked={status === value} onChange={() => setStatus(value)} />
                <span><span className="font-semibold">{label}</span><span className="block text-xs text-gray-600">{hint}</span></span>
              </label>
            ))}
          </div>
        </fieldset>
        <Input label="Insurer's reference (optional)" value={reference} onChange={(e) => setReference(e.target.value)} />
        <Textarea label="Notes (optional)" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending} disabled={!provider || !member.trim() || !status}>Save result</Button>
        </div>
      </form>
    </Modal>
  );
}

/** A patient's insurance: who covers them, the latest answer from the insurer, and the checks made so far. */
export function PatientCover({ patientId, providerId, memberNumber }: { patientId: string; providerId: string | null; memberNumber: string | null }) {
  const [open, setOpen] = useState(false);
  const { data: checks = [] } = useQuery<CoverCheck[]>({ queryKey: ['cover', 'checks', patientId], queryFn: () => api.get(`/cover/checks?patientId=${patientId}`) });
  const { data: insurers = [] } = useInsurers();
  const latest = checks[0];
  const standing: CoverStanding = latest ? latest.status : 'NOT_CHECKED';
  const provider = insurers.find((i) => i.id === providerId);
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300">Insurance</h3>
        <Button variant="secondary" size="sm" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setOpen(true)}>Check cover</Button>
      </div>
      <div className="rounded-lg border px-3 py-2 text-sm dark:border-gray-700">
        {providerId || memberNumber ? (
          <p className="flex flex-wrap items-center justify-between gap-2">
            <span>{provider?.name ?? 'Insurer on file'}{memberNumber ? <span className="ml-2 font-mono text-xs text-gray-500">{memberNumber}</span> : null}</span>
            <CoverBadge standing={standing} />
          </p>
        ) : <p className="text-gray-500">No insurer on file. A result recorded as eligible is saved here.</p>}
        {checks.length > 0 && (
          <ul className="mt-2 space-y-1 border-t pt-2 text-xs text-gray-600 dark:border-gray-700">
            {checks.slice(0, 5).map((c) => (
              <li key={c.id} className="flex justify-between gap-2">
                <span>{c.providerName} · {COVER_LABEL[c.status]}{c.reference ? ` · ref ${c.reference}` : ''}</span>
                <span className="shrink-0">{new Date(c.checkedAt).toLocaleDateString('en-KE')} · {c.checkedByName}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
      {open && <CoverCheckModal patientId={patientId} providerId={providerId ?? undefined} memberNumber={memberNumber ?? undefined} onClose={() => setOpen(false)} onDone={() => setOpen(false)} />}
    </div>
  );
}

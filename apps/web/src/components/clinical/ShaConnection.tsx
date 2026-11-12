import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Plug } from 'lucide-react';
import { api } from '../../lib/api';
import type { ShaConfig } from '../../lib/cover';
import { Badge, Button, Card, CardBody, Input, Select } from '../ui';
import { Modal } from '../../pages/fuel/Modal';
import { useDialog } from '../Dialog';

/**
 * A facility's own connection to the Social Health Authority: its client id and secret, and its Facility Registry code, all given
 * by SHA when the facility is onboarded. With it, "Check with SHA" asks SHA whether a patient is covered. The secret is stored
 * encrypted on the server and is never shown again.
 */
export default function ShaConnectionCard() {
  const qc = useQueryClient();
  const { confirm } = useDialog();
  const [editing, setEditing] = useState(false);
  const { data } = useQuery<ShaConfig>({ queryKey: ['cover', 'sha-config'], queryFn: () => api.get('/cover/sha/config') });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['cover', 'sha-config'] }); void qc.invalidateQueries({ queryKey: ['cover', 'sha-status'] }); };
  const test = useMutation({ mutationFn: () => api.post<{ ok: boolean; message: string }>('/cover/sha/test', {}), onSuccess: (r) => { refresh(); (r.ok ? toast.success : toast.error)(r.message); }, onError: (e: Error) => toast.error(e.message) });
  const remove = useMutation({ mutationFn: () => api.delete('/cover/sha/config'), onSuccess: () => { refresh(); toast.success('SHA connection removed'); }, onError: (e: Error) => toast.error(e.message) });
  const c = data?.connection;
  return (
    <>
      <Card>
        <CardBody className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 font-semibold"><Plug className="h-4 w-4" aria-hidden /> SHA connection
              {c ? <Badge tone={c.enabled ? (c.lastTestOk === false ? 'danger' : 'success') : 'neutral'}>{!c.enabled ? 'Switched off' : c.lastTestOk === true ? 'Connected' : c.lastTestOk === false ? 'Test failed' : 'Not tested yet'}</Badge> : <Badge>Not set up</Badge>}
            </p>
            <p className="text-sm text-gray-600">
              {c ? `${c.baseUrl} · facility ${c.facilityCode}` : 'Enter your facility\'s SHA credentials to check patients\' cover from the visit screen.'}
            </p>
            {c?.lastTestMessage && <p className={`text-xs ${c.lastTestOk ? 'text-green-700' : 'text-red-700'}`}>{c.lastTestMessage}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            {c && <Button variant="secondary" size="sm" loading={test.isPending} onClick={() => test.mutate()}>Test connection</Button>}
            <Button variant={c ? 'secondary' : 'primary'} size="sm" onClick={() => setEditing(true)}>{c ? 'Edit' : 'Set up'}</Button>
            {c && <Button variant="secondary" size="sm" onClick={async () => { if (await confirm({ title: 'Remove the SHA connection', message: 'The saved credentials are deleted. Cover checks go back to being recorded by hand.', confirmLabel: 'Remove', variant: 'danger' })) remove.mutate(); }}>Remove</Button>}
          </div>
        </CardBody>
      </Card>
      {editing && data && <ShaForm config={data} onClose={() => setEditing(false)} onSaved={() => { setEditing(false); refresh(); }} />}
    </>
  );
}

function ShaForm({ config, onClose, onSaved }: { config: ShaConfig; onClose: () => void; onSaved: () => void }) {
  const c = config.connection;
  const [baseUrl, setBaseUrl] = useState(c?.baseUrl ?? config.defaults.baseUrl);
  const [clientId, setClientId] = useState(c?.clientId ?? '');
  const [secret, setSecret] = useState('');
  const [facility, setFacility] = useState(c?.facilityCode ?? '');
  const [enabled, setEnabled] = useState(c?.enabled ?? true);
  const [tokenPath, setTokenPath] = useState(c?.tokenPath ?? config.defaults.tokenPath);
  const [eligibilityPath, setEligibilityPath] = useState(c?.eligibilityPath ?? config.defaults.eligibilityPath);
  const [tokenFormat, setTokenFormat] = useState<string>(c?.tokenFormat ?? config.defaults.tokenFormat);
  const save = useMutation({
    mutationFn: () => api.put('/cover/sha/config', { baseUrl: baseUrl.trim(), clientId: clientId.trim(), clientSecret: secret || undefined, facilityCode: facility.trim(), enabled, tokenPath: tokenPath.trim(), eligibilityPath: eligibilityPath.trim(), tokenFormat }),
    onSuccess: () => { toast.success('Saved. Press Test connection to check it.'); onSaved(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal title="SHA connection" subtitle="Your facility's own credentials from SHA" onClose={onClose}>
      <form className="space-y-4" autoComplete="off" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <p className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-700">SHA gives each facility a client id, a client secret and a Facility Registry code when it is onboarded. The secret is stored encrypted and is never shown again. Each business enters its own: they are not shared.</p>
        <Input label="Service address" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} hint="Pre-filled with DHA's published test address. Use the live address SHA gives you for real patients. Only SHA and DHA addresses are accepted." />
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Client id" value={clientId} onChange={(e) => setClientId(e.target.value)} autoComplete="off" />
          <Input label="Client secret" type="password" value={secret} onChange={(e) => setSecret(e.target.value)} autoComplete="new-password" placeholder={c ? 'Saved. Leave blank to keep it' : ''} />
        </div>
        <Input label="Facility code (Facility Registry)" value={facility} onChange={(e) => setFacility(e.target.value)} placeholder="FID-47-123456-7" />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} /> Switched on (untick to pause checks without deleting the credentials)</label>
        <details className="rounded-lg border px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">Advanced: change only if SHA tells you to</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Input label="Sign-in path" value={tokenPath} onChange={(e) => setTokenPath(e.target.value)} />
            <Input label="Eligibility path" value={eligibilityPath} onChange={(e) => setEligibilityPath(e.target.value)} />
            <Select label="Sign-in request is sent as" value={tokenFormat} onChange={(e) => setTokenFormat(e.target.value)}><option value="json">JSON</option><option value="form">Form fields</option></Select>
          </div>
        </details>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button type="submit" loading={save.isPending} disabled={!baseUrl.trim() || !clientId.trim() || !facility.trim() || (!c && !secret)}>Save</Button>
        </div>
      </form>
    </Modal>
  );
}

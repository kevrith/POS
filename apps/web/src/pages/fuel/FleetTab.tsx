import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowDownCircle, ArrowUpCircle, Building2, Plus } from 'lucide-react';
import { formatKES } from '@pos/shared';
import { api } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Input, Select } from '../../components/ui';
import { Modal } from './Modal';
import { kesToCents } from './money';
import type { FleetAccount } from './types';
import { useFleetAccounts, useFuelScope } from './useFuelData';

export default function FleetTab() {
  const { isManager } = useFuelScope();
  const { data: accounts = [], isPending: isLoading } = useFleetAccounts();
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<FleetAccount | null>(null);

  return (
    <div className="space-y-4">
      {isManager && <div className="flex justify-end"><Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => setAdding(true)}>Add fleet account</Button></div>}
      {isLoading ? <p className="text-sm text-gray-500 py-8 text-center">Loading...</p> : accounts.length === 0 ? (
        <Card><EmptyState icon={<Building2 className="w-6 h-6" />} title="No fleet accounts" description="Companies that fuel on credit and pay later get an account with a credit limit. Their sales are invoiced to them, with their KRA PIN." /></Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {accounts.map((a) => {
            const owes = a.balanceCents < 0;
            return (
              <Card key={a.id} interactive onClick={() => setOpen(a)} className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-gray-900 truncate">{a.companyName}</p>
                    <p className="text-sm text-gray-600 truncate">{[a.contactName, a.contactPhone].filter(Boolean).join(', ') || 'No contact'}</p>
                  </div>
                  {!a.isActive && <Badge>Switched off</Badge>}
                </div>
                <div className="flex items-baseline justify-between">
                  <span className={`text-lg font-extrabold tabular-nums ${owes ? 'text-red-700' : 'text-green-700'}`}>{owes ? 'Owes ' : 'Credit '}{formatKES(Math.abs(a.balanceCents))}</span>
                  <span className="text-xs text-gray-600">Limit {a.creditLimitCents > 0 ? formatKES(a.creditLimitCents) : 'none'}</span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
      {adding && <AddAccount onClose={() => setAdding(false)} />}
      {open && <AccountModal account={accounts.find((a) => a.id === open.id) ?? open} onClose={() => setOpen(null)} />}
    </div>
  );
}

function AddAccount({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState({ companyName: '', contactName: '', contactPhone: '', contactEmail: '', kraPin: '', limit: '' });
  const limit = f.limit.trim() ? kesToCents(f.limit) : 0;
  const save = useMutation({
    mutationFn: () => api.post('/fuel-pump/fleet', { companyName: f.companyName.trim(), contactName: f.contactName.trim() || undefined, contactPhone: f.contactPhone.trim() || undefined, contactEmail: f.contactEmail.trim() || undefined, kraPin: f.kraPin.trim() || undefined, creditLimitCents: limit }),
    onSuccess: () => { toast.success('Fleet account added'); void qc.invalidateQueries({ queryKey: ['fleet-accounts'] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <Modal title="Add a fleet account" onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <Input label="Company name" value={f.companyName} onChange={(e) => setF({ ...f, companyName: e.target.value })} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input label="Contact person" value={f.contactName} onChange={(e) => setF({ ...f, contactName: e.target.value })} />
          <Input label="Phone" value={f.contactPhone} onChange={(e) => setF({ ...f, contactPhone: e.target.value })} />
          <Input label="Email" type="email" value={f.contactEmail} onChange={(e) => setF({ ...f, contactEmail: e.target.value })} />
          <Input label="KRA PIN" value={f.kraPin} onChange={(e) => setF({ ...f, kraPin: e.target.value.toUpperCase() })} hint="Needed on their invoices" />
        </div>
        <Input label="Credit limit (KES)" inputMode="decimal" value={f.limit} onChange={(e) => setF({ ...f, limit: e.target.value })} hint="Leave empty for no limit" error={f.limit.trim() && limit === null ? 'Enter an amount like 50000' : undefined} />
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={!f.companyName.trim() || limit === null}>Add account</Button></div>
      </form>
    </Modal>
  );
}

function AccountModal({ account, onClose }: { account: FleetAccount; onClose: () => void }) {
  const qc = useQueryClient();
  const { isManager } = useFuelScope();
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState('CASH');
  const [reference, setReference] = useState('');
  const { data: tx = [] } = useQuery({ queryKey: ['fleet-tx', account.id], queryFn: () => api.get<Array<{ id: string; type: string; amountCents: number; reference: string | null; description: string | null; createdAt: string }>>(`/fuel-pump/fleet/${account.id}/transactions`) });
  const cents = kesToCents(amount);
  const pay = useMutation({
    mutationFn: () => api.post(`/fuel-pump/fleet/${account.id}/payment`, { amountCents: cents, method, reference: reference.trim() || undefined }),
    onSuccess: () => { toast.success('Payment recorded'); setAmount(''); setReference(''); void qc.invalidateQueries({ queryKey: ['fleet-accounts'] }); void qc.invalidateQueries({ queryKey: ['fleet-tx'] }); },
    onError: (e: Error) => toast.error(e.message),
  });
  const owes = account.balanceCents < 0;
  return (
    <Modal title={account.companyName} subtitle={`${owes ? 'Owes' : 'In credit'} ${formatKES(Math.abs(account.balanceCents))}${account.kraPin ? `. KRA PIN ${account.kraPin}` : '. No KRA PIN on file'}`} onClose={onClose} wide>
      <div className="space-y-4">
        {isManager && (
          <form className="grid grid-cols-2 md:grid-cols-5 gap-3 items-end rounded-lg bg-green-50 p-3" onSubmit={(e) => { e.preventDefault(); if (cents) pay.mutate(); }}>
            <Input label="Payment received (KES)" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} className="col-span-2 md:col-span-1" />
            <Select label="Method" value={method} onChange={(e) => setMethod(e.target.value)}>{['CASH', 'MPESA', 'CARD', 'BANK'].map((m) => <option key={m} value={m}>{m === 'MPESA' ? 'M-Pesa' : m[0] + m.slice(1).toLowerCase()}</option>)}</Select>
            <Input label="Reference" value={reference} onChange={(e) => setReference(e.target.value)} className="col-span-2 md:col-span-2" />
            <Button type="submit" variant="success" loading={pay.isPending} disabled={!cents} className="col-span-2 md:col-span-1">Record payment</Button>
          </form>
        )}
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide sticky top-0"><tr><th className="text-left px-3 py-2">Date</th><th className="text-left px-3 py-2">Type</th><th className="text-right px-3 py-2">Amount</th><th className="text-left px-3 py-2">Reference</th></tr></thead>
            <tbody>
              {tx.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-3 py-1.5 text-gray-600 text-xs whitespace-nowrap">{new Date(t.createdAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}</td>
                  <td className="px-3 py-1.5"><span className={`inline-flex items-center gap-1 text-xs font-semibold ${t.type === 'CHARGE' ? 'text-red-700' : 'text-green-700'}`}>{t.type === 'CHARGE' ? <ArrowDownCircle className="w-3.5 h-3.5" aria-hidden /> : <ArrowUpCircle className="w-3.5 h-3.5" aria-hidden />}{t.type === 'CHARGE' ? 'Fuel' : t.type === 'PAYMENT' ? 'Payment' : 'Voided sale'}</span></td>
                  <td className="px-3 py-1.5 text-right tabular-nums font-medium">{formatKES(t.amountCents)}</td>
                  <td className="px-3 py-1.5 text-gray-600 text-xs">{t.reference ?? t.description ?? '-'}</td>
                </tr>
              ))}
              {tx.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-gray-500">No transactions yet</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Modal>
  );
}

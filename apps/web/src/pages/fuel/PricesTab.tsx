import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { History, Pencil, Plus } from 'lucide-react';
import { formatKES } from '@pos/shared';
import { api } from '../../lib/api';
import { Badge, Button, Card, EmptyState, Input } from '../../components/ui';
import { Modal } from './Modal';
import { centsToInput, kesToCents } from './money';
import type { Grade } from './types';
import { useFuelScope, useGrades } from './useFuelData';

export default function PricesTab() {
  const { storeId, isManager } = useFuelScope();
  const { data: grades = [], isPending: isLoading } = useGrades();
  const [editing, setEditing] = useState<Grade | 'new' | null>(null);
  const [history, setHistory] = useState<Grade | null>(null);

  return (
    <div className="space-y-4">
      {isManager && <div className="flex justify-end"><Button variant="secondary" icon={<Plus className="w-4 h-4" />} onClick={() => setEditing('new')}>Add fuel grade</Button></div>}
      {isLoading ? <p className="text-sm text-gray-500 py-8 text-center">Loading...</p> : grades.length === 0 ? (
        <Card><EmptyState title="No fuel grades yet" description="Add the grades you sell, for example Super Petrol, Diesel and Kerosene, with today's pump price." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600 text-xs uppercase tracking-wide">
                <tr><th className="text-left px-4 py-2">Grade</th><th className="text-right px-3 py-2">Pump price</th><th className="text-right px-3 py-2">Regulator's cap</th><th className="text-left px-3 py-2">Status</th><th className="px-3 py-2" /></tr>
              </thead>
              <tbody>
                {grades.map((g) => (
                  <tr key={g.id} className="border-t">
                    <td className="px-4 py-2"><p className="font-medium">{g.name}</p><p className="text-xs text-gray-600">{g.code}</p></td>
                    <td className="px-3 py-2 text-right tabular-nums font-semibold">{formatKES(g.pricePerLitreCents)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{g.maxPricePerLitreCents ? formatKES(g.maxPricePerLitreCents) : 'none set'}</td>
                    <td className="px-3 py-2">{g.isActive ? <Badge tone="success">Selling</Badge> : <Badge>Switched off</Badge>}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <Button variant="ghost" size="sm" icon={<History className="w-4 h-4" />} onClick={() => setHistory(g)}>History</Button>
                      {isManager && <Button variant="ghost" size="sm" icon={<Pencil className="w-4 h-4" />} onClick={() => setEditing(g)}>Change</Button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {editing && <GradeModal grade={editing === 'new' ? null : editing} storeId={storeId} onClose={() => setEditing(null)} />}
      {history && <HistoryModal grade={history} onClose={() => setHistory(null)} />}
    </div>
  );
}

function GradeModal({ grade, storeId, onClose }: { grade: Grade | null; storeId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(grade?.name ?? '');
  const [code, setCode] = useState(grade?.code ?? '');
  const [price, setPrice] = useState(centsToInput(grade?.pricePerLitreCents));
  const [cap, setCap] = useState(centsToInput(grade?.maxPricePerLitreCents));
  const [note, setNote] = useState('');
  const [active, setActive] = useState(grade?.isActive ?? true);

  const priceCents = kesToCents(price);
  const capCents = cap.trim() ? kesToCents(cap) : null;
  const overCap = priceCents !== null && capCents !== null && priceCents > capCents;
  const changed = grade && priceCents !== null && priceCents !== grade.pricePerLitreCents;

  const save = useMutation({
    mutationFn: () => grade
      ? api.patch(`/fuel-pump/grades/${grade.id}`, { name: name.trim(), code: code.trim(), pricePerLitreCents: priceCents, maxPricePerLitreCents: cap.trim() ? capCents : null, isActive: active, note: note.trim() || undefined })
      : api.post('/fuel-pump/grades', { storeId, name: name.trim(), code: code.trim(), pricePerLitreCents: priceCents }),
    onSuccess: () => { toast.success(grade ? 'Grade updated' : 'Grade added'); void qc.invalidateQueries({ queryKey: ['fuel-grades'] }); void qc.invalidateQueries({ queryKey: ['fuel-pumps'] }); onClose(); },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Modal title={grade ? `Change ${grade.name}` : 'Add a fuel grade'} onClose={onClose}>
      <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="grid grid-cols-2 gap-3">
          <Input label="Name" placeholder="Super Petrol" value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Short code" placeholder="PMS" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} />
        </div>
        <Input label="Pump price per litre (KES)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} error={price && priceCents === null ? 'Enter a price like 195.50' : overCap ? 'Above the regulator\'s cap' : undefined} />
        {grade && <Input label="Regulator's cap per litre (KES, optional)" inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} hint="The highest price allowed this month. A price above it is refused." error={cap.trim() && capCents === null ? 'Enter an amount like 217.36' : undefined} />}
        {changed && <Input label="Reason for the change (optional)" placeholder="Monthly price review" value={note} onChange={(e) => setNote(e.target.value)} hint="Kept with who changed it and when" />}
        {grade && <label className="flex items-center gap-2 text-sm"><input type="checkbox" className="w-5 h-5" checked={active} onChange={(e) => setActive(e.target.checked)} />Selling this grade</label>}
        <div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={save.isPending} disabled={!name.trim() || !code.trim() || priceCents === null || priceCents <= 0 || overCap}>{grade ? 'Save' : 'Add grade'}</Button></div>
      </form>
    </Modal>
  );
}

function HistoryModal({ grade, onClose }: { grade: Grade; onClose: () => void }) {
  const { data = [], isLoading } = useQuery({ queryKey: ['fuel-price-history', grade.id], queryFn: () => api.get<Array<{ id: string; oldPriceCents: number; newPriceCents: number; changedBy: string; note: string | null; createdAt: string }>>(`/fuel-pump/grades/${grade.id}/price-history`) });
  return (
    <Modal title={`${grade.name} price history`} onClose={onClose}>
      {isLoading ? <p className="text-sm text-gray-500">Loading...</p> : data.length === 0 ? <p className="text-sm text-gray-600">No price changes recorded yet.</p> : (
        <table className="w-full text-sm">
          <thead className="text-gray-600 text-xs uppercase tracking-wide"><tr><th className="text-left py-2">When</th><th className="text-right px-2">From</th><th className="text-right px-2">To</th><th className="text-left px-2">By</th></tr></thead>
          <tbody>
            {data.map((h) => (
              <tr key={h.id} className="border-t align-top">
                <td className="py-2 pr-2">{new Date(h.createdAt).toLocaleString('en-KE', { dateStyle: 'medium', timeStyle: 'short' })}{h.note && <p className="text-xs text-gray-600">{h.note}</p>}</td>
                <td className="px-2 py-2 text-right tabular-nums">{formatKES(h.oldPriceCents)}</td>
                <td className="px-2 py-2 text-right tabular-nums font-semibold">{formatKES(h.newPriceCents)}</td>
                <td className="px-2 py-2">{h.changedBy}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </Modal>
  );
}

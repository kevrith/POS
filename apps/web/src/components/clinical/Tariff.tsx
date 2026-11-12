import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { formatKES } from '@pos/shared';
import { Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { Button, Input, Select } from '../ui';
import { Modal } from '../../pages/fuel/Modal';

interface TariffLine { id: string; itemId: string; itemName: string; itemType: string | null; listPriceCents: number | null; priceCents: number }

/**
 * What one insurer pays for each service or medicine, where that differs from the list price. A visit or a dispense that the
 * insurer pays part of is invoiced at these prices; anything not listed here is invoiced at the list price.
 */
export default function TariffModal({ provider, onClose }: { provider: { id: string; name: string }; onClose: () => void }) {
  const user = useAuthStore((s) => s.user);
  const qc = useQueryClient();
  const [itemId, setItemId] = useState('');
  const [price, setPrice] = useState('');
  const { data: lines = [] } = useQuery<TariffLine[]>({ queryKey: ['cover', 'tariffs', provider.id], queryFn: () => api.get(`/cover/tariffs?providerId=${provider.id}`) });
  const { data: items = [] } = useQuery<Array<{ id: string; name: string; type: string; retailPriceCents: number }>>({
    queryKey: ['tariff-items', user?.businessId],
    queryFn: () => api.get(`/items?businessId=${user?.businessId}&storeId=${user?.storeId}&activeOnly=true`),
    enabled: !!user?.businessId,
    staleTime: 60_000,
  });
  const chosen = items.find((i) => i.id === itemId);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['cover'] });
  const save = useMutation({
    mutationFn: () => api.put('/cover/tariffs', { providerId: provider.id, itemId, priceCents: Math.round((parseFloat(price) || 0) * 100) }),
    onSuccess: () => { setItemId(''); setPrice(''); refresh(); toast.success('Price saved'); },
    onError: (e: Error) => toast.error(e.message),
  });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/cover/tariffs/${id}`), onSuccess: refresh, onError: (e: Error) => toast.error(e.message) });
  const listed = new Set(lines.map((l) => l.itemId));
  return (
    <Modal wide title={`${provider.name}: prices`} subtitle="What this insurer pays, where it differs from your list price" onClose={onClose}>
      <div className="space-y-4">
        <form className="grid items-end gap-3 sm:grid-cols-[1fr_160px_auto]" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
          <Select label="Service or medicine" value={itemId} onChange={(e) => { setItemId(e.target.value); const i = items.find((x) => x.id === e.target.value); if (i && !price) setPrice((i.retailPriceCents / 100).toFixed(2)); }}>
            <option value="">Choose an item…</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}{listed.has(i.id) ? ' (has a price)' : ''}</option>)}
          </Select>
          <Input label="Insurer pays (KES)" inputMode="decimal" value={price} onChange={(e) => setPrice(e.target.value)} hint={chosen ? `List price ${formatKES(chosen.retailPriceCents)}` : undefined} />
          <Button type="submit" loading={save.isPending} disabled={!itemId || !(parseFloat(price) > 0)}>Save</Button>
        </form>
        {lines.length === 0 ? <p className="text-sm text-gray-600">No special prices yet: every item is invoiced at its list price.</p> : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs uppercase text-gray-500"><tr><th className="px-3 py-2">Item</th><th className="px-3 py-2 text-right">List price</th><th className="px-3 py-2 text-right">Insurer pays</th><th className="px-3 py-2" /></tr></thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="px-3 py-2">{l.itemName}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-gray-600">{l.listPriceCents === null ? '-' : formatKES(l.listPriceCents)}</td>
                    <td className="px-3 py-2 text-right font-semibold tabular-nums">{formatKES(l.priceCents)}</td>
                    <td className="px-3 py-2 text-right"><button type="button" aria-label={`Remove the price for ${l.itemName}`} className="text-gray-400 hover:text-red-600" onClick={() => remove.mutate(l.id)}><Trash2 className="h-4 w-4" /></button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Modal>
  );
}

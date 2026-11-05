import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { BedDouble, Plus, Trash2 } from 'lucide-react';
import { api } from '../lib/api';

interface Levy { name: string; ratePct: string; base: 'ROOM' | 'ALL' }

function parse(stored?: string | null): Levy[] {
  try {
    const raw = JSON.parse(stored ?? '[]');
    return Array.isArray(raw) ? raw.map((l) => ({ name: String(l.name ?? ''), ratePct: String(l.ratePct ?? ''), base: l.base === 'ALL' ? 'ALL' : 'ROOM' })) : [];
  } catch {
    return [];
  }
}

/**
 * Levies a hotel adds on top of a stay (a tourism levy, a catering levy). Whether to charge one differs hotel to
 * hotel, so each business lists its own; most list none and guests are billed the room and charges only.
 *
 * Saved on its own, not with the Settings form, so a half-edited list is never saved by accident.
 */
export default function HotelLeviesCard({ businessId, stored }: { businessId: string; stored?: string | null }) {
  const qc = useQueryClient();
  const [levies, setLevies] = useState<Levy[]>(() => parse(stored));
  useEffect(() => setLevies(parse(stored)), [stored]);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/business/${businessId}/settings`, {
        hotelLevies: levies.map((l) => ({ name: l.name.trim(), ratePct: parseFloat(l.ratePct), base: l.base })),
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['business-settings', businessId] });
      toast.success('Hotel levies saved');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const set = (i: number, patch: Partial<Levy>) => setLevies((all) => all.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const invalid = levies.some((l) => !l.name.trim() || !(parseFloat(l.ratePct) > 0));

  return (
    <div className="border rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50 space-y-3">
      <div>
        <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
          <BedDouble className="w-4 h-4" /> Hotel levies
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
          Add a levy only if your hotel charges one (for example a tourism levy). It is added to the guest bill at check-out as its own line,
          worked out on the room nights or on everything, before VAT. Leave the list empty to charge none. Confirm the rate and base with your accountant.
        </p>
      </div>
      {levies.map((l, i) => (
        <div key={i} className="grid grid-cols-12 gap-2 items-center">
          <input
            value={l.name}
            onChange={(e) => set(i, { name: e.target.value })}
            placeholder="Name, e.g. Tourism levy"
            maxLength={40}
            className="col-span-5 border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <input
            value={l.ratePct}
            onChange={(e) => set(i, { ratePct: e.target.value })}
            placeholder="Rate %"
            type="number" min={0} max={30} step="0.01"
            className="col-span-2 border rounded-lg px-3 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          />
          <select
            value={l.base}
            onChange={(e) => set(i, { base: e.target.value as Levy['base'] })}
            className="col-span-4 border rounded-lg px-2 py-2 text-sm dark:bg-gray-700 dark:border-gray-600 dark:text-white"
          >
            <option value="ROOM">On room nights</option>
            <option value="ALL">On everything</option>
          </select>
          <button type="button" onClick={() => setLevies((all) => all.filter((_, j) => j !== i))} className="col-span-1 p-2 text-red-500 hover:bg-red-50 rounded-lg" aria-label="Remove levy">
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
      <div className="flex items-center gap-3">
        {levies.length < 5 && (
          <button type="button" onClick={() => setLevies((all) => [...all, { name: '', ratePct: '', base: 'ROOM' }])} className="text-sm text-blue-600 hover:underline flex items-center gap-1">
            <Plus className="w-4 h-4" /> Add a levy
          </button>
        )}
        <button
          type="button"
          onClick={() => save.mutate()}
          disabled={save.isPending || invalid}
          className="ml-auto px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {save.isPending ? 'Saving...' : 'Save levies'}
        </button>
      </div>
    </div>
  );
}

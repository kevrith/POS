import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ChefHat, Monitor, Printer } from 'lucide-react';
import { normalizeKitchenMode, type KitchenMode } from '@pos/shared';
import { api } from '../lib/api';

const OPTIONS: Array<{ mode: KitchenMode; title: string; body: string; icon: typeof Monitor }> = [
  {
    mode: 'KDS',
    title: 'Kitchen display',
    body: 'Orders appear on a screen in the kitchen (another computer, tablet or TV). Cooks tap them through cooking to ready, and the waiter sees when an order is ready to serve.',
    icon: Monitor,
  },
  {
    mode: 'PRINT_ONLY',
    title: 'Printed tickets only',
    body: 'No kitchen screen. When the waiter sends an order, a kitchen ticket prints and is carried to the kitchen. The order is recorded as handed over straight away, so nothing waits on a screen.',
    icon: Printer,
  },
];

/**
 * Whether this business has a kitchen display. Many hotels and restaurants have no second screen, so the display is
 * optional: with "printed tickets only" the kitchen display is hidden and every sent order is recorded as handed over.
 * Saved on its own, like the other cards, so it is never changed by an unrelated Save.
 */
export default function KitchenModeCard({ businessId, stored }: { businessId: string; stored?: string | null }) {
  const qc = useQueryClient();
  const [mode, setMode] = useState<KitchenMode>(() => normalizeKitchenMode(stored));
  useEffect(() => setMode(normalizeKitchenMode(stored)), [stored]);

  const save = useMutation({
    mutationFn: (next: KitchenMode) => api.patch(`/business/${businessId}/settings`, { kitchenMode: next }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['business-settings', businessId] });
      toast.success('Kitchen setting saved');
    },
    onError: (e: Error) => { setMode(normalizeKitchenMode(stored)); toast.error(e.message); },
  });

  return (
    <div className="border rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50 space-y-3">
      <div>
        <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
          <ChefHat className="w-4 h-4" /> How does your kitchen receive orders?
        </h3>
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
          You can change this at any time. Orders already on a kitchen screen stay there until they are served or voided.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {OPTIONS.map(({ mode: m, title, body, icon: Icon }) => {
          const active = mode === m;
          return (
            <button
              key={m}
              type="button"
              disabled={save.isPending}
              onClick={() => { if (!active) { setMode(m); save.mutate(m); } }}
              aria-pressed={active}
              className={`text-left rounded-xl border-2 p-3 transition-colors disabled:opacity-60 ${
                active ? 'border-blue-600 bg-white dark:bg-gray-900' : 'border-gray-200 hover:border-gray-300 bg-white/60 dark:bg-gray-900/40 dark:border-gray-700'
              }`}
            >
              <span className="flex items-center gap-2 font-semibold text-sm text-gray-800 dark:text-white">
                <Icon className="w-4 h-4" /> {title}
                {active && <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-blue-700 bg-blue-100 px-2 py-0.5 rounded-full">In use</span>}
              </span>
              <span className="block text-xs text-gray-500 dark:text-gray-400 mt-1.5">{body}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

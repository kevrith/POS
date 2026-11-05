import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Receipt } from 'lucide-react';
import { api } from '../lib/api';
import { useDialog } from './Dialog';

/**
 * The switch that makes fuel (and, as they arrive, hotel, pharmacy, cyber and appointment) takings real sales.
 *
 * Off is the default for a business that existed before this: if it already rings these takings through the till,
 * switching on would count them twice. Owner only, and not part of the Settings form, so saving other settings can
 * never flip it.
 */
export default function SalesPipelineCard({ businessId, enabled, since }: { businessId: string; enabled: boolean; since?: string | null }) {
  const qc = useQueryClient();
  const { confirm } = useDialog();

  const save = useMutation({
    mutationFn: (verticalSalesEnabled: boolean) => api.patch(`/business/${businessId}/settings`, { verticalSalesEnabled }),
    onSuccess: (_r, on) => {
      void qc.invalidateQueries({ queryKey: ['business-settings', businessId] });
      toast.success(on ? 'Fuel, hotel, pharmacy and cyber takings are now recorded as sales' : 'Those takings are no longer recorded as sales');
    },
    onError: (e: Error) => toast.error(e.message),
  });

  async function toggle() {
    const turningOn = !enabled;
    const ok = await confirm(
      turningOn
        ? {
            title: 'Record these takings as sales?',
            message:
              'From now on every fuel sale (and, as they arrive, hotel, pharmacy and cyber café takings) gets a receipt number, goes to KRA eTIMS and appears in Z-reports, the cash drawer and the books. ' +
              'Do this only if you have STOPPED ringing these takings through the normal till, or they will be counted twice. Earlier takings are not changed.',
            variant: 'warning',
            confirmLabel: 'Turn on',
          }
        : {
            title: 'Stop recording these takings as sales?',
            message:
              'New fuel, hotel, pharmacy and cyber takings will no longer get a receipt, an eTIMS invoice or an entry in the books. Do this only if you will ring them through the normal till instead.',
            variant: 'warning',
            confirmLabel: 'Turn off',
          },
    );
    if (ok) save.mutate(turningOn);
  }

  return (
    <div className="border rounded-xl p-4 bg-gray-50 dark:bg-gray-800/50">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-800 dark:text-white flex items-center gap-2">
            <Receipt className="w-4 h-4" /> Fuel, hotel, pharmacy and cyber takings
          </h3>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-xl">
            {enabled
              ? `Recorded as sales${since ? ` since ${new Date(since).toLocaleDateString()}` : ''}: each one gets a receipt number, goes to KRA eTIMS, and shows in Z-reports, the cash drawer and the books.`
              : 'Not recorded as sales. If you already ring these takings through the till, leave this off so they are not counted twice. Turn it on when you stop doing that.'}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void toggle()}
          disabled={save.isPending}
          className={`shrink-0 px-3 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50 ${enabled ? 'border border-gray-300 text-gray-700 hover:bg-gray-100' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
        >
          {save.isPending ? 'Saving...' : enabled ? 'Turn off' : 'Turn on'}
        </button>
      </div>
    </div>
  );
}

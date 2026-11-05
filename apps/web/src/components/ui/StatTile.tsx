import type { ReactNode } from 'react';
import { cn } from './cn';
import { Card } from './Card';

/**
 * A key figure. The number is in the normal text colour: colour is kept for status (a falling number can be red),
 * so a row of tiles does not turn into a rainbow.
 */
export function StatTile({ label, value, note, icon, tone = 'neutral' }: { label: string; value: ReactNode; note?: ReactNode; icon?: ReactNode; tone?: 'neutral' | 'success' | 'danger' }) {
  return (
    <Card className="p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-600">{label}</p>
        {icon && <span className="w-9 h-9 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center flex-shrink-0" aria-hidden>{icon}</span>}
      </div>
      <p className={cn('mt-2 text-2xl font-extrabold tabular-nums whitespace-nowrap', tone === 'success' ? 'text-green-700' : tone === 'danger' ? 'text-red-600' : 'text-gray-900')}>{value}</p>
      {note && <p className="mt-1 text-sm text-gray-600">{note}</p>}
    </Card>
  );
}

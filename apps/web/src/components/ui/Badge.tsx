import type { ReactNode } from 'react';
import { cn } from './cn';

export type BadgeTone = 'brand' | 'success' | 'warning' | 'danger' | 'neutral';

const TONE: Record<BadgeTone, string> = {
  brand: 'bg-brand-100 text-brand-800 dark:bg-brand-500/20 dark:text-brand-300',
  success: 'bg-green-100 text-green-800 dark:bg-green-500/15 dark:text-green-400',
  warning: 'bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-400',
  danger: 'bg-red-100 text-red-800 dark:bg-red-500/15 dark:text-red-400',
  neutral: 'bg-gray-100 text-gray-700 dark:bg-white/10 dark:text-gray-300',
};

/** A small status pill. Colour carries meaning: success, warning and danger are statuses; brand and neutral are not. */
export function Badge({ tone = 'neutral', icon, children, className }: { tone?: BadgeTone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold leading-none whitespace-nowrap', TONE[tone], className)}>
      {icon}
      {children}
    </span>
  );
}

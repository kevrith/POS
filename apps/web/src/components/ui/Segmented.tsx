import type { ReactNode } from 'react';
import { cn } from './cn';

export interface SegmentItem<T extends string> { id: T; label: string; icon?: ReactNode; count?: number }

/**
 * Pill-style switch between a few views or filters (periods, "All / Open / Closed"). Use Tabs for page sections and
 * Segmented for a choice that changes what a list shows. Wraps on a narrow screen instead of clipping.
 */
export function Segmented<T extends string>({ items, value, onChange, className, size = 'md' }: {
  items: Array<SegmentItem<T>>; value: T; onChange: (id: T) => void; className?: string; size?: 'sm' | 'md';
}) {
  return (
    <div role="tablist" className={cn('flex flex-wrap gap-1.5', className)}>
      {items.map((it) => {
        const active = it.id === value;
        return (
          <button
            key={it.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(it.id)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full font-semibold whitespace-nowrap transition-colors',
              size === 'sm' ? 'h-8 px-3 text-xs' : 'h-10 px-4 text-sm',
              active ? 'bg-brand-600 text-white shadow-btn' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
            )}
          >
            {it.icon}
            {it.label}
            {it.count !== undefined && (
              <span className={cn('text-xs rounded-full px-1.5 py-0.5', active ? 'bg-white/20' : 'bg-white text-gray-700')}>{it.count}</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

import type { ReactNode } from 'react';
import { cn } from './cn';

export interface SideNavItem<T extends string> { id: T; label: string; icon?: ReactNode }
export interface SideNavGroup<T extends string> { label: string; items: Array<SideNavItem<T>> }

/** A grouped vertical menu for pages with many sections (Settings). On a phone, pair it with `Tabs` and hide this one. */
export function SideNav<T extends string>({ groups, value, onChange, className }: {
  groups: Array<SideNavGroup<T>>; value: T; onChange: (id: T) => void; className?: string;
}) {
  return (
    <nav aria-label="Sections" className={cn('space-y-5', className)}>
      {groups.map((g) => (
        <div key={g.label}>
          <p className="px-3 mb-1.5 text-xs font-bold uppercase tracking-wide text-gray-600">{g.label}</p>
          <ul className="space-y-0.5">
            {g.items.map((it) => {
              const active = it.id === value;
              return (
                <li key={it.id}>
                  <button
                    type="button"
                    aria-current={active ? 'page' : undefined}
                    onClick={() => onChange(it.id)}
                    className={cn(
                      'w-full flex items-center gap-2.5 px-3 h-10 rounded-lg text-sm font-semibold text-left transition-colors',
                      active ? 'bg-brand-100 text-brand-800 dark:bg-brand-500/20 dark:text-brand-300' : 'text-gray-700 hover:bg-gray-100',
                    )}
                  >
                    {it.icon && <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center" aria-hidden>{it.icon}</span>}
                    <span className="truncate">{it.label}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

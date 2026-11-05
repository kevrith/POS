import type { ReactNode } from 'react';

/** The title row of a page: title and subtitle on the left, actions on the right, wrapping on a phone. */
export function PageHeader({ title, subtitle, icon, actions }: { title: string; subtitle?: string; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {icon && <span className="w-10 h-10 rounded-xl bg-brand-100 text-brand-700 flex items-center justify-center flex-shrink-0" aria-hidden>{icon}</span>}
        <div className="min-w-0">
          <h1 className="text-xl md:text-2xl font-extrabold tracking-tight text-gray-900 truncate">{title}</h1>
          {subtitle && <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

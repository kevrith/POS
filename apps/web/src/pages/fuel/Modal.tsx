import { useEffect, type ReactNode } from 'react';
import { X } from 'lucide-react';
import { cn } from '../../components/ui';

/** A centred window over the page. Escape and the close button dismiss it; the page behind stays put. */
export function Modal({ title, subtitle, onClose, children, wide }: { title: string; subtitle?: string; onClose: () => void; children: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-3 sm:p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={title} className={cn('bg-white rounded-xl w-full shadow-2xl max-h-[92vh] flex flex-col', wide ? 'max-w-4xl' : 'max-w-lg')}>
        <div className="px-5 py-4 border-b flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-bold text-lg text-gray-900">{title}</h2>
            {subtitle && <p className="text-sm text-gray-600 mt-0.5">{subtitle}</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="w-9 h-9 -mr-2 rounded-lg text-gray-500 hover:bg-gray-100 flex items-center justify-center flex-shrink-0">
            <X className="w-5 h-5" aria-hidden />
          </button>
        </div>
        <div className="p-5 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}

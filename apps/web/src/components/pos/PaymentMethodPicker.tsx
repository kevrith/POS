import type { LucideIcon } from 'lucide-react';
import { cn } from '../ui';

export interface PickerMethod<T extends string> { id: T; label: string; Icon: LucideIcon }
export interface PickerGroup<T extends string> { label: string; Icon: LucideIcon; methods: Array<PickerMethod<T>> }

/**
 * Choose how the customer is paying, in two readable steps instead of one cramped row:
 *   1. the kind of payment (Cash, M-Pesa, Card, Other) as four large tiles, and
 *   2. when that kind has several ways (STK Push, Paybill, QR Code ...), the way, as chips with their full names
 *      that wrap onto a second line rather than being squeezed into a tab.
 * Every target is at least 44px tall, so it works with a finger as well as a mouse.
 */
export function PaymentMethodPicker<T extends string>({ groups, value, onChange }: {
  groups: Array<PickerGroup<T>>; value: T; onChange: (id: T) => void;
}) {
  const active = groups.find((g) => g.methods.some((m) => m.id === value)) ?? groups[0];

  return (
    <div className="px-4 pb-3 space-y-2.5 flex-shrink-0 border-b border-gray-100">
      <div role="tablist" aria-label="Payment type" className="grid gap-2" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
        {groups.map((g) => {
          const isActive = g === active;
          return (
            <button
              key={g.label}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => { if (!isActive) onChange(g.methods[0].id); }}
              className={cn(
                'min-h-[56px] rounded-xl border-2 px-1 py-2 flex flex-col items-center justify-center gap-1 transition-colors active:scale-[0.97]',
                isActive ? 'border-brand-600 bg-brand-50 text-brand-800' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300 hover:bg-gray-50',
              )}
            >
              <g.Icon className="w-5 h-5" aria-hidden />
              <span className="text-xs font-bold leading-none">{g.label}</span>
            </button>
          );
        })}
      </div>

      {active.methods.length > 1 && (
        <div role="tablist" aria-label={`${active.label} options`} className="flex flex-wrap gap-2">
          {active.methods.map(({ id, label, Icon }) => {
            const isActive = id === value;
            return (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={isActive}
                onClick={() => onChange(id)}
                className={cn(
                  'h-11 px-4 rounded-full inline-flex items-center gap-2 text-sm font-semibold whitespace-nowrap transition-colors active:scale-[0.97]',
                  isActive ? 'bg-brand-600 text-white shadow-btn' : 'bg-gray-100 text-gray-700 hover:bg-gray-200',
                )}
              >
                <Icon className="w-4 h-4" aria-hidden />
                {label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

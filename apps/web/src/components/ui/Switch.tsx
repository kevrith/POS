import { cn } from './cn';

/** An on/off switch. It is a real `switch` for assistive tech: it has a name and announces its state. */
export function Switch({ checked, onChange, label, disabled, className }: {
  checked: boolean; onChange: (next: boolean) => void; label: string; disabled?: boolean; className?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed',
        checked ? 'bg-brand-600' : 'bg-gray-300',
        className,
      )}
    >
      <span aria-hidden className={cn('inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform', checked ? 'translate-x-6' : 'translate-x-1')} />
    </button>
  );
}

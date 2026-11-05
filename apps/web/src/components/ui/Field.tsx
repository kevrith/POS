import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from './cn';

const CONTROL =
  'w-full h-10 px-3 rounded-lg border border-gray-300 bg-white text-sm text-gray-900 placeholder:text-gray-400 ' +
  'focus:outline-none focus:ring-2 focus:ring-brand-600/40 focus:border-brand-600 disabled:opacity-60 disabled:cursor-not-allowed ' +
  'aria-[invalid=true]:border-red-500 aria-[invalid=true]:focus:ring-red-500/30';

interface FieldShellProps {
  label: string;
  hint?: string;
  error?: string;
  /** Hide the label visually but keep it for screen readers (a search box with an icon, for example). */
  hideLabel?: boolean;
  className?: string;
}

function Shell({ id, label, hint, error, hideLabel, className, children }: FieldShellProps & { id: string; children: ReactNode }) {
  return (
    <div className={cn('space-y-1.5', className)}>
      <label htmlFor={id} className={cn('block text-[13px] font-semibold text-gray-700', hideLabel && 'sr-only')}>{label}</label>
      {children}
      {error ? <p id={`${id}-msg`} role="alert" className="text-xs text-red-600">{error}</p> : hint ? <p id={`${id}-msg`} className="text-xs text-gray-500">{hint}</p> : null}
    </div>
  );
}

type InputProps = FieldShellProps & Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & { inputClassName?: string };

/** A labelled text field. The label is real text (not a placeholder), so it stays visible once the field is filled. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input({ label, hint, error, hideLabel, className, inputClassName, id, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} hideLabel={hideLabel} className={className}>
      <input ref={ref} id={fid} aria-invalid={error ? true : undefined} aria-describedby={error || hint ? `${fid}-msg` : undefined} className={cn(CONTROL, inputClassName)} {...rest} />
    </Shell>
  );
});

type SelectProps = FieldShellProps & Omit<SelectHTMLAttributes<HTMLSelectElement>, 'className'>;

/** A labelled dropdown with the same height, border and focus ring as Input (the browser default select ignores both). */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select({ label, hint, error, hideLabel, className, id, children, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} hideLabel={hideLabel} className={className}>
      <div className="relative">
        <select ref={ref} id={fid} aria-invalid={error ? true : undefined} className={cn(CONTROL, 'appearance-none pr-9')} {...rest}>
          {children}
        </select>
        <ChevronDown className="w-4 h-4 text-gray-500 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" aria-hidden />
      </div>
    </Shell>
  );
});

type TextareaProps = FieldShellProps & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'className'>;

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea({ label, hint, error, hideLabel, className, id, rows = 3, ...rest }, ref) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <Shell id={fid} label={label} hint={hint} error={error} hideLabel={hideLabel} className={className}>
      <textarea ref={ref} id={fid} rows={rows} aria-invalid={error ? true : undefined} className={cn(CONTROL, 'h-auto py-2')} {...rest} />
    </Shell>
  );
});

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';
import { cn } from './cn';
import { IconButton } from './Button';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  /** Destructive items are red and are listed last, after a divider. */
  danger?: boolean;
  disabled?: boolean;
}

/**
 * A "more actions" button that opens a list of actions. The list is drawn in a portal at the button's position, so
 * a table or card with `overflow-hidden` cannot clip it, and it flips upward near the bottom of the screen.
 */
export function Menu({ items, label = 'More actions', trigger }: { items: MenuItem[]; label?: string; trigger?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const place = useCallback(() => {
    const r = btnRef.current?.getBoundingClientRect();
    if (!r) return;
    const up = window.innerHeight - r.bottom < 240 && r.top > 240;
    setPos({ top: up ? r.top - 4 : r.bottom + 4, left: Math.max(8, Math.min(r.right, window.innerWidth - 8)), up });
  }, []);

  useLayoutEffect(() => { if (open) place(); }, [open, place]);

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => {
      if (e instanceof KeyboardEvent && e.key !== 'Escape') return;
      if (e instanceof MouseEvent && (listRef.current?.contains(e.target as Node) || btnRef.current?.contains(e.target as Node))) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [open, place]);

  const normal = items.filter((i) => !i.danger);
  const danger = items.filter((i) => i.danger);

  const row = (i: MenuItem) => (
    <button
      key={i.label}
      type="button"
      role="menuitem"
      disabled={i.disabled}
      onClick={() => { setOpen(false); i.onSelect(); }}
      className={cn(
        'w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left transition-colors disabled:opacity-50',
        i.danger ? 'text-red-600 hover:bg-red-50 dark:hover:bg-red-500/10' : 'text-gray-700 hover:bg-gray-100',
      )}
    >
      {i.icon && <span className="w-4 h-4 flex-shrink-0 flex items-center justify-center" aria-hidden>{i.icon}</span>}
      {i.label}
    </button>
  );

  return (
    <>
      {trigger ? (
        <button ref={btnRef} type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>{trigger}</button>
      ) : (
        <IconButton ref={btnRef} label={label} size="sm" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
          <MoreHorizontal className="w-4 h-4" />
        </IconButton>
      )}
      {open && pos && createPortal(
        <div
          ref={listRef}
          role="menu"
          style={{ position: 'fixed', top: pos.top, left: pos.left, transform: `translate(-100%, ${pos.up ? '-100%' : '0'})` }}
          className="z-[60] min-w-[11rem] py-1 bg-white rounded-xl border border-gray-200 shadow-modal-sm animate-scale-in"
        >
          {normal.map(row)}
          {danger.length > 0 && normal.length > 0 && <div className="my-1 border-t border-gray-100" />}
          {danger.map(row)}
        </div>,
        document.body,
      )}
    </>
  );
}

import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { AlertTriangle, Loader2, Lock, Minus, Plus, ShieldCheck, X } from 'lucide-react';
import { VOID_REASONS, voidReason } from '@pos/shared';
import { api } from '../lib/api';

const fmt = (cents: number) => `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** What the server answers after a void; the panel uses it to print the kitchen a cancellation slip. */
export interface VoidOutcome {
  scope: 'ITEM' | 'ORDER';
  /** Lines the kitchen had, with the quantity being taken back. Empty when nothing had been sent. */
  sentLines: Array<{ itemId?: string; name: string; quantity: number }>;
}

export type VoidTarget =
  | { scope: 'ITEM'; orderId: string; line: { id: string; itemId: string; name: string; quantity: number; totalCents: number; sent: boolean } }
  | {
      scope: 'ORDER';
      orderId: string;
      tableLabel: string;
      lines: Array<{ id: string; itemId: string; name: string; quantity: number; totalCents: number; sent: boolean }>;
    };

interface Props {
  target: VoidTarget;
  /** The signed-in user's role: owners and managers approve their own voids, anyone else needs a manager PIN. */
  role?: string;
  userName?: string;
  onDone: (outcome: VoidOutcome) => void;
  onClose: () => void;
}

/**
 * One dialog for both kinds of void: part or all of a line ("void 1 of the 10 ugali"), or the whole order.
 *
 * The rules are enforced by the server; this only asks for what the server will require, so a waiter is not sent
 * round in circles: a reason always, and a manager PIN once the kitchen already has what is being taken back.
 */
export default function OrderVoidDialog({ target, role, userName, onDone, onClose }: Props) {
  const isManager = role === 'OWNER' || role === 'MANAGER' || role === 'ADMIN';
  const lines = target.scope === 'ITEM' ? [target.line] : target.lines;
  const anySent = lines.some((l) => l.sent);
  const needsPin = anySent && !isManager;

  const max = target.scope === 'ITEM' ? target.line.quantity : 1;
  const [qty, setQty] = useState(max);
  const [reasonCode, setReasonCode] = useState<string>('');
  const [note, setNote] = useState('');
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const firstChip = useRef<HTMLButtonElement>(null);

  useEffect(() => { firstChip.current?.focus(); }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const reason = voidReason(reasonCode);
  const valueCents = useMemo(() => {
    if (target.scope === 'ORDER') return target.lines.reduce((s, l) => s + l.totalCents, 0);
    return Math.round(target.line.totalCents / target.line.quantity) * qty;
  }, [target, qty]);

  const ready = !!reason && (!reason.note || note.trim().length >= 3) && (!needsPin || pin.length >= 4);

  const submit = useMutation({
    mutationFn: async () => {
      const body = { reasonCode, note: note.trim() || undefined, managerPin: pin || undefined };
      if (target.scope === 'ITEM') {
        await api.patch(`/hospitality/orders/${target.orderId}/items/${target.line.id}/void`, { ...body, quantity: qty });
        return {
          scope: 'ITEM' as const,
          sentLines: target.line.sent ? [{ itemId: target.line.itemId, name: target.line.name, quantity: qty }] : [],
        };
      }
      await api.post(`/hospitality/orders/${target.orderId}/void`, body);
      return {
        scope: 'ORDER' as const,
        sentLines: target.lines.filter((l) => l.sent).map((l) => ({ itemId: l.itemId, name: l.name, quantity: l.quantity })),
      };
    },
    onSuccess: (outcome) => onDone(outcome),
    onError: (e: unknown) => setError(e instanceof Error ? e.message : 'Could not void'),
  });

  const title = target.scope === 'ITEM' ? 'Void item' : `Void whole order, ${target.tableLabel}`;
  const action =
    target.scope === 'ITEM'
      ? `Void ${qty} × ${target.line.name}`
      : `Void order (${lines.length} item${lines.length === 1 ? '' : 's'})`;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/60 p-4" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="void-title" className="w-full max-w-md rounded-2xl bg-white shadow-2xl flex flex-col max-h-[92vh]">
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <h2 id="void-title" className="text-lg font-bold text-gray-900">{title}</h2>
            {target.scope === 'ITEM' ? (
              <p className="text-sm text-gray-500 truncate">{target.line.quantity} × {target.line.name} on the order</p>
            ) : (
              <p className="text-sm text-gray-500">{fmt(valueCents)} will be taken off the bill</p>
            )}
          </div>
          <button onClick={onClose} aria-label="Close" className="p-1.5 rounded-full text-gray-500 hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          {anySent && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
              <span>
                The kitchen already has {target.scope === 'ITEM' ? 'this' : 'part of this order'}. They will be told to stop,
                and the void is recorded with the reason and who approved it.
              </span>
            </div>
          )}

          {target.scope === 'ITEM' && target.line.quantity > 1 && (
            <div>
              <p className="mb-1.5 text-sm font-semibold text-gray-700">How many?</p>
              <div className="flex items-center gap-3">
                <button type="button" onClick={() => setQty((q) => Math.max(1, q - 1))} disabled={qty <= 1} aria-label="One fewer"
                  className="h-10 w-10 rounded-lg border text-gray-700 hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center">
                  <Minus className="h-4 w-4" />
                </button>
                <input
                  type="number" inputMode="numeric" min={1} max={max} value={qty} aria-label="Quantity to void"
                  onChange={(e) => setQty(Math.min(max, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  className="h-10 w-20 rounded-lg border text-center text-lg font-bold tabular-nums"
                />
                <button type="button" onClick={() => setQty((q) => Math.min(max, q + 1))} disabled={qty >= max} aria-label="One more"
                  className="h-10 w-10 rounded-lg border text-gray-700 hover:bg-gray-50 disabled:opacity-40 flex items-center justify-center">
                  <Plus className="h-4 w-4" />
                </button>
                <button type="button" onClick={() => setQty(max)} className="ml-1 text-sm font-medium text-blue-700 hover:underline">
                  All {max}
                </button>
                <span className="ml-auto text-sm font-bold text-gray-800">{fmt(valueCents)}</span>
              </div>
              {qty < max && <p className="mt-1.5 text-xs text-gray-500">{max - qty} will stay on the order.</p>}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-sm font-semibold text-gray-700">Why? <span className="font-normal text-red-600">required</span></p>
            <div className="grid grid-cols-2 gap-2">
              {VOID_REASONS.map((r, i) => (
                <button
                  key={r.code}
                  ref={i === 0 ? firstChip : undefined}
                  type="button"
                  aria-pressed={reasonCode === r.code}
                  onClick={() => setReasonCode(r.code)}
                  className={`rounded-lg border px-3 py-2 text-left text-sm leading-tight transition-colors ${
                    reasonCode === r.code ? 'border-red-600 bg-red-50 font-semibold text-red-800' : 'border-gray-200 text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  {r.label}
                </button>
              ))}
            </div>
            {reason?.note && (
              <textarea
                value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} rows={2} aria-label="Explain why"
                placeholder="Say what happened, in a few words"
                className="mt-2 w-full rounded-lg border px-3 py-2 text-sm"
              />
            )}
          </div>

          {needsPin ? (
            <div>
              <label htmlFor="void-pin" className="mb-1.5 flex items-center gap-1.5 text-sm font-semibold text-gray-700">
                <Lock className="h-4 w-4" /> Manager PIN <span className="font-normal text-red-600">required</span>
              </label>
              <input
                id="void-pin" type="password" inputMode="numeric" autoComplete="off" maxLength={8} value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, '')); setError(null); }}
                placeholder="Ask a manager to enter their PIN"
                className="h-11 w-full rounded-lg border px-3 text-center text-lg tracking-[0.4em]"
              />
            </div>
          ) : (
            anySent && (
              <p className="flex items-center gap-1.5 text-xs text-green-700">
                <ShieldCheck className="h-4 w-4" /> Approved by you{userName ? `, ${userName}` : ''}.
              </p>
            )
          )}

          {error && <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        </div>

        <div className="flex gap-3 border-t bg-gray-50 px-5 py-3">
          <button onClick={onClose} className="flex-1 rounded-xl border bg-white py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-100">
            Keep it
          </button>
          <button
            onClick={() => { setError(null); submit.mutate(); }}
            disabled={!ready || submit.isPending}
            className="flex flex-[1.6] items-center justify-center gap-2 rounded-xl bg-red-600 py-2.5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-40"
          >
            {submit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {action}
          </button>
        </div>
      </div>
    </div>
  );
}

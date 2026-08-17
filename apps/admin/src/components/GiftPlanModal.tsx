/**
 * Grant a plan free of charge.
 *
 * A dedicated modal rather than the generic confirm/prompt: gifting is a
 * consequential, irreversible-feeling action with three things the operator has to
 * see at once — which tier, that the account is excluded from revenue, and that the
 * recipient must sign in again before it takes effect. A one-line browser prompt
 * cannot carry that, and cannot show a failure without a second popup.
 *
 * Inline styles only — the admin app does not use Tailwind.
 */

import { useEffect, useRef, useState } from 'react';

const TIERS = ['FREE', 'STARTER', 'GROWTH', 'PRO', 'ENTERPRISE'] as const;

/** Monthly list price, shown so the operator sees what is being waived. */
const TIER_PRICE_KES: Record<string, number> = {
  FREE: 0, STARTER: 999, GROWTH: 2499, PRO: 4999, ENTERPRISE: 14999,
};

export interface GiftPlanModalProps {
  business: { id: string; name: string; subscriptionTier?: string | null };
  initialTier: string;
  onCancel: () => void;
  onConfirm: (tier: string, reason: string) => Promise<void>;
}

const S = {
  overlay: {
    position: 'fixed' as const, inset: 0, zIndex: 9999, display: 'flex',
    alignItems: 'center', justifyContent: 'center', padding: '1rem',
    background: 'rgba(0,0,0,0.65)', backdropFilter: 'blur(3px)',
  },
  card: {
    background: '#0f172a', border: '1px solid #1e293b', borderRadius: '16px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)', width: '100%', maxWidth: '460px',
  },
  header: { display: 'flex', alignItems: 'flex-start', gap: '1rem', padding: '1.5rem 1.5rem 1rem' },
  iconWrap: {
    flexShrink: 0, width: 40, height: 40, borderRadius: '50%', display: 'flex',
    alignItems: 'center', justifyContent: 'center', background: 'rgba(139,92,246,0.15)',
    fontSize: '1.125rem',
  },
  title: { fontSize: '0.9375rem', fontWeight: 700, color: '#f1f5f9', margin: 0, lineHeight: 1.3 },
  subtitle: { marginTop: '0.375rem', fontSize: '0.875rem', color: '#94a3b8', lineHeight: 1.6 },
  body: { padding: '0 1.5rem', display: 'flex', flexDirection: 'column' as const, gap: '1rem' },
  label: { display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#cbd5e1', marginBottom: '0.375rem' },
  field: {
    width: '100%', padding: '0.5rem 0.75rem', fontSize: '0.875rem', color: '#e2e8f0',
    background: '#0b1220', border: '1px solid #1e293b', borderRadius: '10px', outline: 'none',
    boxSizing: 'border-box' as const,
  },
  note: {
    display: 'flex', gap: '0.625rem', padding: '0.75rem', borderRadius: '10px',
    background: 'rgba(139,92,246,0.08)', border: '1px solid rgba(139,92,246,0.25)',
    fontSize: '0.75rem', color: '#c4b5fd', lineHeight: 1.6,
  },
  error: {
    padding: '0.625rem 0.75rem', borderRadius: '10px', fontSize: '0.8125rem',
    background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5',
  },
  actions: { display: 'flex', gap: '0.75rem', padding: '1.25rem 1.5rem 1.5rem', justifyContent: 'flex-end' },
  btnCancel: {
    padding: '0.5rem 1rem', fontSize: '0.875rem', fontWeight: 500, color: '#94a3b8',
    background: 'rgba(255,255,255,0.05)', border: '1px solid #1e293b', borderRadius: '10px', cursor: 'pointer',
  },
  btnConfirm: (busy: boolean) => ({
    padding: '0.5rem 1.125rem', fontSize: '0.875rem', fontWeight: 700, color: '#fff',
    background: '#7C3AED', border: 'none', borderRadius: '10px',
    cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1,
  }),
};

export default function GiftPlanModal({ business, initialTier, onCancel, onConfirm }: GiftPlanModalProps) {
  const [tier, setTier] = useState(initialTier || 'ENTERPRISE');
  const [reason, setReason] = useState('Complimentary account');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { inputRef.current?.focus(); inputRef.current?.select(); }, []);

  // Escape closes, Enter confirms — expected of any dialog, and the reason a browser
  // prompt at least felt native.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onCancel();
      if (e.key === 'Enter' && !busy) void submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError('');
    try {
      await onConfirm(tier, reason.trim() || 'Complimentary account');
    } catch (e: any) {
      // Shown in place instead of a second popup that loses what was typed.
      setError(e?.message ?? 'Could not grant the plan.');
      setBusy(false);
    }
  }

  const price = TIER_PRICE_KES[tier] ?? 0;

  return (
    <div style={S.overlay} onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <div style={S.card} role="dialog" aria-modal="true" aria-label="Gift a plan">
        <div style={S.header}>
          <div style={S.iconWrap}>🎁</div>
          <div>
            <h3 style={S.title}>Gift a plan — {business.name}</h3>
            <p style={S.subtitle}>
              Grants full access without payment. Currently on{' '}
              <strong style={{ color: '#cbd5e1' }}>{business.subscriptionTier ?? 'FREE'}</strong>.
            </p>
          </div>
        </div>

        <div style={S.body}>
          <div>
            <label style={S.label} htmlFor="gift-tier">Plan</label>
            <select
              id="gift-tier"
              value={tier}
              onChange={(e) => setTier(e.target.value)}
              style={S.field}
              disabled={busy}
            >
              {TIERS.map((t) => (
                <option key={t} value={t}>
                  {t}{TIER_PRICE_KES[t] ? ` — KES ${TIER_PRICE_KES[t].toLocaleString()}/mo waived` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={S.label} htmlFor="gift-reason">Reason</label>
            <input
              id="gift-reason"
              ref={inputRef}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g. Partner account, internal use, pilot"
              style={S.field}
              disabled={busy}
            />
          </div>

          <div style={S.note}>
            <span aria-hidden>ℹ️</span>
            <span>
              Excluded from MRR, ARR and the revenue export{price ? ` — KES ${price.toLocaleString()}/mo will not be counted as income` : ''}.
              The recipient must sign out and back in before the new plan takes effect.
            </span>
          </div>

          {error && <div style={S.error}>{error}</div>}
        </div>

        <div style={S.actions}>
          <button style={S.btnCancel} onClick={onCancel} disabled={busy}>Cancel</button>
          <button style={S.btnConfirm(busy)} onClick={() => void submit()} disabled={busy}>
            {busy ? 'Granting…' : `Gift ${tier} free`}
          </button>
        </div>
      </div>
    </div>
  );
}

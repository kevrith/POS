/**
 * Enterprise-grade dialog system — replaces window.confirm / window.prompt.
 * Uses inline styles only (no Tailwind — admin app does not use Tailwind CSS).
 *
 * Usage:
 *   const { confirm, prompt } = useDialog();
 *
 *   // Confirm:
 *   const ok = await confirm({ title: 'Delete item', message: 'This cannot be undone.', variant: 'danger' });
 *   if (ok) { ... }
 *
 *   // Prompt (text input):
 *   const reason = await prompt({ title: 'Rejection reason', placeholder: 'Enter reason...' });
 *   if (reason) { ... }
 *
 * Mount <DialogProvider /> once in App.tsx (already done).
 */

import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ConfirmOptions {
  title: string;
  message: string;
  variant?: 'danger' | 'warning' | 'info';
  confirmLabel?: string;
  cancelLabel?: string;
}

interface PromptOptions {
  title: string;
  message?: string;
  placeholder?: string;
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  inputType?: 'text' | 'textarea';
}

interface DialogContextValue {
  confirm: (opts: ConfirmOptions) => Promise<boolean>;
  prompt: (opts: PromptOptions) => Promise<string | null>;
}

// ─── Context ─────────────────────────────────────────────────────────────────

const DialogContext = createContext<DialogContextValue | null>(null);

export function useDialog(): DialogContextValue {
  const ctx = useContext(DialogContext);
  if (!ctx) throw new Error('useDialog must be used inside <DialogProvider>');
  return ctx;
}

// ─── Internal state types ─────────────────────────────────────────────────────

type ConfirmState = ConfirmOptions & { resolve: (v: boolean) => void };
type PromptState  = PromptOptions  & { resolve: (v: string | null) => void };

// ─── Shared styles ────────────────────────────────────────────────────────────

const S = {
  overlay: {
    position: 'fixed' as const,
    inset: 0,
    zIndex: 9999,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1rem',
    background: 'rgba(0,0,0,0.65)',
    backdropFilter: 'blur(3px)',
  },
  card: {
    position: 'relative' as const,
    background: '#0f172a',
    border: '1px solid #1e293b',
    borderRadius: '16px',
    boxShadow: '0 24px 64px rgba(0,0,0,0.6)',
    width: '100%',
    maxWidth: '440px',
    animation: 'dialogIn 0.15s ease-out',
  },
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '1rem',
    padding: '1.5rem 1.5rem 1rem',
  },
  iconWrap: (variant: string) => ({
    flexShrink: 0,
    width: '40px',
    height: '40px',
    borderRadius: '50%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: variant === 'danger' ? 'rgba(239,68,68,0.15)' : variant === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)',
  }),
  title: {
    fontSize: '0.9375rem',
    fontWeight: 700,
    color: '#f1f5f9',
    margin: 0,
    lineHeight: 1.3,
  },
  message: {
    marginTop: '0.375rem',
    fontSize: '0.875rem',
    color: '#94a3b8',
    lineHeight: 1.6,
  },
  closeBtn: {
    flexShrink: 0,
    background: 'none',
    border: 'none',
    color: '#475569',
    cursor: 'pointer',
    padding: '4px',
    borderRadius: '6px',
    fontSize: '1.25rem',
    lineHeight: 1,
    marginLeft: 'auto',
  },
  actions: {
    display: 'flex',
    gap: '0.75rem',
    padding: '0 1.5rem 1.5rem',
    justifyContent: 'flex-end',
  },
  btnCancel: {
    padding: '0.5rem 1rem',
    fontSize: '0.875rem',
    fontWeight: 500,
    color: '#94a3b8',
    background: 'rgba(255,255,255,0.05)',
    border: '1px solid #1e293b',
    borderRadius: '10px',
    cursor: 'pointer',
  },
  btnConfirm: (variant: string) => ({
    padding: '0.5rem 1.25rem',
    fontSize: '0.875rem',
    fontWeight: 600,
    color: '#fff',
    background: variant === 'danger' ? '#dc2626' : variant === 'warning' ? '#d97706' : '#2563eb',
    border: 'none',
    borderRadius: '10px',
    cursor: 'pointer',
  }),
  divider: {
    borderTop: '1px solid #1e293b',
    margin: '0 1.5rem 1rem',
  },
  input: {
    width: '100%',
    boxSizing: 'border-box' as const,
    padding: '0.625rem 0.75rem',
    fontSize: '0.875rem',
    background: '#060c1a',
    border: '1px solid #1e293b',
    borderRadius: '8px',
    color: '#f1f5f9',
    outline: 'none',
  },
  inputWrap: {
    padding: '0 1.5rem 1rem',
  },
};

// SVG icons (inline, no lucide dependency needed here)
function IconTrash() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4h6v2" />
    </svg>
  );
}
function IconWarn() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}
function IconInfo() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
    </svg>
  );
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState,  setPromptState]  = useState<PromptState | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (promptState && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [promptState]);

  const confirm = useCallback((opts: ConfirmOptions): Promise<boolean> =>
    new Promise(resolve => setConfirmState({ ...opts, resolve })), []);

  const prompt = useCallback((opts: PromptOptions): Promise<string | null> => {
    setInputValue(opts.defaultValue ?? '');
    return new Promise(resolve => setPromptState({ ...opts, resolve }));
  }, []);

  const resolveConfirm = (result: boolean) => { confirmState?.resolve(result); setConfirmState(null); };
  const resolvePrompt  = (result: string | null) => { promptState?.resolve(result); setPromptState(null); setInputValue(''); };

  const variant = confirmState?.variant ?? 'info';

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}

      {/* Keyframe injection */}
      <style>{`
        @keyframes dialogIn {
          from { opacity: 0; transform: scale(0.95) translateY(8px); }
          to   { opacity: 1; transform: scale(1)    translateY(0);    }
        }
      `}</style>

      {/* ── Confirm Dialog ── */}
      {confirmState && (
        <div style={S.overlay} onClick={() => resolveConfirm(false)}>
          <div style={S.card} onClick={e => e.stopPropagation()}>
            <div style={S.header}>
              <div style={S.iconWrap(variant)}>
                {variant === 'danger' ? <IconTrash /> : variant === 'warning' ? <IconWarn /> : <IconInfo />}
              </div>
              <div style={{ flex: 1 }}>
                <p style={S.title}>{confirmState.title}</p>
                <p style={S.message}>{confirmState.message}</p>
              </div>
              <button style={S.closeBtn} onClick={() => resolveConfirm(false)}>×</button>
            </div>
            <div style={S.actions}>
              {confirmState.cancelLabel !== '' && (
                <button style={S.btnCancel} onClick={() => resolveConfirm(false)}>
                  {confirmState.cancelLabel ?? 'Cancel'}
                </button>
              )}
              <button
                autoFocus
                style={S.btnConfirm(variant)}
                onClick={() => resolveConfirm(true)}
              >
                {confirmState.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Prompt Dialog ── */}
      {promptState && (
        <div style={S.overlay} onClick={() => resolvePrompt(null)}>
          <div style={S.card} onClick={e => e.stopPropagation()}>
            <div style={S.header}>
              <div style={{ flex: 1 }}>
                <p style={S.title}>{promptState.title}</p>
                {promptState.message && <p style={S.message}>{promptState.message}</p>}
              </div>
              <button style={S.closeBtn} onClick={() => resolvePrompt(null)}>×</button>
            </div>
            <div style={S.divider} />
            <div style={S.inputWrap}>
              {promptState.inputType === 'textarea' ? (
                <textarea
                  ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                  rows={4}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder={promptState.placeholder ?? ''}
                  style={{ ...S.input, resize: 'vertical', minHeight: '80px' }}
                />
              ) : (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') resolvePrompt(inputValue || null); if (e.key === 'Escape') resolvePrompt(null); }}
                  placeholder={promptState.placeholder ?? ''}
                  style={S.input}
                />
              )}
            </div>
            <div style={S.actions}>
              <button style={S.btnCancel} onClick={() => resolvePrompt(null)}>
                {promptState.cancelLabel ?? 'Cancel'}
              </button>
              <button style={S.btnConfirm('info')} onClick={() => resolvePrompt(inputValue || null)}>
                {promptState.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

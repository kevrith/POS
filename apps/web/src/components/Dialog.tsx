/**
 * Enterprise-grade dialog system — replaces window.confirm / window.prompt.
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
import { AlertTriangle, Info, X, Trash2 } from 'lucide-react';

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

// ─── Provider ─────────────────────────────────────────────────────────────────

export function DialogProvider({ children }: { children: React.ReactNode }) {
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);
  const [promptState,  setPromptState]  = useState<PromptState | null>(null);
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);

  // Focus input when prompt opens
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

  const resolveConfirm = (result: boolean) => {
    confirmState?.resolve(result);
    setConfirmState(null);
  };

  const resolvePrompt = (result: string | null) => {
    promptState?.resolve(result);
    setPromptState(null);
    setInputValue('');
  };

  return (
    <DialogContext.Provider value={{ confirm, prompt }}>
      {children}

      {/* ── Confirm Dialog ── */}
      {confirmState && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => resolveConfirm(false)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-start gap-4 p-6 pb-4">
              <div className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${
                confirmState.variant === 'danger'  ? 'bg-red-100 dark:bg-red-900/30' :
                confirmState.variant === 'warning' ? 'bg-amber-100 dark:bg-amber-900/30' :
                'bg-blue-100 dark:bg-blue-900/30'
              }`}>
                {confirmState.variant === 'danger'  ? <Trash2        className="w-5 h-5 text-red-600 dark:text-red-400" /> :
                 confirmState.variant === 'warning' ? <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" /> :
                                                      <Info          className="w-5 h-5 text-blue-600 dark:text-blue-400" />}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-base font-semibold text-gray-900 dark:text-white">{confirmState.title}</h3>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 leading-relaxed">{confirmState.message}</p>
              </div>
              <button
                onClick={() => resolveConfirm(false)}
                className="flex-shrink-0 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-6 pb-6 justify-end">
              <button
                onClick={() => resolveConfirm(false)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {confirmState.cancelLabel ?? 'Cancel'}
              </button>
              <button
                autoFocus
                onClick={() => resolveConfirm(true)}
                className={`px-4 py-2 text-sm font-semibold text-white rounded-xl transition-colors ${
                  confirmState.variant === 'danger'  ? 'bg-red-600 hover:bg-red-700' :
                  confirmState.variant === 'warning' ? 'bg-amber-500 hover:bg-amber-600' :
                  'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {confirmState.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Prompt Dialog ── */}
      {promptState && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={() => resolvePrompt(null)}
          />
          <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl w-full max-w-md border border-gray-200 dark:border-gray-700 animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-gray-800">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white">{promptState.title}</h3>
              <button
                onClick={() => resolvePrompt(null)}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4 text-gray-400" />
              </button>
            </div>

            {/* Body */}
            <div className="px-6 py-4 space-y-3">
              {promptState.message && (
                <p className="text-sm text-gray-500 dark:text-gray-400">{promptState.message}</p>
              )}
              {promptState.inputType === 'textarea' ? (
                <textarea
                  ref={inputRef as React.RefObject<HTMLTextAreaElement>}
                  rows={4}
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  placeholder={promptState.placeholder ?? ''}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              ) : (
                <input
                  ref={inputRef as React.RefObject<HTMLInputElement>}
                  type="text"
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') resolvePrompt(inputValue || null); if (e.key === 'Escape') resolvePrompt(null); }}
                  placeholder={promptState.placeholder ?? ''}
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-xl bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 px-6 pb-6 justify-end">
              <button
                onClick={() => resolvePrompt(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                {promptState.cancelLabel ?? 'Cancel'}
              </button>
              <button
                onClick={() => resolvePrompt(inputValue || null)}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-xl transition-colors"
              >
                {promptState.confirmLabel ?? 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

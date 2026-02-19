import { useEffect } from 'react';

interface ShortcutHandlers {
  onSearch?: () => void;
  onCash?: () => void;
  onHold?: () => void;
  onRecall?: () => void;
}

export function useKeyboardShortcuts(handlers: ShortcutHandlers) {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.key === '/') {
        e.preventDefault();
        handlers.onSearch?.();
      }

      if (e.key === 'F1') {
        e.preventDefault();
        handlers.onCash?.();
      }

      if (e.key === 'F5') {
        e.preventDefault();
        handlers.onHold?.();
      }

      if (e.key === 'F6') {
        e.preventDefault();
        handlers.onRecall?.();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handlers]);
}

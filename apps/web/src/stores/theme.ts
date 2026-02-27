/**
 * Theme store — dark mode toggle, persisted to localStorage
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeState {
  isDark: boolean;
  toggle: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      isDark: false,
      toggle: () => {
        const next = !get().isDark;
        set({ isDark: next });
        if (next) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
      },
    }),
    { name: 'pos-theme' },
  ),
);

/** Call once on app init to restore persisted theme */
export function initTheme(): void {
  const stored = localStorage.getItem('pos-theme');
  if (stored) {
    try {
      const { state } = JSON.parse(stored) as { state: { isDark: boolean } };
      if (state.isDark) document.documentElement.classList.add('dark');
    } catch {
      // ignore parse errors
    }
  }
}

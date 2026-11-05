import * as Sentry from '@sentry/react';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import './index.css';
import './mobile.css';
import { initTheme } from './stores/theme';
import { initSyncEngine } from './lib/syncEngine';

// Initialize Sentry error tracking (no-op when DSN not set)
if (import.meta.env.VITE_SENTRY_DSN) {
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN as string,
    environment: import.meta.env.MODE,
    integrations: [Sentry.browserTracingIntegration(), Sentry.replayIntegration()],
    tracesSampleRate: import.meta.env.PROD ? 0.2 : 1.0,
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}

// Restore dark mode before first render to avoid flash
initTheme();
// Apply saved font size preference
const savedFontSize = localStorage.getItem('pos-font-size');
if (savedFontSize) {
  const sizeMap: Record<string, string> = { sm: '13px', md: '15px', lg: '17px', xl: '19px' };
  const px = sizeMap[savedFontSize];
  if (px) document.documentElement.style.fontSize = px;
}
// Start offline sync engine
initSyncEngine();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      retry: 1,
    },
  },
});

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* No v7_startTransition: with it, React keeps showing the OLD page while the new page's code loads, so the sidebar does
          not move and a click looks dead for as long as the load takes. Without it the page area switches at once to the
          loading skeleton (see PageLoader in App.tsx). React Router logs a one-line notice about the flag in development. */}
      <BrowserRouter future={{ v7_relativeSplatPath: true }}>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </React.StrictMode>
);

import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './Button';

/** What to tell the user about a failed request, from the status the API sent (an `ApiError` carries `status`). */
export function describeLoadError(error: unknown): { title: string; hint: string } {
  const status = typeof (error as { status?: unknown })?.status === 'number' ? (error as { status: number }).status : undefined;
  const message = error instanceof Error ? error.message : '';
  if (status === 401) return { title: 'You have been signed out', hint: 'Sign in again to continue.' };
  if (status === 403) return { title: 'This is not available to you', hint: message || 'Your role or plan does not include this.' };
  if (status !== undefined && status >= 500) {
    return {
      title: 'The server could not load this',
      hint: /migration|out of date/i.test(message)
        ? message
        : 'The server hit a problem. If the app was just updated, check that the latest database migrations have been applied, and look at the API terminal for the exact error.',
    };
  }
  if (status === undefined) return { title: 'Cannot reach the server', hint: 'Check your connection, or that the API is running, then try again.' };
  return { title: 'Could not load this', hint: message || 'Please try again.' };
}

/**
 * Shown where a list should be when the request FAILED. An empty list and a failed load look identical on screen
 * ("No items found"), which sends people hunting for data that is fine, so a failure always gets its own message.
 */
export function ErrorState({ error, onRetry, subject = 'this' }: { error: unknown; onRetry?: () => void; subject?: string }) {
  const { title, hint } = describeLoadError(error);
  return (
    <div role="alert" className="flex flex-col items-center justify-center text-center py-14 px-4">
      <div className="w-14 h-14 rounded-2xl bg-red-100 text-red-700 flex items-center justify-center mb-4" aria-hidden><AlertTriangle className="w-6 h-6" /></div>
      <p className="text-base font-semibold text-gray-800">{title}{subject !== 'this' ? `: ${subject}` : ''}</p>
      <p className="text-sm text-gray-600 mt-1 max-w-md">{hint}</p>
      <p className="text-xs text-gray-500 mt-3">Your data has not been changed or lost.</p>
      {onRetry && <div className="mt-4"><Button icon={<RefreshCw className="w-4 h-4" />} onClick={onRetry}>Try again</Button></div>}
    </div>
  );
}

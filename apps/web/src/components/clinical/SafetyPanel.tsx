import { AlertOctagon, AlertTriangle, Info, ShieldAlert } from 'lucide-react';
import { canApproveAlone, type SafetyWarning } from '../../lib/clinical';

export interface OverrideState { reason: string; pin: string }

const STYLE = {
  BLOCK: { box: 'border-red-300 bg-red-50 text-red-800 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-200', icon: AlertOctagon, label: 'Stop' },
  WARN: { box: 'border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200', icon: AlertTriangle, label: 'Check' },
  INFO: { box: 'border-gray-200 bg-gray-50 text-gray-600 dark:border-gray-600 dark:bg-gray-700/40 dark:text-gray-300', icon: Info, label: 'Note' },
} as const;

/**
 * What the safety check found, most serious first. A "Stop" cannot be passed without a manager's approval and a reason, which
 * are asked for here and go on record; the rest are for the pharmacist's judgement.
 */
export default function SafetyPanel({
  warnings,
  override,
  onOverride,
  role,
  action = 'dispensing',
  showOverride = true,
}: {
  warnings: SafetyWarning[];
  override: OverrideState;
  onOverride: (o: OverrideState) => void;
  role?: string;
  action?: string;
  /** Off on a prescription still being written: there is nothing to approve yet, only to see. */
  showOverride?: boolean;
}) {
  if (warnings.length === 0) return null;
  const order = { BLOCK: 0, WARN: 1, INFO: 2 } as const;
  const sorted = [...warnings].sort((a, b) => order[a.severity] - order[b.severity]);
  const blocked = warnings.some((w) => w.severity === 'BLOCK');
  const alone = canApproveAlone(role);

  return (
    <div className="space-y-2" role="region" aria-label="Safety check">
      {sorted.map((w, i) => {
        const s = STYLE[w.severity];
        const Icon = s.icon;
        return (
          <div key={i} className={`flex gap-2 rounded-lg border p-2.5 text-sm ${s.box}`}>
            <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <p><span className="font-semibold">{s.label}: </span>{w.message}</p>
          </div>
        );
      })}

      {blocked && showOverride && (
        <div className="rounded-lg border border-red-200 p-3 space-y-2 dark:border-red-500/30">
          <p className="flex items-center gap-1.5 text-sm font-semibold text-red-700 dark:text-red-300">
            <ShieldAlert className="h-4 w-4" aria-hidden /> Continue {action} anyway
          </p>
          <p className="text-xs text-gray-600 dark:text-gray-300">
            This needs a manager. Their name and the reason are kept on record.{alone ? '' : ' Ask a manager to enter their PIN.'}
          </p>
          <textarea
            className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
            rows={2}
            placeholder="Why is this safe to go ahead? (for example: the prescriber confirmed)"
            aria-label="Reason for going ahead"
            value={override.reason}
            onChange={(e) => onOverride({ ...override, reason: e.target.value })}
          />
          {!alone && (
            <input
              className="w-full rounded-lg border px-3 py-2 text-sm dark:border-gray-600 dark:bg-gray-700"
              type="password"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Manager PIN"
              aria-label="Manager PIN"
              value={override.pin}
              onChange={(e) => onOverride({ ...override, pin: e.target.value })}
            />
          )}
        </div>
      )}
    </div>
  );
}

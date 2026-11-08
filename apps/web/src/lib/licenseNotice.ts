// The licence's words, with no network or screen in them so every state is tested directly.
/** What `GET /license/status` answers (apps/api/src/licensing/license.service.ts). */
export interface LicenseStatus {
  edition: 'LOCAL' | 'CLOUD';
  configured: boolean;
  state: 'NONE' | 'ACTIVE' | 'EXPIRING_SOON' | 'GRACE' | 'LAPSED';
  tier: string | null;
  tokenExpiresAt: string | null;
  licenseExpiresAt: string | null;
  graceEndsAt: string | null;
  daysLeft: number | null;
  clockBehind: boolean;
  machineId: string | null;
  keyHint: string | null;
  serverStatus: string | null;
  serverMessage: string | null;
  lastRenewedAt: string | null;
  trial: { active: boolean; endsAt: string | null; daysLeft: number | null } | null;
}

export type LicenseTone = 'info' | 'warning' | 'danger';

export interface LicenseNotice {
  tone: LicenseTone;
  /** Short, plain words for the owner. */
  message: string;
}

const days = (n: number) => `${n} day${n === 1 ? '' : 's'}`;

/**
 * The one sentence the owner should see about their licence right now, or null when everything is fine (or this is the
 * cloud edition, which has no licence). Pure, so every state is tested without a screen.
 *
 * A trial is only mentioned in its last week: telling someone daily for a month that they are on a trial is nagging.
 */
export function licenseNotice(s: LicenseStatus | null | undefined): LicenseNotice | null {
  if (!s || s.edition !== 'LOCAL') return null;
  if (s.clockBehind) {
    return { tone: 'danger', message: "This computer's clock is behind. Set the correct date and time, or the licence cannot be checked." };
  }
  switch (s.state) {
    case 'ACTIVE':
      return null;
    case 'EXPIRING_SOON':
      return { tone: 'warning', message: `Connect this computer to the internet within ${days(s.daysLeft ?? 0)} to keep your plan.` };
    case 'GRACE': {
      const left = s.graceEndsAt ? Math.max(0, Math.ceil((new Date(s.graceEndsAt).getTime() - Date.now()) / 86_400_000)) : 0;
      return { tone: 'danger', message: `Your licence could not be renewed. Connect to the internet within ${days(left)} or this shop drops to the Free plan.` };
    }
    case 'LAPSED':
      return { tone: 'danger', message: 'Your licence has lapsed, so this shop is on the Free plan. Connect to the internet to renew it. Your data is safe.' };
    case 'NONE': {
      if (!s.trial) return null;
      if (s.trial.active) {
        return s.trial.daysLeft !== null && s.trial.daysLeft <= 7
          ? { tone: 'warning', message: `Your free trial ends in ${days(s.trial.daysLeft)}. Enter your licence key to keep your plan.` }
          : null;
      }
      return { tone: 'warning', message: 'Your trial has ended and this shop is on the Free plan. Enter your licence key to unlock your plan.' };
    }
  }
}

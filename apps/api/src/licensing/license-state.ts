/**
 * What a licence token means today: the rules, with no database and no clock of their own so they can be tested to the day.
 *
 * Agreed policy: a licence is renewed quietly whenever the computer is online (the token lasts 30 days). Offline, the app
 * just checks the signature and the dates. When a token runs out there are 14 days of grace; after that the shop falls back
 * to the Free plan, exactly as a lapsed cloud subscription does. Data stays open throughout and backups never stop.
 */
import { SubscriptionTier } from '@pos/shared';

export const TOKEN_DAYS = 30;
export const GRACE_DAYS = 14;
/** From this many days before the token ends the screens start saying "connect to the internet". */
export const WARN_DAYS = 7;

const DAY = 24 * 60 * 60 * 1000;

export type LicenseState = 'NONE' | 'ACTIVE' | 'EXPIRING_SOON' | 'GRACE' | 'LAPSED';

export interface LicenseSnapshot {
  tier: string;
  tokenExpiresAt: Date;
  licenseExpiresAt: Date | null;
  /** The latest time this computer has ever seen. */
  lastSeenAt: Date | null;
}

export interface LicenseEvaluation {
  state: LicenseState;
  /** The time the rules used: never earlier than the latest time seen, so winding the clock back changes nothing. */
  effectiveNow: Date;
  /** The clock is more than a day behind what this computer has already seen: tell the owner to fix it. */
  clockBehind: boolean;
  /** Whole days until the token ends (negative-free: 0 once it has ended). */
  daysLeft: number | null;
  graceEndsAt: Date | null;
}

export function evaluateLicense(s: LicenseSnapshot | null, now: Date): LicenseEvaluation {
  const seen = s?.lastSeenAt ?? null;
  const effectiveNow = seen && seen > now ? seen : now;
  const clockBehind = !!seen && now.getTime() < seen.getTime() - DAY;
  if (!s) return { state: 'NONE', effectiveNow, clockBehind, daysLeft: null, graceEndsAt: null };

  const ends = s.tokenExpiresAt;
  const graceEndsAt = new Date(ends.getTime() + GRACE_DAYS * DAY);
  if (effectiveNow <= ends) {
    const daysLeft = Math.max(0, Math.ceil((ends.getTime() - effectiveNow.getTime()) / DAY));
    return { state: daysLeft <= WARN_DAYS ? 'EXPIRING_SOON' : 'ACTIVE', effectiveNow, clockBehind, daysLeft, graceEndsAt };
  }
  if (effectiveNow <= graceEndsAt) return { state: 'GRACE', effectiveNow, clockBehind, daysLeft: 0, graceEndsAt };
  return { state: 'LAPSED', effectiveNow, clockBehind, daysLeft: 0, graceEndsAt };
}

/** The licence's plan as a tier this app knows. LIFETIME is the top tier; anything unrecognised is the Free plan. */
export function licenseTierToPlan(tier: string): SubscriptionTier {
  const t = String(tier ?? '').toUpperCase();
  if (t === 'LIFETIME') return SubscriptionTier.ENTERPRISE;
  return (Object.values(SubscriptionTier) as string[]).includes(t) ? (t as SubscriptionTier) : SubscriptionTier.FREE;
}

const LABEL: Record<SubscriptionTier, string> = {
  [SubscriptionTier.FREE]: 'Free',
  [SubscriptionTier.STARTER]: 'Starter',
  [SubscriptionTier.GROWTH]: 'Growth',
  [SubscriptionTier.PRO]: 'Pro',
  [SubscriptionTier.ENTERPRISE]: 'Enterprise',
};
export const planLabel = (tier: SubscriptionTier): string => LABEL[tier];

/**
 * What to write into the business so every existing check (feature gates, limits, the plan shown in the app) follows the
 * licence. The app already decides access from these three fields in one shared function, so keeping them right is all it
 * takes. Returns null when there is no licence: the business keeps its trial as registered.
 */
export function planFieldsFor(state: LicenseState, tier: string):
  | { subscriptionTier: string; subscriptionStatus: 'ACTIVE'; trialEndsAt: null; planName: string }
  | { subscriptionStatus: 'EXPIRED' }
  | null {
  if (state === 'NONE') return null;
  if (state === 'LAPSED') return { subscriptionStatus: 'EXPIRED' };
  const plan = licenseTierToPlan(tier);
  return { subscriptionTier: plan, subscriptionStatus: 'ACTIVE', trialEndsAt: null, planName: planLabel(plan) };
}

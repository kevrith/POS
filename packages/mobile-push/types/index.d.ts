/**
 * Public type surface for @pos/mobile-push.
 *
 * Hand-written and deliberately free of native imports (expo-notifications etc.)
 * so that a consuming app's `tsc` can type-check against the package WITHOUT
 * resolving the package's peer deps from the package's own location (a monorepo
 * module-resolution pitfall). At runtime Metro bundles `src/` and resolves the
 * native modules from the app's own node_modules via the `react-native` field.
 *
 * Keep this in sync with src/index.ts's exports.
 */

export interface NotificationData {
  type?: string;
  id?: string;
  raw: Record<string, unknown>;
}

export type RouteMap = Record<string, string>;

export function parseNotificationData(raw: unknown): NotificationData;
export function resolveRoute(data: NotificationData, map: RouteMap): string | null;

export interface UsePushOptions {
  onTap?: (data: NotificationData) => void;
  onReceive?: (data: NotificationData) => void;
}

/** Request permission + return the device's Expo push token (null if unavailable). */
export function registerForPushNotificationsAsync(): Promise<string | null>;

/** Wire foreground + tap listeners (and cold-start tap). Call once near app root. */
export function usePushNotifications(options?: UsePushOptions): void;

/** Ensure the Android "default" notification channel exists. */
export function setupAndroidChannel(): Promise<void>;

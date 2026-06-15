import { registerForPushNotificationsAsync, resolveRoute, RouteMap, NotificationData } from '@pos/mobile-push';
import { driverApi } from './api';

/** Notification type -> driver route. Used to navigate on tap. */
export const DRIVER_ROUTES: RouteMap = {
  delivery: '/delivery/:id',
};

/** Register this device's Expo token against the logged-in driver. Best-effort. */
export async function syncPushToken(userId: string): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) await driverApi.post('/push/register', { userId, token });
  } catch {
    /* never block login on push setup */
  }
}

/** Stop this device receiving pushes (logout). Best-effort. */
export async function clearPushToken(userId: string): Promise<void> {
  try {
    await driverApi.post('/push/unregister', { userId });
  } catch {
    /* ignore */
  }
}

/** Resolve a tapped notification to a driver route (or null to stay put). */
export function routeForTap(data: NotificationData): string | null {
  return resolveRoute(data, DRIVER_ROUTES);
}

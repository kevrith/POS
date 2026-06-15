import { registerForPushNotificationsAsync, resolveRoute, RouteMap, NotificationData } from '@pos/mobile-push';
import { mobileApi } from './api';

/** Notification type -> POS route (manager alerts). */
export const POS_ROUTES: RouteMap = {
  low_stock: '/manage-stock?filter=low',
  expiring: '/manage-batches',
  transfer: '/manage-transfers',
};

export async function syncPushToken(userId: string): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) await mobileApi.post('/push/register', { userId, token });
  } catch {
    /* best-effort */
  }
}

export async function clearPushToken(userId: string): Promise<void> {
  try {
    await mobileApi.post('/push/unregister', { userId });
  } catch {
    /* ignore */
  }
}

export function routeForTap(data: NotificationData): string | null {
  return resolveRoute(data, POS_ROUTES);
}

import { registerForPushNotificationsAsync, resolveRoute, RouteMap, NotificationData } from '@pos/mobile-push';
import { agentApi } from './api';

/** Notification type -> agent route. */
export const AGENT_ROUTES: RouteMap = {
  order: '/(tabs)/today',
  collection: '/(tabs)/collections',
  customer: '/(tabs)/customers',
};

export async function syncPushToken(userId: string): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) await agentApi.post('/push/register', { userId, token });
  } catch {
    /* best-effort */
  }
}

export async function clearPushToken(userId: string): Promise<void> {
  try {
    await agentApi.post('/push/unregister', { userId });
  } catch {
    /* ignore */
  }
}

export function routeForTap(data: NotificationData): string | null {
  return resolveRoute(data, AGENT_ROUTES);
}

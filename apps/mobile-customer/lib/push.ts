import { registerForPushNotificationsAsync, resolveRoute, RouteMap, NotificationData } from '@pos/mobile-push';
import { apiPost } from './api';

/** Notification type -> customer route. */
export const CUSTOMER_ROUTES: RouteMap = {
  order: '/(tabs)/orders',
  loyalty: '/(tabs)/loyalty',
};

export function routeForTap(data: NotificationData): string | null {
  return resolveRoute(data, CUSTOMER_ROUTES);
}

/**
 * The customer app has no login — a customer is only identifiable by the phone
 * they enter at checkout/loyalty. So we register the Expo token keyed to
 * { businessId, phone }; the backend attaches it to the matching Customer.
 * Call this right after an order is placed (the Customer record now exists).
 */
export async function registerCustomerPushToken(businessId: string, phone: string): Promise<void> {
  try {
    const token = await registerForPushNotificationsAsync();
    if (token) await apiPost('/push/register-customer', { businessId, phone, token });
  } catch {
    /* best-effort — never block ordering on push setup */
  }
}

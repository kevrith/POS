import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface PushPayload {
  title: string;
  body: string;
  /** Arbitrary data delivered to the app; `type` + `id` drive in-app routing. */
  data?: Record<string, unknown>;
}

/** One message in the Expo Push API request body. */
export interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  sound: 'default';
  data?: Record<string, unknown>;
  channelId?: string;
}

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

/** Expo push tokens look like ExponentPushToken[xxxx] or ExpoPushToken[xxxx]. */
export function isValidExpoToken(token?: string | null): token is string {
  if (!token) return false;
  return /^Expo(nent)?PushToken\[[^\]]+\]$/.test(token.trim());
}

/** Map a delivery status to a customer-facing push title/body. Null = don't notify. */
export function deliveryStatusMessage(
  status: string,
  orderNumber?: string,
): { title: string; body: string } | null {
  const ref = orderNumber ? `Order #${orderNumber}` : 'Your order';
  switch (status) {
    case 'CONFIRMED':
    case 'ACCEPTED':
      return { title: 'Order confirmed', body: `${ref} has been accepted and is being prepared.` };
    case 'READY':
      return { title: 'Ready for pickup', body: `${ref} is ready for collection.` };
    case 'ASSIGNED':
      return { title: 'Driver on the way', body: `${ref} has been assigned to a driver.` };
    case 'IN_TRANSIT':
    case 'OUT_FOR_DELIVERY':
      return { title: 'Out for delivery', body: `${ref} is on its way to you.` };
    case 'DELIVERED':
      return { title: 'Delivered', body: `${ref} has been delivered. Enjoy!` };
    case 'REJECTED':
    case 'CANCELLED':
      return { title: 'Order cancelled', body: `${ref} was cancelled. Contact the store for help.` };
    case 'FAILED':
      return { title: 'Delivery issue', body: `We hit a problem delivering ${ref.toLowerCase()}. We'll be in touch.` };
    default:
      return null;
  }
}

/** Build Expo message objects for the valid tokens among the given list. */
export function buildExpoMessages(tokens: (string | null | undefined)[], payload: PushPayload): ExpoMessage[] {
  const seen = new Set<string>();
  const messages: ExpoMessage[] = [];
  for (const token of tokens) {
    if (!isValidExpoToken(token) || seen.has(token)) continue;
    seen.add(token);
    messages.push({
      to: token,
      title: payload.title,
      body: payload.body,
      sound: 'default',
      data: payload.data,
      channelId: 'default',
    });
  }
  return messages;
}

@Injectable()
export class PushService {
  private readonly logger = new Logger(PushService.name);

  constructor(private prisma: PrismaService) {}

  /** Store/refresh the Expo push token for a user's device. */
  async registerToken(userId: string, token: string): Promise<{ success: boolean }> {
    if (!isValidExpoToken(token)) {
      this.logger.warn(`Rejected invalid Expo push token for user ${userId}`);
      return { success: false };
    }
    await this.prisma.user.update({ where: { id: userId }, data: { deviceToken: token } });
    return { success: true };
  }

  /** Clear the token (logout / token revoked). */
  async unregisterToken(userId: string): Promise<{ success: boolean }> {
    await this.prisma.user.update({ where: { id: userId }, data: { deviceToken: null } });
    return { success: true };
  }

  /** Send to a single user. No-op (not an error) when the user has no token. */
  async sendToUser(userId: string, payload: PushPayload): Promise<void> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { deviceToken: true },
    });
    await this.sendToTokens([user?.deviceToken], payload);
  }

  /** Send to several users at once. */
  async sendToUsers(userIds: string[], payload: PushPayload): Promise<void> {
    if (userIds.length === 0) return;
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { deviceToken: true },
    });
    await this.sendToTokens(users.map((u) => u.deviceToken), payload);
  }

  /** Send to every user in a business holding one of the given roles. */
  async sendToBusinessRoles(businessId: string, roles: string[], payload: PushPayload): Promise<void> {
    const users = await this.prisma.user.findMany({
      where: { businessId, role: { in: roles }, deviceToken: { not: null } },
      select: { deviceToken: true },
    });
    await this.sendToTokens(users.map((u) => u.deviceToken), payload);
  }

  // ── Customer (self-service app) ───────────────────────────────────────────────

  /** Attach an Expo token to the Customer matched by phone (the only id the app has). */
  async registerCustomerToken(businessId: string, phone: string, token: string): Promise<{ success: boolean }> {
    if (!isValidExpoToken(token) || !phone) return { success: false };
    const result = await this.prisma.customer.updateMany({
      where: { businessId, phone },
      data: { deviceToken: token },
    });
    return { success: result.count > 0 };
  }

  /** Push a known customer by id. No-op when they have no token. */
  async sendToCustomer(customerId: string, payload: PushPayload): Promise<void> {
    const customer = await this.prisma.customer.findUnique({
      where: { id: customerId },
      select: { deviceToken: true },
    });
    await this.sendToTokens([customer?.deviceToken], payload);
  }

  /** Push a customer resolved by phone within a business (delivery has only phone). */
  async sendToCustomerByPhone(businessId: string, phone: string, payload: PushPayload): Promise<void> {
    if (!phone) return;
    const customers = await this.prisma.customer.findMany({
      where: { businessId, phone, deviceToken: { not: null } },
      select: { deviceToken: true },
    });
    await this.sendToTokens(customers.map((c) => c.deviceToken), payload);
  }

  /** Low-level send: POST valid tokens to the Expo Push API. Never throws. */
  async sendToTokens(tokens: (string | null | undefined)[], payload: PushPayload): Promise<void> {
    const messages = buildExpoMessages(tokens, payload);
    if (messages.length === 0) return;
    try {
      const res = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(messages),
      });
      if (!res.ok) {
        this.logger.warn(`Expo push send failed: ${res.status} ${await res.text().catch(() => '')}`);
      }
    } catch (err) {
      // Push is best-effort — a delivery being created must never fail because
      // the push endpoint is unreachable.
      this.logger.warn(`Expo push send error: ${(err as Error).message}`);
    }
  }
}

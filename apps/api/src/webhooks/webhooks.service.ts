import { Injectable, Logger } from '@nestjs/common';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(private prisma: PrismaService) {}

  async list(businessId: string) {
    return this.prisma.webhook.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async create(data: {
    businessId: string;
    url: string;
    secret?: string;
    events: string[];
    description?: string;
  }) {
    return this.prisma.webhook.create({
      data: {
        businessId: data.businessId,
        url: data.url,
        secret: data.secret,
        events: JSON.stringify(data.events),
        description: data.description,
      },
    });
  }

  async update(id: string, data: { url?: string; secret?: string; events?: string[]; description?: string; isActive?: boolean }) {
    return this.prisma.webhook.update({
      where: { id },
      data: {
        ...(data.url !== undefined && { url: data.url }),
        ...(data.secret !== undefined && { secret: data.secret }),
        ...(data.events !== undefined && { events: JSON.stringify(data.events) }),
        ...(data.description !== undefined && { description: data.description }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async remove(id: string) {
    await this.prisma.webhook.delete({ where: { id } });
    return { deleted: true };
  }

  /** Dispatch event to all matching active webhooks for a business. Fire-and-forget. */
  async dispatch(businessId: string, event: string, payload: Record<string, unknown>): Promise<void> {
    const webhooks = await this.prisma.webhook.findMany({
      where: { businessId, isActive: true },
    });

    for (const webhook of webhooks) {
      const events: string[] = JSON.parse(webhook.events ?? '[]');
      if (!events.includes(event)) continue;

      const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
      const signature = webhook.secret
        ? createHmac('sha256', webhook.secret).update(body).digest('hex')
        : undefined;

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Webhook-Event': event,
      };
      if (signature) headers['X-Webhook-Signature'] = `sha256=${signature}`;

      // Fire and forget — don't await, don't block the sale
      this.prisma.webhook
        .update({ where: { id: webhook.id }, data: { lastFiredAt: new Date() } })
        .catch(() => {});

      fetch(webhook.url, { method: 'POST', headers, body })
        .then(async (res) => {
          if (!res.ok) {
            this.logger.warn(`Webhook ${webhook.id} returned ${res.status}`);
            await this.prisma.webhook.update({
              where: { id: webhook.id },
              data: { failureCount: { increment: 1 } },
            });
          } else {
            await this.prisma.webhook.update({
              where: { id: webhook.id },
              data: { failureCount: 0 },
            });
          }
        })
        .catch(async (err) => {
          this.logger.error(`Webhook ${webhook.id} delivery failed: ${err.message}`);
          await this.prisma.webhook.update({
            where: { id: webhook.id },
            data: { failureCount: { increment: 1 } },
          });
        });
    }
  }

  /** Test-ping a webhook with a sample payload */
  async ping(id: string) {
    const webhook = await this.prisma.webhook.findUniqueOrThrow({ where: { id } });
    const body = JSON.stringify({ event: 'webhook.test', data: { message: 'Ping from Universal POS' }, timestamp: new Date().toISOString() });
    const signature = webhook.secret
      ? createHmac('sha256', webhook.secret).update(body).digest('hex')
      : undefined;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Webhook-Event': 'webhook.test' };
    if (signature) headers['X-Webhook-Signature'] = `sha256=${signature}`;

    try {
      const res = await fetch(webhook.url, { method: 'POST', headers, body });
      return { success: res.ok, status: res.status };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}

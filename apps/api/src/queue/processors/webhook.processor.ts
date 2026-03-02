import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { createHmac } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { WebhookJobData } from '../jobs.service';

@Processor('webhook-retry')
export class WebhookProcessor extends WorkerHost {
  private readonly logger = new Logger(WebhookProcessor.name);

  constructor(private prisma: PrismaService) {
    super();
  }

  async process(job: Job<WebhookJobData>): Promise<void> {
    const { webhookId, url, secret, event, payload } = job.data;

    const body = JSON.stringify({ event, data: payload, timestamp: new Date().toISOString() });
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Webhook-Event': event,
      'X-Webhook-Attempt': String(job.attemptsMade + 1),
    };

    if (secret) {
      headers['X-Webhook-Signature'] = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    }

    const res = await fetch(url, { method: 'POST', headers, body });

    await this.prisma.webhook.update({
      where: { id: webhookId },
      data: {
        lastFiredAt: new Date(),
        failureCount: res.ok ? 0 : { increment: 1 },
      },
    });

    if (!res.ok) {
      this.logger.warn(`Webhook ${webhookId} returned ${res.status} on attempt ${job.attemptsMade + 1}`);
      throw new Error(`HTTP ${res.status}`);
    }

    this.logger.log(`Webhook ${webhookId} delivered OK (attempt ${job.attemptsMade + 1})`);
  }
}

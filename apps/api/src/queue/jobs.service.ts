import { Injectable, Logger, Optional } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { EmailService, SendEmailOptions } from '../email/email.service';

export interface WebhookJobData {
  webhookId: string;
  url: string;
  secret?: string;
  event: string;
  payload: Record<string, unknown>;
  attempt: number;
}

export interface EtimsJobData {
  saleId: string;
  businessId: string;
  attempt: number;
}

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private email: EmailService,
    @Optional() @InjectQueue('email') private emailQueue: Queue | null,
    @Optional() @InjectQueue('webhook-retry') private webhookQueue: Queue | null,
    @Optional() @InjectQueue('etims-retry') private etimsQueue: Queue | null,
  ) {}

  // ── Email ──────────────────────────────────────────────────────────────────

  async queueEmail(opts: SendEmailOptions): Promise<void> {
    if (this.emailQueue) {
      await this.emailQueue.add('send-email', opts, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 100,
        removeOnFail: 50,
      });
    } else {
      // Fallback: direct send (no Redis)
      await this.email.send(opts).catch((e) => this.logger.error(`Direct email failed: ${e.message}`));
    }
  }

  // ── Webhook retry ──────────────────────────────────────────────────────────

  async queueWebhookRetry(data: WebhookJobData, delayMs = 0): Promise<void> {
    if (this.webhookQueue) {
      await this.webhookQueue.add('dispatch-webhook', data, {
        delay: delayMs,
        attempts: 5,
        backoff: { type: 'exponential', delay: 10000 },
        removeOnComplete: 200,
        removeOnFail: 100,
      });
    } else {
      this.logger.warn(`Webhook retry queuing skipped (no Redis): ${data.webhookId}`);
    }
  }

  // ── eTIMS retry ────────────────────────────────────────────────────────────

  async queueEtimsSubmit(data: EtimsJobData, delayMs = 0): Promise<void> {
    if (this.etimsQueue) {
      await this.etimsQueue.add('submit-etims', data, {
        delay: delayMs,
        attempts: 10,
        backoff: { type: 'exponential', delay: 30000 },
        removeOnComplete: 500,
        removeOnFail: 200,
      });
    } else {
      this.logger.warn(`eTIMS retry queuing skipped (no Redis): ${data.saleId}`);
    }
  }
}

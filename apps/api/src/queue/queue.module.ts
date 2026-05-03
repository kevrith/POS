import { Module, DynamicModule, Logger } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { EmailProcessor } from './processors/email.processor';
import { WebhookProcessor } from './processors/webhook.processor';
import { EtimsProcessor } from './processors/etims.processor';
import { JobsService } from './jobs.service';

const QUEUE_NAMES = ['email', 'webhook-retry', 'etims-retry'] as const;

@Module({})
export class QueueModule {
  static register(): DynamicModule {
    const logger = new Logger('QueueModule');
    const host = process.env.REDIS_HOST;
    const hasRedis = !!host;
    const isProd = process.env.NODE_ENV === 'production';

    if (!hasRedis) {
      logger.warn(
        `REDIS_HOST not set — BullMQ queues disabled; jobs will run synchronously${isProd ? ' (add REDIS_HOST to enable retries)' : ' (dev/test only)'}`,
      );
      return {
        module: QueueModule,
        providers: [JobsService],
        exports: [JobsService],
        global: true,
      };
    }

    const redisConnection = {
      host: process.env.REDIS_HOST ?? 'localhost',
      port: parseInt(process.env.REDIS_PORT ?? '6379', 10),
      password: process.env.REDIS_PASSWORD || undefined,
    };

    return {
      module: QueueModule,
      imports: [
        BullModule.forRoot({ connection: redisConnection }),
        BullModule.registerQueue(...QUEUE_NAMES.map((name) => ({ name }))),
      ],
      providers: [JobsService, EmailProcessor, WebhookProcessor, EtimsProcessor],
      exports: [JobsService],
      global: true,
    };
  }
}

import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EmailService, SendEmailOptions } from '../../email/email.service';

@Processor('email')
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(private email: EmailService) {
    super();
  }

  async process(job: Job<SendEmailOptions>): Promise<void> {
    this.logger.log(`Processing email job ${job.id}: ${job.data.subject}`);
    const ok = await this.email.send(job.data);
    if (!ok) throw new Error('Email send returned false — will retry');
  }
}

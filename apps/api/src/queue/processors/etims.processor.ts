import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { EtimsService } from '../../etims/etims.service';
import { EtimsJobData } from '../jobs.service';

@Processor('etims-retry')
export class EtimsProcessor extends WorkerHost {
  private readonly logger = new Logger(EtimsProcessor.name);

  constructor(private etims: EtimsService) {
    super();
  }

  async process(job: Job<EtimsJobData>): Promise<void> {
    const { saleId } = job.data;
    this.logger.log(`Processing eTIMS submission for sale ${saleId} (attempt ${job.attemptsMade + 1})`);

    const result = await this.etims.submitSale(saleId);

    if (!result.success) {
      if (result.reason === 'already submitted' || result.reason === 'credentials not configured') {
        this.logger.log(`eTIMS skipped for ${saleId}: ${result.reason}`);
        return; // Don't retry — permanent failure
      }
      throw new Error(`eTIMS submission failed: ${JSON.stringify(result)}`);
    }

    this.logger.log(`eTIMS submitted successfully for sale ${saleId}`);
  }
}

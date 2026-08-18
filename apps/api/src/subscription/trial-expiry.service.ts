import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';

/**
 * Move finished trials to EXPIRED.
 *
 * The subscription guard already treats a lapsed trial as FREE on every request,
 * so access is correct without this. What was wrong is the record: nothing ever
 * changed subscriptionStatus, so a business whose trial ended months ago still
 * read as TRIAL on ENTERPRISE in the admin console, in the trials-expiring
 * report, and in any query counting active subscriptions. The console and the
 * API told different stories about the same account.
 *
 * Comped accounts are skipped — a gift has no trial to end.
 */
@Injectable()
export class TrialExpiryService {
  private readonly logger = new Logger(TrialExpiryService.name);

  constructor(private prisma: PrismaService) {}

  /** 02:15 UTC — after the nightly backup at 02:00, before the 05:00 report run. */
  @Cron('15 2 * * *')
  async expireFinishedTrials(): Promise<{ expired: number }> {
    const now = new Date();

    const due = await this.prisma.business.findMany({
      where: {
        subscriptionStatus: 'TRIAL',
        trialEndsAt: { not: null, lt: now },
        isComped: false,
      },
      select: { id: true, name: true, trialEndsAt: true },
    });

    if (due.length === 0) {
      this.logger.log('No trials to expire');
      return { expired: 0 };
    }

    // The tier is deliberately left alone. It records what they were trialling,
    // which is what a sales conversation needs, and the guard reads the status.
    await this.prisma.business.updateMany({
      where: { id: { in: due.map((b) => b.id) } },
      data: { subscriptionStatus: 'EXPIRED' },
    });

    for (const b of due) {
      this.logger.log(
        `Trial expired: ${b.name} (ended ${b.trialEndsAt?.toISOString().slice(0, 10)})`,
      );
    }
    this.logger.log(`Expired ${due.length} trial(s)`);
    return { expired: due.length };
  }
}

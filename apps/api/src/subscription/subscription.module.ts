import { Module } from '@nestjs/common';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { TrialExpiryService } from './trial-expiry.service';

@Module({
  imports: [PrismaModule, EmailModule, AffiliateModule],
  providers: [SubscriptionLimitsService, SubscriptionService, TrialExpiryService],
  controllers: [SubscriptionController],
  exports: [SubscriptionLimitsService, SubscriptionService, TrialExpiryService],
})
export class SubscriptionModule {}

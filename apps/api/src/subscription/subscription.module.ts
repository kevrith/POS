import { Module } from '@nestjs/common';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { SubscriptionService } from './subscription.service';
import { SubscriptionController } from './subscription.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { EmailModule } from '../email/email.module';
import { AffiliateModule } from '../affiliate/affiliate.module';

@Module({
  imports: [PrismaModule, EmailModule, AffiliateModule],
  providers: [SubscriptionLimitsService, SubscriptionService],
  controllers: [SubscriptionController],
  exports: [SubscriptionLimitsService, SubscriptionService],
})
export class SubscriptionModule {}

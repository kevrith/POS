import { Module } from '@nestjs/common';
import { SubscriptionLimitsService } from './subscription-limits.service';
import { SubscriptionController } from './subscription.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  providers: [SubscriptionLimitsService],
  controllers: [SubscriptionController],
  exports: [SubscriptionLimitsService],
})
export class SubscriptionModule {}

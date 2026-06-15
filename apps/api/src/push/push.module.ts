import { Global, Module } from '@nestjs/common';
import { PushService } from './push.service';
import { PushController } from './push.controller';
import { PrismaModule } from '../prisma/prisma.module';

/**
 * Global so any feature module (delivery, sales, field-sales, inventory…) can
 * inject PushService to fire an Expo push without re-importing the module.
 */
@Global()
@Module({
  imports: [PrismaModule],
  controllers: [PushController],
  providers: [PushService],
  exports: [PushService],
})
export class PushModule {}

import { Module } from '@nestjs/common';
import { ChannelManagerService } from './channel-manager.service';
import { ChannelManagerController } from './channel-manager.controller';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [PrismaModule],
  controllers: [ChannelManagerController],
  providers: [ChannelManagerService],
})
export class ChannelManagerModule {}

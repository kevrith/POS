import { Module } from '@nestjs/common';
import { ChannelManagerService } from './channel-manager.service';
import { ChannelManagerController } from './channel-manager.controller';
import { PrismaModule } from '../prisma/prisma.module';
import { ApiKeysModule } from '../api-keys/api-keys.module';

@Module({
  imports: [PrismaModule, ApiKeysModule],
  controllers: [ChannelManagerController],
  providers: [ChannelManagerService],
})
export class ChannelManagerModule {}

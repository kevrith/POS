import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CoverController } from './cover.controller';
import { CoverService } from './cover.service';

@Module({
  imports: [PrismaModule],
  providers: [CoverService],
  controllers: [CoverController],
  exports: [CoverService],
})
export class CoverModule {}

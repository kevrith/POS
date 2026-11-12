import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { CoverController } from './cover.controller';
import { CoverService } from './cover.service';
import { ShaController } from './sha/sha.controller';
import { ShaService } from './sha/sha.service';

@Module({
  imports: [PrismaModule],
  providers: [CoverService, ShaService],
  controllers: [CoverController, ShaController],
  exports: [CoverService],
})
export class CoverModule {}

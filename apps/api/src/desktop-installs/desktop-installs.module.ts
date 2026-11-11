import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { DesktopInstallsController } from './desktop-installs.controller';
import { DesktopInstallsService } from './desktop-installs.service';

@Module({
  imports: [PrismaModule],
  controllers: [DesktopInstallsController],
  providers: [DesktopInstallsService],
  exports: [DesktopInstallsService],
})
export class DesktopInstallsModule {}

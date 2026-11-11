import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminAuthGuard } from './super-admin-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { SecretsRotationService } from '../security/secrets-rotation.service';
import { EmailModule } from '../email/email.module';
import { DbBackupModule } from '../backup/db-backup.module';
import { LicensingModule } from '../licensing/licensing.module';
import { DesktopInstallsModule } from '../desktop-installs/desktop-installs.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({}),
    EmailModule,
    DbBackupModule,
    LicensingModule,
    DesktopInstallsModule,
  ],
  providers: [SuperAdminService, SuperAdminAuthGuard, SecretsRotationService],
  controllers: [SuperAdminController],
})
export class SuperAdminModule {}

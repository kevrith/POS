import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminAuthGuard } from './super-admin-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';
import { SecretsRotationService } from '../security/secrets-rotation.service';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({}), // options provided per-call via jwt.sign(payload, opts)
    EmailModule,
  ],
  providers: [SuperAdminService, SuperAdminAuthGuard, SecretsRotationService],
  controllers: [SuperAdminController],
})
export class SuperAdminModule {}

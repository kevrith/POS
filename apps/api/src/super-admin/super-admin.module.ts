import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { SuperAdminService } from './super-admin.service';
import { SuperAdminController } from './super-admin.controller';
import { SuperAdminAuthGuard } from './super-admin-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    JwtModule.register({}), // options provided per-call via jwt.sign(payload, opts)
  ],
  providers: [SuperAdminService, SuperAdminAuthGuard],
  controllers: [SuperAdminController],
})
export class SuperAdminModule {}

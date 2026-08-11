import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AffiliateService } from './affiliate.service';
import { AffiliateController } from './affiliate.controller';
import { AffiliateJwtGuard } from './affiliate-jwt.guard';
import { SuperAdminAuthGuard } from '../super-admin/super-admin-auth.guard';
import { PrismaModule } from '../prisma/prisma.module';

@Module({
  imports: [
    PrismaModule,
    // Self-contained JwtModule (same secret as auth) so we don't depend on
    // AuthModule — AuthModule imports us to attribute signups, avoiding a cycle.
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-in-production',
        signOptions: { expiresIn: '30d' },
      }),
    }),
  ],
  controllers: [AffiliateController],
  providers: [AffiliateService, AffiliateJwtGuard, SuperAdminAuthGuard],
  exports: [AffiliateService],
})
export class AffiliateModule {}

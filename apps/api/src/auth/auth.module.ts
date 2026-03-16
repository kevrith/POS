import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { TenantGuard } from './tenant.guard';
import { SubscriptionGuard } from './subscription.guard';
import { EmailModule } from '../email/email.module';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'dev-secret-change-in-production',
        signOptions: { expiresIn: '15m' },
      }),
    }),
    EmailModule,
  ],
  providers: [AuthService, JwtStrategy, GoogleStrategy, JwtAuthGuard, RolesGuard, TenantGuard, SubscriptionGuard],
  controllers: [AuthController],
  exports: [AuthService, JwtModule, JwtAuthGuard, RolesGuard, TenantGuard, SubscriptionGuard],
})
export class AuthModule {}

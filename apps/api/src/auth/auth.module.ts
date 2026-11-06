import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { ConfigService } from '@nestjs/config';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { WebAuthnService } from './webauthn.service';
import { DeviceLoginService } from './device-login.service';
import { WebAuthnController } from './webauthn.controller';
import { JwtStrategy } from './jwt.strategy';
import { GoogleStrategy } from './google.strategy';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { TenantGuard } from './tenant.guard';
import { SubscriptionGuard } from './subscription.guard';
import { EmailModule } from '../email/email.module';
import { AffiliateModule } from '../affiliate/affiliate.module';
import { jwtSecretFrom } from '../common/jwt-secret';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: jwtSecretFrom(config),
        signOptions: { expiresIn: '15m' },
      }),
    }),
    EmailModule,
    AffiliateModule,
  ],
  providers: [AuthService, WebAuthnService, DeviceLoginService, JwtStrategy, GoogleStrategy, JwtAuthGuard, RolesGuard, TenantGuard, SubscriptionGuard],
  controllers: [AuthController, WebAuthnController],
  exports: [AuthService, JwtModule, JwtAuthGuard, RolesGuard, TenantGuard, SubscriptionGuard],
})
export class AuthModule {}

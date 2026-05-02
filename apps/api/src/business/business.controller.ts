import {
  Controller,
  Get,
  Patch,
  Post,
  Delete,
  Body,
  Param,
  UseGuards,
  Req,
} from '@nestjs/common';
import { BusinessService } from './business.service';
import { JwtAuthGuard, Public } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';
import { SkipSubscriptionCheck } from '../auth/subscription.guard';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { UserRole } from '@pos/shared';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('business')
export class BusinessController {
  constructor(private businessService: BusinessService) {}

  @SkipSubscriptionCheck()
  @Get(':businessId/settings')
  async getSettings(@Param('businessId') businessId: string) {
    return this.businessService.getSettings(businessId);
  }

  @Patch(':businessId/settings')
  async updateSettings(
    @Param('businessId') businessId: string,
    @Body()
    dto: {
      name?: string;
      taxType?: 'VAT' | 'TOT' | 'NONE';
      totRate?: number;
      serviceChargeRate?: number;
      serviceChargeDefault?: boolean;
      negativePolicyDefault?: 'BLOCK' | 'WARN' | 'ALLOW';
      posMode?: string;
      expiredItemPolicy?: string;
      expenseApprovalThresholdCents?: number;
      expiryAlertDays?: number;
      [key: string]: unknown;
    },
  ) {
    return this.businessService.updateSettings(businessId, dto);
  }

  @SkipSubscriptionCheck()
  @Get(':businessId/stores')
  async getStores(@Param('businessId') businessId: string) {
    return this.businessService.getStores(businessId);
  }

  @Post(':businessId/stores')
  async createStore(
    @Param('businessId') businessId: string,
    @Body() dto: { name: string; storeCode: string },
  ) {
    return this.businessService.createStore(businessId, dto);
  }

  @SkipSubscriptionCheck()
  @Get(':businessId/subscription')
  async getSubscription(@Param('businessId') businessId: string) {
    return this.businessService.getSubscriptionStatus(businessId);
  }

  @SkipSubscriptionCheck()
  @Post(':businessId/cancel-subscription')
  async cancelSubscription(
    @Param('businessId') businessId: string,
    @Body() body: { reason: string },
  ) {
    return this.businessService.cancelSubscription(businessId, body.reason);
  }

  // ─── User Management ────────────────────────────────────────────────────────

  @Get(':businessId/users')
  async getUsers(@Param('businessId') businessId: string) {
    return this.businessService.getUsers(businessId);
  }

  @Post(':businessId/users')
  async createUser(
    @Param('businessId') businessId: string,
    @Body()
    dto: {
      name: string;
      email?: string;
      role: UserRole;
      pin?: string;
      password?: string;
    },
  ) {
    return this.businessService.createUser(businessId, dto);
  }

  @Patch(':businessId/users/:userId')
  async updateUser(
    @Param('businessId') businessId: string,
    @Param('userId') userId: string,
    @Body()
    dto: {
      name?: string;
      role?: UserRole;
      pin?: string;
      password?: string;
    },
  ) {
    return this.businessService.updateUser(businessId, userId, dto);
  }

  @Delete(':businessId/users/:userId')
  async deleteUser(
    @Param('businessId') businessId: string,
    @Param('userId') userId: string,
    @Req() req: Request & { user: AuthUser },
  ) {
    if (req.user.id === userId) {
      return { error: 'Cannot delete your own account' };
    }
    return this.businessService.deleteUser(businessId, userId);
  }

  @Post(':businessId/users/:userId/stores/:storeId')
  async assignUserToStore(
    @Param('businessId') businessId: string,
    @Param('userId') userId: string,
    @Param('storeId') storeId: string,
  ) {
    return this.businessService.assignUserToStore(businessId, userId, storeId);
  }

  @Delete(':businessId/users/:userId/stores/:storeId')
  async removeUserFromStore(
    @Param('businessId') businessId: string,
    @Param('userId') userId: string,
    @Param('storeId') storeId: string,
  ) {
    return this.businessService.removeUserFromStore(businessId, userId, storeId);
  }

  // ─── Credential Management ──────────────────────────────────────────────────

  @Patch(':businessId/etims-credentials')
  async saveEtimsCredentials(
    @Param('businessId') businessId: string,
    @Body() dto: { bhfId: string; tin: string; dvcSrno: string },
  ) {
    return this.businessService.saveEtimsCredentials(businessId, dto);
  }

  @Patch(':businessId/mpesa-credentials')
  async saveMpesaCredentials(
    @Param('businessId') businessId: string,
    @Body()
    dto: {
      consumerKey: string;
      consumerSecret: string;
      shortcode: string;
      passkey: string;
      callbackUrl: string;
    },
  ) {
    return this.businessService.saveMpesaCredentials(businessId, dto);
  }

  @Patch(':businessId/at-credentials')
  async saveAtCredentials(
    @Param('businessId') businessId: string,
    @Body() dto: { apiKey: string; username: string; senderId?: string },
  ) {
    return this.businessService.saveAtCredentials(businessId, dto);
  }

  // ─── Exchange Rates ──────────────────────────────────────────────────────────

  @Get(':businessId/exchange-rates')
  async getExchangeRates(@Param('businessId') businessId: string) {
    return this.businessService.getExchangeRates(businessId);
  }

  /** Auto-fetch live rates from open.er-api.com for requested currencies. */
  @Post(':businessId/exchange-rates/refresh')
  async refreshExchangeRates(
    @Param('businessId') businessId: string,
    @Body() dto: { currencies: string[] },
  ) {
    return this.businessService.refreshExchangeRates(businessId, dto.currencies ?? []);
  }

  @Patch(':businessId/exchange-rates')
  async updateExchangeRates(
    @Param('businessId') businessId: string,
    @Body() dto: { rates?: Record<string, number>; displayCurrencies?: string[] },
  ) {
    return this.businessService.updateExchangeRates(businessId, dto);
  }

  // ── Pole Display Config (public, no auth required) ────────────────────────────

  @Public()
  @SkipSubscriptionCheck()
  @UseGuards(JwtAuthGuard)
  @Get(':id/pole-config')
  async getPoleConfig(@Param('id') id: string) {
    return this.businessService.getPoleConfig(id);
  }

  /** Resolve a short business code (e.g. PREMIE01) → { id, name, shortCode }
   * Used by the PIN login screen so staff type a short code, not a UUID.
   * Also accepts seed-style IDs like "biz-001" for dev convenience.
   */
  @Public()
  @SkipSubscriptionCheck()
  @UseGuards(JwtAuthGuard)
  @Get('resolve/:code')
  async resolveByCode(@Param('code') code: string) {
    const biz = await this.businessService.resolveByCode(code);
    if (!biz) {
      const { NotFoundException: NotFound } = await import('@nestjs/common');
      throw new NotFound('Business code not found');
    }
    return biz;
  }

  /** Public staff picker — no auth required (only returns id/name/role, no PINs)
   * Method-level @UseGuards() overrides the class-level JwtAuthGuard+TenantGuard.
   */
  @Public()
  @SkipSubscriptionCheck()
  @UseGuards(JwtAuthGuard)
  @Get(':id/staff')
  async getStaffList(@Param('id') id: string) {
    // :id may be a real UUID or a shortCode — resolve transparently
    const biz = await this.businessService.resolveByCode(id);
    return this.businessService.getStaffList(biz ? biz.id : id);
  }
}

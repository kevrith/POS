import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Post, Get, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { SecurityService } from './security.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresFeature(Feature.SECURITY_SETTINGS)
@Controller('security')
export class SecurityController {
  constructor(private securityService: SecurityService) {}

  // ─── Custom Roles & Permissions ─────────────────────────────────────────────

  @Post('roles')
  async createCustomRole(@Body() dto: any) {
    return this.securityService.createCustomRole(dto);
  }

  @Get('roles')
  async getCustomRoles(@Query('businessId') businessId: string) {
    return this.securityService.getCustomRoles(businessId);
  }

  @Get('permissions')
  async getAllPermissions() {
    return this.securityService.getAllPermissions();
  }

  @Put('roles/:id/permissions')
  async updateRolePermissions(
    @Param('id') roleId: string,
    @Body() dto: { permissions: string[]; businessId: string },
  ) {
    return this.securityService.updateRolePermissions(roleId, dto.permissions, dto.businessId);
  }

  @Get('check-permission/:userId/:permission')
  async checkPermission(
    @Param('userId') userId: string,
    @Param('permission') permission: string,
  ) {
    const hasPermission = await this.securityService.checkPermission(userId, permission);
    return { hasPermission };
  }

  // ─── Password Policy ─────────────────────────────────────────────────────────

  @Get('password-policy')
  async getPasswordPolicy(@Query('businessId') businessId: string) {
    return this.securityService.getPasswordPolicy(businessId);
  }

  @Put('password-policy')
  async updatePasswordPolicy(@Body() dto: any) {
    return this.securityService.updatePasswordPolicy(dto);
  }

  @Post('validate-password')
  async validatePassword(@Body() dto: { password: string; businessId: string }) {
    return this.securityService.validatePassword(dto.password, dto.businessId);
  }

  @Post('change-password')
  async changePassword(@Body() dto: any) {
    return this.securityService.changePassword(dto);
  }

  @Get('password-expiry/:userId')
  async checkPasswordExpiry(@Param('userId') userId: string) {
    return this.securityService.checkPasswordExpiry(userId);
  }

  // ─── Audit Log Viewer ───────────────────────────────────────────────────────

  @Get('audit-logs')
  async getAuditLogs(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('actor') actor?: string,
    @Query('action') action?: string,
    @Query('entity') entity?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    return this.securityService.getAuditLogs(businessId, {
      startDate,
      endDate,
      actor,
      action,
      entity,
      limit: limit ? parseInt(limit) : undefined,
      offset: offset ? parseInt(offset) : undefined,
    });
  }

  // ─── Tax Configuration ──────────────────────────────────────────────────────

  @Post('tax/zero-rated')
  async setZeroRatedItem(@Body() dto: { businessId: string; itemId: string; exemptionReason: string }) {
    return this.securityService.setZeroRatedItem(dto.businessId, dto.itemId, dto.exemptionReason);
  }

  @Get('tax/configurations')
  async getTaxConfigurations(@Query('businessId') businessId: string) {
    return this.securityService.getTaxConfigurations(businessId);
  }
}
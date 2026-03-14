import { Injectable, BadRequestException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as bcrypt from 'bcrypt';

interface CreateCustomRoleDto {
  businessId: string;
  name: string;
  description?: string;
  permissions: string[];
}

interface UpdatePasswordPolicyDto {
  businessId: string;
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumbers?: boolean;
  requireSpecialChars?: boolean;
  rotationDays?: number;
  preventReuse?: number;
}

interface ChangePasswordDto {
  userId: string;
  currentPassword: string;
  newPassword: string;
}

@Injectable()
export class SecurityService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  // ─── Custom Roles & Permissions ─────────────────────────────────────────────

  async createCustomRole(dto: CreateCustomRoleDto) {
    // Validate permissions exist
    const validPermissions = await this.prisma.permission.findMany({
      where: { id: { in: dto.permissions }, isActive: true },
    });

    if (validPermissions.length !== dto.permissions.length) {
      throw new BadRequestException('Some permissions are invalid');
    }

    const role = await this.prisma.customRole.create({
      data: {
        businessId: dto.businessId,
        name: dto.name,
        description: dto.description,
        permissions: JSON.stringify(dto.permissions),
      },
    });

    // Create role-permission mappings
    await Promise.all(
      dto.permissions.map(permissionId =>
        this.prisma.rolePermission.create({
          data: {
            roleId: role.id,
            permissionId,
            granted: true,
          },
        }),
      ),
    );

    await this.audit.createEntry({
      businessId: dto.businessId,
      actor: 'system',
      actorType: 'SYSTEM',
      action: 'CUSTOM_ROLE_CREATED',
      entity: 'CustomRole',
      entityId: role.id,
      after: { name: dto.name, permissions: dto.permissions },
      source: 'SYSTEM',
    });

    return role;
  }

  async getCustomRoles(businessId: string) {
    const roles = await this.prisma.customRole.findMany({
      where: { businessId, isActive: true },
      include: {
        rolePermissions: {
          include: {
            permission: true,
          },
        },
      },
    });

    return roles.map(role => ({
      ...role,
      permissions: JSON.parse(role.permissions),
      grantedPermissions: role.rolePermissions
        .filter(rp => rp.granted)
        .map(rp => rp.permission),
    }));
  }

  async getAllPermissions() {
    return this.prisma.permission.findMany({
      where: { isActive: true },
      orderBy: [{ category: 'asc' }, { name: 'asc' }],
    });
  }

  async updateRolePermissions(roleId: string, permissions: string[], businessId: string) {
    // Verify role belongs to business
    const role = await this.prisma.customRole.findFirst({
      where: { id: roleId, businessId },
    });

    if (!role) {
      throw new BadRequestException('Role not found');
    }

    // Delete existing permissions
    await this.prisma.rolePermission.deleteMany({
      where: { roleId },
    });

    // Create new permissions
    await Promise.all(
      permissions.map(permissionId =>
        this.prisma.rolePermission.create({
          data: {
            roleId,
            permissionId,
            granted: true,
          },
        }),
      ),
    );

    // Update role permissions JSON
    await this.prisma.customRole.update({
      where: { id: roleId },
      data: { permissions: JSON.stringify(permissions) },
    });

    return { success: true };
  }

  async checkPermission(userId: string, permission: string): Promise<boolean> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user) return false;

    // Check if user has a custom role with this permission
    const customRoles = await this.prisma.customRole.findMany({
      where: { businessId: user.businessId, isActive: true },
      include: {
        rolePermissions: {
          where: { granted: true },
          include: { permission: true },
        },
      },
    });

    for (const role of customRoles) {
      const permissions = JSON.parse(role.permissions);
      if (permissions.includes(permission)) {
        return true;
      }
    }

    // Fallback to basic role-based permissions
    const basicPermissions = this.getBasicRolePermissions(user.role);
    return basicPermissions.includes(permission);
  }

  // ─── Password Policy ─────────────────────────────────────────────────────────

  async getPasswordPolicy(businessId: string) {
    let policy = await this.prisma.passwordPolicy.findFirst({
      where: { businessId, isActive: true },
    });

    if (!policy) {
      // Create default policy
      policy = await this.prisma.passwordPolicy.create({
        data: { businessId },
      });
    }

    return policy;
  }

  async updatePasswordPolicy(dto: UpdatePasswordPolicyDto) {
    const updateData = {
      minLength: dto.minLength,
      requireUppercase: dto.requireUppercase,
      requireLowercase: dto.requireLowercase,
      requireNumbers: dto.requireNumbers,
      requireSpecialChars: dto.requireSpecialChars,
      rotationDays: dto.rotationDays,
      preventReuse: dto.preventReuse,
    };
    const existing = await this.prisma.passwordPolicy.findFirst({ where: { businessId: dto.businessId } });
    const policy = existing
      ? await this.prisma.passwordPolicy.update({ where: { id: existing.id }, data: updateData })
      : await this.prisma.passwordPolicy.create({ data: { businessId: dto.businessId, ...updateData } });

    await this.audit.createEntry({
      businessId: dto.businessId,
      actor: 'system',
      actorType: 'SYSTEM',
      action: 'PASSWORD_POLICY_UPDATED',
      entity: 'PasswordPolicy',
      entityId: policy.id,
      after: dto,
      source: 'SYSTEM',
    });

    return policy;
  }

  async validatePassword(password: string, businessId: string): Promise<{ valid: boolean; errors: string[] }> {
    const policy = await this.getPasswordPolicy(businessId);
    const errors: string[] = [];

    if (password.length < policy.minLength) {
      errors.push(`Password must be at least ${policy.minLength} characters long`);
    }

    if (policy.requireUppercase && !/[A-Z]/.test(password)) {
      errors.push('Password must contain at least one uppercase letter');
    }

    if (policy.requireLowercase && !/[a-z]/.test(password)) {
      errors.push('Password must contain at least one lowercase letter');
    }

    if (policy.requireNumbers && !/\\d/.test(password)) {
      errors.push('Password must contain at least one number');
    }

    if (policy.requireSpecialChars && !/[!@#$%^&*(),.?\":{}|<>]/.test(password)) {
      errors.push('Password must contain at least one special character');
    }

    return { valid: errors.length === 0, errors };
  }

  async changePassword(dto: ChangePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: dto.userId },
    });

    if (!user || !user.passwordHash) {
      throw new BadRequestException('User not found or no password set');
    }

    // Verify current password
    const isCurrentValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isCurrentValid) {
      throw new BadRequestException('Current password is incorrect');
    }

    // Validate new password against policy
    const validation = await this.validatePassword(dto.newPassword, user.businessId);
    if (!validation.valid) {
      throw new BadRequestException(validation.errors.join(', '));
    }

    // Check password history
    const policy = await this.getPasswordPolicy(user.businessId);
    if (policy.preventReuse > 0) {
      const recentPasswords = await this.prisma.userPasswordHistory.findMany({
        where: { userId: dto.userId },
        orderBy: { createdAt: 'desc' },
        take: policy.preventReuse,
      });

      for (const oldPassword of recentPasswords) {
        const isReused = await bcrypt.compare(dto.newPassword, oldPassword.passwordHash);
        if (isReused) {
          throw new BadRequestException(`Cannot reuse any of the last ${policy.preventReuse} passwords`);
        }
      }
    }

    // Hash new password
    const newPasswordHash = await bcrypt.hash(dto.newPassword, 12);

    // Update user password
    const updatedUser = await this.prisma.user.update({
      where: { id: dto.userId },
      data: {
        passwordHash: newPasswordHash,
        passwordChangedAt: new Date(),
        passwordExpiresAt: new Date(Date.now() + policy.rotationDays * 24 * 60 * 60 * 1000),
        mustChangePassword: false,
      },
    });

    // Save to password history
    await this.prisma.userPasswordHistory.create({
      data: {
        userId: dto.userId,
        passwordHash: user.passwordHash,
      },
    });

    // Clean up old password history
    if (policy.preventReuse > 0) {
      const oldPasswords = await this.prisma.userPasswordHistory.findMany({
        where: { userId: dto.userId },
        orderBy: { createdAt: 'desc' },
        skip: policy.preventReuse,
      });

      if (oldPasswords.length > 0) {
        await this.prisma.userPasswordHistory.deleteMany({
          where: { id: { in: oldPasswords.map(p => p.id) } },
        });
      }
    }

    await this.audit.createEntry({
      businessId: user.businessId,
      actor: dto.userId,
      actorType: 'USER',
      action: 'PASSWORD_CHANGED',
      entity: 'User',
      entityId: dto.userId,
      source: 'SYSTEM',
    });

    return { success: true };
  }

  async checkPasswordExpiry(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });

    if (!user || !user.passwordExpiresAt) {
      return { expired: false, daysUntilExpiry: null };
    }

    const now = new Date();
    const expiryDate = new Date(user.passwordExpiresAt);
    const daysUntilExpiry = Math.ceil((expiryDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

    return {
      expired: daysUntilExpiry <= 0,
      daysUntilExpiry,
      mustChangePassword: user.mustChangePassword,
    };
  }

  // ─── Audit Log Viewer ───────────────────────────────────────────────────────

  async getAuditLogs(businessId: string, filters: {
    startDate?: string;
    endDate?: string;
    actor?: string;
    action?: string;
    entity?: string;
    limit?: number;
    offset?: number;
  }) {
    const where: any = { businessId };

    if (filters.startDate || filters.endDate) {
      where.createdAt = {};
      if (filters.startDate) where.createdAt.gte = new Date(filters.startDate);
      if (filters.endDate) where.createdAt.lte = new Date(filters.endDate);
    }

    if (filters.actor) where.actor = { contains: filters.actor, mode: 'insensitive' };
    if (filters.action) where.action = filters.action;
    if (filters.entity) where.entity = filters.entity;

    const [logs, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: filters.limit || 50,
        skip: filters.offset || 0,
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return { logs, total };
  }

  // ─── Tax Configuration ──────────────────────────────────────────────────────

  async setZeroRatedItem(businessId: string, itemId: string, exemptionReason: string) {
    const existing = await this.prisma.taxConfiguration.findFirst({ where: { businessId, itemId } });
    if (existing) {
      return this.prisma.taxConfiguration.update({
        where: { id: existing.id },
        data: { isZeroRated: true, exemptionReason, vatRate: 0, totRate: 0 },
      });
    }
    return this.prisma.taxConfiguration.create({
      data: { businessId, itemId, isZeroRated: true, exemptionReason, vatRate: 0, totRate: 0 },
    });
  }

  async getTaxConfigurations(businessId: string) {
    const configs = await this.prisma.taxConfiguration.findMany({ where: { businessId } });
    // Enrich with item name if itemId is set
    const itemIds = configs.map(c => c.itemId).filter(Boolean) as string[];
    const items = itemIds.length > 0
      ? await this.prisma.item.findMany({ where: { id: { in: itemIds } }, select: { id: true, name: true, category: true } })
      : [];
    const itemMap = Object.fromEntries(items.map(i => [i.id, i]));
    return configs.map(c => ({ ...c, item: c.itemId ? (itemMap[c.itemId] ?? null) : null }));
  }

  private getBasicRolePermissions(role: string): string[] {
    const rolePermissions: Record<string, string[]> = {
      ADMIN: ['perm_sales_create', 'perm_sales_view', 'perm_sales_void', 'perm_inventory_view', 'perm_inventory_adjust', 'perm_reports_view', 'perm_users_manage', 'perm_settings_manage', 'perm_delivery_manage', 'perm_audit_view'],
      MANAGER: ['perm_sales_create', 'perm_sales_view', 'perm_sales_void', 'perm_inventory_view', 'perm_reports_view', 'perm_delivery_manage'],
      CASHIER: ['perm_sales_create', 'perm_sales_view', 'perm_inventory_view'],
      DRIVER: ['perm_delivery_manage'],
    };

    return rolePermissions[role] || [];
  }
}
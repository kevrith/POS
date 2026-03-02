import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { randomBytes, createHash } from 'crypto';

@Injectable()
export class ApiKeysService {
  constructor(private prisma: PrismaService) {}

  async listKeys(businessId: string) {
    const keys = await this.prisma.apiKey.findMany({
      where: { businessId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        scopes: true,
        ipWhitelist: true,
        isActive: true,
        lastUsedAt: true,
        createdAt: true,
      },
    });
    return keys.map((k) => ({
      ...k,
      scopes: this.parseJSON(k.scopes, []),
    }));
  }

  async createKey(
    businessId: string,
    dto: { name: string; scopes: string[]; ipWhitelist?: string },
  ) {
    const rawKey = `pos_${randomBytes(24).toString('hex')}`;
    const keyHash = createHash('sha256').update(rawKey).digest('hex');

    const key = await this.prisma.apiKey.create({
      data: {
        businessId,
        name: dto.name,
        keyHash,
        scopes: JSON.stringify(dto.scopes),
        ipWhitelist: dto.ipWhitelist ?? '',
        isActive: true,
      },
      select: { id: true, name: true, scopes: true, ipWhitelist: true, isActive: true, createdAt: true },
    });

    return {
      ...key,
      scopes: this.parseJSON(key.scopes, []),
      rawKey, // shown ONCE — never stored in plaintext
    };
  }

  async revokeKey(id: string, businessId: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.businessId !== businessId) throw new BadRequestException('Key not found');
    await this.prisma.apiKey.update({ where: { id }, data: { isActive: false } });
    return { success: true };
  }

  async deleteKey(id: string, businessId: string) {
    const key = await this.prisma.apiKey.findUnique({ where: { id } });
    if (!key || key.businessId !== businessId) throw new BadRequestException('Key not found');
    await this.prisma.apiKey.delete({ where: { id } });
    return { success: true };
  }

  private parseJSON(value: string, fallback: unknown) {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
}

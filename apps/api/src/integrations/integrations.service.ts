import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { createCipheriv, createDecipheriv } from 'crypto';

@Injectable()
export class IntegrationsService {
  constructor(private prisma: PrismaService) {}

  private encrypt(data: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const iv = Buffer.alloc(16, 0);
    const cipher = createCipheriv(algorithm, key, iv);
    return cipher.update(data, 'utf8', 'hex') + cipher.final('hex');
  }

  private decrypt(encrypted: string): string {
    const algorithm = 'aes-256-cbc';
    const key = Buffer.from(process.env.ENCRYPTION_KEY, 'hex');
    const iv = Buffer.alloc(16, 0);
    const decipher = createDecipheriv(algorithm, key, iv);
    return decipher.update(encrypted, 'hex', 'utf8') + decipher.final('utf8');
  }

  async createIntegration(data: {
    businessId: string;
    type: string;
    name: string;
    config: Record<string, unknown>;
  }) {
    return this.prisma.integration.create({
      data: {
        businessId: data.businessId,
        type: data.type,
        name: data.name,
        config: this.encrypt(JSON.stringify(data.config)),
        isActive: true,
      },
    });
  }

  async updateIntegration(id: string, data: {
    name?: string;
    config?: Record<string, unknown>;
    isActive?: boolean;
  }) {
    return this.prisma.integration.update({
      where: { id },
      data: {
        ...(data.name && { name: data.name }),
        ...(data.config && { config: this.encrypt(JSON.stringify(data.config)) }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async getIntegrations(businessId: string, type?: string) {
    const integrations = await this.prisma.integration.findMany({
      where: {
        businessId,
        ...(type && { type }),
      },
    });

    return integrations.map(i => ({
      ...i,
      config: JSON.parse(this.decrypt(i.config)),
    }));
  }

  async syncSale(integrationId: string, saleId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
    });

    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { items: true, payments: true },
    });

    const config = JSON.parse(this.decrypt(integration.config));

    switch (integration.type) {
      case 'QUICKBOOKS':
        return this.syncToQuickBooks(config, sale);
      case 'XERO':
        return this.syncToXero(config, sale);
      case 'WOOCOMMERCE':
        return this.syncToWooCommerce(config, sale);
      case 'SHOPIFY':
        return this.syncToShopify(config, sale);
      default:
        throw new Error(`Unsupported integration type: ${integration.type}`);
    }
  }

  private async syncToQuickBooks(config: Record<string, unknown>, sale: unknown) {
    // QuickBooks API integration
    return { success: true, externalId: 'QB-' + Date.now() };
  }

  private async syncToXero(config: Record<string, unknown>, sale: unknown) {
    // Xero API integration
    return { success: true, externalId: 'XERO-' + Date.now() };
  }

  private async syncToWooCommerce(config: Record<string, unknown>, sale: unknown) {
    // WooCommerce API integration
    return { success: true, externalId: 'WC-' + Date.now() };
  }

  private async syncToShopify(config: Record<string, unknown>, sale: unknown) {
    // Shopify API integration
    return { success: true, externalId: 'SHOPIFY-' + Date.now() };
  }

  async syncInventory(integrationId: string, itemId: string) {
    const integration = await this.prisma.integration.findUnique({
      where: { id: integrationId },
    });

    const item = await this.prisma.item.findUnique({
      where: { id: itemId },
    });

    const stock = await this.prisma.inventoryMovement.aggregate({
      where: { itemId },
      _sum: { quantity: true },
    });

    const config = JSON.parse(this.decrypt(integration.config));

    await this.prisma.integration.update({
      where: { id: integrationId },
      data: { lastSyncAt: new Date() },
    });

    return {
      success: true,
      item: item.name,
      stock: stock._sum.quantity || 0,
      syncedAt: new Date(),
    };
  }

  async webhookHandler(type: string, payload: Record<string, unknown>) {
    switch (type) {
      case 'WOOCOMMERCE_ORDER':
        return this.handleWooCommerceOrder(payload);
      case 'SHOPIFY_ORDER':
        return this.handleShopifyOrder(payload);
      default:
        throw new Error(`Unsupported webhook type: ${type}`);
    }
  }

  private async handleWooCommerceOrder(payload: Record<string, unknown>) {
    // Create sale from WooCommerce order
    return { success: true, saleId: 'SALE-' + Date.now() };
  }

  private async handleShopifyOrder(payload: Record<string, unknown>) {
    // Create sale from Shopify order
    return { success: true, saleId: 'SALE-' + Date.now() };
  }
}

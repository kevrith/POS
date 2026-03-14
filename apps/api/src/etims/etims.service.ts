import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import * as crypto from 'crypto';

interface EtimsProductionOnboardingDto {
  businessId: string;
  kraPin: string;
  businessName: string;
  businessAddress: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  certificateFile?: string; // Base64 encoded certificate
}

interface ItaxVatReturnDto {
  businessId: string;
  period: string; // YYYY-MM format
  totalSales: number;
  totalPurchases: number;
  vatOnSales: number;
  vatOnPurchases: number;
  netVat: number;
}

@Injectable()
export class EtimsService {
  private readonly ETIMS_SANDBOX_URL = 'https://etims-api-sbx.kra.go.ke';
  private readonly ETIMS_PRODUCTION_URL = 'https://etims-api.kra.go.ke';
  private readonly ITAX_API_URL = 'https://itax.kra.go.ke/api';

  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  async initiateProductionOnboarding(dto: EtimsProductionOnboardingDto) {
    const business = await this.prisma.business.findUnique({
      where: { id: dto.businessId },
    });

    if (!business) {
      throw new BadRequestException('Business not found');
    }

    if (business.etimsProductionOnboarded) {
      throw new BadRequestException('Business already onboarded to production');
    }

    // Validate KRA PIN format
    if (!/^[A-Z]\d{9}[A-Z]$/.test(dto.kraPin)) {
      throw new BadRequestException('Invalid KRA PIN format');
    }

    // Submit onboarding request to KRA eTIMS
    const onboardingData = {
      kraPin: dto.kraPin,
      businessName: dto.businessName,
      businessAddress: dto.businessAddress,
      contactPerson: dto.contactPerson,
      contactPhone: dto.contactPhone,
      contactEmail: dto.contactEmail,
      systemName: 'Universal POS',
      systemVersion: '1.0.0',
      certificateFile: dto.certificateFile,
    };

    try {
      // In production, this would make actual API calls to KRA
      const response = await this.submitEtimsOnboarding(onboardingData);
      
      // Update business with production credentials
      await this.prisma.business.update({
        where: { id: dto.businessId },
        data: {
          etimsMode: 'PRODUCTION',
          etimsProductionOnboarded: true,
          etimsCredentialsEncrypted: this.encryptCredentials({
            deviceId: response.deviceId,
            deviceKey: response.deviceKey,
            kraPin: dto.kraPin,
          }),
        },
      });

      await this.audit.createEntry({
        businessId: dto.businessId,
        actor: 'system',
        actorType: 'SYSTEM',
        action: 'ETIMS_PRODUCTION_ONBOARDED',
        entity: 'Business',
        entityId: dto.businessId,
        after: { etimsMode: 'PRODUCTION', kraPin: dto.kraPin },
        source: 'API',
      });

      return {
        success: true,
        deviceId: response.deviceId,
        message: 'Successfully onboarded to eTIMS production',
      };
    } catch (error) {
      throw new BadRequestException(`eTIMS onboarding failed: ${error.message}`);
    }
  }

  async switchToProductionMode(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
    });

    if (!business) {
      throw new BadRequestException('Business not found');
    }

    if (!business.etimsProductionOnboarded) {
      throw new BadRequestException('Business must complete production onboarding first');
    }

    await this.prisma.business.update({
      where: { id: businessId },
      data: { etimsMode: 'PRODUCTION' },
    });

    await this.audit.createEntry({
      businessId,
      actor: 'system',
      actorType: 'SYSTEM',
      action: 'ETIMS_MODE_SWITCHED',
      entity: 'Business',
      entityId: businessId,
      after: { etimsMode: 'PRODUCTION' },
      source: 'API',
    });

    return { success: true, message: 'Switched to eTIMS production mode' };
  }

  async enableItaxIntegration(businessId: string, itaxCredentials: {
    username: string;
    password: string;
    kraPin: string;
  }) {
    // Validate iTax credentials
    const isValid = await this.validateItaxCredentials(itaxCredentials);
    if (!isValid) {
      throw new BadRequestException('Invalid iTax credentials');
    }

    // Encrypt and store credentials
    const encryptedCredentials = this.encryptCredentials(itaxCredentials);

    await this.prisma.business.update({
      where: { id: businessId },
      data: {
        kraItaxIntegrationEnabled: true,
        kraItaxCredentials: encryptedCredentials,
      },
    });

    await this.audit.createEntry({
      businessId,
      actor: 'system',
      actorType: 'SYSTEM',
      action: 'ITAX_INTEGRATION_ENABLED',
      entity: 'Business',
      entityId: businessId,
      source: 'API',
    });

    return { success: true, message: 'iTax integration enabled successfully' };
  }

  async submitVatReturn(dto: ItaxVatReturnDto) {
    const business = await this.prisma.business.findUnique({
      where: { id: dto.businessId },
    });

    if (!business || !business.kraItaxIntegrationEnabled || !business.kraItaxCredentials) {
      throw new BadRequestException('iTax integration not enabled for this business');
    }

    const credentials = this.decryptCredentials(business.kraItaxCredentials);

    // Prepare VAT return data
    const vatReturnData = {
      kraPin: credentials.kraPin,
      period: dto.period,
      totalSales: dto.totalSales,
      totalPurchases: dto.totalPurchases,
      vatOnSales: dto.vatOnSales,
      vatOnPurchases: dto.vatOnPurchases,
      netVat: dto.netVat,
      submissionDate: new Date().toISOString(),
    };

    try {
      // Submit to iTax API
      const response = await this.submitToItax(credentials, vatReturnData);

      await this.audit.createEntry({
        businessId: dto.businessId,
        actor: 'system',
        actorType: 'SYSTEM',
        action: 'VAT_RETURN_SUBMITTED',
        entity: 'Business',
        entityId: dto.businessId,
        after: { period: dto.period, netVat: dto.netVat, referenceNumber: response.referenceNumber },
        source: 'API',
      });

      return {
        success: true,
        referenceNumber: response.referenceNumber,
        message: 'VAT return submitted successfully',
      };
    } catch (error) {
      throw new BadRequestException(`VAT return submission failed: ${error.message}`);
    }
  }

  async getVatReturnData(businessId: string, period: string) {
    // Parse period (YYYY-MM)
    const [year, month] = period.split('-').map(Number);
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);

    // Get sales data for the period
    const sales = await this.prisma.sale.findMany({
      where: {
        businessId,
        status: 'PAID',
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
      },
      include: {
        items: true,
      },
    });

    // Calculate totals
    const totalSales = sales.reduce((sum, sale) => sum + sale.totalCents, 0);
    const vatOnSales = sales.reduce((sum, sale) => sum + sale.vatCents, 0);

    // Get purchase data (expenses) for the period
    const expenses = await this.prisma.expense.findMany({
      where: {
        businessId,
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        vatReclaimable: true,
      },
    });

    const totalPurchases = expenses.reduce((sum, expense) => sum + expense.amountCents, 0);
    const vatOnPurchases = expenses.reduce((sum, expense) => sum + expense.vatAmountCents, 0);

    const netVat = vatOnSales - vatOnPurchases;

    return {
      period,
      totalSales: totalSales / 100, // Convert to actual currency
      totalPurchases: totalPurchases / 100,
      vatOnSales: vatOnSales / 100,
      vatOnPurchases: vatOnPurchases / 100,
      netVat: netVat / 100,
      salesCount: sales.length,
      expensesCount: expenses.length,
    };
  }

  async voidSale(saleId: string, reason: string) {
    const sale = await this.prisma.sale.findUnique({
      where: { id: saleId },
      include: { business: true },
    });

    if (!sale) {
      throw new BadRequestException('Sale not found');
    }

    // Submit void to eTIMS if in production mode
    if (sale.business.etimsMode === 'PRODUCTION' && sale.etimsSubmitted) {
      try {
        const credentials = this.decryptCredentials(sale.business.etimsCredentialsEncrypted);
        const voidResponse = await this.submitEtimsVoid(credentials, {
          receiptNumber: sale.receiptNumber,
          controlNumber: sale.etimsControlNumber,
          reason,
        });

        // Update void record with eTIMS reference
        await this.prisma.voidRecord.updateMany({
          where: { saleId },
          data: { etimsVoidRef: voidResponse.voidReference },
        });
      } catch (error) {
        // Log error but don't fail the void operation
        console.error('eTIMS void submission failed:', error);
      }
    }

    return { success: true };
  }

  private async submitEtimsOnboarding(data: any) {
    // Mock response for development
    // In production, this would make actual HTTP requests to KRA eTIMS API
    return {
      deviceId: `DEV_${Date.now()}`,
      deviceKey: crypto.randomBytes(32).toString('hex'),
      status: 'APPROVED',
    };
  }

  private async validateItaxCredentials(credentials: any): Promise<boolean> {
    // Mock validation for development
    // In production, this would validate against iTax API
    return credentials.username && credentials.password && credentials.kraPin;
  }

  private async submitToItax(credentials: any, vatReturnData: any) {
    // Mock response for development
    // In production, this would submit to actual iTax API
    return {
      referenceNumber: `VAT_${Date.now()}`,
      status: 'SUBMITTED',
      submissionDate: new Date().toISOString(),
    };
  }

  private async submitEtimsVoid(credentials: any, voidData: any) {
    // Mock response for development
    // In production, this would submit to actual eTIMS API
    return {
      voidReference: `VOID_${Date.now()}`,
      status: 'VOIDED',
    };
  }

  private encryptCredentials(credentials: any): string {
    const key = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
    const cipher = crypto.createCipher('aes-256-cbc', key);
    let encrypted = cipher.update(JSON.stringify(credentials), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
  }

  private decryptCredentials(encryptedCredentials: string): any {
    const key = process.env.ENCRYPTION_KEY || 'default-key-change-in-production';
    const decipher = crypto.createDecipher('aes-256-cbc', key);
    let decrypted = decipher.update(encryptedCredentials, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return JSON.parse(decrypted);
  }
}
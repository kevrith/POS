import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { AuditModule } from './audit/audit.module';
import { ItemsModule } from './items/items.module';
import { InventoryModule } from './inventory/inventory.module';
import { SalesModule } from './sales/sales.module';
import { PaymentsModule } from './payments/payments.module';
import { CustomersModule } from './customers/customers.module';
import { LayawayModule } from './layaway/layaway.module';
import { BatchModule } from './batch/batch.module';
import { SerialModule } from './serial/serial.module';
import { BundleModule } from './bundle/bundle.module';
import { RecipeModule } from './recipe/recipe.module';
import { CashDrawerModule } from './cash-drawer/cash-drawer.module';
import { SupplierModule } from './supplier/supplier.module';
import { ExpenseModule } from './expense/expense.module';
import { HrModule } from './hr/hr.module';
import { EtimsModule } from './etims/etims.module';
import { ReportsModule } from './reports/reports.module';
import { HospitalityModule } from './hospitality/hospitality.module';
import { TransfersModule } from './transfers/transfers.module';
import { IntegrationsModule } from './integrations/integrations.module';
import { PromotionsModule } from './promotions/promotions.module';
import { GiftCardsModule } from './gift-cards/gift-cards.module';
import { LoyaltyModule } from './loyalty/loyalty.module';
import { NotificationsModule } from './notifications/notifications.module';
import { BusinessModule } from './business/business.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    ThrottlerModule.forRoot([
      { name: 'auth', ttl: 60000, limit: 10 },
      { name: 'general', ttl: 60000, limit: 100 },
    ]),
    PrismaModule,
    AuditModule,
    AuthModule,
    ItemsModule,
    InventoryModule,
    SalesModule,
    PaymentsModule,
    CustomersModule,
    LayawayModule,
    BatchModule,
    SerialModule,
    BundleModule,
    RecipeModule,
    CashDrawerModule,
    SupplierModule,
    ExpenseModule,
    HrModule,
    EtimsModule,
    ReportsModule,
    HospitalityModule,
    TransfersModule,
    IntegrationsModule,
    PromotionsModule,
    GiftCardsModule,
    LoyaltyModule,
    NotificationsModule,
    BusinessModule,
  ],
})
export class AppModule {}

import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './throttler.guard';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { SubscriptionGuard } from './auth/subscription.guard';
import { TenantMiddleware } from './prisma/tenant.middleware';
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
import { BudgetModule } from './budget/budget.module';
import { PrintersModule } from './printers/printers.module';
import { ApiKeysModule } from './api-keys/api-keys.module';
import { ReportSchedulesModule } from './report-schedules/report-schedules.module';
import { WebhooksModule } from './webhooks/webhooks.module';
// New modules
import { EmailModule } from './email/email.module';
import { QueueModule } from './queue/queue.module';
import { SubscriptionModule } from './subscription/subscription.module';
import { SuperAdminModule } from './super-admin/super-admin.module';
import { ReferralsModule } from './referrals/referrals.module';
import { KdpaModule } from './kdpa/kdpa.module';
import { PrescriptionsModule } from './prescriptions/prescriptions.module';
import { PharmacyModule } from './pharmacy/pharmacy.module';
import { AppointmentsModule } from './appointments/appointments.module';
import { DeliveryModule } from './delivery/delivery.module';
import { PortalModule } from './portal/portal.module';
import { EventsModule } from './events/events.module';
import { FranchiseModule } from './franchise/franchise.module';
import { StocktakeModule } from './stocktake/stocktake.module';
import { DamagedGoodsModule } from './damaged-goods/damaged-goods.module';
import { WaitlistModule } from './waitlist/waitlist.module';
import { ChannelManagerModule } from './channel-manager/channel-manager.module';
import { HousekeepingModule } from './housekeeping/housekeeping.module';
import { DisciplinaryModule } from './disciplinary/disciplinary.module';
import { RFQModule } from './rfq/rfq.module';
import { ChequeModule } from './cheque/cheque.module';
import { LedgerModule } from './ledger/ledger.module';
import { PaymentLinksModule } from './payment-links/payment-links.module';
import { SecurityModule } from './security/security.module';
import { NpsModule } from './nps/nps.module';
import { FuelPumpModule } from './fuel-pump/fuel-pump.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env' }),
    ScheduleModule.forRoot(),
    ThrottlerModule.forRoot([
      // Single global throttler for writes (GET requests are skipped by AppThrottlerGuard).
      // Sensitive endpoints (login, M-Pesa) override this with a stricter limit via @Throttle.
      { name: 'default', ttl: 60000, limit: 300 },
    ]),
    // Infrastructure
    EmailModule,
    QueueModule.register(),
    // Data
    PrismaModule,
    AuditModule,
    AuthModule,
    // Features
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
    BudgetModule,
    PrintersModule,
    ApiKeysModule,
    ReportSchedulesModule,
    WebhooksModule,
    // New
    SubscriptionModule,
    SuperAdminModule,
    ReferralsModule,
    KdpaModule,
    PrescriptionsModule,
    PharmacyModule,
    AppointmentsModule,
    DeliveryModule,
    PortalModule,
    EventsModule,
    FranchiseModule,
    StocktakeModule,
    DamagedGoodsModule,
    WaitlistModule,
    ChannelManagerModule,
    HousekeepingModule,
    DisciplinaryModule,
    RFQModule,
    ChequeModule,
    LedgerModule,
    PaymentLinksModule,
    SecurityModule,
    NpsModule,
    FuelPumpModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: AppThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: SubscriptionGuard },
    TenantMiddleware,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}

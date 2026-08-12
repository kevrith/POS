import { Module } from '@nestjs/common';
import { ReportsController } from './reports.controller';
import { ReportsService } from './reports.service';
import { PdfService } from './pdf.service';
import { ForecastingController } from './forecasting.controller';
import { ForecastingService } from './forecasting.service';
import { PrismaModule } from '../prisma/prisma.module';
import { AuthModule } from '../auth/auth.module';
import { CashDrawerModule } from '../cash-drawer/cash-drawer.module';

@Module({
  imports: [PrismaModule, AuthModule, CashDrawerModule],
  controllers: [ReportsController, ForecastingController],
  providers: [ReportsService, PdfService, ForecastingService],
  exports: [ReportsService, PdfService, ForecastingService],
})
export class ReportsModule {}

import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { PrismaModule } from '../prisma/prisma.module';
import { ComplianceController } from './compliance.controller';
import { ComplianceService } from './compliance.service';

@Module({
  imports: [PrismaModule, AuditModule],
  providers: [ComplianceService],
  controllers: [ComplianceController],
})
export class ComplianceModule {}

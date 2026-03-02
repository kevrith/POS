import { Module } from '@nestjs/common';
import { SupplierController } from './supplier.controller';
import { SupplierService } from './supplier.service';
import { PrismaService } from '../prisma/prisma.service';
import { WebhooksModule } from '../webhooks/webhooks.module';

@Module({
  imports: [WebhooksModule],
  controllers: [SupplierController],
  providers: [SupplierService, PrismaService],
  exports: [SupplierService],
})
export class SupplierModule {}

import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { RFQService } from './rfq.service';
import { TenantGuard } from '../auth/tenant.guard';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';

interface CreateRFQDto {
  businessId?: string;
  storeId?: string;
  createdBy?: string;
  notes?: string;
  deadline?: string;
  items: Array<{ itemId: string; quantityNeeded: number }>;
}

@UseGuards(TenantGuard)
@Controller('suppliers/rfq')
export class RFQController {
  constructor(private readonly svc: RFQService) {}

  @Get()
  list(
    @Req() req: Request & { user: AuthUser },
    @Query('status') status?: string,
  ) {
    return this.svc.list(req.user.businessId, status);
  }

  @Post()
  create(@Body() dto: CreateRFQDto, @Req() req: Request & { user: AuthUser }) {
    return this.svc.create({
      ...dto,
      businessId: req.user.businessId,
      createdBy: dto.createdBy ?? req.user.id,
    });
  }

  @Patch(':id/send')
  send(@Param('id') id: string, @Req() req: Request & { user: AuthUser }) {
    return this.svc.send(id, req.user.businessId);
  }

  @Post(':id/responses')
  addResponse(
    @Param('id') rfqId: string,
    @Body()
    dto: {
      supplierId: string;
      quotedPriceCents: number;
      deliveryDays?: number;
      validUntil?: string;
      notes?: string;
    },
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.svc.addResponse(rfqId, req.user.businessId, dto);
  }

  @Patch(':id/responses/:rid/award')
  awardResponse(
    @Param('id') rfqId: string,
    @Param('rid') responseId: string,
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.svc.awardResponse(rfqId, responseId, req.user.businessId);
  }

  @Get(':id/comparison')
  getComparison(
    @Param('id') rfqId: string,
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.svc.getComparison(rfqId, req.user.businessId);
  }
}

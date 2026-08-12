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
import { DamagedGoodsService } from './damaged-goods.service';
import { TenantGuard } from '../auth/tenant.guard';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';

interface CreateDamagedGoodsDto {
  businessId?: string;
  storeId?: string;
  itemId: string;
  variantId?: string;
  quantity: number;
  costCents?: number;
  reason: string;
  notes?: string;
  imageUrl?: string;
  submittedBy?: string;
}

@UseGuards(TenantGuard)
@Controller('damaged-goods')
export class DamagedGoodsController {
  constructor(private readonly svc: DamagedGoodsService) {}

  @Get()
  list(
    @Req() req: Request & { user: AuthUser },
    @Query('storeId') storeId?: string,
    @Query('status') status?: string,
  ) {
    return this.svc.list(req.user.businessId, storeId, status);
  }

  @Post()
  create(
    @Body() dto: CreateDamagedGoodsDto,
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.svc.create({
      ...dto,
      businessId: req.user.businessId,
      // The write-off form has no "submitted by" field — it is always the signed-in user.
      submittedBy: dto.submittedBy ?? req.user.id,
    });
  }

  @Patch(':id/approve')
  approve(
    @Param('id') id: string,
    @Body('authorizedBy') authorizedBy: string | undefined,
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.svc.approve(id, req.user.businessId, authorizedBy ?? req.user.id);
  }

  @Patch(':id/reject')
  reject(
    @Param('id') id: string,
    @Body('authorizedBy') authorizedBy: string | undefined,
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.svc.reject(id, req.user.businessId, authorizedBy ?? req.user.id);
  }
}

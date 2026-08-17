import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import {
  Controller, Get, Post, Patch, Delete,
  Body, Param, Query, UseGuards,
} from '@nestjs/common';
import { StocktakeService } from './stocktake.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresFeature(Feature.STOCKTAKE)
@Controller('stocktake')
export class StocktakeController {
  constructor(private stocktake: StocktakeService) {}

  @Get('sessions')
  getSessions(
    @Query('businessId') businessId: string,
    @Query('storeId') storeId?: string,
  ) {
    return this.stocktake.getSessions(businessId, storeId);
  }

  @Post('sessions')
  createSession(
    @Body() dto: {
      businessId: string;
      storeId: string;
      name: string;
      createdBy: string;
      notes?: string;
    },
  ) {
    return this.stocktake.createSession(dto);
  }

  @Get('sessions/:id')
  getSession(@Param('id') id: string) {
    return this.stocktake.getSession(id);
  }

  @Patch('sessions/:id/counts')
  saveCounts(
    @Param('id') sessionId: string,
    @Body() body: {
      updates: Array<{ countId: string; countedQty: number; note?: string; countedBy?: string }>;
    },
  ) {
    return this.stocktake.saveCounts(sessionId, body.updates);
  }

  @Post('sessions/:id/finalize')
  finalizeSession(
    @Param('id') sessionId: string,
    @Body('finalizedBy') finalizedBy: string,
  ) {
    return this.stocktake.finalizeSession(sessionId, finalizedBy);
  }

  @Delete('sessions/:id')
  deleteSession(@Param('id') id: string) {
    return this.stocktake.deleteSession(id);
  }
}

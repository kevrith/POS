import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DeliveryRoutesService } from './delivery-routes.service';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';

@Controller('delivery-routes')
@UseGuards(JwtAuthGuard)
export class DeliveryRoutesController {
  constructor(private readonly service: DeliveryRoutesService) {}

  @Post('runs')
  createRun(
    @Body()
    body: {
      businessId: string;
      routeId: string;
      date: string;
      driverUserId?: string;
      orderIds: string[];
    },
  ) {
    const { businessId, ...dto } = body;
    return this.service.createRun(businessId, dto);
  }

  @Get('runs')
  getRuns(
    @Query('businessId') businessId: string,
    @Query('routeId') routeId?: string,
    @Query('date') date?: string,
    @Query('status') status?: string,
  ) {
    return this.service.getRuns(businessId, { routeId, date, status });
  }

  @Get('runs/:id')
  getRun(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
  ) {
    return this.service.getRun(id, businessId);
  }

  @Post('runs/:id/orders')
  addOrderToRun(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthUser },
    @Body() body: { fieldOrderId: string; businessId?: string },
  ) {
    return this.service.addOrderToRun(id, req.user.businessId, body.fieldOrderId);
  }

  @Delete('run-orders/:id')
  removeOrderFromRun(
    @Param('id') id: string,
    @Req() req: Request & { user: AuthUser },
  ) {
    return this.service.removeOrderFromRun(id, req.user.businessId);
  }

  @Post('runs/:id/expenses')
  addExpense(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
    @Body()
    dto: {
      category: string;
      amountCents: number;
      description?: string;
      recordedBy: string;
    },
  ) {
    return this.service.addExpense(id, businessId, dto);
  }

  @Patch('runs/:id/complete')
  markComplete(
    @Param('id') id: string,
    @Body() body: { businessId: string },
  ) {
    return this.service.markRunComplete(id, body.businessId);
  }

  @Post('run-orders/:id/proof')
  captureProof(
    @Param('id') id: string,
    @Body()
    dto: {
      signatureBase64?: string;
      receivedByName: string;
      latitude?: number;
      longitude?: number;
      photoUrl?: string;
      notes?: string;
    },
  ) {
    return this.service.captureProof(id, dto);
  }

  @Get('profitability')
  getRouteProfitability(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.service.getRouteProfitability(businessId, { startDate, endDate });
  }
}

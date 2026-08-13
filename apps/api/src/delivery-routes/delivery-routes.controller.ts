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

type AuthedRequest = Request & { user: AuthUser };

@Controller('delivery-routes')
@UseGuards(JwtAuthGuard)
export class DeliveryRoutesController {
  constructor(private readonly service: DeliveryRoutesService) {}

  @Post('runs')
  createRun(
    @Req() req: AuthedRequest,
    @Body()
    body: {
      businessId?: string;
      routeId: string;
      date: string;
      driverUserId?: string;
      orderIds: string[];
    },
  ) {
    const { businessId: _ignored, ...dto } = body;
    return this.service.createRun(req.user.businessId, dto);
  }

  @Get('runs')
  getRuns(
    @Req() req: AuthedRequest,
    @Query('routeId') routeId?: string,
    @Query('date') date?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('status') status?: string,
  ) {
    return this.service.getRuns(req.user.businessId, {
      routeId,
      date,
      startDate,
      endDate,
      status,
    });
  }

  @Get('runs/:id')
  getRun(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.service.getRun(id, req.user.businessId);
  }

  @Post('runs/:id/orders')
  addOrderToRun(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Body() body: { fieldOrderId: string; businessId?: string },
  ) {
    return this.service.addOrderToRun(id, req.user.businessId, body.fieldOrderId);
  }

  @Delete('run-orders/:id')
  removeOrderFromRun(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.service.removeOrderFromRun(id, req.user.businessId);
  }

  @Post('runs/:id/expenses')
  addExpense(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
    @Body()
    dto: {
      category: string;
      amountCents: number;
      description?: string;
      recordedBy?: string;
    },
  ) {
    // Clients don't send recordedBy — the expense belongs to whoever is logged in.
    return this.service.addExpense(id, req.user.businessId, {
      ...dto,
      recordedBy: req.user.id,
    });
  }

  @Patch('runs/:id/complete')
  markComplete(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.service.markRunComplete(id, req.user.businessId);
  }

  @Post('run-orders/:id/proof')
  captureProof(
    @Param('id') id: string,
    @Req() req: AuthedRequest,
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
    return this.service.captureProof(id, req.user.businessId, dto);
  }

  @Get('profitability')
  getRouteProfitability(
    @Req() req: AuthedRequest,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string,
  ) {
    return this.service.getRouteProfitability(req.user.businessId, {
      startDate,
      endDate,
    });
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Public } from '../auth/jwt-auth.guard';
import { PortalAuthGuard } from './portal-auth.guard';
import { CustomerPortalService } from './customer-portal.service';

@Controller('portal')
@Public() // Exempt entire controller from the global JwtAuthGuard
export class CustomerPortalController {
  constructor(private readonly service: CustomerPortalService) {}

  // ─── Public auth routes ───────────────────────────────────────────────────

  @Post('auth/request-otp')
  requestOtp(
    @Body() body: { phone: string; businessId: string },
  ) {
    return this.service.requestOtp(body.phone, body.businessId);
  }

  @Post('auth/verify-otp')
  verifyOtp(
    @Body() body: { phone: string; otp: string; businessId: string },
  ) {
    return this.service.verifyOtp(body.phone, body.otp, body.businessId);
  }

  // ─── Protected portal routes (PortalAuthGuard) ────────────────────────────

  @Get('orders')
  @UseGuards(PortalAuthGuard)
  getOrders(@Request() req: { portalCustomerId: string }) {
    return this.service.getPortalOrders(req.portalCustomerId);
  }

  @Get('statement')
  @UseGuards(PortalAuthGuard)
  getStatement(@Request() req: { portalCustomerId: string }) {
    return this.service.getPortalStatement(req.portalCustomerId);
  }

  @Post('pay')
  @UseGuards(PortalAuthGuard)
  requestPayment(
    @Request() req: { portalCustomerId: string },
    @Body() body: { fieldOrderId: string; method: 'STK_PUSH' | 'PAYBILL' },
  ) {
    return this.service.requestPayment(
      req.portalCustomerId,
      body.fieldOrderId,
      body.method,
    );
  }

  @Post('reorder')
  @UseGuards(PortalAuthGuard)
  requestReorder(
    @Request() req: { portalCustomerId: string },
    @Body() body: { fieldOrderId: string },
  ) {
    return this.service.requestReorder(req.portalCustomerId, body.fieldOrderId);
  }
}

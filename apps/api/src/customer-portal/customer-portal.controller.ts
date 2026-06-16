import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  Request,
} from '@nestjs/common';
import { Public } from '../auth/jwt-auth.guard';
import { PortalAuthGuard } from './portal-auth.guard';
import { CustomerPortalService } from './customer-portal.service';

/**
 * Authenticated self-service customer portal. Auth routes are public; everything
 * else sits under /portal/me/* (PortalAuthGuard) — the /me/ prefix also avoids
 * colliding with the anonymous PortalController's /portal/orders route.
 */
@Controller('portal')
@Public() // Exempt entire controller from the global JwtAuthGuard
export class CustomerPortalController {
  constructor(private readonly service: CustomerPortalService) {}

  // ─── Public auth routes ───────────────────────────────────────────────────

  @Post('auth/request-otp')
  requestOtp(@Body() body: { phone: string; businessId: string; name?: string }) {
    return this.service.requestOtp(body.phone, body.businessId, body.name);
  }

  @Post('auth/verify-otp')
  verifyOtp(@Body() body: { phone: string; otp: string; businessId: string; name?: string }) {
    return this.service.verifyOtp(body.phone, body.otp, body.businessId, body.name);
  }

  // ─── Protected portal routes (PortalAuthGuard) ────────────────────────────

  @Get('me')
  @UseGuards(PortalAuthGuard)
  getProfile(@Request() req: { portalCustomerId: string }) {
    return this.service.getProfile(req.portalCustomerId);
  }

  @Get('me/orders')
  @UseGuards(PortalAuthGuard)
  getOrders(@Request() req: { portalCustomerId: string }) {
    return this.service.getPortalOrders(req.portalCustomerId);
  }

  @Get('me/orders/:id')
  @UseGuards(PortalAuthGuard)
  getOrder(@Request() req: { portalCustomerId: string }, @Param('id') id: string) {
    return this.service.getPortalOrder(req.portalCustomerId, id);
  }

  @Get('me/statement')
  @UseGuards(PortalAuthGuard)
  getStatement(@Request() req: { portalCustomerId: string }) {
    return this.service.getPortalStatement(req.portalCustomerId);
  }

  @Post('me/pay')
  @UseGuards(PortalAuthGuard)
  requestPayment(
    @Request() req: { portalCustomerId: string },
    @Body() body: { fieldOrderId: string; method: 'STK_PUSH' | 'PAYBILL' },
  ) {
    return this.service.requestPayment(req.portalCustomerId, body.fieldOrderId, body.method);
  }

  @Post('me/reorder')
  @UseGuards(PortalAuthGuard)
  requestReorder(
    @Request() req: { portalCustomerId: string },
    @Body() body: { fieldOrderId: string },
  ) {
    return this.service.requestReorder(req.portalCustomerId, body.fieldOrderId);
  }
}

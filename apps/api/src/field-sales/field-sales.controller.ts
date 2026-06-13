import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  Request,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { FieldSalesService } from './field-sales.service';

@Controller('field-sales')
@UseGuards(JwtAuthGuard)
export class FieldSalesController {
  constructor(private readonly service: FieldSalesService) {}

  // ─── Routes ───────────────────────────────────────────────────────────────

  @Get('routes')
  getRoutes(@Query('businessId') businessId: string) {
    return this.service.getRoutes(businessId);
  }

  @Post('routes')
  createRoute(
    @Body()
    body: {
      businessId: string;
      name: string;
      branchId?: string;
      deliveryDays: string[];
      driverUserId?: string;
      color?: string;
    },
  ) {
    const { businessId, ...dto } = body;
    return this.service.createRoute(businessId, dto);
  }

  @Patch('routes/:id')
  updateRoute(
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      branchId?: string;
      deliveryDays?: string[];
      driverUserId?: string;
      color?: string;
      isActive?: boolean;
    },
  ) {
    return this.service.updateRoute(id, dto);
  }

  @Delete('routes/:id')
  deleteRoute(@Param('id') id: string) {
    return this.service.deleteRoute(id);
  }

  // ─── Customers ────────────────────────────────────────────────────────────

  @Get('customers')
  getCustomers(
    @Query('businessId') businessId: string,
    @Query('agentId') agentId: string,
    @Query('search') search?: string,
  ) {
    return this.service.getAgentCustomers(agentId, businessId, search);
  }

  @Post('customers')
  registerCustomer(
    @Body()
    body: {
      agentId: string;
      businessId: string;
      name: string;
      phone: string;
      kraPin?: string;
      shopType?: string;
      gpsLat?: number;
      gpsLng?: number;
      routeId?: string;
      creditLimitCents?: number;
      offlineId?: string;
    },
  ) {
    const { agentId, businessId, ...dto } = body;
    return this.service.registerCustomer(agentId, businessId, dto);
  }

  @Patch('customers/:id/route')
  updateCustomerRoute(
    @Param('id') id: string,
    @Body() body: { routeId: string },
  ) {
    return this.service.updateCustomerRoute(id, body.routeId);
  }

  @Get('customers/:id/history')
  getCustomerHistory(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
    @Query('agentId') agentId: string,
  ) {
    return this.service.getCustomerOrderHistory(id, agentId, businessId);
  }

  // ─── Field Orders ─────────────────────────────────────────────────────────

  @Post('orders')
  createOrder(
    @Body()
    body: {
      agentId: string;
      businessId: string;
      customerId: string;
      routeId?: string;
      items: {
        itemId?: string;
        itemName: string;
        itemSku?: string;
        quantity: number;
        unitPriceCents: number;
        isSample?: boolean;
      }[];
      notes?: string;
      isSampleOrder?: boolean;
      offlineId?: string;
    },
  ) {
    const { agentId, businessId, ...dto } = body;
    return this.service.createFieldOrder(agentId, businessId, dto);
  }

  @Get('orders')
  getOrders(
    @Query('businessId') businessId: string,
    @Query('agentId') agentId?: string,
    @Query('status') status?: string,
    @Query('routeId') routeId?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
  ) {
    return this.service.getFieldOrders(businessId, {
      agentId,
      status,
      routeId,
      startDate,
      endDate,
    });
  }

  @Get('orders/:id')
  getOrder(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
  ) {
    return this.service.getFieldOrder(id, businessId);
  }

  @Patch('orders/:id/status')
  updateOrderStatus(
    @Param('id') id: string,
    @Body()
    body: {
      businessId: string;
      status: string;
      rejectionReason?: string;
      expectedDeliveryDate?: string;
      packedBy?: string;
    },
  ) {
    const { businessId, status, ...extra } = body;
    return this.service.updateFieldOrderStatus(id, businessId, status, extra);
  }

  // ─── Credit Requests ──────────────────────────────────────────────────────

  @Post('credit-requests')
  requestCredit(
    @Body()
    body: {
      businessId: string;
      customerId: string;
      fieldOrderId?: string;
      requestedBy: string;
      currentLimitCents: number;
      requestedLimitCents: number;
      orderTotalCents: number;
      reason?: string;
    },
  ) {
    const { businessId, ...dto } = body;
    return this.service.requestCreditIncrease(businessId, dto);
  }

  @Get('credit-requests')
  getCreditRequests(
    @Query('businessId') businessId: string,
    @Query('status') status?: string,
  ) {
    return this.service.getPendingCreditRequests(businessId, status);
  }

  @Patch('credit-requests/:id/review')
  reviewCredit(
    @Param('id') id: string,
    @Body() body: { reviewedBy: string; status: 'APPROVED' | 'DECLINED'; reviewNote?: string },
  ) {
    const { reviewedBy, ...dto } = body;
    return this.service.reviewCreditRequest(id, reviewedBy, dto);
  }

  // ─── Agent Stats ──────────────────────────────────────────────────────────

  @Get('agent-stats')
  getAgentStats(
    @Query('agentId') agentId: string,
    @Query('businessId') businessId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.service.getAgentStats(
      agentId,
      businessId,
      parseInt(month, 10),
      parseInt(year, 10),
    );
  }

  // ─── Payment Collection ──────────────────────────────────────────────────

  @Post('orders/:id/collect-payment')
  collectPayment(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
    @Body() body: { amountCents: number; method: string; reference?: string; collectedBy: string; offlineId?: string },
  ) {
    return this.service.collectPayment(id, businessId, body);
  }

  // ─── Visit Log ───────────────────────────────────────────────────────────

  @Post('customers/:id/visits')
  logVisit(
    @Param('id') customerId: string,
    @Query('businessId') businessId: string,
    @Body() body: { agentId: string; outcome: string; notes?: string; fieldOrderId?: string; gpsLat?: number; gpsLng?: number },
  ) {
    const { agentId, ...dto } = body;
    return this.service.logVisit(agentId, businessId, customerId, dto);
  }

  @Get('customers/:id/visits')
  getVisits(
    @Param('id') customerId: string,
    @Query('businessId') businessId: string,
  ) {
    return this.service.getVisits(customerId, businessId);
  }

  // ─── Call Plan ───────────────────────────────────────────────────────────

  @Get('call-plan')
  getCallPlan(
    @Query('agentId') agentId: string,
    @Query('businessId') businessId: string,
  ) {
    return this.service.getCallPlan(agentId, businessId);
  }

  // ─── Credit Collection ───────────────────────────────────────────────────

  @Get('credit-collection')
  getCreditCollection(
    @Query('agentId') agentId: string,
    @Query('businessId') businessId: string,
  ) {
    return this.service.getCreditCollection(agentId, businessId);
  }

  // ─── Leaderboard ─────────────────────────────────────────────────────────

  @Get('leaderboard')
  getLeaderboard(
    @Query('businessId') businessId: string,
    @Query('month') month: string,
    @Query('year') year: string,
  ) {
    return this.service.getLeaderboard(businessId, parseInt(month, 10), parseInt(year, 10));
  }

  // ─── Partial Invoice (by delivered quantity) ──────────────────────────────

  @Post('orders/:id/generate-partial-invoice')
  generatePartialInvoice(
    @Param('id') id: string,
    @Body('businessId') businessId: string,
  ) {
    return this.service.generatePartialInvoice(id, businessId);
  }

  // ─── Bulk Generate Invoices ───────────────────────────────────────────────

  @Post('orders/bulk-generate-invoices')
  bulkGenerateInvoices(@Body('businessId') businessId: string) {
    return this.service.bulkGenerateInvoices(businessId);
  }

  // ─── Generate Invoice ─────────────────────────────────────────────────────

  @Post('orders/:id/generate-invoice')
  generateInvoice(
    @Param('id') id: string,
    @Body('businessId') businessId: string,
  ) {
    return this.service.generateInvoice(id, businessId);
  }

  // ─── Delivery Note ────────────────────────────────────────────────────────

  @Get('orders/:id/delivery-note')
  getDeliveryNote(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
  ) {
    return this.service.getDeliveryNote(id, businessId);
  }
}

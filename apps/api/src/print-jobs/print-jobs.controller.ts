import { Body, Controller, Get, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.service';
import { PrintJobsService, type CompleteDto, type EnqueueDto, type LogDto } from './print-jobs.service';

type AuthedRequest = Request & { user: AuthUser };

const actorOf = (req: AuthedRequest) => ({ id: req.user.id, businessId: req.user.businessId, role: String(req.user.role) });

@UseGuards(JwtAuthGuard)
@Controller('print-jobs')
export class PrintJobsController {
  constructor(private jobs: PrintJobsService) {}

  /** Queue bytes for a LAN printer. Delivered at once when this server can reach it, else by a print bridge. */
  @Post()
  enqueue(@Body() dto: EnqueueDto, @Req() req: AuthedRequest) {
    return this.jobs.enqueue(dto, actorOf(req));
  }

  /** Record a print the till made itself (browser dialog, USB, Bluetooth, installed printer). */
  @Post('log')
  log(@Body() dto: LogDto, @Req() req: AuthedRequest) {
    return this.jobs.log(dto, actorOf(req));
  }

  @Post('receipt-copy')
  receiptCopy(@Body() body: { saleId: string }, @Req() req: AuthedRequest) {
    return this.jobs.nextReceiptCopy(body?.saleId, actorOf(req));
  }

  @Get()
  list(@Query('storeId') storeId: string, @Query('status') status: string | undefined, @Query('limit') limit: string | undefined, @Req() req: AuthedRequest) {
    return this.jobs.list(storeId, status, limit ? Number(limit) : undefined, actorOf(req));
  }

  @Get('summary')
  summary(@Query('storeId') storeId: string, @Query('days') days: string | undefined, @Req() req: AuthedRequest) {
    return this.jobs.summary(storeId, days ? Number(days) : undefined, actorOf(req));
  }

  @Post(':id/retry')
  retry(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.jobs.retry(id, actorOf(req));
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.jobs.cancel(id, actorOf(req));
  }

  // Print bridge endpoints
  @Post('claim')
  claim(@Body() body: { storeId: string; bridgeId: string; limit?: number }, @Req() req: AuthedRequest) {
    return this.jobs.claim(body?.storeId, body?.bridgeId, body?.limit, actorOf(req));
  }

  @Post(':id/result')
  result(@Param('id') id: string, @Body() body: CompleteDto & { bridgeId: string }, @Req() req: AuthedRequest) {
    return this.jobs.complete(id, body, body?.bridgeId, actorOf(req));
  }
}

import { Controller, Post, Get, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { KdpaService } from './kdpa.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@Controller('kdpa')
export class KdpaController {
  constructor(private kdpaService: KdpaService) {}

  /** Any user can submit a deletion request on behalf of a customer */
  @Post('requests')
  @UseGuards(JwtAuthGuard)
  async createRequest(@Body() data: {
    businessId: string;
    requestedBy: string;
    customerId?: string;
    reason?: string;
  }) {
    return this.kdpaService.createRequest(data);
  }

  /** Owners/managers list requests */
  @Get('requests')
  @UseGuards(JwtAuthGuard)
  async getRequests(
    @Query('businessId') businessId: string,
    @Query('status') status?: string,
  ) {
    return this.kdpaService.getRequests(businessId, status);
  }

  /** Owner approves or rejects */
  @Patch('requests/:id')
  @UseGuards(JwtAuthGuard)
  async reviewRequest(
    @Param('id') id: string,
    @Body() body: { action: 'APPROVED' | 'REJECTED'; reviewedBy: string; reviewNotes?: string },
  ) {
    return this.kdpaService.reviewRequest(id, body.action, body.reviewedBy, body.reviewNotes);
  }
}

import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
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
} from '@nestjs/common';
import { FranchiseService } from './franchise.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@UseGuards(JwtAuthGuard, TenantGuard)
@RequiresFeature(Feature.FRANCHISE)
@Controller('franchise')
export class FranchiseController {
  constructor(private svc: FranchiseService) {}

  @Get('network')
  getNetwork(@Query('businessId') businessId: string) {
    return this.svc.getNetwork(businessId);
  }

  @Get('dashboard')
  getDashboard(@Query('businessId') businessId: string) {
    return this.svc.getDashboard(businessId);
  }

  @Get('settings')
  getSettings(@Query('businessId') businessId: string) {
    return this.svc.getSettings(businessId);
  }

  @Patch('settings')
  updateSettings(
    @Body()
    body: {
      businessId: string;
      franchiseFee: number;
      royaltyRate: number;
    },
  ) {
    return this.svc.updateSettings(body.businessId, body.franchiseFee, body.royaltyRate);
  }

  @Post('link')
  linkFranchisee(
    @Body()
    body: {
      franchiseeId: string;
      parentBusinessId: string;
      franchiseFee: number;
      royaltyRate: number;
    },
  ) {
    return this.svc.linkFranchisee(
      body.franchiseeId,
      body.parentBusinessId,
      body.franchiseFee,
      body.royaltyRate,
    );
  }

  @Delete('link/:franchiseeId')
  unlinkFranchisee(@Param('franchiseeId') franchiseeId: string) {
    return this.svc.unlinkFranchisee(franchiseeId);
  }
}

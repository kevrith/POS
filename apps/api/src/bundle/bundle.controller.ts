import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Put, Body, Param, Query, UseGuards } from '@nestjs/common';
import { BundleService } from './bundle.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@RequiresFeature(Feature.BUNDLES)
@Controller('bundle')
@UseGuards(JwtAuthGuard, TenantGuard)
export class BundleController {
  constructor(private bundleService: BundleService) {}

  @Get()
  findAll(@Query('businessId') businessId: string) {
    return this.bundleService.findAll(businessId);
  }

  @Post()
  create(
    @Query('businessId') businessId: string,
    @Body() body: { bundleItemId: string; components: Array<{ itemId: string; quantity: number }> },
  ) {
    return this.bundleService.create(businessId, body);
  }

  @Put(':itemId/components')
  replaceComponents(
    @Param('itemId') itemId: string,
    @Query('businessId') businessId: string,
    @Body() body: { components: Array<{ itemId: string; quantity: number }> },
  ) {
    return this.bundleService.replaceComponents(itemId, businessId, body.components);
  }
}

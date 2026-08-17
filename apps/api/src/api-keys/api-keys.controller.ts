import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Delete, Patch, Body, Param, Query, UseGuards } from '@nestjs/common';
import { ApiKeysService } from './api-keys.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@RequiresFeature(Feature.API_KEYS)
@Controller('api-keys')
@UseGuards(JwtAuthGuard)
export class ApiKeysController {
  constructor(private apiKeys: ApiKeysService) {}

  @Get()
  list(@Query('businessId') businessId: string) {
    return this.apiKeys.listKeys(businessId);
  }

  @Post()
  create(
    @Body() body: { businessId: string; name: string; scopes: string[]; ipWhitelist?: string },
  ) {
    return this.apiKeys.createKey(body.businessId, body);
  }

  @Patch(':id/revoke')
  revoke(@Param('id') id: string, @Query('businessId') businessId: string) {
    return this.apiKeys.revokeKey(id, businessId);
  }

  @Delete(':id')
  delete(@Param('id') id: string, @Query('businessId') businessId: string) {
    return this.apiKeys.deleteKey(id, businessId);
  }
}

import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PharmacyService } from './pharmacy.service';

@UseGuards(JwtAuthGuard)
@RequiresFeature(Feature.PHARMACY)
@Controller('pharmacy')
export class PharmacyController {
  constructor(private svc: PharmacyService) {}

  // Drug Interactions
  @Get('interactions')
  getInteractions(@Query('businessId') businessId: string) {
    return this.svc.getInteractions(businessId);
  }

  @Post('interactions')
  createInteraction(@Body() dto: any) {
    return this.svc.createInteraction(dto);
  }

  @Delete('interactions/:id')
  deleteInteraction(@Param('id') id: string) {
    return this.svc.deleteInteraction(id);
  }

  // Insurance Providers
  @Get('providers')
  getProviders(@Query('businessId') businessId: string) {
    return this.svc.getProviders(businessId);
  }

  @Post('providers')
  createProvider(@Body() dto: any) {
    return this.svc.createProvider(dto);
  }

  @Patch('providers/:id')
  updateProvider(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateProvider(id, dto);
  }

  // Claims
  @Get('claims')
  getClaims(@Query('businessId') businessId: string, @Query('status') status?: string) {
    return this.svc.getClaims(businessId, status);
  }

  @Get('claims/stats')
  getClaimStats(@Query('businessId') businessId: string) {
    return this.svc.getClaimStats(businessId);
  }

  @Post('claims')
  createClaim(@Body() dto: any) {
    return this.svc.createClaim(dto);
  }

  @Patch('claims/:id')
  updateClaim(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateClaim(id, dto);
  }

  // Drug Catalogue
  @Get('drugs')
  getDrugs(@Query('businessId') businessId: string, @Query('search') search?: string) {
    return this.svc.getDrugs(businessId, search);
  }

  @Post('drugs')
  createDrug(@Body() dto: any) {
    return this.svc.createDrug(dto);
  }

  @Patch('drugs/:id')
  updateDrug(@Param('id') id: string, @Body() dto: any) {
    return this.svc.updateDrug(id, dto);
  }

  @Delete('drugs/:id')
  deleteDrug(@Param('id') id: string) {
    return this.svc.deleteDrug(id);
  }

  @Get('formulary')
  getFormulary(@Query('businessId') businessId: string, @Query('search') search?: string) {
    return this.svc.getFormulary(businessId, search);
  }

  @Post('formulary')
  createFormularyEntry(@Body() dto: any) {
    const { businessId, ...rest } = dto;
    return this.svc.createFormularyEntry(businessId, rest);
  }

  @Delete('formulary/:id')
  deleteFormularyEntry(@Param('id') id: string) {
    return this.svc.deleteFormularyEntry(id);
  }
}

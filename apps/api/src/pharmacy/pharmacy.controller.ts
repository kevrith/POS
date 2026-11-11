import { Feature } from '@pos/shared';
import { RequiresFeature } from '../auth/subscription.guard';
import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import type { AuthUser } from '../auth/auth.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PharmacyService } from './pharmacy.service';
import type { DrugInput } from './drug-data';

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
  updateClaim(@Param('id') id: string, @Body() dto: any, @Req() req: Request & { user: AuthUser }) {
    return this.svc.updateClaim(id, req.user.businessId, dto);
  }

  /** A manager loads the starter interactions and drug limits. What is already there is left alone. */
  @Post('starter-data')
  loadStarterData(@Req() req: Request & { user: AuthUser }) {
    return this.svc.loadStarterData(req.user.businessId);
  }

  // The drug list (what used to be two lists, the drug catalogue and the formulary).
  @Get('drugs')
  getDrugs(@Query('businessId') businessId: string, @Query('search') search?: string) {
    return this.svc.getDrugs(businessId, search);
  }

  @Post('drugs')
  createDrug(@Body() dto: DrugInput & { businessId?: string }, @Req() req: Request & { user: AuthUser }) {
    return this.svc.createDrug(req.user.businessId, dto ?? {});
  }

  @Patch('drugs/:id')
  updateDrug(@Param('id') id: string, @Body() dto: DrugInput, @Req() req: Request & { user: AuthUser }) {
    return this.svc.updateDrug(id, req.user.businessId, dto ?? {});
  }

  @Delete('drugs/:id')
  deleteDrug(@Param('id') id: string, @Req() req: Request & { user: AuthUser }) {
    return this.svc.deleteDrug(id, req.user.businessId);
  }
}

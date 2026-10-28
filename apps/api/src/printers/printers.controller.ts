import { Controller, Get, Post, Patch, Delete, Body, Param, Query, Req, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { PrintersService } from './printers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/auth.service';

type AuthedRequest = Request & { user: AuthUser };

@UseGuards(JwtAuthGuard)
@Controller('printers')
export class PrintersController {
  constructor(private printersService: PrintersService) {}

  @Get()
  async getPrinters(@Query('storeId') storeId: string, @Req() req: AuthedRequest) {
    return this.printersService.getPrinters(storeId, req.user.businessId);
  }

  @Post()
  async createPrinter(
    @Body()
    dto: {
      storeId: string;
      name: string;
      connectionType: string;
      connectionDetails?: string;
      isDefault?: boolean;
      handles: string[];
    },
    @Req() req: AuthedRequest,
  ) {
    return this.printersService.createPrinter(dto, req.user.businessId);
  }

  @Patch(':id')
  async updatePrinter(
    @Param('id') id: string,
    @Body()
    dto: {
      name?: string;
      connectionType?: string;
      connectionDetails?: string;
      isDefault?: boolean;
      handles?: string[];
    },
    @Req() req: AuthedRequest,
  ) {
    return this.printersService.updatePrinter(id, dto, req.user.businessId);
  }

  @Delete(':id')
  async deletePrinter(@Param('id') id: string, @Req() req: AuthedRequest) {
    return this.printersService.deletePrinter(id, req.user.businessId);
  }

  @Post(':id/print')
  async printToNetwork(@Param('id') id: string, @Body() body: { data: string }, @Req() req: AuthedRequest) {
    return this.printersService.printToNetwork(id, body?.data, req.user.businessId);
  }
}

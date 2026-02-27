import { Controller, Get, Post, Patch, Delete, Body, Param, Query, UseGuards } from '@nestjs/common';
import { PrintersService } from './printers.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('printers')
export class PrintersController {
  constructor(private printersService: PrintersService) {}

  @Get()
  async getPrinters(@Query('storeId') storeId: string) {
    return this.printersService.getPrinters(storeId);
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
  ) {
    return this.printersService.createPrinter(dto);
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
  ) {
    return this.printersService.updatePrinter(id, dto);
  }

  @Delete(':id')
  async deletePrinter(@Param('id') id: string) {
    return this.printersService.deletePrinter(id);
  }
}

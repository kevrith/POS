import { Controller, Get, Post, Delete, Param, Body, Query, UseGuards } from '@nestjs/common';
import { BudgetService } from './budget.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { TenantGuard } from '../auth/tenant.guard';

@UseGuards(JwtAuthGuard, TenantGuard)
@Controller('budgets')
export class BudgetController {
  constructor(private budgetService: BudgetService) {}

  @Get()
  async getBudgets(
    @Query('businessId') businessId: string,
    @Query('year') year: string,
    @Query('month') month?: string,
  ) {
    return this.budgetService.getBudgets(
      businessId,
      parseInt(year) || new Date().getFullYear(),
      month !== undefined ? parseInt(month) : undefined,
    );
  }

  @Get('vs-actual')
  async getBudgetVsActual(
    @Query('businessId') businessId: string,
    @Query('year') year: string,
    @Query('month') month: string,
  ) {
    return this.budgetService.getBudgetVsActual(
      businessId,
      parseInt(year) || new Date().getFullYear(),
      parseInt(month) || new Date().getMonth() + 1,
    );
  }

  @Post()
  async upsertBudget(
    @Body()
    dto: {
      businessId: string;
      category: string;
      amountCents: number;
      month: number;
      year: number;
    },
  ) {
    return this.budgetService.upsertBudget(dto);
  }

  @Delete(':id')
  async deleteBudget(
    @Param('id') id: string,
    @Query('businessId') businessId: string,
  ) {
    return this.budgetService.deleteBudget(id, businessId);
  }
}

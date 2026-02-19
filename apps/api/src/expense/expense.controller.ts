import { Controller, Post, Get, Patch, Body, Param, Query } from '@nestjs/common';
import { ExpenseService } from './expense.service';

@Controller('expenses')
export class ExpenseController {
  constructor(private expenseService: ExpenseService) {}

  @Post()
  async create(@Body() data: {
    offlineId: string;
    businessId: string;
    storeId: string;
    amountCents: number;
    category: string;
    description: string;
    paidBy: string;
    submittedBy: string;
    receiptPhotoUrl?: string;
    isRecurring?: boolean;
    recurringDay?: number;
    cashDrawerSessionId?: string;
  }) {
    return this.expenseService.create(data);
  }

  @Get()
  async findAll(
    @Query('businessId') businessId: string,
    @Query('category') category?: string,
    @Query('startDate') startDate?: string,
    @Query('endDate') endDate?: string,
    @Query('approvalStatus') approvalStatus?: string
  ) {
    return this.expenseService.findAll(businessId, {
      category,
      startDate: startDate ? new Date(startDate) : undefined,
      endDate: endDate ? new Date(endDate) : undefined,
      approvalStatus,
    });
  }

  @Patch(':id/approve')
  async approve(@Param('id') id: string, @Body('approvedBy') approvedBy: string) {
    return this.expenseService.approve(id, approvedBy);
  }

  @Patch(':id/reject')
  async reject(@Param('id') id: string, @Body('approvedBy') approvedBy: string) {
    return this.expenseService.reject(id, approvedBy);
  }

  @Get('summary/by-category')
  async getTotalByCategory(
    @Query('businessId') businessId: string,
    @Query('startDate') startDate: string,
    @Query('endDate') endDate: string
  ) {
    return this.expenseService.getTotalByCategory(
      businessId,
      new Date(startDate),
      new Date(endDate)
    );
  }
}

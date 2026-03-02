import {
  Controller,
  Post,
  Get,
  Patch,
  Body,
  Param,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
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

  // ── Recurring Expenses ────────────────────────────────────────────────────────

  @Get('recurring')
  async getRecurring(@Query('businessId') businessId: string) {
    return this.expenseService.getRecurringExpenses(businessId);
  }

  @Post('recurring/check')
  async checkRecurring(@Body('businessId') businessId: string) {
    await this.expenseService.checkRecurringDue(businessId);
    return { success: true };
  }

  // ── Receipt Photo Upload ──────────────────────────────────────────────────────

  @Post('upload-receipt')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './public/uploads/receipts',
      filename: (req, file, cb) => {
        cb(null, `${Date.now()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`);
      },
    }),
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) cb(null, true);
      else cb(new Error('Only images allowed'), false);
    },
  }))
  uploadReceipt(@UploadedFile() file: any) {
    const url = `/uploads/receipts/${file.filename}`;
    return { url };
  }
}

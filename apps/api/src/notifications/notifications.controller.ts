import { Controller, Post, Get, Patch, Delete, Body, Param, Query } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  async getNotifications(
    @Query('businessId') businessId: string,
    @Query('unreadOnly') unreadOnly?: string,
  ) {
    return this.notificationsService.getNotifications(businessId, unreadOnly === 'true');
  }

  @Get('unread-count')
  async getUnreadCount(@Query('businessId') businessId: string) {
    const count = await this.notificationsService.getUnreadCount(businessId);
    return { count };
  }

  @Patch(':id/read')
  async markRead(@Param('id') id: string) {
    return this.notificationsService.markRead(id);
  }

  @Post('mark-all-read')
  async markAllRead(@Body('businessId') businessId: string) {
    return this.notificationsService.markAllRead(businessId);
  }

  @Delete(':id')
  async deleteNotification(@Param('id') id: string) {
    return this.notificationsService.deleteNotification(id);
  }

  @Post()
  async createNotification(@Body() data: {
    businessId: string;
    type: string;
    priority?: string;
    title: string;
    body: string;
    entityId?: string;
    entityType?: string;
  }) {
    return this.notificationsService.createNotification(data);
  }

  // ─── Messaging endpoints ──────────────────────────────────────────────────

  @Post('send-receipt')
  async sendReceipt(@Body() data: {
    businessId: string;
    phone: string;
    receiptNumber: string;
    totalCents: number;
    channel?: 'sms' | 'whatsapp';
  }) {
    if (data.channel === 'whatsapp') {
      return this.notificationsService.sendReceiptWhatsApp(data.businessId, data.phone, data.receiptNumber, data.totalCents);
    }
    return this.notificationsService.sendReceiptSMS(data.businessId, data.phone, data.receiptNumber, data.totalCents);
  }

  @Post('sms')
  async sendSMS(@Body() data: { businessId: string; phone: string; message: string }) {
    return this.notificationsService.sendSMS(data.businessId, data.phone, data.message);
  }

  @Post('whatsapp')
  async sendWhatsApp(@Body() data: { businessId: string; phone: string; message: string }) {
    return this.notificationsService.sendWhatsApp(data.businessId, data.phone, data.message);
  }

  @Post('loyalty-points')
  async sendLoyaltyPointsSMS(@Body() data: { businessId: string; phone: string; points: number; balance: number }) {
    return this.notificationsService.sendLoyaltyPointsSMS(data.businessId, data.phone, data.points, data.balance);
  }

  @Post('promotion')
  async sendPromotionSMS(@Body() data: { businessId: string; phone: string; promotionName: string; discount: string }) {
    return this.notificationsService.sendPromotionSMS(data.businessId, data.phone, data.promotionName, data.discount);
  }
}

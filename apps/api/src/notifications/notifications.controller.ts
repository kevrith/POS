import { Controller, Post, Body } from '@nestjs/common';
import { NotificationsService } from './notifications.service';

@Controller('notifications')
export class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Post('sms')
  async sendSMS(@Body() data: { phone: string; message: string }) {
    return this.notificationsService.sendSMS(data.phone, data.message);
  }

  @Post('email')
  async sendEmail(@Body() data: { to: string; subject: string; body: string }) {
    return this.notificationsService.sendEmail(data.to, data.subject, data.body);
  }

  @Post('whatsapp')
  async sendWhatsApp(@Body() data: { phone: string; message: string }) {
    return this.notificationsService.sendWhatsApp(data.phone, data.message);
  }

  @Post('receipt')
  async sendReceiptSMS(@Body() data: {
    phone: string;
    receiptNumber: string;
    totalCents: number;
  }) {
    return this.notificationsService.sendReceiptSMS(
      data.phone,
      data.receiptNumber,
      data.totalCents
    );
  }

  @Post('loyalty-points')
  async sendLoyaltyPointsSMS(@Body() data: {
    phone: string;
    points: number;
    balance: number;
  }) {
    return this.notificationsService.sendLoyaltyPointsSMS(data.phone, data.points, data.balance);
  }

  @Post('promotion')
  async sendPromotionSMS(@Body() data: {
    phone: string;
    promotionName: string;
    discount: string;
  }) {
    return this.notificationsService.sendPromotionSMS(
      data.phone,
      data.promotionName,
      data.discount
    );
  }
}

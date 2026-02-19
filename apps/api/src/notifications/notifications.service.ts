import { Injectable } from '@nestjs/common';

@Injectable()
export class NotificationsService {
  async sendSMS(phone: string, message: string) {
    // Africa's Talking integration
    return { success: true, messageId: 'SMS-' + Date.now() };
  }

  async sendEmail(to: string, subject: string, body: string) {
    // Resend integration
    return { success: true, messageId: 'EMAIL-' + Date.now() };
  }

  async sendWhatsApp(phone: string, message: string) {
    // Africa's Talking WhatsApp integration
    return { success: true, messageId: 'WA-' + Date.now() };
  }

  async sendReceiptSMS(phone: string, receiptNumber: string, totalCents: number) {
    const message = `Thank you for your purchase! Receipt: ${receiptNumber}, Total: KES ${(totalCents / 100).toFixed(2)}`;
    return this.sendSMS(phone, message);
  }

  async sendLoyaltyPointsSMS(phone: string, points: number, balance: number) {
    const message = `You earned ${points} loyalty points! Your balance: ${balance} points`;
    return this.sendSMS(phone, message);
  }

  async sendPromotionSMS(phone: string, promotionName: string, discount: string) {
    const message = `Special offer: ${promotionName}! Get ${discount} off. Visit us today!`;
    return this.sendSMS(phone, message);
  }

  async sendLayawayReminderSMS(phone: string, remainingCents: number, dueDate: Date) {
    const message = `Layaway reminder: KES ${(remainingCents / 100).toFixed(2)} remaining. Due: ${dueDate.toLocaleDateString()}`;
    return this.sendSMS(phone, message);
  }

  async sendCreditReminderSMS(phone: string, balanceCents: number) {
    const message = `Credit balance reminder: KES ${(balanceCents / 100).toFixed(2)} outstanding`;
    return this.sendSMS(phone, message);
  }
}

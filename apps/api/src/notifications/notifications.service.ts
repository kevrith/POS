import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EventsGateway } from '../events/events.gateway';
import { createDecipheriv } from 'crypto';

@Injectable()
export class NotificationsService {
  constructor(
    private prisma: PrismaService,
    private events: EventsGateway,
  ) {}

  // ─── AT Credentials ─────────────────────────────────────────────────────────

  private decryptAtCredentials(encrypted: string): { apiKey: string; username: string; senderId?: string } | null {
    try {
      const algorithm = 'aes-256-cbc';
      const key = Buffer.from(process.env.ENCRYPTION_KEY ?? '0'.repeat(64), 'hex');
      const parts = encrypted.split(':');
      const iv = Buffer.from(parts.shift()!, 'hex');
      const encryptedText = Buffer.from(parts.join(':'), 'hex');
      const decipher = createDecipheriv(algorithm, key, iv);
      const decrypted = Buffer.concat([decipher.update(encryptedText), decipher.final()]);
      return JSON.parse(decrypted.toString());
    } catch {
      return null;
    }
  }

  private async getAtInstance(businessId: string) {
    if (!businessId) return null;
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { atCredentialsEncrypted: true },
    });
    if (!business?.atCredentialsEncrypted) return null;
    const creds = this.decryptAtCredentials(business.atCredentialsEncrypted);
    if (!creds) return null;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const AfricasTalking = require('africastalking');
    const at = AfricasTalking({ apiKey: creds.apiKey, username: creds.username });
    return { at, creds };
  }

  // ─── In-App Notifications ─────────────────────────────────────────────────

  async createNotification(data: {
    businessId: string;
    type: string;
    priority?: string;
    title: string;
    body: string;
    entityId?: string;
    entityType?: string;
  }) {
    const notification = await this.prisma.notification.create({
      data: { ...data, priority: data.priority ?? 'NORMAL' },
    });
    // Push real-time event to all staff connected to this business
    this.events.emitNotificationCreated(data.businessId, {
      id: notification.id,
      type: notification.type,
      priority: notification.priority,
      title: notification.title,
      body: notification.body,
      entityId: notification.entityId,
      entityType: notification.entityType,
      isRead: notification.isRead,
      createdAt: notification.createdAt,
    });
    return notification;
  }

  async getNotifications(businessId: string, unreadOnly?: boolean, type?: string) {
    return this.prisma.notification.findMany({
      where: {
        businessId,
        ...(unreadOnly ? { isRead: false } : {}),
        ...(type ? { type } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
  }

  async markRead(id: string) {
    return this.prisma.notification.update({ where: { id }, data: { isRead: true } });
  }

  async markAllRead(businessId: string) {
    return this.prisma.notification.updateMany({
      where: { businessId, isRead: false },
      data: { isRead: true },
    });
  }

  async getUnreadCount(businessId: string) {
    return this.prisma.notification.count({ where: { businessId, isRead: false } });
  }

  async deleteNotification(id: string) {
    return this.prisma.notification.delete({ where: { id } });
  }

  // ─── Automated notification triggers ─────────────────────────────────────

  async notifyLowStock(businessId: string, itemName: string, currentStock: number, itemId?: string) {
    return this.createNotification({
      businessId,
      type: 'LOW_STOCK',
      priority: 'HIGH',
      title: 'Low Stock Alert',
      body: `${itemName} is running low (${currentStock} remaining).`,
      entityId: itemId,
      entityType: 'Item',
    });
  }

  async notifyExpiringSoon(businessId: string, itemName: string, daysLeft: number, batchId?: string) {
    return this.createNotification({
      businessId,
      type: 'EXPIRY_ALERT',
      priority: daysLeft <= 7 ? 'HIGH' : 'NORMAL',
      title: 'Expiry Alert',
      body: `${itemName} expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}.`,
      entityId: batchId,
      entityType: 'Batch',
    });
  }

  async notifyEtimsFailure(businessId: string, receiptNumber: string, saleId?: string) {
    return this.createNotification({
      businessId,
      type: 'ETIMS_FAILED',
      priority: 'HIGH',
      title: 'eTIMS Submission Failed',
      body: `Receipt ${receiptNumber} could not be submitted to KRA. Will retry when online.`,
      entityId: saleId,
      entityType: 'Sale',
    });
  }

  async notifyCreditOverdue(businessId: string, customerName: string, balanceCents: number, customerId?: string) {
    return this.createNotification({
      businessId,
      type: 'CREDIT_OVERDUE',
      priority: 'NORMAL',
      title: 'Credit Balance Outstanding',
      body: `${customerName} has KES ${(balanceCents / 100).toFixed(2)} outstanding.`,
      entityId: customerId,
      entityType: 'Customer',
    });
  }

  async notifyExpenseApproval(businessId: string, amount: number, category: string, expenseId?: string) {
    return this.createNotification({
      businessId,
      type: 'EXPENSE_APPROVAL',
      priority: 'NORMAL',
      title: 'Expense Awaiting Approval',
      body: `KES ${(amount / 100).toFixed(2)} ${category} expense requires manager approval.`,
      entityId: expenseId,
      entityType: 'Expense',
    });
  }

  async notifyCommissionMilestone(businessId: string, employeeId: string, employeeName: string, pct: number) {
    await this.prisma.notification.create({
      data: {
        businessId,
        type: 'COMMISSION_MILESTONE',
        priority: 'LOW',
        title: `Commission Milestone: ${employeeName}`,
        body: `${employeeName} has achieved ${pct}% of their commission target this month.`,
        entityId: employeeId,
        entityType: 'Employee',
      },
    });
  }

  async notifyCashDiscrepancy(businessId: string, storeId: string, varianceCents: number, cashierId: string) {
    const sign = varianceCents > 0 ? '+' : '';
    await this.prisma.notification.create({
      data: {
        businessId,
        type: 'CASH_DISCREPANCY',
        priority: 'HIGH',
        title: 'Cash Drawer Discrepancy',
        body: `Cash drawer closed with variance of ${sign}KES ${(Math.abs(varianceCents) / 100).toFixed(2)}. Please review.`,
        entityId: storeId,
        entityType: 'Store',
      },
    });
  }

  async notifyBatchRecall(businessId: string, batchId: string, itemName: string, affectedCount: number) {
    await this.prisma.notification.create({
      data: {
        businessId,
        type: 'BATCH_RECALL',
        priority: 'HIGH',
        title: `Batch Recall: ${itemName}`,
        body: `Batch has been recalled. ${affectedCount} unit(s) of ${itemName} affected. Please remove from shelves immediately.`,
        entityId: batchId,
        entityType: 'Batch',
      },
    });
  }

  // ─── SMS / WhatsApp via Africa's Talking ──────────────────────────────────

  async sendSMS(businessId: string, phone: string, message: string) {
    const instance = await this.getAtInstance(businessId);
    if (!instance) {
      console.warn('[AT] Africa\'s Talking not configured for business', businessId);
      return { success: false, error: 'Messaging not configured' };
    }
    try {
      const result = await instance.at.SMS.send({ to: [phone], message });
      const recipient = result?.SMSMessageData?.Recipients?.[0];
      return { success: recipient?.status === 'Success', messageId: recipient?.messageId };
    } catch (err: any) {
      console.error('[AT] SMS send failed:', err?.message);
      return { success: false, error: err?.message };
    }
  }

  async sendWhatsApp(businessId: string, phone: string, message: string) {
    // Africa's Talking WhatsApp channel (if enabled on account)
    const instance = await this.getAtInstance(businessId);
    if (!instance) {
      return { success: false, error: 'Messaging not configured' };
    }
    try {
      // Use SMS as fallback since AT WhatsApp requires special business account approval
      const result = await instance.at.SMS.send({
        to: [phone],
        message,
        ...(instance.creds.senderId ? { from: instance.creds.senderId } : {}),
      });
      const recipient = result?.SMSMessageData?.Recipients?.[0];
      return { success: recipient?.status === 'Success', messageId: recipient?.messageId };
    } catch (err: any) {
      console.error('[AT] WhatsApp/SMS send failed:', err?.message);
      return { success: false, error: err?.message };
    }
  }

  async sendReceiptSMS(businessId: string, phone: string, receiptNumber: string, totalCents: number) {
    const message = `Thank you for shopping with us!\nReceipt: ${receiptNumber}\nTotal: KES ${(totalCents / 100).toFixed(2)}\nPowered by KASTRA POS`;
    return this.sendSMS(businessId, phone, message);
  }

  async sendReceiptWhatsApp(businessId: string, phone: string, receiptNumber: string, totalCents: number) {
    const message = `*Thank you for your purchase!*\n\nReceipt No: ${receiptNumber}\nTotal: KES ${(totalCents / 100).toFixed(2)}\n\n_Powered by KASTRA POS_`;
    return this.sendWhatsApp(businessId, phone, message);
  }

  async sendLoyaltyPointsSMS(businessId: string, phone: string, points: number, balance: number) {
    const message = `You earned ${points} loyalty points! Your balance is now ${balance} points.`;
    return this.sendSMS(businessId, phone, message);
  }

  async sendPromotionSMS(businessId: string, phone: string, promotionName: string, discount: string) {
    return this.sendSMS(businessId, phone, `Special offer: ${promotionName}! Get ${discount} off.`);
  }

  async sendLayawayReminderSMS(businessId: string, phone: string, remainingCents: number, dueDate: Date) {
    return this.sendSMS(businessId, phone, `Layaway reminder: KES ${(remainingCents / 100).toFixed(2)} remaining. Due: ${dueDate.toLocaleDateString()}`);
  }

  async sendCreditReminderSMS(businessId: string, phone: string, balanceCents: number) {
    return this.sendSMS(businessId, phone, `Credit balance outstanding: KES ${(balanceCents / 100).toFixed(2)}. Please clear your balance.`);
  }
}

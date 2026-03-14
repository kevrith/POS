import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class ChannelManagerService {
  constructor(private prisma: PrismaService) {}

  async receiveWebhook(channel: string, payload: any, businessId: string, storeId: string) {
    // Parse channel-specific payload
    const data: any = {
      businessId,
      storeId,
      channel: channel.toUpperCase(),
      externalId: payload.id || payload.booking_id || payload.confirmation_code || String(Date.now()),
      guestName: payload.guest?.name || payload.guestName || 'Unknown',
      guestEmail: payload.guest?.email || payload.guestEmail,
      guestPhone: payload.guest?.phone || payload.guestPhone,
      roomNumber: payload.room?.number || payload.roomNumber,
      checkInDate: new Date(payload.check_in || payload.checkIn || payload.checkInDate),
      checkOutDate: new Date(payload.check_out || payload.checkOut || payload.checkOutDate),
      nightCount: payload.nights || payload.nightCount || 1,
      totalAmountCents: Math.round((payload.total || 0) * 100),
      commissionCents: Math.round((payload.commission || 0) * 100),
      status: payload.status?.toUpperCase() || 'CONFIRMED',
      rawPayload: JSON.stringify(payload),
    };

    return this.prisma.channelBooking.upsert({
      where: { businessId_channel_externalId: { businessId, channel: data.channel, externalId: data.externalId } },
      create: data,
      update: { status: data.status, rawPayload: data.rawPayload },
    });
  }

  async list(businessId: string, status?: string) {
    return this.prisma.channelBooking.findMany({
      where: { businessId, ...(status ? { status } : {}) },
      orderBy: { checkInDate: 'asc' },
    });
  }

  async assignRoom(id: string, roomBookingId: string) {
    return this.prisma.channelBooking.update({
      where: { id },
      data: { roomBookingId, status: 'CHECKED_IN' },
    });
  }

  async updateStatus(id: string, status: string) {
    return this.prisma.channelBooking.update({ where: { id }, data: { status } });
  }

  async syncFromChannel(businessId: string, channel: string) {
    // Mock sync — returns simulated bookings from channel
    return {
      channel: channel.toUpperCase(),
      synced: 0,
      message: `Sync triggered for ${channel}. Connect channel API credentials in Settings > Integrations to enable live sync.`,
    };
  }
}

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class HotelService {
  constructor(private prisma: PrismaService) {}

  async getRooms(businessId: string, status?: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { businessId, type: 'HOTEL', isActive: true },
    });
    if (!integration) return { rooms: [], message: 'Hotel integration not configured' };
    try {
      const config = JSON.parse(integration.config);
      const url = `${config.baseUrl}/api/rooms${status ? `?status=${status}` : ''}`;
      const response = await fetch(url, {
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      });
      if (!response.ok) return { rooms: [], message: 'Hotel API error' };
      return response.json();
    } catch {
      return { rooms: [], message: 'Cannot connect to hotel system' };
    }
  }

  async recordRoomCharge(
    businessId: string,
    roomNumber: string,
    saleId: string,
    amountCents: number,
  ) {
    const integration = await this.prisma.integration.findFirst({
      where: { businessId, type: 'HOTEL', isActive: true },
    });
    if (!integration) return { success: false, message: 'Hotel integration not configured' };
    try {
      const config = JSON.parse(integration.config);
      const response = await fetch(`${config.baseUrl}/api/room-charges`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roomNumber,
          saleId,
          amountCents,
          timestamp: new Date().toISOString(),
        }),
      });
      return { success: response.ok, status: response.status };
    } catch (e) {
      return { success: false, message: String(e) };
    }
  }

  async pushMenu(businessId: string) {
    const integration = await this.prisma.integration.findFirst({
      where: { businessId, type: 'HOTEL', isActive: true },
    });
    if (!integration) return { success: false, message: 'Hotel integration not configured' };
    const items = await this.prisma.item.findMany({
      where: { businessId, deletedAt: null },
      select: {
        id: true,
        name: true,
        retailPriceCents: true,
        category: true,
        type: true,
      },
    });
    try {
      const config = JSON.parse(integration.config);
      const response = await fetch(`${config.baseUrl}/api/menu`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      return { success: response.ok, itemCount: items.length };
    } catch (e) {
      return { success: false, message: String(e) };
    }
  }
}

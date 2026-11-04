import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { hasHotelAccess, hasRestaurantAccess } from '@pos/shared';
import type { AuthUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';

/** The parts of /hospitality that belong to a restaurant, bar or kitchen. */
const RESTAURANT_AREAS = new Set([
  'tables', 'orders', 'kitchen', 'kds', 'kot', 'reservations', 'bar-tabs', 'happy-hours', 'revpash', 'waitlist',
]);

/** The parts that belong to a hotel. */
const HOTEL_AREAS = new Set([
  'hotel-rooms', 'room-bookings', 'folio-charges', 'housekeeping', 'housekeeping-assignments', 'hotel-dashboard',
]);

const CACHE_MS = 15_000;

interface Access { restaurant: boolean; hotel: boolean; at: number }

/**
 * Restaurant and hotel routes belong to restaurants and hotels.
 *
 * The plan gate only asks "has this business paid for hospitality features?",
 * which a supermarket or a pharmacy on the same plan also has. This asks the
 * other question: is the restaurant (or the hotel) turned on for this business,
 * either because its till is that kind of till or because the owner enabled the
 * module next to a different main till.
 */
@Injectable()
export class HospitalityAccessGuard implements CanActivate {
  private cache = new Map<string, Access>();

  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const parts = req.path.split('/').filter(Boolean);
    const area = parts[parts.indexOf('hospitality') + 1];
    const needsRestaurant = !!area && RESTAURANT_AREAS.has(area);
    const needsHotel = !!area && HOTEL_AREAS.has(area);
    if (!needsRestaurant && !needsHotel) return true;

    const businessId = req.user?.businessId;
    if (!businessId) return false;

    const access = await this.accessFor(businessId);
    if (needsRestaurant && !access.restaurant) {
      throw new ForbiddenException(
        'Tables and kitchen tickets are not switched on for this business. Enable the Restaurant module in Settings.',
      );
    }
    if (needsHotel && !access.hotel) {
      throw new ForbiddenException(
        'Rooms and bookings are not switched on for this business. Enable the Hotel module in Settings.',
      );
    }
    return true;
  }

  private async accessFor(businessId: string): Promise<Access> {
    const hit = this.cache.get(businessId);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit;

    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { posMode: true, enabledModules: true },
    });
    const access: Access = {
      restaurant: !!business && hasRestaurantAccess(business.posMode, business.enabledModules),
      hotel: !!business && hasHotelAccess(business.posMode, business.enabledModules),
      at: Date.now(),
    };
    this.cache.set(businessId, access);
    return access;
  }
}

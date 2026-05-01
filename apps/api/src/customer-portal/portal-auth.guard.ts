import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class PortalAuthGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers['authorization'] as string | undefined;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Missing portal session token');
    }

    const rawToken = authHeader.slice(7).trim();
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');

    const session = await this.prisma.customerPortalSession.findUnique({
      where: { sessionToken: tokenHash },
      include: { customer: { select: { id: true, name: true, businessId: true } } },
    });

    if (!session) {
      throw new UnauthorizedException('Invalid portal session token');
    }

    if (new Date() > session.expiresAt) {
      throw new UnauthorizedException('Portal session has expired');
    }

    // Attach customerId to request for controllers to use
    request.portalCustomerId = session.customerId;
    request.portalCustomer = session.customer;

    return true;
  }
}

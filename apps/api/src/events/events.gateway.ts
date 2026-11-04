import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';

@Injectable()
@WebSocketGateway({
  cors: { origin: '*', credentials: false },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);
  private readonly jwt = new JwtService({
    secret: process.env.JWT_SECRET ?? 'dev-secret-change-in-production',
  });

  /**
   * A socket may only listen to the business its token belongs to.
   *
   * This used to accept whatever businessId the client asked to join, so anyone
   * who could reach the server could subscribe to another business's sales and
   * kitchen tickets. The room is now taken from the verified token and the
   * client's request is ignored.
   */
  handleConnection(client: Socket) {
    const token = (client.handshake.auth as { token?: string } | undefined)?.token;
    try {
      const payload = this.jwt.verify<{ businessId?: string }>(token ?? '');
      if (!payload.businessId) throw new Error('token has no business');
      (client.data as { businessId?: string }).businessId = payload.businessId;
    } catch {
      this.logger.warn(`Rejected unauthenticated socket ${client.id}`);
      client.disconnect(true);
      return;
    }
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /** Client joins a business room to receive its events */
  @SubscribeMessage('join_business')
  handleJoinBusiness(
    @ConnectedSocket() client: Socket,
    @MessageBody() _data: { businessId: string },
  ) {
    const businessId = (client.data as { businessId?: string }).businessId;
    if (businessId) {
      void client.join(`business:${businessId}`);
      client.emit('joined', { room: `business:${businessId}` });
    }
  }

  // ─── Emit helpers (called by services) ───────────────────────────────────────

  emitSaleCreated(businessId: string, payload: Record<string, unknown>) {
    this.server.to(`business:${businessId}`).emit('sale_created', payload);
  }

  emitInventoryUpdated(businessId: string, payload: Record<string, unknown>) {
    this.server.to(`business:${businessId}`).emit('inventory_updated', payload);
  }

  emitTableUpdated(businessId: string, payload: Record<string, unknown>) {
    this.server.to(`business:${businessId}`).emit('table_updated', payload);
  }

  emitKotCreated(businessId: string, payload: Record<string, unknown>) {
    this.server.to(`business:${businessId}`).emit('kot_created', payload);
  }

  /** A ticket changed state (started, ready, served, recalled or cancelled). */
  emitKotUpdated(businessId: string, payload: Record<string, unknown>) {
    this.server.to(`business:${businessId}`).emit('kot_updated', payload);
  }

  /** A line was removed after it was sent; the kitchen must be told. */
  emitKotVoided(businessId: string, payload: Record<string, unknown>) {
    this.server.to(`business:${businessId}`).emit('kot_voided', payload);
  }

  emitOrderUpdated(businessId: string, payload: Record<string, unknown>) {
    this.server.to(`business:${businessId}`).emit('order_updated', payload);
  }

  emitDeliveryUpdated(businessId: string, payload: Record<string, unknown>) {
    this.server.to(`business:${businessId}`).emit('delivery_updated', payload);
  }

  emitNotificationCreated(businessId: string, payload: Record<string, unknown>) {
    this.server.to(`business:${businessId}`).emit('notification_created', payload);
  }

  emitC2BPaymentReceived(businessId: string, payload: Record<string, unknown>) {
    this.server.to(`business:${businessId}`).emit('mpesa_c2b_payment', payload);
  }

  emitCyberCallAttendant(businessId: string, payload: Record<string, unknown>) {
    this.server.to(`business:${businessId}`).emit('cyber_call_attendant', payload);
  }
}

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

@Injectable()
@WebSocketGateway({
  cors: { origin: '*', credentials: false },
  namespace: '/',
})
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(EventsGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`Client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected: ${client.id}`);
  }

  /** Client joins a business room to receive its events */
  @SubscribeMessage('join_business')
  handleJoinBusiness(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { businessId: string },
  ) {
    if (data?.businessId) {
      void client.join(`business:${data.businessId}`);
      client.emit('joined', { room: `business:${data.businessId}` });
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
}

/**
 * Socket.IO client for real-time LAN sync across POS terminals.
 * Connects to the NestJS WebSocket gateway for live updates.
 */
import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3010';

let socket: Socket | null = null;
let currentBusinessId: string | null = null;

export function connectSocket(token: string, businessId: string): void {
  if (socket?.connected && currentBusinessId === businessId) return;

  // Disconnect previous connection
  if (socket) socket.disconnect();

  currentBusinessId = businessId;

  socket = io(WS_URL, {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionDelay: 2000,
    reconnectionAttempts: 10,
  });

  socket.on('connect', () => {
    console.log('[Socket] Connected:', socket?.id);
    // Join the business room to receive its events
    socket?.emit('join_business', { businessId });
  });

  socket.on('joined', (data: { room: string }) => {
    console.log('[Socket] Joined room:', data.room);
  });

  socket.on('disconnect', (reason) => {
    console.log('[Socket] Disconnected:', reason);
  });

  socket.on('connect_error', (err) => {
    console.warn('[Socket] Connection error:', err.message);
  });
}

export function disconnectSocket(): void {
  if (socket) {
    // Remove all listeners before disconnecting so the "closed before
    // established" warning from React StrictMode double-effect doesn't spam.
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
    currentBusinessId = null;
  }
}

type EventHandler = (data: Record<string, unknown>) => void;

/**
 * Subscribe to a business event.
 * Returns an unsubscribe function.
 */
export function subscribeToEvent(event: string, handler: EventHandler): () => void {
  if (!socket) return () => {};
  socket.on(event, handler);
  return () => {
    socket?.off(event, handler);
  };
}

export function isConnected(): boolean {
  return socket?.connected ?? false;
}

// Named events for type safety
export const SocketEvents = {
  SALE_CREATED: 'sale_created',
  INVENTORY_UPDATED: 'inventory_updated',
  TABLE_UPDATED: 'table_updated',
  KOT_CREATED: 'kot_created',
  ORDER_UPDATED: 'order_updated',
  DELIVERY_UPDATED: 'delivery_updated',
  NOTIFICATION_CREATED: 'notification_created',
  MPESA_C2B_PAYMENT: 'mpesa_c2b_payment',
  CYBER_CALL_ATTENDANT: 'cyber_call_attendant',
} as const;

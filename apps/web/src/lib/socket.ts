/**
 * Socket.IO client for real-time LAN sync across POS terminals.
 * Connects to the NestJS WebSocket gateway for live updates.
 */
import { io, Socket } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_API_URL?.replace('/api/v1', '') ?? 'http://localhost:3010';

type EventHandler = (data: Record<string, unknown>) => void;

let socket: Socket | null = null;
let currentBusinessId: string | null = null;

/**
 * Every subscription ever made, kept apart from the socket itself. Components subscribe the moment they mount, but the
 * socket is opened a moment later (and is replaced on reconnect-with-new-business / sign-out and in), so a handler
 * attached straight to `socket` was silently dropped when none existed yet, or lost when it was replaced.
 */
const handlers = new Map<string, Set<EventHandler>>();

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

  // Hand the new socket every subscription made so far, including those made before it existed.
  for (const [event, set] of handlers) for (const h of set) socket.on(event, h);
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

/**
 * Subscribe to a business event.
 * Returns an unsubscribe function.
 */
export function subscribeToEvent(event: string, handler: EventHandler): () => void {
  let set = handlers.get(event);
  if (!set) handlers.set(event, (set = new Set()));
  set.add(handler);
  socket?.on(event, handler);
  return () => {
    set.delete(handler);
    if (set.size === 0) handlers.delete(event);
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
  KOT_UPDATED: 'kot_updated',
  KOT_VOIDED: 'kot_voided',
  ORDER_UPDATED: 'order_updated',
  DELIVERY_UPDATED: 'delivery_updated',
  NOTIFICATION_CREATED: 'notification_created',
  MPESA_C2B_PAYMENT: 'mpesa_c2b_payment',
  CYBER_CALL_ATTENDANT: 'cyber_call_attendant',
} as const;

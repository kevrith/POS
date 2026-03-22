/**
 * FuelPumpGateway — WebSocket gateway + TCP pump controller bridge.
 *
 * Architecture:
 *   POS Browser ←─WebSocket─→ NestJS Gateway ←─TCP─→ Pump Controller
 *
 * The NestJS server runs on the same LAN as the pump controller.
 * The browser connects via WebSocket (no raw TCP from browser needed).
 *
 * Supported protocols over TCP:
 *   - Gilbarco Veeder-Root (GVR) ASCII, default port 10001
 *   - Wayne Dresser ASCII, default port 10002
 *   - IFSF/Tokheim ASCII, default port 5555
 *   - Generic NTML (Northern Telecom/Microcat) port 3000
 *
 * Message types (client → server):
 *   { type: 'tcp_connect',    host, port, protocol, businessId, storeId }
 *   { type: 'tcp_disconnect', businessId, storeId }
 *   { type: 'authorize',      pumpId, pumpNumber }
 *   { type: 'stop',           pumpId, pumpNumber }
 *   { type: 'status',         pumpNumber }
 *   { type: 'transaction',    pumpNumber }
 *
 * Message types (server → client):
 *   { type: 'connected' }
 *   { type: 'disconnected' }
 *   { type: 'pump_status',   pumpNumber, status, litresDispensed, totalCents }
 *   { type: 'transaction',   pumpNumber, litresDispensed, pricePerLitreCents, totalCents }
 *   { type: 'error',         message }
 */

import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  MessageBody,
  ConnectedSocket,
} from '@nestjs/websockets';
import { Logger } from '@nestjs/common';
import { Server, Socket } from 'socket.io';
import * as net from 'net';

export type PumpProtocol = 'GILBARCO' | 'WAYNE' | 'IFSF' | 'TOKHEIM';

interface TcpSession {
  socket: net.Socket;
  protocol: PumpProtocol;
  host: string;
  port: number;
  buffer: Buffer;
}

// One TCP connection per business+store (shared across all cashiers)
const tcpSessions = new Map<string, TcpSession>();

// ─── Frame builders ──────────────────────────────────────────────────────────

const SOH = 0x01;
const ETX = 0x03;
const STX = 0x02;

function bcc(data: Buffer): number {
  let v = 0;
  for (const b of data) v ^= b;
  return v;
}

function crc16(data: Buffer): number {
  let crc = 0xffff;
  for (const b of data) {
    crc ^= b << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1;
  }
  return crc & 0xffff;
}

function buildGilbarcoFrame(address: number, cmd: number, data: Buffer): Buffer {
  const payload = Buffer.concat([
    Buffer.from([address & 0x1f, cmd]),
    data,
    Buffer.from([ETX]),
  ]);
  return Buffer.concat([Buffer.from([SOH]), payload, Buffer.from([bcc(payload)])]);
}

function buildWayneFrame(cmd: number, data: Buffer): Buffer {
  const len = data.length + 1;
  const inner = Buffer.concat([Buffer.from([STX, len & 0xff, cmd]), data, Buffer.from([ETX])]);
  const crc = crc16(inner.slice(1, inner.length));
  return Buffer.concat([inner, Buffer.from([(crc >> 8) & 0xff, crc & 0xff])]);
}

function buildIfsfCmd(verb: string, pumpNumber: number): Buffer {
  return Buffer.from(`${verb} ${pumpNumber}\r\n`);
}

// ─── Command codes ───────────────────────────────────────────────────────────

const GVR_CMD = { AUTHORIZE: 0x41, STOP: 0x53, STATUS: 0x50, TRANSACTION: 0x54 } as const;
const WAYNE_CMD = { AUTHORIZE: 0x01, STOP: 0x02, STATUS: 0x03, TRANSACTION: 0x04 } as const;

// ─── Response parsers ────────────────────────────────────────────────────────

function parseGilbarcoStatus(raw: Buffer, pumpNumber: number) {
  const statusByte = raw[2] ?? 0x49;
  const map: Record<number, string> = { 0x49: 'IDLE', 0x41: 'AUTHORIZED', 0x44: 'DISPENSING', 0x53: 'STOPPED' };
  return { pumpNumber, status: map[statusByte] ?? 'ERROR', litresDispensed: 0, totalCents: 0 };
}

function parseGilbarcoTransaction(raw: Buffer, pumpNumber: number) {
  const text = raw.slice(2, raw.length - 2).toString('ascii');
  const litres = parseFloat(text.slice(0, 6)) / 1000;
  const pricePerLitre = parseFloat(text.slice(6, 12)) / 100;
  const total = parseFloat(text.slice(12, 20)) / 100;
  return {
    pumpNumber,
    litresDispensed: litres,
    pricePerLitreCents: Math.round(pricePerLitre * 100),
    totalCents: Math.round(total * 100),
  };
}

function parseWayneTransaction(raw: Buffer, pumpNumber: number) {
  const text = raw.slice(3, raw.length - 3).toString('ascii');
  const litres = parseFloat(text.slice(0, 6)) / 1000;
  const total = parseFloat(text.slice(6, 14)) / 100;
  return {
    pumpNumber,
    litresDispensed: litres,
    pricePerLitreCents: litres > 0 ? Math.round((total / litres) * 100) : 0,
    totalCents: Math.round(total * 100),
  };
}

function parseIfsfTransaction(raw: Buffer, pumpNumber: number) {
  // IFSF/Tokheim ASCII: "TXN <pump> <litres> <total>\r\n"
  const parts = raw.toString('ascii').trim().split(/\s+/);
  const litres = parseFloat(parts[2] ?? '0');
  const total = parseFloat(parts[3] ?? '0');
  return {
    pumpNumber,
    litresDispensed: litres,
    pricePerLitreCents: litres > 0 ? Math.round((total / litres) * 100) : 0,
    totalCents: Math.round(total * 100),
  };
}

// ─── Session key ─────────────────────────────────────────────────────────────

function sessionKey(businessId: string, storeId: string) {
  return `${businessId}:${storeId}`;
}

// ─── Gateway ─────────────────────────────────────────────────────────────────

@WebSocketGateway({ namespace: '/fuel-pump', cors: { origin: '*' } })
export class FuelPumpGateway implements OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer() server!: Server;
  private readonly logger = new Logger(FuelPumpGateway.name);

  handleConnection(client: Socket) {
    this.logger.log(`WS client connected: ${client.id}`);
  }

  handleDisconnect(client: Socket) {
    this.logger.log(`WS client disconnected: ${client.id}`);
  }

  // ── TCP connect ────────────────────────────────────────────────────────────

  @SubscribeMessage('tcp_connect')
  async handleTcpConnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { host: string; port: number; protocol: PumpProtocol; businessId: string; storeId: string },
  ) {
    const key = sessionKey(payload.businessId, payload.storeId);
    if (tcpSessions.has(key)) {
      client.emit('connected', { message: 'Already connected' });
      return;
    }

    const tcpSocket = new net.Socket();
    tcpSocket.setKeepAlive(true, 5000);
    tcpSocket.setTimeout(30000);

    const session: TcpSession = {
      socket: tcpSocket,
      protocol: payload.protocol,
      host: payload.host,
      port: payload.port,
      buffer: Buffer.alloc(0),
    };

    tcpSocket.on('data', (chunk: Buffer) => {
      session.buffer = Buffer.concat([session.buffer, chunk]);
      // Emit raw status updates to all clients watching this business+store
      this.server.emit(`pump_data:${key}`, { raw: chunk.toString('hex') });
    });

    tcpSocket.on('error', (err) => {
      this.logger.error(`TCP error [${key}]: ${err.message}`);
      client.emit('error', { message: err.message });
      tcpSessions.delete(key);
    });

    tcpSocket.on('close', () => {
      this.logger.log(`TCP closed [${key}]`);
      tcpSessions.delete(key);
      this.server.emit(`disconnected:${key}`);
    });

    tcpSocket.on('timeout', () => {
      this.logger.warn(`TCP timeout [${key}]`);
      tcpSocket.destroy();
    });

    try {
      await new Promise<void>((resolve, reject) => {
        tcpSocket.connect(payload.port, payload.host, resolve);
        tcpSocket.once('error', reject);
      });
      tcpSessions.set(key, session);
      this.logger.log(`TCP connected to ${payload.host}:${payload.port} [${payload.protocol}]`);
      client.emit('connected', { host: payload.host, port: payload.port, protocol: payload.protocol });
    } catch (err: any) {
      client.emit('error', { message: `TCP connect failed: ${err.message}` });
    }
  }

  // ── TCP disconnect ─────────────────────────────────────────────────────────

  @SubscribeMessage('tcp_disconnect')
  handleTcpDisconnect(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { businessId: string; storeId: string },
  ) {
    const key = sessionKey(payload.businessId, payload.storeId);
    const session = tcpSessions.get(key);
    if (session) {
      session.socket.destroy();
      tcpSessions.delete(key);
    }
    client.emit('disconnected');
  }

  // ── Send command and read response ─────────────────────────────────────────

  private async sendAndReceive(session: TcpSession, frame: Buffer, timeoutMs = 5000): Promise<Buffer> {
    session.buffer = Buffer.alloc(0);
    session.socket.write(frame);

    return new Promise<Buffer>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Pump controller timeout')), timeoutMs);

      const check = setInterval(() => {
        const buf = session.buffer;
        // Complete frame: contains ETX (0x03) or ends with \n for ASCII protocols
        if (buf.includes(ETX) || (buf.length > 0 && buf[buf.length - 1] === 0x0a)) {
          clearInterval(check);
          clearTimeout(timer);
          resolve(buf);
        }
      }, 50);
    });
  }

  // ── Authorize pump ─────────────────────────────────────────────────────────

  @SubscribeMessage('authorize')
  async handleAuthorize(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { businessId: string; storeId: string; pumpNumber: number },
  ) {
    const key = sessionKey(payload.businessId, payload.storeId);
    const session = tcpSessions.get(key);
    if (!session) { client.emit('error', { message: 'Not connected to pump controller' }); return; }

    const { pumpNumber } = payload;
    const pumpByte = Buffer.from([pumpNumber & 0xff]);
    let frame: Buffer;

    switch (session.protocol) {
      case 'GILBARCO': frame = buildGilbarcoFrame(0, GVR_CMD.AUTHORIZE, pumpByte); break;
      case 'WAYNE':    frame = buildWayneFrame(WAYNE_CMD.AUTHORIZE, pumpByte); break;
      default:         frame = buildIfsfCmd('AUTH', pumpNumber); break;
    }

    try {
      await this.sendAndReceive(session, frame, 4000);
      client.emit('authorized', { pumpNumber });
      this.logger.log(`Pump ${pumpNumber} authorized [${session.protocol}]`);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  // ── Stop pump ──────────────────────────────────────────────────────────────

  @SubscribeMessage('stop')
  async handleStop(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { businessId: string; storeId: string; pumpNumber: number },
  ) {
    const key = sessionKey(payload.businessId, payload.storeId);
    const session = tcpSessions.get(key);
    if (!session) { client.emit('error', { message: 'Not connected to pump controller' }); return; }

    const { pumpNumber } = payload;
    const pumpByte = Buffer.from([pumpNumber & 0xff]);
    let frame: Buffer;

    switch (session.protocol) {
      case 'GILBARCO': frame = buildGilbarcoFrame(0, GVR_CMD.STOP, pumpByte); break;
      case 'WAYNE':    frame = buildWayneFrame(WAYNE_CMD.STOP, pumpByte); break;
      default:         frame = buildIfsfCmd('STOP', pumpNumber); break;
    }

    try {
      await this.sendAndReceive(session, frame, 4000);
      client.emit('stopped', { pumpNumber });
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  // ── Poll pump status ───────────────────────────────────────────────────────

  @SubscribeMessage('status')
  async handleStatus(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { businessId: string; storeId: string; pumpNumber: number },
  ) {
    const key = sessionKey(payload.businessId, payload.storeId);
    const session = tcpSessions.get(key);
    if (!session) { client.emit('error', { message: 'Not connected' }); return; }

    const { pumpNumber } = payload;
    const pumpByte = Buffer.from([pumpNumber & 0xff]);
    let frame: Buffer;

    switch (session.protocol) {
      case 'GILBARCO': frame = buildGilbarcoFrame(0, GVR_CMD.STATUS, pumpByte); break;
      case 'WAYNE':    frame = buildWayneFrame(WAYNE_CMD.STATUS, pumpByte); break;
      default:         frame = buildIfsfCmd('STATUS', pumpNumber); break;
    }

    try {
      const raw = await this.sendAndReceive(session, frame, 3000);
      let statusPayload: any;

      if (session.protocol === 'GILBARCO') {
        statusPayload = parseGilbarcoStatus(raw, pumpNumber);
      } else if (session.protocol === 'IFSF' || session.protocol === 'TOKHEIM') {
        // ASCII: "STATUS <pump> <state>\r\n"
        const parts = raw.toString('ascii').trim().split(/\s+/);
        statusPayload = { pumpNumber, status: parts[2] ?? 'UNKNOWN', litresDispensed: 0, totalCents: 0 };
      } else {
        statusPayload = { pumpNumber, status: 'UNKNOWN', litresDispensed: 0, totalCents: 0 };
      }

      client.emit('pump_status', statusPayload);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  // ── Read transaction ───────────────────────────────────────────────────────

  @SubscribeMessage('transaction')
  async handleTransaction(
    @ConnectedSocket() client: Socket,
    @MessageBody() payload: { businessId: string; storeId: string; pumpNumber: number },
  ) {
    const key = sessionKey(payload.businessId, payload.storeId);
    const session = tcpSessions.get(key);
    if (!session) { client.emit('error', { message: 'Not connected' }); return; }

    const { pumpNumber } = payload;
    const pumpByte = Buffer.from([pumpNumber & 0xff]);
    let frame: Buffer;

    switch (session.protocol) {
      case 'GILBARCO': frame = buildGilbarcoFrame(0, GVR_CMD.TRANSACTION, pumpByte); break;
      case 'WAYNE':    frame = buildWayneFrame(WAYNE_CMD.TRANSACTION, pumpByte); break;
      default:         frame = buildIfsfCmd('TXN', pumpNumber); break;
    }

    try {
      const raw = await this.sendAndReceive(session, frame, 6000);
      let txn: any;

      if (session.protocol === 'GILBARCO') {
        txn = parseGilbarcoTransaction(raw, pumpNumber);
      } else if (session.protocol === 'WAYNE') {
        txn = parseWayneTransaction(raw, pumpNumber);
      } else {
        txn = parseIfsfTransaction(raw, pumpNumber);
      }

      client.emit('transaction', txn);
      this.logger.log(`Pump ${pumpNumber} txn: ${txn.litresDispensed}L KES ${txn.totalCents / 100}`);
    } catch (err: any) {
      client.emit('error', { message: err.message });
    }
  }

  // ── Public helper: check if store has active TCP session ───────────────────

  isConnected(businessId: string, storeId: string): boolean {
    return tcpSessions.has(sessionKey(businessId, storeId));
  }

  getTcpStatus(businessId: string, storeId: string) {
    const s = tcpSessions.get(sessionKey(businessId, storeId));
    if (!s) return null;
    return { host: s.host, port: s.port, protocol: s.protocol, connected: !s.socket.destroyed };
  }
}

import { useCallback, useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';
import { AlertTriangle, Usb, Wifi, WifiOff } from 'lucide-react';
import { Badge, Button, Card, Input, Select } from '../../components/ui';
import {
  connectPumpController, disconnectPumpController, isPumpControllerConnected,
  authorizePump as hwAuthorizePump, stopPump as hwStopPump, getPumpTransaction, isSerialAvailable,
  type PumpControllerConfig, type PumpProtocol,
} from '../../lib/fuelPumpController';
import type { Pump } from './types';

type Mode = 'serial' | 'tcp';

/**
 * The link to a pump controller, kept in the page so it survives a change of tab. A reading that comes back from the
 * controller is handed to `onReading`, which opens the sale for that pump with the litres filled in.
 *
 * Not verified against a real controller yet: Forecourt works without it, by keying in what the pump display shows.
 */
export function useControllerLink({ businessId, storeId, pumps, onReading }: { businessId: string; storeId: string; pumps: Pump[]; onReading: (pumpNumber: number, litres: number) => void }) {
  const [mode, setMode] = useState<Mode>('serial');
  const [hwConnected, setHwConnected] = useState(isPumpControllerConnected());
  const [hwProtocol, setHwProtocol] = useState<PumpProtocol>('GILBARCO');
  const [hwBusy, setHwBusy] = useState(false);
  const [hwError, setHwError] = useState('');
  const hwConfig: PumpControllerConfig = { protocol: hwProtocol };

  const [host, setHost] = useState('192.168.1.100');
  const [port, setPort] = useState('10001');
  const [tcpProtocol, setTcpProtocol] = useState<PumpProtocol>('GILBARCO');
  const [tcpConnected, setTcpConnected] = useState(false);
  const [tcpBusy, setTcpBusy] = useState(false);
  const [tcpError, setTcpError] = useState('');
  const [live, setLive] = useState<Record<number, { status: string; litresDispensed: number }>>({});
  const socketRef = useRef<Socket | null>(null);
  const onReadingRef = useRef(onReading);
  onReadingRef.current = onReading;
  const pumpsRef = useRef(pumps);
  pumpsRef.current = pumps;

  const connectSerial = async () => {
    setHwBusy(true); setHwError('');
    try { await connectPumpController(hwConfig); setHwConnected(true); }
    catch (err) { setHwError(err instanceof Error ? err.message : 'Connection failed'); }
    finally { setHwBusy(false); }
  };
  const disconnectSerial = async () => { await disconnectPumpController(); setHwConnected(false); };

  const connectTcp = useCallback(() => {
    if (socketRef.current?.connected) return;
    setTcpBusy(true); setTcpError('');
    const sock = io('/fuel-pump', { path: '/socket.io', transports: ['websocket'] });
    socketRef.current = sock;
    sock.on('connected', () => { setTcpConnected(true); setTcpBusy(false); });
    sock.on('disconnected', () => setTcpConnected(false));
    sock.on('error', (e: { message: string }) => { setTcpError(e.message); setTcpBusy(false); });
    sock.on('pump_status', (d: { pumpNumber: number; status: string; litresDispensed: number }) => setLive((p) => ({ ...p, [d.pumpNumber]: d })));
    sock.on('transaction', (d: { pumpNumber: number; litresDispensed: number }) => {
      setLive((p) => ({ ...p, [d.pumpNumber]: { status: 'IDLE', litresDispensed: d.litresDispensed } }));
      onReadingRef.current(d.pumpNumber, d.litresDispensed);
    });
    sock.emit('tcp_connect', { host, port: parseInt(port, 10), protocol: tcpProtocol, businessId, storeId });
  }, [host, port, tcpProtocol, businessId, storeId]);

  const disconnectTcp = useCallback(() => {
    socketRef.current?.emit('tcp_disconnect', { businessId, storeId });
    socketRef.current?.disconnect();
    socketRef.current = null;
    setTcpConnected(false);
  }, [businessId, storeId]);

  useEffect(() => () => { socketRef.current?.disconnect(); }, []);

  // While a pump is authorized or dispensing, ask the controller for its status every 3 seconds.
  useEffect(() => {
    if (!tcpConnected) return;
    const timer = setInterval(() => {
      for (const p of pumpsRef.current) {
        if (['AUTHORIZED', 'DISPENSING'].includes(p.status)) socketRef.current?.emit('status', { businessId, storeId, pumpNumber: p.pumpNumber });
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [tcpConnected, businessId, storeId]);

  const active = mode === 'serial' ? hwConnected : tcpConnected;

  /** Send Authorize or Stop to the controller. The server-side pump status is changed by the caller. */
  const dispatch = useCallback(async (action: 'authorize' | 'stop', pump: Pump) => {
    if (mode === 'tcp' && tcpConnected && socketRef.current) {
      socketRef.current.emit(action, { businessId, storeId, pumpNumber: pump.pumpNumber });
      if (action === 'stop') socketRef.current.emit('transaction', { businessId, storeId, pumpNumber: pump.pumpNumber });
    } else if (mode === 'serial' && hwConnected) {
      try {
        if (action === 'authorize') await hwAuthorizePump(pump.pumpNumber, hwConfig);
        else {
          await hwStopPump(pump.pumpNumber, hwConfig);
          const txn = await getPumpTransaction(pump.pumpNumber, hwConfig);
          onReadingRef.current(pump.pumpNumber, txn.litresDispensed);
        }
      } catch { /* the sale can still be keyed in by hand */ }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, tcpConnected, hwConnected, hwProtocol, businessId, storeId]);

  return {
    mode, setMode, active, dispatch, live,
    serial: { connected: hwConnected, protocol: hwProtocol, setProtocol: setHwProtocol, busy: hwBusy, error: hwError, connect: connectSerial, disconnect: disconnectSerial },
    tcp: { connected: tcpConnected, host, setHost, port, setPort, protocol: tcpProtocol, setProtocol: setTcpProtocol, busy: tcpBusy, error: tcpError, connect: connectTcp, disconnect: disconnectTcp },
  };
}

export type ControllerLink = ReturnType<typeof useControllerLink>;

export default function ControllerPanel({ link }: { link: ControllerLink }) {
  const { mode, setMode, serial, tcp } = link;
  return (
    <Card className="p-4 space-y-3">
      <div className="flex items-start gap-3 rounded-lg bg-amber-50 text-amber-900 px-3 py-2 text-sm">
        <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" aria-hidden />
        <p>Not yet tested with a real pump controller. You do not need it: attendants key in the litres from the pump display, and the shift meter check catches any litre that is missed. Only connect one if its maker has given you the protocol details.</p>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex rounded-lg border overflow-hidden text-sm" role="group" aria-label="Connection type">
          <button type="button" aria-pressed={mode === 'serial'} onClick={() => setMode('serial')} className={`flex items-center gap-1.5 px-3 h-9 ${mode === 'serial' ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}><Usb className="w-4 h-4" aria-hidden />USB / serial</button>
          <button type="button" aria-pressed={mode === 'tcp'} onClick={() => setMode('tcp')} className={`flex items-center gap-1.5 px-3 h-9 ${mode === 'tcp' ? 'bg-brand-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}><Wifi className="w-4 h-4" aria-hidden />Network</button>
        </div>
        <Badge tone={link.active ? 'success' : 'neutral'}>{link.active ? 'Connected' : 'Not connected'}</Badge>
      </div>

      {mode === 'serial' ? (
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Controller type" value={serial.protocol} disabled={serial.connected} onChange={(e) => serial.setProtocol(e.target.value as PumpProtocol)}>
            <option value="GILBARCO">Gilbarco</option><option value="WAYNE">Wayne</option><option value="TOKHEIM">Tokheim</option><option value="IFSF">IFSF</option>
          </Select>
          {serial.connected
            ? <Button variant="danger" onClick={() => void serial.disconnect()}>Disconnect</Button>
            : <Button onClick={() => void serial.connect()} loading={serial.busy} disabled={!isSerialAvailable()}>Connect</Button>}
          {!isSerialAvailable() && <span className="text-sm text-amber-800">Needs Chrome or Edge</span>}
          {serial.error && <span role="alert" className="text-sm text-red-700">{serial.error}</span>}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <Input label="Controller address" value={tcp.host} disabled={tcp.connected} onChange={(e) => tcp.setHost(e.target.value)} />
            <Input label="Port" value={tcp.port} disabled={tcp.connected} onChange={(e) => tcp.setPort(e.target.value)} className="w-28" />
            <Select label="Controller type" value={tcp.protocol} disabled={tcp.connected} onChange={(e) => tcp.setProtocol(e.target.value as PumpProtocol)}>
              <option value="GILBARCO">Gilbarco</option><option value="WAYNE">Wayne</option><option value="IFSF">IFSF / Tokheim</option>
            </Select>
            {tcp.connected
              ? <Button variant="danger" icon={<WifiOff className="w-4 h-4" />} onClick={tcp.disconnect}>Disconnect</Button>
              : <Button icon={<Wifi className="w-4 h-4" />} onClick={tcp.connect} loading={tcp.busy}>Connect</Button>}
          </div>
          {tcp.error && <p role="alert" className="text-sm text-red-700">{tcp.error}</p>}
          {Object.keys(link.live).length > 0 && (
            <div className="flex flex-wrap gap-2">{Object.entries(link.live).map(([n, s]) => <Badge key={n} tone="brand">Pump {n}: {s.status}{s.litresDispensed > 0 ? ` ${s.litresDispensed.toFixed(2)} L` : ''}</Badge>)}</div>
          )}
        </div>
      )}
    </Card>
  );
}

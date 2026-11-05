import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { BedDouble, RefreshCw, Upload, DollarSign, Wifi, WifiOff, CheckCircle, XCircle, AlertCircle } from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { formatKES } from '@pos/shared';

interface Room {
  roomNumber: string;
  guestName?: string;
  status: 'OCCUPIED' | 'VACANT' | 'MAINTENANCE';
  balanceCents?: number;
}

interface RoomChargeResponse {
  success: boolean;
  message?: string;
}

interface MenuPushResponse {
  success: boolean;
  itemsSynced?: number;
  message?: string;
}

const STATUS_CONFIG = {
  OCCUPIED:    { label: 'Occupied',    color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  VACANT:      { label: 'Vacant',      color: 'bg-gray-100 text-gray-500 border-gray-200' },
  MAINTENANCE: { label: 'Maintenance', color: 'bg-amber-100 text-amber-700 border-amber-200' },
};

export default function HotelPage() {
  const user = useAuthStore(s => s.user);
  const businessId = user?.businessId ?? '';
  const qc = useQueryClient();

  const [statusFilter, setStatusFilter] = useState('');
  const [chargeRoomNumber, setChargeRoomNumber] = useState('');
  const [chargeSaleId, setChargeSaleId] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeMsg, setChargeMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [pushMsg, setPushMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const { data: rooms, isLoading, isError, refetch } = useQuery<Room[]>({
    queryKey: ['hotel-rooms-pms', businessId, statusFilter],
    queryFn: async () => {
      const res = await api.get<Room[] | { rooms: Room[] }>(`/integrations/hotel/rooms?businessId=${businessId}${statusFilter ? `&status=${statusFilter}` : ''}`);
      return Array.isArray(res) ? res : ((res as { rooms?: Room[] }).rooms ?? []);
    },
    enabled: !!businessId,
    staleTime: 30_000,
  });

  const chargeMutation = useMutation({
    mutationFn: (body: { roomNumber: string; saleId: string; amountCents: number }) =>
      api.post<RoomChargeResponse>('/integrations/hotel/room-charge', { businessId, ...body }),
    onSuccess: (data) => {
      setChargeMsg({ type: 'ok', text: data.message ?? 'Room charge recorded.' });
      setChargeRoomNumber(''); setChargeSaleId(''); setChargeAmount('');
      void qc.invalidateQueries({ queryKey: ['hotel-rooms', businessId] });
    },
    onError: (err: Error) => setChargeMsg({ type: 'err', text: err.message }),
  });

  const pushMutation = useMutation({
    mutationFn: () => api.post<MenuPushResponse>(`/integrations/hotel/menu-push?businessId=${businessId}`, {}),
    onSuccess: (data) => setPushMsg({ type: 'ok', text: data.message ?? `Menu synced${data.itemsSynced != null ? ` (${data.itemsSynced} items)` : ''}.` }),
    onError: (err: Error) => setPushMsg({ type: 'err', text: err.message }),
  });

  function submitCharge(e: React.FormEvent) {
    e.preventDefault();
    setChargeMsg(null);
    const amountCents = Math.round(parseFloat(chargeAmount) * 100);
    if (!chargeRoomNumber || !chargeSaleId || isNaN(amountCents) || amountCents <= 0) return;
    chargeMutation.mutate({ roomNumber: chargeRoomNumber, saleId: chargeSaleId, amountCents });
  }

  const occupied = rooms?.filter(r => r.status === 'OCCUPIED').length ?? 0;
  const vacant   = rooms?.filter(r => r.status === 'VACANT').length ?? 0;
  const maintenance = rooms?.filter(r => r.status === 'MAINTENANCE').length ?? 0;

  return (
    <div className="p-3 sm:p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BedDouble className="w-6 h-6 text-blue-600" /> Hotel Integration
          </h1>
          <p className="text-sm text-gray-500 mt-1">Sync POS with your Property Management System (PMS)</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { setPushMsg(null); pushMutation.mutate(); }}
            disabled={pushMutation.isPending}
            className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            <Upload className="w-4 h-4" />
            {pushMutation.isPending ? 'Syncing…' : 'Push Menu to PMS'}
          </button>
          <button
            onClick={() => void refetch()}
            className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium hover:bg-gray-50"
          >
            <RefreshCw className="w-4 h-4" /> Refresh
          </button>
        </div>
      </div>

      {/* Push menu feedback */}
      {pushMsg && (
        <div className={`flex items-center gap-2 p-3 rounded-lg text-sm ${pushMsg.type === 'ok' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
          {pushMsg.type === 'ok' ? <CheckCircle className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
          {pushMsg.text}
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <div className="bg-white border rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-emerald-600">{occupied}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Occupied</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-gray-400">{vacant}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Vacant</div>
        </div>
        <div className="bg-white border rounded-xl p-4 text-center">
          <div className="text-3xl font-bold text-amber-500">{maintenance}</div>
          <div className="text-xs text-gray-500 mt-1 font-medium uppercase tracking-wide">Maintenance</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Rooms list */}
        <div className="lg:col-span-2 bg-white border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b flex items-center justify-between flex-wrap gap-3">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <BedDouble className="w-4 h-4 text-blue-600" /> Room Status
            </h2>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value)}
              className="text-sm border rounded-lg px-3 py-1.5 focus:ring-2 focus:ring-blue-500" aria-label="Filter by rooms">
              <option value="">All Rooms</option>
              <option value="OCCUPIED">Occupied</option>
              <option value="VACANT">Vacant</option>
              <option value="MAINTENANCE">Maintenance</option>
            </select>
          </div>

          {isLoading && (
            <div className="p-12 text-center text-gray-400 text-sm">Loading rooms…</div>
          )}
          {isError && (
            <div className="p-8 text-center">
              <WifiOff className="w-8 h-8 text-red-300 mx-auto mb-2" />
              <p className="text-sm text-red-500">Could not connect to PMS. Check your hotel integration settings.</p>
            </div>
          )}
          {!isLoading && !isError && (!rooms || rooms.length === 0) && (
            <div className="p-12 text-center">
              <Wifi className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-400">No rooms found. Make sure your PMS API URL is configured in Settings → Integrations.</p>
            </div>
          )}
          {rooms && rooms.length > 0 && (
            <div className="divide-y">
              {rooms.map(room => (
                <div key={room.roomNumber} className="flex items-center justify-between px-5 py-3 hover:bg-gray-50">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-blue-700 font-bold text-sm">
                      {room.roomNumber}
                    </div>
                    <div>
                      <div className="text-sm font-semibold text-gray-800">Room {room.roomNumber}</div>
                      {room.guestName && <div className="text-xs text-gray-500">{room.guestName}</div>}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {room.balanceCents != null && room.balanceCents > 0 && (
                      <span className="text-sm font-semibold text-gray-700">{formatKES(room.balanceCents)}</span>
                    )}
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ${STATUS_CONFIG[room.status]?.color ?? 'bg-gray-100 text-gray-500'}`}>
                      {STATUS_CONFIG[room.status]?.label ?? room.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Room charge form */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b">
            <h2 className="font-semibold text-gray-800 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-green-600" /> Post Room Charge
            </h2>
            <p className="text-xs text-gray-400 mt-1">Charge a sale to a room's PMS account</p>
          </div>
          <form onSubmit={submitCharge} className="p-5 space-y-4">
            {chargeMsg && (
              <div className={`flex items-center gap-2 p-3 rounded-lg text-xs ${chargeMsg.type === 'ok' ? 'bg-green-50 border border-green-200 text-green-700' : 'bg-red-50 border border-red-200 text-red-700'}`}>
                {chargeMsg.type === 'ok' ? <CheckCircle className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                {chargeMsg.text}
              </div>
            )}
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Room Number</label>
              <input
                type="text"
                value={chargeRoomNumber}
                onChange={e => setChargeRoomNumber(e.target.value)}
                placeholder="e.g. 204"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Sale ID</label>
              <input
                type="text"
                value={chargeSaleId}
                onChange={e => setChargeSaleId(e.target.value)}
                placeholder="Sale reference"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1.5">Amount (KES)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={chargeAmount}
                onChange={e => setChargeAmount(e.target.value)}
                placeholder="0.00"
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={chargeMutation.isPending}
              className="w-full py-2.5 bg-green-600 hover:bg-green-700 text-white font-semibold rounded-lg text-sm disabled:opacity-50"
            >
              {chargeMutation.isPending ? 'Posting…' : 'Post Charge →'}
            </button>
          </form>

          {/* Info card */}
          <div className="mx-5 mb-5 p-4 bg-blue-50 border border-blue-100 rounded-lg">
            <p className="text-xs font-semibold text-blue-700 mb-1">PMS Configuration</p>
            <p className="text-xs text-blue-600 leading-relaxed">
              Configure your hotel PMS API URL in <strong>Settings → Integrations</strong>. Supports Opera, Protel, and any REST-compatible PMS.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

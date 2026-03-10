import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Users, Clock, ChefHat, X, Trash2, Send, Receipt, RefreshCw,
  UtensilsCrossed, ArrowRight, Check, AlertCircle, Loader2,
  ArrowLeftRight, GitMerge, CalendarDays, Zap, Edit2, CheckCircle,
  BedDouble, KeyRound, LogIn, LogOut, Phone,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import PaymentModal from '../components/PaymentModal';
import { printKOT, printBill, printKOTWithRouting } from '../lib/printer';
import type { KOTData } from '../lib/printer';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Table {
  id: string;
  number: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'BILL_REQUESTED' | 'RESERVED';
  floor?: string;
  currentOrderId?: string;
  hasReadyKOT?: boolean;
  hasPendingKOT?: boolean;
  activeKOTCount?: number;
}

interface OrderItem {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  specialInstructions?: string;
  modifiers?: string | string[];
  kotSent?: boolean;
}

interface HospOrder {
  id: string;
  tableId?: string;
  status: string;
  totalCents: number;
  items: OrderItem[];
  createdAt: string;
  kots?: Array<{ id: string; status: string; type: string; createdAt: string }>;
}

interface MenuItem {
  id: string;
  name: string;
  retailPriceCents: number;
  category?: string;
  sku?: string;
}

interface Reservation {
  id: string;
  tableId: string;
  customerName: string;
  customerPhone?: string;
  partySize: number;
  reservationTime: string;
  status: string;
  notes?: string;
  table: { number: string; capacity: number };
}

interface KdsItem {
  id: string;
  kotNumber: number;
  status: string;
  createdAt: string;
  assignedChef?: { id: string; name: string } | null;
  estimatedReadyAt?: string;
  estimatedPrepMinutes?: number;
  order: {
    id: string;
    table: { number: string } | null;
    waiter?: { id: string; name: string } | null;
    items: Array<{ id: string; name: string; quantity: number; specialInstructions?: string | null }>;
  };
}

type PendingItem = {
  itemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  specialInstructions?: string;
  modifiers?: string[];
};

interface BarTab {
  id: string;
  mode: string;
  status: string;
  waiterId?: string;
  createdAt: string;
  items: Array<{ id: string; name: string; quantity: number; unitPriceCents: number; totalCents: number; modifiers?: string }>;
}

interface HotelRoom {
  id: string;
  number: string;
  type: string;
  floor?: string;
  capacity: number;
  pricePerNightCents: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'MAINTENANCE' | 'RESERVED';
  amenities?: string;
  notes?: string;
  bookings: Array<{
    id: string;
    guestName: string;
    guestPhone?: string;
    actualCheckIn?: string;
    checkOutDate?: string;
    nightCount: number;
    totalAmountCents: number;
    depositCents: number;
  }>;
}

interface RoomBooking {
  id: string;
  roomId: string;
  guestName: string;
  guestPhone?: string;
  guestIdNumber?: string;
  checkInDate: string;
  checkOutDate?: string;
  actualCheckIn?: string;
  actualCheckOut?: string;
  nightCount: number;
  pricePerNightCents: number;
  totalAmountCents: number;
  depositCents: number;
  status: string;
  notes?: string;
  room?: { number: string; type: string; floor?: string };
}

// ─── Constants ────────────────────────────────────────────────────────────────

const COMMON_MODIFIERS = [
  'Extra Spicy', 'Mild', 'No Onion', 'No Garlic', 'Well Done',
  'Medium Done', 'Rare', 'No Ice', 'Extra Sauce', 'Less Salt',
  'Gluten Free', 'Vegan', 'Extra Cheese', 'No Sugar',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (cents: number) =>
  `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function uuid(): string {
  return crypto.randomUUID();
}

type ModifierEntry = string | { name: string; priceCents?: number };

function parseModifiers(mods: string | string[] | null | undefined): string[] {
  if (!mods) return [];
  if (Array.isArray(mods)) return mods;
  try {
    const parsed = JSON.parse(mods) as ModifierEntry[];
    if (!Array.isArray(parsed)) return [];
    return parsed.map((m) => (typeof m === 'string' ? m : m.name));
  } catch { return []; }
}

function parsePricedModifiers(mods: string | string[] | null | undefined): Array<{ name: string; priceCents?: number }> {
  if (!mods) return [];
  const raw = Array.isArray(mods) ? mods : (() => { try { return JSON.parse(mods) as ModifierEntry[]; } catch { return [] as ModifierEntry[]; } })();
  if (!Array.isArray(raw)) return [];
  return raw.map((m) => (typeof m === 'string' ? { name: m } : m));
}

const TABLE_COLORS: Record<Table['status'], string> = {
  AVAILABLE:     'bg-emerald-50 border-emerald-400 text-emerald-800 hover:bg-emerald-100 shadow-emerald-100',
  OCCUPIED:      'bg-red-50 border-red-400 text-red-800 hover:bg-red-100 shadow-red-100',
  BILL_REQUESTED:'bg-amber-50 border-amber-500 text-amber-900 hover:bg-amber-100 shadow-amber-100',
  RESERVED:      'bg-blue-50 border-blue-400 text-blue-800 hover:bg-blue-100 shadow-blue-100',
};

const TABLE_DOTS: Record<Table['status'], string> = {
  AVAILABLE:     'bg-emerald-500',
  OCCUPIED:      'bg-red-500',
  BILL_REQUESTED:'bg-amber-500 animate-pulse',
  RESERVED:      'bg-blue-500',
};

const TABLE_STATUS_LABEL: Record<Table['status'], string> = {
  AVAILABLE:     'Available',
  OCCUPIED:      'Occupied',
  BILL_REQUESTED:'Bill Due',
  RESERVED:      'Reserved',
};

// ─── ItemPicker Modal ─────────────────────────────────────────────────────────

interface ItemPickerProps {
  businessId: string;
  storeId: string;
  onAdd: (item: MenuItem, qty: number, note: string, modifiers: string[]) => void;
  onClose: () => void;
}

function ItemPicker({ businessId, storeId, onAdd, onClose }: ItemPickerProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');
  const [activeMods, setActiveMods] = useState<Set<string>>(new Set());

  const { data: items = [], isLoading } = useQuery<MenuItem[]>({
    queryKey: ['menu-items', businessId, storeId],
    queryFn: () =>
      api.get<MenuItem[]>(`/items?businessId=${businessId}&storeId=${storeId}&active=true`),
    enabled: !!businessId,
  });

  const filtered = items.filter((i) =>
    i.name.toLowerCase().includes(search.toLowerCase()) ||
    (i.sku ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const grouped = filtered.reduce<Record<string, MenuItem[]>>((acc, item) => {
    const cat = item.category ?? 'Other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  function toggleMod(mod: string) {
    setActiveMods((prev) => {
      const next = new Set(prev);
      if (next.has(mod)) next.delete(mod); else next.add(mod);
      return next;
    });
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Add Items</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b">
          <input
            type="text"
            placeholder="Search menu items..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full px-4 py-2 border rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
            autoFocus
          />
        </div>

        {/* Item List */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="text-center py-12 text-gray-400">No items found</div>
          ) : (
            Object.entries(grouped).map(([cat, catItems]) => (
              <div key={cat}>
                <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">{cat}</h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {catItems.map((item) => (
                    <button
                      key={item.id}
                      onClick={() => { setSelected(item); setQty(1); setNote(''); setActiveMods(new Set()); }}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        selected?.id === item.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-800 truncate">{item.name}</div>
                      <div className="text-xs text-blue-600 font-semibold mt-1">{fmt(item.retailPriceCents)}</div>
                    </button>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Add Controls */}
        {selected && (
          <div className="border-t px-6 py-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-gray-800 truncate mr-4">{selected.name}</span>
              <span className="text-blue-600 font-bold">{fmt(selected.retailPriceCents * qty)}</span>
            </div>

            <div className="flex gap-3">
              <div className="flex items-center border rounded-xl overflow-hidden">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="px-4 py-2 text-lg font-bold text-gray-600 hover:bg-gray-100"
                >−</button>
                <span className="px-4 py-2 font-bold text-lg w-12 text-center">{qty}</span>
                <button
                  onClick={() => setQty((q) => q + 1)}
                  className="px-4 py-2 text-lg font-bold text-gray-600 hover:bg-gray-100"
                >+</button>
              </div>
              <input
                type="text"
                placeholder="Special instructions..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>

            {/* Modifier chips */}
            <div>
              <p className="text-xs text-gray-500 mb-1.5">Modifiers:</p>
              <div className="flex flex-wrap gap-1.5">
                {COMMON_MODIFIERS.map((mod) => (
                  <button
                    key={mod}
                    onClick={() => toggleMod(mod)}
                    className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-all ${
                      activeMods.has(mod)
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-600 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {activeMods.has(mod) ? '✓ ' : ''}{mod}
                  </button>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                onAdd(selected, qty, note, Array.from(activeMods));
                setSelected(null);
                setNote('');
                setQty(1);
                setActiveMods(new Set());
              }}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add {qty}× {selected.name}
              {activeMods.size > 0 && ` (+${activeMods.size} mod${activeMods.size > 1 ? 's' : ''})`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Reservations Modal ───────────────────────────────────────────────────────

interface ReservationsModalProps {
  storeId: string;
  businessId: string;
  tables: Table[];
  onClose: () => void;
  tablePrefix?: string;
}

function ReservationsModal({ storeId, businessId, tables, onClose, tablePrefix = 'T' }: ReservationsModalProps) {
  const qc = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    tableId: '',
    customerName: '',
    customerPhone: '',
    partySize: '2',
    reservationTime: '',
    notes: '',
  });

  const { data: reservations = [], isLoading } = useQuery<Reservation[]>({
    queryKey: ['reservations', storeId],
    queryFn: () => api.get<Reservation[]>(`/hospitality/reservations?storeId=${storeId}`),
    enabled: !!storeId,
  });

  const createReservation = useMutation({
    mutationFn: () =>
      api.post('/hospitality/reservations', {
        tableId: form.tableId,
        customerName: form.customerName.trim(),
        customerPhone: form.customerPhone.trim() || undefined,
        partySize: parseInt(form.partySize, 10),
        reservationTime: new Date(form.reservationTime).toISOString(),
        notes: form.notes.trim() || undefined,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['reservations'] });
      void qc.invalidateQueries({ queryKey: ['tables'] });
      setShowForm(false);
      setForm({ tableId: '', customerName: '', customerPhone: '', partySize: '2', reservationTime: '', notes: '' });
    },
  });

  // Phone-number auto-lookup — pre-fills customer name when a known number is typed
  const phoneTrimmed = form.customerPhone.replace(/\s/g, '');
  const { data: phoneMatches } = useQuery<Array<{ id: string; name: string; phone?: string }>>({
    queryKey: ['customer-phone-lookup', businessId, phoneTrimmed],
    queryFn: () => api.get(`/businesses/${businessId}/customers?search=${encodeURIComponent(phoneTrimmed)}`),
    enabled: !!businessId && phoneTrimmed.length >= 7,
    staleTime: 30_000,
  });
  const phoneSuggestion = phoneMatches?.length === 1 && !form.customerName ? phoneMatches[0] : null;

  const availableTables = tables.filter((t) => t.status === 'AVAILABLE' || t.status === 'RESERVED');

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <CalendarDays className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-bold text-gray-800">Today's Reservations</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-3">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-blue-500 animate-spin" />
            </div>
          ) : reservations.length === 0 && !showForm ? (
            <div className="text-center py-8 text-gray-400">
              <CalendarDays className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No reservations today</p>
            </div>
          ) : (
            reservations.map((res) => (
              <div key={res.id} className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-semibold text-gray-800">{res.customerName}</p>
                    <p className="text-xs text-gray-500 mt-0.5">
                      {fmtTable(res.table.number, tablePrefix)} • {res.partySize} guests
                    </p>
                    {res.customerPhone && <p className="text-xs text-gray-500">{res.customerPhone}</p>}
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold text-blue-700">
                      {new Date(res.reservationTime).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      res.status === 'CONFIRMED' ? 'bg-green-100 text-green-700' :
                      res.status === 'SEATED' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>{res.status}</span>
                  </div>
                </div>
                {res.notes && (
                  <p className="text-xs text-amber-700 mt-2 bg-amber-50 px-2 py-1 rounded">{res.notes}</p>
                )}
              </div>
            ))
          )}

          {showForm && (
            <div className="border-2 border-blue-200 rounded-xl p-4 space-y-3">
              <h3 className="font-semibold text-gray-800">New Reservation</h3>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Customer Name *</label>
                  <input
                    type="text"
                    value={form.customerName}
                    onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="John Doe"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Phone</label>
                  <input
                    type="tel"
                    value={form.customerPhone}
                    onChange={(e) => setForm((f) => ({ ...f, customerPhone: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="0712 345 678"
                  />
                  {phoneSuggestion && (
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, customerName: phoneSuggestion.name }))}
                      className="mt-1 w-full text-left px-2 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700 hover:bg-blue-100 flex items-center gap-1.5"
                    >
                      <CheckCircle className="w-3.5 h-3.5 text-blue-500 flex-shrink-0" />
                      <span>Returning guest: <strong>{phoneSuggestion.name}</strong> — tap to fill</span>
                    </button>
                  )}
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Table *</label>
                  <select
                    value={form.tableId}
                    onChange={(e) => setForm((f) => ({ ...f, tableId: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  >
                    <option value="">Select table</option>
                    {availableTables.map((t) => (
                      <option key={t.id} value={t.id}>{fmtTable(t.number, tablePrefix)} ({t.capacity} seats)</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Party Size *</label>
                  <input
                    type="number"
                    min="1"
                    value={form.partySize}
                    onChange={(e) => setForm((f) => ({ ...f, partySize: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Date & Time *</label>
                  <input
                    type="datetime-local"
                    value={form.reservationTime}
                    onChange={(e) => setForm((f) => ({ ...f, reservationTime: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div className="col-span-2">
                  <label className="block text-xs text-gray-500 mb-1">Notes</label>
                  <input
                    type="text"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    placeholder="Birthday, window seat, allergies..."
                  />
                </div>
              </div>
              {createReservation.isError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {(createReservation.error as Error).message}
                </div>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 border border-gray-300 rounded-lg text-sm text-gray-600 hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={() => createReservation.mutate()}
                  disabled={!form.customerName || !form.tableId || !form.reservationTime || createReservation.isPending}
                  className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium disabled:opacity-40"
                >
                  {createReservation.isPending ? 'Saving…' : 'Create Reservation'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="border-t p-4">
          <button
            onClick={() => setShowForm(true)}
            disabled={showForm}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-40"
          >
            <Plus className="w-4 h-4" />
            New Reservation
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Fast Food Panel ──────────────────────────────────────────────────────────

interface FastFoodPanelProps {
  businessId: string;
  storeId: string;
  userId: string;
  userName?: string;
  onClose: () => void;
}

function FastFoodPanel({ businessId, storeId, userId, userName, onClose }: FastFoodPanelProps) {
  const qc = useQueryClient();
  const [showPicker, setShowPicker] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);

  const subtotal = pendingItems.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);

  function handleAddFromPicker(item: MenuItem, qty: number, note: string, modifiers: string[]) {
    setPendingItems((prev) => {
      const existing = prev.find(
        (p) => p.itemId === item.id && !p.specialInstructions && !note && modifiers.length === 0,
      );
      if (existing) {
        return prev.map((p) => p === existing ? { ...p, quantity: p.quantity + qty } : p);
      }
      return [...prev, {
        itemId: item.id,
        name: item.name,
        quantity: qty,
        unitPriceCents: item.retailPriceCents,
        specialInstructions: note || undefined,
        modifiers: modifiers.length > 0 ? modifiers : undefined,
      }];
    });
    setShowPicker(false);
  }

  async function handlePaymentComplete(payments: Array<{ method: string; amountCents: number; reference?: string }>) {
    setIsBusy(true);
    setPayError(null);
    try {
      const order = await api.post<{ id: string }>('/hospitality/orders', {
        offlineId: uuid(),
        businessId,
        storeId,
        waiterId: userId,
      });

      await api.post(`/hospitality/orders/${order.id}/items`, { items: pendingItems });
      await api.post(`/hospitality/orders/${order.id}/kot`, { type: 'NEW_ORDER' });

      // Print KOT immediately
      const kotData: KOTData = {
        tableNumber: 'COUNTER',
        orderType: 'NEW_ORDER',
        items: pendingItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          specialInstructions: i.specialInstructions,
          modifiers: i.modifiers,
        })),
        createdAt: new Date().toISOString(),
        waiterName: userName,
      };
      printKOT(kotData);

      // Checkout
      await api.post('/sales/checkout', {
        storeId,
        businessId,
        cashierId: userId,
        type: 'NORMAL',
        priceLevel: 'RETAIL',
        orderId: order.id,
        items: pendingItems.map((i) => ({
          itemId: i.itemId,
          name: i.name,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
        })),
        payments,
        serviceChargeCents: 0,
      });

      void qc.invalidateQueries({ queryKey: ['tables'] });
      setShowPayment(false);
      setPendingItems([]);
    } catch (err) {
      setPayError(err instanceof Error ? err.message : 'Checkout failed');
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        <div className="px-5 py-4 border-b bg-amber-50">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-600" />
              <div>
                <h2 className="text-xl font-bold text-gray-800">Fast Food / Counter</h2>
                <p className="text-xs text-amber-600 mt-0.5">Pay first, then send to kitchen</p>
              </div>
            </div>
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200">
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {pendingItems.length === 0 ? (
            <div className="text-center py-12">
              <UtensilsCrossed className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400 text-sm">No items yet</p>
              <p className="text-gray-400 text-xs mt-1">Add items then take payment</p>
            </div>
          ) : (
            pendingItems.map((item, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-amber-700">{item.quantity}×</span>
                    <span className="text-sm text-amber-800 truncate">{item.name}</span>
                  </div>
                  {item.specialInstructions && (
                    <p className="text-xs text-amber-600 mt-0.5 ml-6">{item.specialInstructions}</p>
                  )}
                  {item.modifiers && item.modifiers.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1 ml-6">
                      {parsePricedModifiers(item.modifiers).map((m, mi) => (
                        <span key={mi} className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                          {m.name}{m.priceCents ? ` +KES ${(m.priceCents / 100).toFixed(2)}` : ''}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <span className="text-sm font-bold text-amber-800 whitespace-nowrap">
                  {fmt(item.unitPriceCents * item.quantity)}
                </span>
                <button
                  onClick={() => setPendingItems((prev) => prev.filter((_, i) => i !== idx))}
                  className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))
          )}
        </div>

        <div className="border-t p-5 space-y-3">
          {pendingItems.length > 0 && (
            <div className="flex justify-between text-lg font-bold text-gray-800 pb-2 border-b">
              <span>Total</span>
              <span className="text-amber-600">{fmt(subtotal)}</span>
            </div>
          )}
          <button
            onClick={() => setShowPicker(true)}
            className="w-full py-3 border-2 border-dashed border-amber-300 text-amber-600 hover:bg-amber-50 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Items
          </button>
          {pendingItems.length > 0 && (
            <button
              onClick={() => { setPayError(null); setShowPayment(true); }}
              disabled={isBusy}
              className="w-full py-3.5 bg-amber-500 hover:bg-amber-600 disabled:opacity-40 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
            >
              {isBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <ArrowRight className="w-5 h-5" />}
              Pay Now — {fmt(subtotal)}
            </button>
          )}
          {payError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {payError}
            </div>
          )}
        </div>
      </div>

      {showPicker && (
        <ItemPicker
          businessId={businessId}
          storeId={storeId}
          onAdd={handleAddFromPicker}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showPayment && (
        <PaymentModal
          totalCents={subtotal}
          onComplete={(payments) => void handlePaymentComplete(payments)}
          onCancel={() => { setShowPayment(false); setPayError(null); }}
          isProcessing={isBusy}
          error={payError}
        />
      )}
    </>
  );
}

// ─── Order Panel ──────────────────────────────────────────────────────────────

interface OrderPanelProps {
  table: Table;
  allTables: Table[];
  businessId: string;
  storeId: string;
  onClose: () => void;
  onRefresh: () => void;
  userName?: string;
  tablePrefix?: string;
}

function fmtTable(number: string, prefix: string): string {
  return /\D/.test(number) ? number : `${prefix}${number}`;
}

function OrderPanel({ table, allTables, businessId, storeId, onClose, onRefresh, userName, tablePrefix = 'T' }: OrderPanelProps) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [showPicker, setShowPicker] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [showMerge, setShowMerge] = useState(false);
  const [pendingItems, setPendingItems] = useState<PendingItem[]>([]);

  const { data: printers = [] } = useQuery<Array<{ id: string; handles: string[]; connectionType: string; connectionDetails: string }>>({
    queryKey: ['printers', storeId],
    queryFn: () => api.get(`/printers?storeId=${storeId}`),
    enabled: !!storeId,
    staleTime: 5 * 60_000,
  });

  const { data: order, isLoading: orderLoading, refetch: refetchOrder } = useQuery<HospOrder | null>({
    queryKey: ['hosp-order', table.id],
    queryFn: async () => {
      if (!table.currentOrderId) return null;
      return api.get<HospOrder>(`/hospitality/orders/${table.currentOrderId}`);
    },
    enabled: !!table.currentOrderId,
    refetchInterval: 8000,
  });

  const { data: bizSettings } = useQuery<{ name?: string; receiptHeader?: string; receiptFooter?: string; tablePrefix?: string | null }>({
    queryKey: ['biz-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 60_000,
  });

  const createOrder = useMutation({
    mutationFn: () =>
      api.post<HospOrder>('/hospitality/orders', {
        offlineId: uuid(),
        businessId,
        storeId,
        tableId: table.id,
        waiterId: user?.id ?? '',
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tables'] });
      void refetchOrder();
      onRefresh();
    },
  });

  const addItems = useMutation({
    mutationFn: (vars: { orderId: string; items: PendingItem[] }) =>
      api.post(`/hospitality/orders/${vars.orderId}/items`, { items: vars.items }),
    onSuccess: () => {
      setPendingItems([]);
      void refetchOrder();
      void qc.invalidateQueries({ queryKey: ['tables'] });
    },
  });

  const removeItem = useMutation({
    mutationFn: (vars: { orderId: string; itemId: string }) =>
      api.delete(`/hospitality/orders/${vars.orderId}/items?itemIds=${vars.itemId}`),
    onSuccess: () => void refetchOrder(),
  });

  const sendKOTMutation = useMutation({
    mutationFn: (vars: { orderId: string; type: string }) =>
      api.post(`/hospitality/orders/${vars.orderId}/kot`, { type: vars.type }),
    onSuccess: () => {
      void refetchOrder();
      void qc.invalidateQueries({ queryKey: ['kds'] });
    },
  });

  const markServedMutation = useMutation({
    mutationFn: (kotId: string) =>
      api.patch(`/hospitality/kot/${kotId}/status`, { status: 'SERVED' }),
    onSuccess: () => {
      void refetchOrder();
      void qc.invalidateQueries({ queryKey: ['kds'] });
      void qc.invalidateQueries({ queryKey: ['tables'] });
    },
  });

  const requestBill = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/hospitality/orders/${orderId}/request-bill`, {}),
    onSuccess: () => {
      void refetchOrder();
      void qc.invalidateQueries({ queryKey: ['tables'] });
      onRefresh();
      // Auto-print bill so waiter can carry it to the table
      if (activeOrder) {
        const billItems = activeOrder.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
          totalCents: i.unitPriceCents * i.quantity,
        }));
        printBill({
          tableNumber: table.number,
          businessName: bizSettings?.name ?? 'Restaurant',
          waiterName: userName,
          items: billItems,
          subtotalCents: subtotal,
          totalCents: subtotal,
          date: new Date().toISOString(),
          footer: bizSettings?.receiptFooter || undefined,
        });
      }
    },
  });

  const transferOrder = useMutation({
    mutationFn: (vars: { orderId: string; newTableId: string }) =>
      api.post(`/hospitality/orders/${vars.orderId}/transfer`, { newTableId: vars.newTableId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tables'] });
      setShowTransfer(false);
      onClose();
    },
  });

  const mergeTables = useMutation({
    mutationFn: (targetTableId: string) =>
      api.post('/hospitality/tables/merge', {
        tableIds: [table.id, targetTableId],
        targetTableId: table.id,
      }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tables'] });
      setShowMerge(false);
      onClose();
    },
  });

  const checkout = useMutation({
    mutationFn: (payments: Array<{ method: string; amountCents: number; reference?: string }>) => {
      if (!order) throw new Error('No order');
      return api.post('/sales/checkout', {
        storeId,
        businessId,
        cashierId: user?.id ?? '',
        type: 'NORMAL',
        priceLevel: 'RETAIL',
        orderId: order.id,
        items: order.items.map((i) => ({
          itemId: i.itemId,
          name: i.name,
          quantity: i.quantity,
          unitPriceCents: i.unitPriceCents,
        })),
        payments,
        serviceChargeCents: 0, // prices are VAT-inclusive; no service charge added
      });
    },
    onSuccess: () => {
      setShowPayment(false);
      setPayError(null);
      void qc.invalidateQueries({ queryKey: ['tables'] });
      void qc.invalidateQueries({ queryKey: ['hosp-order', table.id] });
      onRefresh();
      onClose();
    },
    onError: (err) => setPayError(err instanceof Error ? err.message : 'Payment failed'),
  });

  const cancelOrderMutation = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/hospitality/orders/${orderId}/cancel`, {}),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tables'] });
      void qc.invalidateQueries({ queryKey: ['hosp-order', table.id] });
      onRefresh();
      onClose();
    },
  });

  const activeOrder = order;
  const allItems: Array<OrderItem | (PendingItem & { id: string; kotSent: boolean })> = [
    ...(activeOrder?.items ?? []),
    ...pendingItems.map((p) => ({ ...p, id: `pending-${p.itemId}-${Math.random()}`, kotSent: false })),
  ];
  const subtotal = allItems.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  const hasPendingItems = pendingItems.length > 0;

  const availableForTransfer = allTables.filter((t) => t.id !== table.id && t.status === 'AVAILABLE');
  const occupiedForMerge = allTables.filter(
    (t) => t.id !== table.id && t.status === 'OCCUPIED' && t.currentOrderId,
  );

  function handleAddFromPicker(item: MenuItem, qty: number, note: string, modifiers: string[]) {
    setPendingItems((prev) => {
      const existing = prev.find(
        (p) => p.itemId === item.id && !p.specialInstructions && !note && modifiers.length === 0,
      );
      if (existing) {
        return prev.map((p) => p === existing ? { ...p, quantity: p.quantity + qty } : p);
      }
      return [...prev, {
        itemId: item.id,
        name: item.name,
        quantity: qty,
        unitPriceCents: item.retailPriceCents,
        specialInstructions: note || undefined,
        modifiers: modifiers.length > 0 ? modifiers : undefined,
      }];
    });
    setShowPicker(false);
  }

  async function handleSendKOT() {
    if (!activeOrder && pendingItems.length === 0) return;

    let orderId: string;
    let orderType: 'NEW_ORDER' | 'ADDITION';
    let kotItems: Array<{ name: string; quantity: number; specialInstructions?: string; modifiers?: string[] }>;

    if (!activeOrder) {
      const newOrder = await createOrder.mutateAsync();
      orderId = newOrder.id;
      orderType = 'NEW_ORDER';
      kotItems = pendingItems;
      if (pendingItems.length > 0) {
        await addItems.mutateAsync({ orderId, items: pendingItems });
      }
    } else {
      orderId = activeOrder.id;
      if (pendingItems.length > 0) {
        await addItems.mutateAsync({ orderId, items: pendingItems });
        orderType = 'ADDITION';
        kotItems = pendingItems;
      } else {
        orderType = 'NEW_ORDER';
        kotItems = activeOrder.items.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          specialInstructions: i.specialInstructions,
          modifiers: parseModifiers(i.modifiers),
        }));
      }
    }

    await sendKOTMutation.mutateAsync({ orderId, type: orderType });

    // Auto-print KOT
    const kotData: KOTData = {
      tableNumber: table.number,
      orderType,
      items: kotItems,
      createdAt: new Date().toISOString(),
      waiterName: userName ?? user?.name,
    };
    printKOTWithRouting(kotData, printers);
  }

  const isBusy =
    createOrder.isPending || addItems.isPending || sendKOTMutation.isPending ||
    requestBill.isPending || checkout.isPending || transferOrder.isPending || mergeTables.isPending;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800">{fmtTable(table.number, tablePrefix)}</h2>
              <p className="text-sm text-gray-500">
                <Users className="w-3 h-3 inline mr-1" />
                {table.capacity} seats •{' '}
                <span className={`font-medium ${
                  table.status === 'AVAILABLE' ? 'text-green-600' :
                  table.status === 'OCCUPIED' ? 'text-red-600' :
                  table.status === 'BILL_REQUESTED' ? 'text-yellow-600' : 'text-blue-600'
                }`}>{table.status.replace('_', ' ')}</span>
              </p>
            </div>
            <div className="flex items-center gap-1">
              {activeOrder && table.status === 'OCCUPIED' && (
                <button
                  onClick={() => setShowTransfer(true)}
                  title="Transfer to another table"
                  className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition-colors"
                >
                  <ArrowLeftRight className="w-4 h-4" />
                </button>
              )}
              {activeOrder && table.status === 'OCCUPIED' && occupiedForMerge.length > 0 && (
                <button
                  onClick={() => setShowMerge(true)}
                  title="Merge with another table"
                  className="p-2 text-purple-500 hover:bg-purple-50 rounded-lg transition-colors"
                >
                  <GitMerge className="w-4 h-4" />
                </button>
              )}
              <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
          </div>
        </div>

        {/* Order Items */}
        <div className="flex-1 overflow-y-auto p-5 space-y-2">
          {orderLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            </div>
          ) : allItems.length === 0 ? (
            <div className="text-center py-12">
              <UtensilsCrossed className="w-12 h-12 mx-auto text-gray-300 mb-3" />
              <p className="text-gray-400 text-sm font-medium">
                {table.status === 'AVAILABLE' ? 'Table is available' : 'No items yet'}
              </p>
              <p className="text-gray-400 text-xs mt-1">
                {table.status === 'AVAILABLE'
                  ? 'Tap "+ Add Items" below to start a new order'
                  : 'Add items to start the order'}
              </p>
              {/* Clear table — for guests who sat but left without ordering */}
              {activeOrder && table.status === 'OCCUPIED' && allItems.length === 0 && (
                <button
                  onClick={() => {
                    if (confirm('Clear this table? This will cancel the empty order and mark the table as available.')) {
                      cancelOrderMutation.mutate(activeOrder.id);
                    }
                  }}
                  disabled={cancelOrderMutation.isPending}
                  className="mt-4 flex items-center gap-1.5 px-4 py-2 mx-auto text-xs font-semibold text-red-600 border border-red-200 rounded-lg hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Clear Table (guests left)
                </button>
              )}
            </div>
          ) : (
            <>
              {activeOrder?.items.map((item) => {
                const pricedMods = parsePricedModifiers(item.modifiers);
                return (
                  <div key={item.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-xl">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-gray-800">{item.quantity}×</span>
                        <span className="text-sm text-gray-700 truncate">{item.name}</span>
                        <Check className="w-3 h-3 text-green-500 flex-shrink-0" aria-label="Sent to kitchen" />
                      </div>
                      {item.specialInstructions && (
                        <p className="text-xs text-amber-600 mt-0.5 ml-6">{item.specialInstructions}</p>
                      )}
                      {pricedMods.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1 ml-6">
                          {pricedMods.map((m, mi) => (
                            <span key={mi} className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                              {m.name}{m.priceCents ? ` +KES ${(m.priceCents / 100).toFixed(2)}` : ''}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="text-sm font-bold text-gray-800 whitespace-nowrap">
                      {fmt(item.unitPriceCents * item.quantity)}
                    </span>
                    {table.status !== 'BILL_REQUESTED' && (
                      <button
                        onClick={() => activeOrder && removeItem.mutate({ orderId: activeOrder.id, itemId: item.id })}
                        className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                );
              })}

              {pendingItems.map((item, idx) => {
                const pendingMods = parsePricedModifiers(item.modifiers);
                return (
                <div key={idx} className="flex items-start gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-amber-700">{item.quantity}×</span>
                      <span className="text-sm text-amber-800 truncate">{item.name}</span>
                      <span className="text-xs bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded">pending</span>
                    </div>
                    {item.specialInstructions && (
                      <p className="text-xs text-amber-600 mt-0.5 ml-6">{item.specialInstructions}</p>
                    )}
                    {pendingMods.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1 ml-6">
                        {pendingMods.map((m, mi) => (
                          <span key={mi} className="text-xs bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded">
                            {m.name}{m.priceCents ? ` +KES ${(m.priceCents / 100).toFixed(2)}` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="text-sm font-bold text-amber-800 whitespace-nowrap">
                    {fmt(item.unitPriceCents * item.quantity)}
                  </span>
                  <button
                    onClick={() => setPendingItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              );
              })}
            </>
          )}
        </div>

        {/* Totals + Actions */}
        <div className="border-t p-5 space-y-3">
          {allItems.length > 0 && (
            <div className="flex justify-between text-lg font-bold text-gray-800 pb-2 border-b">
              <span>Total</span>
              <span className="text-blue-600">{fmt(subtotal)}</span>
            </div>
          )}

          <button
            onClick={() => setShowPicker(true)}
            className="w-full py-3 border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Items
          </button>

          {(hasPendingItems || (activeOrder && activeOrder.items.length > 0 && activeOrder.status === 'OPEN')) && (
            <button
              onClick={() => void handleSendKOT()}
              disabled={isBusy}
              className="w-full py-3 bg-orange-500 hover:bg-orange-600 disabled:opacity-40 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
            >
              {isBusy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
              {hasPendingItems ? `Send KOT (${pendingItems.length} items)` : 'Re-send KOT'}
            </button>
          )}

          {activeOrder && table.status === 'OCCUPIED' && (
            <button
              onClick={() => requestBill.mutate(activeOrder.id)}
              disabled={isBusy}
              className="w-full py-3 bg-yellow-500 hover:bg-yellow-600 disabled:opacity-40 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
            >
              {requestBill.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <Receipt className="w-5 h-5" />}
              Request Bill
            </button>
          )}

          {activeOrder && (table.status === 'OCCUPIED' || table.status === 'BILL_REQUESTED') && activeOrder.items.length > 0 && (
            <button
              onClick={() => {
                printBill({
                  tableNumber: table.number,
                  businessName: bizSettings?.name ?? 'Restaurant',
                  waiterName: userName,
                  items: activeOrder.items.map((i) => ({
                    name: i.name,
                    quantity: i.quantity,
                    unitPriceCents: i.unitPriceCents,
                    totalCents: i.unitPriceCents * i.quantity,
                  })),
                  subtotalCents: subtotal,
                  totalCents: subtotal,
                  date: new Date().toISOString(),
                  footer: bizSettings?.receiptFooter || undefined,
                });
              }}
              className="w-full py-2.5 border-2 border-amber-300 text-amber-700 hover:bg-amber-50 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 transition-colors"
            >
              <Receipt className="w-4 h-4" />
              Print Bill
            </button>
          )}

          {activeOrder && (table.status === 'OCCUPIED' || table.status === 'BILL_REQUESTED') && (
            <button
              onClick={() => { setPayError(null); setShowPayment(true); }}
              disabled={isBusy}
              className="w-full py-3.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
              Take Payment — {fmt(subtotal)}
            </button>
          )}

          {/* ── KOT Status tracker (waiter view) ── */}
          {activeOrder?.kots && activeOrder.kots.length > 0 && (
            <div className="border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b text-xs font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                <ChefHat className="w-3.5 h-3.5" /> Kitchen Status
              </div>
              <div className="divide-y">
                {activeOrder.kots.map((kot) => (
                  <div key={kot.id} className="flex items-center justify-between px-3 py-2.5 gap-3">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
                        kot.status === 'READY'       ? 'bg-green-500' :
                        kot.status === 'IN_PROGRESS' ? 'bg-yellow-400' :
                        kot.status === 'SERVED'      ? 'bg-gray-300' :
                                                       'bg-orange-400'
                      }`} />
                      <span className="text-xs text-gray-600 truncate">
                        {kot.type.replace('_', ' ')}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                        kot.status === 'READY'       ? 'bg-green-100 text-green-700' :
                        kot.status === 'IN_PROGRESS' ? 'bg-yellow-100 text-yellow-700' :
                        kot.status === 'SERVED'      ? 'bg-gray-100 text-gray-500' :
                                                       'bg-orange-100 text-orange-700'
                      }`}>
                        {kot.status === 'IN_PROGRESS' ? 'Cooking' : kot.status === 'READY' ? 'Ready!' : kot.status === 'SERVED' ? 'Served' : 'Pending'}
                      </span>
                      {kot.status === 'READY' && (
                        <button
                          onClick={() => markServedMutation.mutate(kot.id)}
                          disabled={markServedMutation.isPending}
                          className="flex items-center gap-1 px-2.5 py-1 bg-green-600 hover:bg-green-700 text-white text-xs font-semibold rounded-lg disabled:opacity-50 transition-colors"
                        >
                          <CheckCircle className="w-3 h-3" /> Served ✓
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Manager: Force-clear occupied table (guests left mid-service) ── */}
          {activeOrder && (table.status === 'OCCUPIED' || table.status === 'BILL_REQUESTED') &&
           activeOrder.items.length > 0 &&
           (user?.role === 'OWNER' || user?.role === 'MANAGER') && (
            <button
              onClick={() => {
                if (confirm(
                  `Clear ${fmtTable(table.number, tablePrefix)}? This will void the current order (${activeOrder.items.length} item${activeOrder.items.length !== 1 ? 's' : ''}) and mark the table as available.\n\nUse this only when guests have left without paying.`
                )) {
                  cancelOrderMutation.mutate(activeOrder.id);
                }
              }}
              disabled={cancelOrderMutation.isPending}
              className="w-full py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50"
            >
              <Trash2 className="w-3.5 h-3.5" />
              Clear Table (void order)
            </button>
          )}
        </div>
      </div>

      {/* Transfer Modal */}
      {showTransfer && activeOrder && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <ArrowLeftRight className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-gray-800">Transfer to Table</h3>
              </div>
              <button onClick={() => setShowTransfer(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 mb-3">Move order to an available table:</p>
              {availableForTransfer.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No available tables to transfer to</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {availableForTransfer.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => transferOrder.mutate({ orderId: activeOrder.id, newTableId: t.id })}
                      disabled={transferOrder.isPending}
                      className="p-3 rounded-xl border-2 border-green-200 bg-green-50 hover:bg-green-100 text-center disabled:opacity-40 transition-colors"
                    >
                      <div className="font-bold text-green-800">{fmtTable(t.number, tablePrefix)}</div>
                      <div className="text-xs text-green-600">{t.capacity} seats</div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Merge Modal */}
      {showMerge && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4">
          <div className="bg-white rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div className="flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-purple-600" />
                <h3 className="font-bold text-gray-800">Merge Tables</h3>
              </div>
              <button onClick={() => setShowMerge(false)} className="p-2 hover:bg-gray-100 rounded-full">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <div className="p-5">
              <p className="text-sm text-gray-600 mb-3">
                Merge another table's order into <strong>{fmtTable(table.number, tablePrefix)}</strong>:
              </p>
              {occupiedForMerge.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">No occupied tables to merge</p>
              ) : (
                <div className="grid grid-cols-3 gap-2">
                  {occupiedForMerge.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => mergeTables.mutate(t.id)}
                      disabled={mergeTables.isPending}
                      className="p-3 rounded-xl border-2 border-red-200 bg-red-50 hover:bg-red-100 text-center disabled:opacity-40 transition-colors"
                    >
                      <div className="font-bold text-red-800">{fmtTable(t.number, tablePrefix)}</div>
                      <div className="text-xs text-red-600">{t.capacity} seats</div>
                    </button>
                  ))}
                </div>
              )}
              <p className="text-xs text-gray-400 mt-3 text-center">
                Items from the selected table move into {fmtTable(table.number, tablePrefix)}
              </p>
            </div>
          </div>
        </div>
      )}

      {showPicker && (
        <ItemPicker
          businessId={businessId}
          storeId={storeId}
          onAdd={handleAddFromPicker}
          onClose={() => setShowPicker(false)}
        />
      )}

      {showPayment && activeOrder && (
        <PaymentModal
          totalCents={subtotal}
          onComplete={(payments) => checkout.mutate(payments)}
          onCancel={() => { setShowPayment(false); setPayError(null); }}
          isProcessing={checkout.isPending}
          error={payError}
        />
      )}
    </>
  );
}

// ─── KDS View ─────────────────────────────────────────────────────────────────

interface KDSViewProps {
  storeId: string;
  onClose: () => void;
  tablePrefix?: string;
}

function KDSView({ storeId, onClose, tablePrefix = 'T' }: KDSViewProps) {
  const qc = useQueryClient();

  const { data: kdsOrders = [], isLoading } = useQuery<KdsItem[]>({
    queryKey: ['kds', storeId],
    queryFn: () => api.get<KdsItem[]>(`/hospitality/kds/orders?storeId=${storeId}`),
    refetchInterval: 10000,
    enabled: !!storeId,
  });

  const updateKOT = useMutation({
    mutationFn: (vars: { kotId: string; status: string }) =>
      api.patch(`/hospitality/kot/${vars.kotId}/status`, { status: vars.status }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['kds'] }),
  });

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      <div className="flex items-center justify-between px-6 py-4 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center gap-3">
          <ChefHat className="w-6 h-6 text-orange-400" />
          <h2 className="text-xl font-bold text-white">Kitchen Display</h2>
          <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded-full">
            {kdsOrders.length} orders
          </span>
        </div>
        <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-700 text-gray-400 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-orange-400 animate-spin" />
          </div>
        ) : kdsOrders.length === 0 ? (
          <div className="text-center py-20">
            <ChefHat className="w-16 h-16 mx-auto text-gray-600 mb-4" />
            <p className="text-gray-400 text-lg font-medium">No pending orders</p>
            <p className="text-gray-600 text-sm mt-1">Kitchen is all caught up!</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {kdsOrders.map((kds) => {
              const age = Math.floor((Date.now() - new Date(kds.createdAt).getTime()) / 60000);
              const isOld = age >= 15;
              return (
                <div
                  key={kds.id}
                  className={`rounded-xl border-2 p-4 ${
                    kds.status === 'READY' ? 'border-green-500 bg-green-900/20' :
                    isOld ? 'border-red-500 bg-red-900/20 animate-pulse' :
                    'border-orange-400 bg-orange-900/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-white font-bold text-lg">{kds.order.table?.number ? fmtTable(kds.order.table.number, tablePrefix) : '?'}</span>
                      <span className="ml-2 text-xs text-gray-400">
                        {new Date(kds.createdAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOld && <span className="text-xs text-red-400 font-bold">{age}m</span>}
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                        kds.status === 'READY' ? 'bg-green-600 text-white' :
                        kds.status === 'IN_PROGRESS' ? 'bg-orange-500 text-white' :
                        'bg-gray-600 text-gray-200'
                      }`}>
                        {kds.status}
                      </span>
                    </div>
                  </div>
                  {kds.assignedChef && (
                    <div className="text-xs text-yellow-600 flex items-center gap-1 mb-2">
                      <span>👨‍🍳</span> {kds.assignedChef.name}
                    </div>
                  )}
                  {kds.estimatedReadyAt && kds.status === 'IN_PROGRESS' && (
                    <div className="text-xs text-blue-600 mb-2">
                      Ready ~{new Date(kds.estimatedReadyAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  )}

                  <div className="space-y-2 mb-4">
                    {kds.order.items.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-orange-300 font-bold text-sm w-6">{item.quantity}×</span>
                        <div>
                          <span className="text-white text-sm font-medium">{item.name}</span>
                          {item.specialInstructions && (
                            <p className="text-amber-300 text-xs mt-0.5 flex items-center gap-1">
                              <AlertCircle className="w-3 h-3" />
                              {item.specialInstructions}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    {kds.status === 'PENDING' && (
                      <button
                        onClick={() => updateKOT.mutate({ kotId: kds.id, status: 'IN_PROGRESS' })}
                        className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Start
                      </button>
                    )}
                    {kds.status === 'IN_PROGRESS' && (
                      <button
                        onClick={() => updateKOT.mutate({ kotId: kds.id, status: 'READY' })}
                        className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Ready
                      </button>
                    )}
                    {kds.status === 'READY' && (
                      <div className="flex-1 py-2 bg-green-900/30 border border-green-500/40 text-green-400 rounded-lg text-xs font-semibold text-center flex items-center justify-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" />
                        At the pass
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function HospitalityPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [view, setView] = useState<'tables' | 'bar-tabs' | 'rooms'>('tables');
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [showKDS, setShowKDS] = useState(false);
  const [showReservations, setShowReservations] = useState(false);
  const [showFastFood, setShowFastFood] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Table['status'] | 'ALL'>('ALL');
  const [selectedBarTab, setSelectedBarTab] = useState<BarTab | null>(null);
  const [newTabName, setNewTabName] = useState('');
  const [showNewTabDialog, setShowNewTabDialog] = useState(false);
  const [selectedRoom, setSelectedRoom] = useState<HotelRoom | null>(null);
  const [editingRoom, setEditingRoom] = useState<HotelRoom | null>(null);
  const [editRoomForm, setEditRoomForm] = useState({ number: '', type: 'STANDARD', floor: '', capacity: 2, pricePerNightCents: 0, notes: '' });
  const [showAddRoomModal, setShowAddRoomModal] = useState(false);
  const [showBookingModal, setShowBookingModal] = useState<HotelRoom | null>(null);
  const [showBookingsListModal, setShowBookingsListModal] = useState(false);

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';

  const { data: tables = [], isLoading, refetch } = useQuery<Table[]>({
    queryKey: ['tables', storeId],
    queryFn: () => api.get<Table[]>(`/hospitality/tables?storeId=${storeId}`),
    enabled: !!storeId,
    refetchInterval: 10000,
  });

  const { data: bizSettings } = useQuery<{ tablePrefix?: string | null }>({
    queryKey: ['biz-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
    staleTime: 60_000,
  });
  const tablePrefix = bizSettings?.tablePrefix ?? 'T';

  function tableLabel(number: string): string {
    // If the number already contains non-digit characters (e.g. "Tokyo"), show as-is
    return /\D/.test(number) ? number : `${tablePrefix}${number}`;
  }

  const { data: barTabs = [], refetch: refetchBarTabs } = useQuery<BarTab[]>({
    queryKey: ['bar-tabs', businessId, storeId],
    queryFn: () => api.get(`/hospitality/bar-tabs?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId && view === 'bar-tabs',
    refetchInterval: 15000,
  });

  const createBarTabMutation = useMutation({
    mutationFn: (data: { businessId: string; storeId: string; tabName: string; waiterId: string }) =>
      api.post('/hospitality/bar-tabs', data),
    onSuccess: () => { void refetchBarTabs(); setNewTabName(''); setShowNewTabDialog(false); },
  });

  const settleBarTabMutation = useMutation({
    mutationFn: ({ tabId, payments }: { tabId: string; payments: Array<{ method: string; amountCents: number }> }) =>
      api.post(`/hospitality/bar-tabs/${tabId}/settle`, { payments }),
    onSuccess: () => { void refetchBarTabs(); setSelectedBarTab(null); },
  });

  const closeBarTabMutation = useMutation({
    mutationFn: (tabId: string) => api.post(`/hospitality/bar-tabs/${tabId}/close`, {}),
    onSuccess: () => { void refetchBarTabs(); setSelectedBarTab(null); },
  });

  // ── Hotel Rooms ─────────────────────────────────────────────────────────────

  const { data: hotelRooms = [], refetch: refetchRooms } = useQuery<HotelRoom[]>({
    queryKey: ['hotel-rooms', businessId, storeId],
    queryFn: () => api.get(`/hospitality/hotel-rooms?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId && view === 'rooms',
    refetchInterval: 20000,
  });

  const { data: roomBookings = [] } = useQuery<RoomBooking[]>({
    queryKey: ['room-bookings', businessId, storeId],
    queryFn: () => api.get(`/hospitality/room-bookings?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId && showBookingsListModal,
  });

  const [addRoomForm, setAddRoomForm] = useState({
    number: '', type: 'STANDARD', floor: '', capacity: 2, pricePerNightCents: 0, notes: '',
  });

  const [bookingForm, setBookingForm] = useState({
    guestName: '', guestPhone: '', guestIdNumber: '',
    checkInDate: new Date().toISOString().split('T')[0],
    checkOutDate: '',
    nightCount: 1,
    depositCents: 0,
    notes: '',
  });

  const createRoomMutation = useMutation({
    mutationFn: (data: typeof addRoomForm) =>
      api.post('/hospitality/hotel-rooms', {
        ...data,
        businessId,
        storeId,
        pricePerNightCents: Math.round(data.pricePerNightCents * 100),
      }),
    onSuccess: () => { void refetchRooms(); setShowAddRoomModal(false); setAddRoomForm({ number: '', type: 'STANDARD', floor: '', capacity: 2, pricePerNightCents: 0, notes: '' }); },
  });

  const updateRoomStatusMutation = useMutation({
    mutationFn: ({ roomId, status }: { roomId: string; status: string }) =>
      api.patch(`/hospitality/hotel-rooms/${roomId}`, { status }),
    onSuccess: () => void refetchRooms(),
  });

  const updateRoomMutation = useMutation({
    mutationFn: ({ roomId, data }: { roomId: string; data: typeof editRoomForm }) =>
      api.patch(`/hospitality/hotel-rooms/${roomId}`, {
        ...data,
        pricePerNightCents: Math.round(data.pricePerNightCents * 100),
      }),
    onSuccess: () => { void refetchRooms(); setEditingRoom(null); },
  });

  const createBookingMutation = useMutation({
    mutationFn: (roomId: string) =>
      api.post('/hospitality/room-bookings', {
        ...bookingForm,
        roomId,
        businessId,
        storeId,
        depositCents: Math.round(bookingForm.depositCents * 100),
      }),
    onSuccess: () => { void refetchRooms(); setShowBookingModal(null); setBookingForm({ guestName: '', guestPhone: '', guestIdNumber: '', checkInDate: new Date().toISOString().split('T')[0], checkOutDate: '', nightCount: 1, depositCents: 0, notes: '' }); },
  });

  const checkInMutation = useMutation({
    mutationFn: (bookingId: string) => api.post(`/hospitality/room-bookings/${bookingId}/check-in`, {}),
    onSuccess: () => { void refetchRooms(); setSelectedRoom(null); },
  });

  const checkOutMutation = useMutation({
    mutationFn: (bookingId: string) => api.post(`/hospitality/room-bookings/${bookingId}/check-out`, { payments: [] }),
    onSuccess: () => { void refetchRooms(); setSelectedRoom(null); },
  });

  const cancelBookingMutation = useMutation({
    mutationFn: (bookingId: string) => api.post(`/hospitality/room-bookings/${bookingId}/cancel`, {}),
    onSuccess: () => { void refetchRooms(); setSelectedRoom(null); },
  });

  const ROOM_STATUS_COLORS: Record<string, string> = {
    AVAILABLE:   'border-green-300 bg-green-50 dark:bg-green-900/20',
    OCCUPIED:    'border-blue-400 bg-blue-50 dark:bg-blue-900/20',
    RESERVED:    'border-yellow-300 bg-yellow-50 dark:bg-yellow-900/20',
    MAINTENANCE: 'border-red-300 bg-red-50 dark:bg-red-900/20',
  };

  const [showAddTableModal, setShowAddTableModal] = useState(false);
  const [addTableForm, setAddTableForm] = useState({ number: '', capacity: 4, floor: '' });
  const [editingTable, setEditingTable] = useState<Table | null>(null);
  const [editTableForm, setEditTableForm] = useState({ number: '', capacity: 4, floor: '' });
  const [confirmDeleteTable, setConfirmDeleteTable] = useState<Table | null>(null);

  const createTable = useMutation({
    mutationFn: (data: { number: string; capacity: number; floor?: string }) =>
      api.post('/hospitality/tables', { ...data, businessId, storeId }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tables'] });
      setShowAddTableModal(false);
      setAddTableForm({ number: '', capacity: 4, floor: '' });
    },
  });

  const updateTableMutation = useMutation({
    mutationFn: ({ id, ...data }: { id: string; number: string; capacity: number; floor: string }) =>
      api.patch(`/hospitality/tables/${id}`, { ...data, floor: data.floor || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tables'] });
      setEditingTable(null);
    },
  });

  const deleteTableMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/hospitality/tables/${id}`),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['tables'] });
      setConfirmDeleteTable(null);
    },
  });

  const filtered = filterStatus === 'ALL' ? tables : tables.filter((t) => t.status === filterStatus);

  const stats = {
    available: tables.filter((t) => t.status === 'AVAILABLE').length,
    occupied: tables.filter((t) => t.status === 'OCCUPIED').length,
    billRequested: tables.filter((t) => t.status === 'BILL_REQUESTED').length,
    reserved: tables.filter((t) => t.status === 'RESERVED').length,
  };

  function openAddTable() {
    setAddTableForm({ number: '', capacity: 4, floor: '' });
    setShowAddTableModal(true);
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                {view === 'tables' ? 'Table Management' : view === 'bar-tabs' ? 'Bar Tabs' : 'Hotel Rooms'}
              </h1>
              {view === 'tables' && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {stats.available} available • {stats.occupied} occupied
                  {stats.billRequested > 0 && ` • ${stats.billRequested} bill requested`}
                  {stats.reserved > 0 && ` • ${stats.reserved} reserved`}
                </p>
              )}
              {view === 'bar-tabs' && (
                <p className="text-sm text-gray-500 mt-0.5">{barTabs.length} open tab{barTabs.length !== 1 ? 's' : ''}</p>
              )}
              {view === 'rooms' && (
                <p className="text-sm text-gray-500 mt-0.5">
                  {hotelRooms.filter(r => r.status === 'AVAILABLE').length} available •{' '}
                  {hotelRooms.filter(r => r.status === 'OCCUPIED').length} occupied
                </p>
              )}
            </div>
            <div className="flex gap-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
              <button
                onClick={() => setView('tables')}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${view === 'tables' ? 'bg-white dark:bg-gray-600 shadow text-blue-600' : 'text-gray-600 dark:text-gray-300'}`}
              >
                Tables
              </button>
              <button
                onClick={() => setView('bar-tabs')}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${view === 'bar-tabs' ? 'bg-white dark:bg-gray-600 shadow text-purple-600' : 'text-gray-600 dark:text-gray-300'}`}
              >
                Bar Tabs
              </button>
              <button
                onClick={() => setView('rooms')}
                className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors flex items-center gap-1.5 ${view === 'rooms' ? 'bg-white dark:bg-gray-600 shadow text-teal-600' : 'text-gray-600 dark:text-gray-300'}`}
              >
                <BedDouble className="w-3.5 h-3.5" /> Rooms
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void refetch()}
              className="p-2 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
            <button
              onClick={() => setShowReservations(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-50 hover:bg-blue-100 text-blue-700 rounded-lg font-medium text-sm transition-colors"
            >
              <CalendarDays className="w-4 h-4" />
              Reservations
            </button>
            <button
              onClick={() => setShowFastFood(true)}
              className="flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded-lg font-medium text-sm transition-colors"
            >
              <Zap className="w-4 h-4" />
              Fast Food
            </button>
            <button
              onClick={() => setShowKDS(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
            >
              <ChefHat className="w-4 h-4" />
              KDS
            </button>
            <button
              onClick={openAddTable}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Table
            </button>
          </div>
        </div>

        {/* Status filter tabs — only shown in tables view */}
        {view === 'tables' && (
          <div className="flex gap-1 mt-3">
            {(['ALL', 'AVAILABLE', 'OCCUPIED', 'BILL_REQUESTED', 'RESERVED'] as const).map((s) => (
              <button
                key={s}
                onClick={() => setFilterStatus(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  filterStatus === s
                    ? 'bg-gray-800 text-white'
                    : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {s === 'ALL' ? 'All' :
                 s === 'BILL_REQUESTED' ? 'Bill Req.' :
                 s.charAt(0) + s.slice(1).toLowerCase()}
                {' '}
                <span className="opacity-70">
                  ({s === 'ALL' ? tables.length :
                    s === 'AVAILABLE' ? stats.available :
                    s === 'OCCUPIED' ? stats.occupied :
                    s === 'BILL_REQUESTED' ? stats.billRequested : stats.reserved})
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Table Grid */}
      {view === 'tables' && <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
          </div>
        ) : tables.length === 0 ? (
          <div className="text-center py-16">
            <Users className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <p className="text-gray-500 text-lg font-medium mb-1">No tables configured</p>
            <p className="text-gray-400 text-sm mb-6">Add tables to start managing dine-in orders</p>
            <button
              onClick={openAddTable}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
            >
              Add First Table
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            No {filterStatus.toLowerCase().replace('_', ' ')} tables
          </div>
        ) : (() => {
          // Group tables by floor
          const floors = Array.from(new Set(filtered.map((t) => t.floor ?? 'Main Floor'))).sort();
          const byFloor = floors.reduce<Record<string, Table[]>>((acc, floor) => {
            acc[floor] = filtered.filter((t) => (t.floor ?? 'Main Floor') === floor);
            return acc;
          }, {});

          return (
            <div className="space-y-8">
              {/* Legend */}
              <div className="flex flex-wrap items-center gap-3 px-1">
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider">Legend:</span>
                {(['AVAILABLE', 'OCCUPIED', 'BILL_REQUESTED', 'RESERVED'] as const).map((s) => (
                  <span key={s} className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                    <span className={`w-2.5 h-2.5 rounded-full ${TABLE_DOTS[s].replace(' animate-pulse', '')}`} />
                    {TABLE_STATUS_LABEL[s]}
                  </span>
                ))}
                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <span className="bg-orange-400 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold">In Kitchen</span>
                </span>
                <span className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
                  <span className="bg-green-500 text-white rounded-full px-1.5 py-0.5 text-[10px] font-bold animate-pulse">READY</span>
                  Order ready to serve
                </span>
              </div>
              {floors.map((floor) => (
                <div key={floor}>
                  {/* Floor section header */}
                  <div className="flex items-center gap-3 mb-4">
                    <h3 className="text-sm font-bold text-gray-600 uppercase tracking-widest">{floor}</h3>
                    <div className="flex-1 h-px bg-gray-200" />
                    <span className="text-xs text-gray-400">{byFloor[floor].length} tables</span>
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
                    {byFloor[floor].map((table) => (
                      <div key={table.id} className="relative group">
                        <button
                          onClick={() => setSelectedTable(table)}
                          className={`w-full relative p-4 rounded-2xl border-2 transition-all hover:shadow-lg active:scale-95 shadow-sm ${TABLE_COLORS[table.status]}`}
                        >
                          {/* Status dot */}
                          <div className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${TABLE_DOTS[table.status]}`} />
                          <div className="text-center">
                            <div className="text-2xl font-black mb-1">{tableLabel(table.number)}</div>
                            <div className="text-xs opacity-70 flex items-center justify-center gap-1">
                              <Users className="w-3 h-3" />
                              {table.capacity}
                            </div>
                            {/* Status badge */}
                            <div className={`mt-2 text-xs font-bold px-2 py-0.5 rounded-full inline-block
                              ${table.status === 'AVAILABLE'     ? 'bg-emerald-100 text-emerald-700' :
                                table.status === 'OCCUPIED'      ? 'bg-red-100 text-red-700' :
                                table.status === 'BILL_REQUESTED'? 'bg-amber-200 text-amber-800' :
                                                                   'bg-blue-100 text-blue-700'}`}>
                              {TABLE_STATUS_LABEL[table.status]}
                            </div>
                            {table.status === 'OCCUPIED' && !table.hasReadyKOT && !table.hasPendingKOT && (
                              <div className="mt-1 flex items-center justify-center gap-1">
                                <Clock className="w-3 h-3 opacity-60" />
                                <span className="text-xs opacity-60">Active</span>
                              </div>
                            )}
                            {table.hasReadyKOT && (
                              <div className="mt-2 flex items-center justify-center gap-1 bg-green-500 text-white rounded-full px-2 py-0.5 animate-pulse">
                                <ChefHat className="w-3 h-3" />
                                <span className="text-xs font-bold">READY</span>
                              </div>
                            )}
                            {!table.hasReadyKOT && table.hasPendingKOT && (
                              <div className="mt-2 flex items-center justify-center gap-1 bg-orange-400 text-white rounded-full px-2 py-0.5">
                                <ChefHat className="w-3 h-3" />
                                <span className="text-xs font-bold">In Kitchen</span>
                              </div>
                            )}
                            {table.status === 'RESERVED' && (
                              <div className="mt-1 flex items-center justify-center gap-1">
                                <CalendarDays className="w-3 h-3 opacity-60" />
                                <span className="text-xs opacity-60">Reserved</span>
                              </div>
                            )}
                          </div>
                        </button>
                        {/* Hover management actions */}
                        <div className="absolute top-2 left-2 hidden group-hover:flex gap-1 z-10">
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setEditingTable(table);
                              setEditTableForm({ number: table.number, capacity: table.capacity, floor: table.floor ?? '' });
                            }}
                            className="p-1.5 bg-white/95 hover:bg-white rounded-lg shadow text-gray-500 hover:text-blue-600 transition-colors"
                            title="Edit table"
                          >
                            <Edit2 className="w-3 h-3" />
                          </button>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setConfirmDeleteTable(table);
                            }}
                            disabled={table.status !== 'AVAILABLE'}
                            className="p-1.5 bg-white/95 hover:bg-white rounded-lg shadow text-gray-500 hover:text-red-600 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title={table.status !== 'AVAILABLE' ? 'Cannot delete — table is in use' : 'Delete table'}
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          );
        })()}
      </div>}

      {/* Bar Tabs View */}
      {view === 'bar-tabs' && (
        <div className="flex-1 overflow-hidden p-6">
          <div className="flex h-full gap-4">
            {/* Tab list (left panel) */}
            <div className="w-64 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col">
              <div className="p-3 border-b flex items-center justify-between">
                <h3 className="font-semibold text-sm text-gray-700 dark:text-gray-300">Open Tabs ({barTabs.length})</h3>
                <button
                  onClick={() => setShowNewTabDialog(true)}
                  className="px-2 py-1 bg-purple-600 text-white text-xs rounded-lg hover:bg-purple-700"
                >
                  + New Tab
                </button>
              </div>
              <div className="flex-1 overflow-y-auto divide-y divide-gray-100 dark:divide-gray-700">
                {barTabs.map(tab => {
                  const tabTotal = tab.items.reduce((s, i) => s + i.totalCents, 0);
                  const duration = Math.round((Date.now() - new Date(tab.createdAt).getTime()) / 60000);
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setSelectedBarTab(tab)}
                      className={`w-full text-left px-3 py-3 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors ${selectedBarTab?.id === tab.id ? 'bg-purple-50 dark:bg-purple-900/20' : ''}`}
                    >
                      <div className="font-medium text-sm text-gray-900 dark:text-white">
                        Tab #{tab.id.slice(-4).toUpperCase()}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">{tab.items.length} items • {duration}m ago</div>
                      <div className="text-sm font-semibold text-purple-600 dark:text-purple-400 mt-1">
                        KES {(tabTotal / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                      </div>
                    </button>
                  );
                })}
                {barTabs.length === 0 && (
                  <div className="p-6 text-center text-sm text-gray-400">No open bar tabs</div>
                )}
              </div>
            </div>

            {/* Tab detail (right panel) */}
            <div className="flex-1 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 flex flex-col">
              {selectedBarTab ? (
                <>
                  <div className="p-4 border-b flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900 dark:text-white">
                      Bar Tab #{selectedBarTab.id.slice(-4).toUpperCase()}
                    </h3>
                    <div className="flex gap-2">
                      <button
                        onClick={() => closeBarTabMutation.mutate(selectedBarTab.id)}
                        disabled={closeBarTabMutation.isPending}
                        className="px-3 py-1.5 text-sm border border-red-300 text-red-600 rounded-lg hover:bg-red-50 disabled:opacity-50"
                      >
                        Close Tab
                      </button>
                      <button
                        onClick={() => {
                          const total = selectedBarTab.items.reduce((s, i) => s + i.totalCents, 0);
                          settleBarTabMutation.mutate({
                            tabId: selectedBarTab.id,
                            payments: [{ method: 'CASH', amountCents: total }],
                          });
                        }}
                        disabled={selectedBarTab.items.length === 0 || settleBarTabMutation.isPending}
                        className="px-3 py-1.5 text-sm bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
                      >
                        Settle Tab
                      </button>
                    </div>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    {selectedBarTab.items.length === 0 ? (
                      <div className="text-center text-gray-400 py-8">No items on this tab yet</div>
                    ) : (
                      <div className="space-y-2">
                        {selectedBarTab.items.map(item => {
                          let mods: Array<{name: string; priceCents?: number}> = [];
                          try { mods = item.modifiers ? JSON.parse(item.modifiers) as Array<{name: string; priceCents?: number}> : []; } catch { mods = []; }
                          return (
                            <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                              <div>
                                <div className="font-medium text-sm text-gray-900 dark:text-white">{item.name} × {item.quantity}</div>
                                {mods.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {mods.map((m, i) => (
                                      <span key={i} className="text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 px-1.5 py-0.5 rounded">
                                        {m.name}{m.priceCents ? ` +KES ${(m.priceCents/100).toFixed(2)}` : ''}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                              <div className="font-semibold text-gray-900 dark:text-white">
                                KES {(item.totalCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="p-4 border-t bg-gray-50 dark:bg-gray-750">
                    <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span>KES {(selectedBarTab.items.reduce((s, i) => s + i.totalCents, 0) / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex-1 flex items-center justify-center text-gray-400">
                  Select a bar tab to view details
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Hotel Rooms View ──────────────────────────────────────────────────── */}
      {view === 'rooms' && (
        <div className="flex-1 overflow-y-auto p-6">
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex gap-2">
              <button
                onClick={() => setShowAddRoomModal(true)}
                className="flex items-center gap-2 px-4 py-2 bg-teal-600 text-white rounded-lg hover:bg-teal-700 text-sm font-medium"
              >
                <Plus className="w-4 h-4" /> Add Room
              </button>
              <button
                onClick={() => setShowBookingsListModal(true)}
                className="flex items-center gap-2 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
              >
                <CalendarDays className="w-4 h-4" /> All Bookings
              </button>
            </div>
            <button onClick={() => void refetchRooms()} className="p-2 text-gray-500 hover:text-gray-700 rounded-lg hover:bg-gray-100">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>

          {hotelRooms.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-24 text-gray-400">
              <BedDouble className="w-16 h-16 mb-4 opacity-20" />
              <p className="text-lg font-medium">No rooms configured</p>
              <p className="text-sm mt-1">Click "Add Room" to set up your hotel rooms</p>
            </div>
          ) : (
            (() => {
              // Group by floor
              const byFloor: Record<string, HotelRoom[]> = {};
              hotelRooms.forEach(r => {
                const floor = r.floor || 'Ground Floor';
                if (!byFloor[floor]) byFloor[floor] = [];
                byFloor[floor].push(r);
              });
              return Object.entries(byFloor).map(([floor, rooms]) => (
                <div key={floor} className="mb-6">
                  <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-3 flex items-center gap-2">
                    <KeyRound className="w-3.5 h-3.5" /> {floor}
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3">
                    {rooms.map(room => {
                      const booking = room.bookings[0];
                      return (
                        <button
                          key={room.id}
                          onClick={() => setSelectedRoom(room)}
                          className={`relative p-4 rounded-xl border-2 text-left transition-all hover:shadow-md ${ROOM_STATUS_COLORS[room.status] ?? 'border-gray-200 bg-gray-50'}`}
                        >
                          <div className="flex items-start justify-between mb-2">
                            <span className="text-xl font-bold text-gray-800 dark:text-white">{room.number}</span>
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                              room.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' :
                              room.status === 'OCCUPIED' ? 'bg-blue-100 text-blue-700' :
                              room.status === 'RESERVED' ? 'bg-yellow-100 text-yellow-700' :
                              'bg-red-100 text-red-700'
                            }`}>{room.status}</span>
                          </div>
                          <p className="text-xs text-gray-500">{room.type}</p>
                          <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                            <Users className="w-3 h-3" /> {room.capacity} guests
                          </p>
                          <p className="text-xs font-semibold text-teal-700 mt-1">
                            KES {(room.pricePerNightCents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}/night
                          </p>
                          {booking && (
                            <p className="text-xs text-blue-600 mt-1 font-medium truncate">{booking.guestName}</p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ));
            })()
          )}
        </div>
      )}

      {/* ── Room Detail Panel ─────────────────────────────────────────────────── */}
      {selectedRoom && (
        <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
              <div>
                <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                  <BedDouble className="w-5 h-5 text-teal-600" />
                  Room {selectedRoom.number}
                </h2>
                <p className="text-sm text-gray-500">{selectedRoom.type} · Capacity: {selectedRoom.capacity}</p>
              </div>
              <button onClick={() => setSelectedRoom(null)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Status badge */}
              <div className="flex items-center justify-between">
                <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold ${
                  selectedRoom.status === 'AVAILABLE' ? 'bg-green-100 text-green-700' :
                  selectedRoom.status === 'OCCUPIED'  ? 'bg-blue-100 text-blue-700' :
                  selectedRoom.status === 'RESERVED'  ? 'bg-yellow-100 text-yellow-700' :
                  'bg-red-100 text-red-700'
                }`}>
                  <BedDouble className="w-4 h-4" /> {selectedRoom.status}
                </span>
                <span className="text-lg font-bold text-teal-700">
                  KES {(selectedRoom.pricePerNightCents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}/night
                </span>
              </div>

              {/* Active booking info */}
              {selectedRoom.bookings[0] && (
                <div className="p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl border border-blue-200">
                  <p className="text-xs font-semibold text-blue-500 uppercase tracking-wide mb-2">Current Guest</p>
                  <p className="font-bold text-gray-800 dark:text-white text-lg">{selectedRoom.bookings[0].guestName}</p>
                  {selectedRoom.bookings[0].guestPhone && (
                    <p className="text-sm text-gray-500 flex items-center gap-1 mt-0.5">
                      <Phone className="w-3.5 h-3.5" /> {selectedRoom.bookings[0].guestPhone}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-3 mt-3 text-sm">
                    <div>
                      <p className="text-gray-400 text-xs">Check-in</p>
                      <p className="font-medium text-gray-700 dark:text-gray-300">
                        {selectedRoom.bookings[0].actualCheckIn
                          ? new Date(selectedRoom.bookings[0].actualCheckIn).toLocaleDateString('en-KE')
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Check-out (planned)</p>
                      <p className="font-medium text-gray-700 dark:text-gray-300">
                        {selectedRoom.bookings[0].checkOutDate
                          ? new Date(selectedRoom.bookings[0].checkOutDate).toLocaleDateString('en-KE')
                          : '—'}
                      </p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Nights</p>
                      <p className="font-medium text-gray-700 dark:text-gray-300">{selectedRoom.bookings[0].nightCount}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs">Total / Deposit</p>
                      <p className="font-medium text-gray-700 dark:text-gray-300">
                        KES {(selectedRoom.bookings[0].totalAmountCents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}
                        {' / '}
                        KES {(selectedRoom.bookings[0].depositCents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {selectedRoom.notes && (
                <p className="text-sm text-gray-500 italic">{selectedRoom.notes}</p>
              )}
            </div>

            {/* Actions */}
            <div className="p-4 border-t dark:border-gray-700 space-y-2">
              {selectedRoom.status === 'AVAILABLE' && (
                <button
                  onClick={() => { setShowBookingModal(selectedRoom); setSelectedRoom(null); }}
                  className="w-full py-3 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold flex items-center justify-center gap-2"
                >
                  <LogIn className="w-5 h-5" /> Check In / Reserve
                </button>
              )}
              {selectedRoom.status === 'RESERVED' && selectedRoom.bookings[0] && (
                <>
                  <button
                    onClick={() => checkInMutation.mutate(selectedRoom.bookings[0].id)}
                    disabled={checkInMutation.isPending}
                    className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {checkInMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
                    Confirm Check-In
                  </button>
                  <button
                    onClick={() => {
                      if (confirm('Cancel this reservation?')) cancelBookingMutation.mutate(selectedRoom.bookings[0].id);
                    }}
                    disabled={cancelBookingMutation.isPending}
                    className="w-full py-2.5 border border-red-200 text-red-600 hover:bg-red-50 rounded-xl font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <X className="w-4 h-4" /> Cancel Reservation
                  </button>
                </>
              )}
              {selectedRoom.status === 'OCCUPIED' && selectedRoom.bookings[0] && (
                <button
                  onClick={() => {
                    if (confirm(`Check out ${selectedRoom.bookings[0].guestName}?\n\nTotal due: KES ${(selectedRoom.bookings[0].totalAmountCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`)) {
                      checkOutMutation.mutate(selectedRoom.bookings[0].id);
                    }
                  }}
                  disabled={checkOutMutation.isPending}
                  className="w-full py-3 bg-green-600 hover:bg-green-700 text-white rounded-xl font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {checkOutMutation.isPending ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogOut className="w-5 h-5" />}
                  Check Out — KES {(selectedRoom.bookings[0].totalAmountCents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setEditRoomForm({
                      number: selectedRoom.number,
                      type: selectedRoom.type,
                      floor: selectedRoom.floor ?? '',
                      capacity: selectedRoom.capacity,
                      pricePerNightCents: selectedRoom.pricePerNightCents / 100,
                      notes: selectedRoom.notes ?? '',
                    });
                    setEditingRoom(selectedRoom);
                    setSelectedRoom(null);
                  }}
                  className="py-2 text-xs border border-blue-200 text-blue-600 hover:bg-blue-50 rounded-xl flex items-center justify-center gap-1.5"
                >
                  <Edit2 className="w-3.5 h-3.5" /> Edit Room
                </button>
                {selectedRoom.status !== 'MAINTENANCE' ? (
                  <button
                    onClick={() => {
                      updateRoomStatusMutation.mutate({ roomId: selectedRoom.id, status: 'MAINTENANCE' });
                      setSelectedRoom(null);
                    }}
                    className="py-2 text-xs border border-gray-200 text-gray-500 hover:bg-gray-50 rounded-xl flex items-center justify-center gap-1"
                  >
                    Maintenance
                  </button>
                ) : (
                  <button
                    onClick={() => {
                      updateRoomStatusMutation.mutate({ roomId: selectedRoom.id, status: 'AVAILABLE' });
                      setSelectedRoom(null);
                    }}
                    className="py-2 text-xs border border-green-200 text-green-600 hover:bg-green-50 rounded-xl flex items-center justify-center gap-1"
                  >
                    Mark Available
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New Booking Modal ─────────────────────────────────────────────────── */}
      {showBookingModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-md shadow-2xl max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">
                Check In — Room {showBookingModal.number}
              </h2>
              <button onClick={() => setShowBookingModal(null)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm p-3 bg-teal-50 rounded-xl">
                <div><span className="text-gray-400">Room Type</span><p className="font-semibold">{showBookingModal.type}</p></div>
                <div><span className="text-gray-400">Rate</span><p className="font-semibold text-teal-700">KES {(showBookingModal.pricePerNightCents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}/night</p></div>
              </div>
              {[
                { label: 'Guest Name *', key: 'guestName', type: 'text', placeholder: 'Full name' },
                { label: 'Phone Number', key: 'guestPhone', type: 'tel', placeholder: '+254...' },
                { label: 'ID / Passport', key: 'guestIdNumber', type: 'text', placeholder: 'National ID or passport' },
              ].map(({ label, key, type, placeholder }) => (
                <div key={key}>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">{label}</label>
                  <input
                    type={type}
                    value={(bookingForm as Record<string, string | number>)[key] as string}
                    onChange={e => setBookingForm(f => ({ ...f, [key]: e.target.value }))}
                    placeholder={placeholder}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              ))}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Check-in Date</label>
                  <input
                    type="date"
                    value={bookingForm.checkInDate}
                    onChange={e => setBookingForm(f => ({ ...f, checkInDate: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Check-out Date</label>
                  <input
                    type="date"
                    value={bookingForm.checkOutDate}
                    onChange={e => {
                      const nights = bookingForm.checkInDate && e.target.value
                        ? Math.max(1, Math.ceil((new Date(e.target.value).getTime() - new Date(bookingForm.checkInDate).getTime()) / 86400000))
                        : 1;
                      setBookingForm(f => ({ ...f, checkOutDate: e.target.value, nightCount: nights }));
                    }}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Nights</label>
                  <input
                    type="number"
                    min={1}
                    value={bookingForm.nightCount}
                    onChange={e => setBookingForm(f => ({ ...f, nightCount: parseInt(e.target.value) || 1 }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Deposit (KES)</label>
                  <input
                    type="number"
                    min={0}
                    value={bookingForm.depositCents}
                    onChange={e => setBookingForm(f => ({ ...f, depositCents: parseFloat(e.target.value) || 0 }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
              <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Room total ({bookingForm.nightCount} night{bookingForm.nightCount !== 1 ? 's' : ''})</span>
                  <span className="font-bold text-teal-700">KES {((showBookingModal.pricePerNightCents * bookingForm.nightCount) / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}</span>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <textarea
                  value={bookingForm.notes}
                  onChange={e => setBookingForm(f => ({ ...f, notes: e.target.value }))}
                  rows={2}
                  placeholder="Special requests, preferences..."
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>
            <div className="p-4 border-t dark:border-gray-700 grid grid-cols-2 gap-3">
              <button onClick={() => setShowBookingModal(null)} className="py-2.5 border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm">Cancel</button>
              <button
                onClick={() => createBookingMutation.mutate(showBookingModal.id)}
                disabled={!bookingForm.guestName || createBookingMutation.isPending}
                className="py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {createBookingMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogIn className="w-4 h-4" />}
                Check In
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Add Room Modal ───────────────────────────────────────────────────── */}
      {showAddRoomModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">Add Room</h2>
              <button onClick={() => setShowAddRoomModal(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Room Number *</label>
                  <input
                    type="text"
                    value={addRoomForm.number}
                    onChange={e => setAddRoomForm(f => ({ ...f, number: e.target.value }))}
                    placeholder="101, Suite A…"
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Floor</label>
                  <input
                    type="text"
                    value={addRoomForm.floor}
                    onChange={e => setAddRoomForm(f => ({ ...f, floor: e.target.value }))}
                    placeholder="1st Floor"
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Type</label>
                  <select
                    value={addRoomForm.type}
                    onChange={e => setAddRoomForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
                  >
                    {['STANDARD','DELUXE','SUITE','EXECUTIVE','PENTHOUSE'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Capacity</label>
                  <input
                    type="number"
                    min={1}
                    value={addRoomForm.capacity}
                    onChange={e => setAddRoomForm(f => ({ ...f, capacity: parseInt(e.target.value) || 1 }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Price per Night (KES)</label>
                <input
                  type="number"
                  min={0}
                  value={addRoomForm.pricePerNightCents}
                  onChange={e => setAddRoomForm(f => ({ ...f, pricePerNightCents: parseFloat(e.target.value) || 0 }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Notes</label>
                <input
                  type="text"
                  value={addRoomForm.notes}
                  onChange={e => setAddRoomForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Ocean view, Non-smoking…"
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-teal-500"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button onClick={() => setShowAddRoomModal(false)} className="py-2.5 border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm">Cancel</button>
                <button
                  onClick={() => createRoomMutation.mutate(addRoomForm)}
                  disabled={!addRoomForm.number || createRoomMutation.isPending}
                  className="py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-sm disabled:opacity-50"
                >
                  Add Room
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Room Modal ─────────────────────────────────────────────────── */}
      {editingRoom && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white">Edit Room {editingRoom.number}</h2>
              <button onClick={() => setEditingRoom(null)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Room Number *</label>
                  <input
                    type="text"
                    value={editRoomForm.number}
                    onChange={e => setEditRoomForm(f => ({ ...f, number: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Floor</label>
                  <input
                    type="text"
                    value={editRoomForm.floor}
                    onChange={e => setEditRoomForm(f => ({ ...f, floor: e.target.value }))}
                    placeholder="1st Floor"
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Type</label>
                  <select
                    value={editRoomForm.type}
                    onChange={e => setEditRoomForm(f => ({ ...f, type: e.target.value }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  >
                    {['STANDARD','DELUXE','SUITE','EXECUTIVE','PENTHOUSE'].map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Capacity</label>
                  <input
                    type="number"
                    min={1}
                    value={editRoomForm.capacity}
                    onChange={e => setEditRoomForm(f => ({ ...f, capacity: parseInt(e.target.value) || 1 }))}
                    className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Price per Night (KES)</label>
                <input
                  type="number"
                  min={0}
                  value={editRoomForm.pricePerNightCents}
                  onChange={e => setEditRoomForm(f => ({ ...f, pricePerNightCents: parseFloat(e.target.value) || 0 }))}
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Notes</label>
                <input
                  type="text"
                  value={editRoomForm.notes}
                  onChange={e => setEditRoomForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Ocean view, Non-smoking…"
                  className="w-full border rounded-xl px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3 pt-2">
                <button onClick={() => setEditingRoom(null)} className="py-2.5 border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm dark:border-gray-600 dark:text-gray-300">Cancel</button>
                <button
                  onClick={() => updateRoomMutation.mutate({ roomId: editingRoom.id, data: editRoomForm })}
                  disabled={!editRoomForm.number || updateRoomMutation.isPending}
                  className="py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {updateRoomMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                  Save Changes
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── All Bookings Modal ───────────────────────────────────────────────── */}
      {showBookingsListModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b dark:border-gray-700">
              <h2 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                <CalendarDays className="w-5 h-5 text-teal-600" /> All Bookings
              </h2>
              <button onClick={() => setShowBookingsListModal(false)} className="p-2 rounded-full hover:bg-gray-100 dark:hover:bg-gray-700">
                <X className="w-5 h-5 text-gray-500" />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {roomBookings.length === 0 ? (
                <div className="py-16 text-center text-gray-400">
                  <CalendarDays className="w-10 h-10 mx-auto mb-2 opacity-20" />
                  <p className="text-sm">No bookings yet</p>
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0">
                    <tr>
                      {['Room','Guest','Phone','Check-in','Check-out','Nights','Total','Status'].map(h => (
                        <th key={h} className="text-left px-4 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                    {roomBookings.map(b => (
                      <tr key={b.id} className="hover:bg-gray-50 dark:hover:bg-gray-700/50">
                        <td className="px-4 py-3 font-medium">{b.room?.number}</td>
                        <td className="px-4 py-3">{b.guestName}</td>
                        <td className="px-4 py-3 text-gray-500">{b.guestPhone || '—'}</td>
                        <td className="px-4 py-3 text-gray-500">{new Date(b.checkInDate).toLocaleDateString('en-KE')}</td>
                        <td className="px-4 py-3 text-gray-500">{b.checkOutDate ? new Date(b.checkOutDate).toLocaleDateString('en-KE') : '—'}</td>
                        <td className="px-4 py-3 text-center">{b.nightCount}</td>
                        <td className="px-4 py-3 font-medium text-teal-700">KES {(b.totalAmountCents / 100).toLocaleString('en-KE', { maximumFractionDigits: 0 })}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                            b.status === 'CHECKED_IN'  ? 'bg-blue-100 text-blue-700' :
                            b.status === 'CHECKED_OUT' ? 'bg-green-100 text-green-700' :
                            b.status === 'RESERVED'    ? 'bg-yellow-100 text-yellow-700' :
                            b.status === 'CANCELLED'   ? 'bg-red-100 text-red-700' :
                            'bg-gray-100 text-gray-600'
                          }`}>{b.status.replace('_', ' ')}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="p-4 border-t dark:border-gray-700">
              <button onClick={() => setShowBookingsListModal(false)} className="w-full py-2.5 border border-gray-300 text-gray-700 rounded-xl font-semibold text-sm">Close</button>
            </div>
          </div>
        </div>
      )}

      {/* Order Panel */}
      {selectedTable && (
        <OrderPanel
          table={selectedTable}
          allTables={tables}
          businessId={businessId}
          storeId={storeId}
          userName={user?.name}
          tablePrefix={tablePrefix}
          onClose={() => setSelectedTable(null)}
          onRefresh={() => {
            void qc.invalidateQueries({ queryKey: ['tables'] });
            setSelectedTable(null);
          }}
        />
      )}

      {/* Fast Food Panel */}
      {showFastFood && (
        <FastFoodPanel
          businessId={businessId}
          storeId={storeId}
          userId={user?.id ?? ''}
          userName={user?.name}
          onClose={() => setShowFastFood(false)}
        />
      )}

      {/* Reservations Modal */}
      {showReservations && (
        <ReservationsModal
          storeId={storeId}
          businessId={businessId}
          tables={tables}
          tablePrefix={tablePrefix}
          onClose={() => setShowReservations(false)}
        />
      )}

      {/* KDS View */}
      {showKDS && (
        <KDSView storeId={storeId} tablePrefix={tablePrefix} onClose={() => setShowKDS(false)} />
      )}

      {/* ── Add Table Modal ─────────────────────────────────────────────────── */}
      {showAddTableModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Add Table</h2>
              <button onClick={() => setShowAddTableModal(false)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Table Number / Name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={addTableForm.number}
                  onChange={(e) => setAddTableForm((f) => ({ ...f, number: e.target.value }))}
                  placeholder="e.g. 1, A1, Terrace-2, VIP"
                  className="w-full border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Seating Capacity</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setAddTableForm((f) => ({ ...f, capacity: Math.max(1, f.capacity - 1) }))}
                    className="w-10 h-10 rounded-xl border flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-lg"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={addTableForm.capacity}
                    onChange={(e) => setAddTableForm((f) => ({ ...f, capacity: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="flex-1 border rounded-xl px-4 py-2.5 text-center text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => setAddTableForm((f) => ({ ...f, capacity: Math.min(50, f.capacity + 1) }))}
                    className="w-10 h-10 rounded-xl border flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-lg"
                  >
                    +
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Floor / Section <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={addTableForm.floor}
                  onChange={(e) => setAddTableForm((f) => ({ ...f, floor: e.target.value }))}
                  placeholder="e.g. Ground Floor, Rooftop, Garden"
                  className="w-full border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {createTable.isError && (
                <p className="text-sm text-red-600">{(createTable.error as Error).message}</p>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setShowAddTableModal(false)}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  createTable.mutate({
                    number: addTableForm.number.trim(),
                    capacity: addTableForm.capacity,
                    floor: addTableForm.floor.trim() || undefined,
                  })
                }
                disabled={!addTableForm.number.trim() || createTable.isPending}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {createTable.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Plus className="w-4 h-4" />
                )}
                {createTable.isPending ? 'Adding…' : 'Add Table'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Edit Table Modal ─────────────────────────────────────────────────── */}
      {editingTable && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="flex items-center justify-between px-6 py-4 border-b">
              <h2 className="text-lg font-bold text-gray-900">Edit Table T{editingTable.number}</h2>
              <button onClick={() => setEditingTable(null)} className="text-gray-400 hover:text-gray-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Table Number / Name</label>
                <input
                  type="text"
                  value={editTableForm.number}
                  onChange={(e) => setEditTableForm((f) => ({ ...f, number: e.target.value }))}
                  className="w-full border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">Seating Capacity</label>
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setEditTableForm((f) => ({ ...f, capacity: Math.max(1, f.capacity - 1) }))}
                    className="w-10 h-10 rounded-xl border flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-lg"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={editTableForm.capacity}
                    onChange={(e) => setEditTableForm((f) => ({ ...f, capacity: Math.max(1, parseInt(e.target.value) || 1) }))}
                    className="flex-1 border rounded-xl px-4 py-2.5 text-center text-lg font-semibold focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <button
                    onClick={() => setEditTableForm((f) => ({ ...f, capacity: Math.min(50, f.capacity + 1) }))}
                    className="w-10 h-10 rounded-xl border flex items-center justify-center text-gray-600 hover:bg-gray-50 font-bold text-lg"
                  >
                    +
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Floor / Section <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={editTableForm.floor}
                  onChange={(e) => setEditTableForm((f) => ({ ...f, floor: e.target.value }))}
                  placeholder="e.g. Ground Floor, Rooftop, Garden"
                  className="w-full border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              {updateTableMutation.isError && (
                <p className="text-sm text-red-600">{(updateTableMutation.error as Error).message}</p>
              )}
            </div>
            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={() => setEditingTable(null)}
                className="flex-1 py-2.5 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() =>
                  updateTableMutation.mutate({
                    id: editingTable.id,
                    number: editTableForm.number.trim(),
                    capacity: editTableForm.capacity,
                    floor: editTableForm.floor.trim(),
                  })
                }
                disabled={!editTableForm.number.trim() || updateTableMutation.isPending}
                className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
              >
                {updateTableMutation.isPending ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <CheckCircle className="w-4 h-4" />
                )}
                {updateTableMutation.isPending ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Table Confirmation ─────────────────────────────────────────── */}
      {confirmDeleteTable && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6">
              <div className="flex items-start gap-4 mb-5">
                <div className="p-2.5 bg-red-50 rounded-xl flex-shrink-0">
                  <Trash2 className="w-5 h-5 text-red-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 text-base">Remove Table</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    Permanently remove <strong>Table T{confirmDeleteTable.number}</strong>
                    {confirmDeleteTable.floor && ` (${confirmDeleteTable.floor})`}? This cannot be undone.
                  </p>
                </div>
              </div>
              {deleteTableMutation.isError && (
                <div className="mb-4 p-3 bg-red-50 rounded-lg text-sm text-red-700">
                  {(deleteTableMutation.error as Error).message}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={() => { setConfirmDeleteTable(null); deleteTableMutation.reset(); }}
                  className="flex-1 py-2.5 border border-gray-300 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => deleteTableMutation.mutate(confirmDeleteTable.id)}
                  disabled={deleteTableMutation.isPending}
                  className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-xl text-sm font-medium disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
                >
                  {deleteTableMutation.isPending && <RefreshCw className="w-4 h-4 animate-spin" />}
                  {deleteTableMutation.isPending ? 'Removing…' : 'Remove Table'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── New Bar Tab Dialog ───────────────────────────────────────────────── */}
      {showNewTabDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <h3 className="font-semibold text-lg text-gray-900 dark:text-white mb-4">New Bar Tab</h3>
            <input
              type="text"
              value={newTabName}
              onChange={e => setNewTabName(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && newTabName.trim()) {
                  createBarTabMutation.mutate({ businessId, storeId, tabName: newTabName.trim(), waiterId: user!.id });
                }
              }}
              placeholder="Customer name or table number"
              className="w-full px-4 py-3 border rounded-xl text-sm mb-4 focus:ring-2 focus:ring-purple-500 focus:border-transparent dark:bg-gray-700 dark:border-gray-600 dark:text-white"
              autoFocus
            />
            <div className="flex gap-3">
              <button
                onClick={() => { setShowNewTabDialog(false); setNewTabName(''); }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-xl text-sm text-gray-700 hover:bg-gray-50 dark:text-gray-300 dark:border-gray-600 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (newTabName.trim()) {
                    createBarTabMutation.mutate({ businessId, storeId, tabName: newTabName.trim(), waiterId: user!.id });
                  }
                }}
                disabled={!newTabName.trim() || createBarTabMutation.isPending}
                className="flex-1 px-4 py-2 bg-purple-600 text-white rounded-xl text-sm disabled:opacity-50 hover:bg-purple-700"
              >
                {createBarTabMutation.isPending ? 'Creating…' : 'Create Tab'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

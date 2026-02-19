import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Users, Clock, ChefHat, X, Trash2, Send, Receipt, RefreshCw,
  UtensilsCrossed, ArrowRight, Check, AlertCircle, Loader2,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import PaymentModal from '../components/PaymentModal';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Table {
  id: string;
  number: string;
  capacity: number;
  status: 'AVAILABLE' | 'OCCUPIED' | 'BILL_REQUESTED' | 'RESERVED';
  floor?: string;
  currentOrderId?: string;
}

interface OrderItem {
  id: string;
  itemId: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  specialInstructions?: string;
  modifiers?: string[];
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
  priceCents: number;
  category?: string;
  sku?: string;
}

interface KdsItem {
  orderId: string;
  tableNumber: string;
  items: Array<{ name: string; quantity: number; specialInstructions?: string }>;
  kotId: string;
  kotStatus: string;
  createdAt: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmt = (cents: number) =>
  `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function uuid(): string {
  return crypto.randomUUID();
}

const TABLE_COLORS: Record<Table['status'], string> = {
  AVAILABLE: 'bg-green-50 border-green-300 text-green-800 hover:bg-green-100',
  OCCUPIED: 'bg-red-50 border-red-300 text-red-800 hover:bg-red-100',
  BILL_REQUESTED: 'bg-yellow-50 border-yellow-300 text-yellow-800 hover:bg-yellow-100',
  RESERVED: 'bg-blue-50 border-blue-300 text-blue-800 hover:bg-blue-100',
};

const TABLE_DOTS: Record<Table['status'], string> = {
  AVAILABLE: 'bg-green-500',
  OCCUPIED: 'bg-red-500',
  BILL_REQUESTED: 'bg-yellow-500',
  RESERVED: 'bg-blue-500',
};

// ─── ItemPicker Modal ─────────────────────────────────────────────────────────

interface ItemPickerProps {
  businessId: string;
  storeId: string;
  onAdd: (item: MenuItem, qty: number, note: string) => void;
  onClose: () => void;
}

function ItemPicker({ businessId, storeId, onAdd, onClose }: ItemPickerProps) {
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<MenuItem | null>(null);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  const { data: items = [], isLoading } = useQuery<MenuItem[]>({
    queryKey: ['menu-items', businessId, storeId],
    queryFn: () =>
      api.get<MenuItem[]>(`/catalog/items?businessId=${businessId}&storeId=${storeId}&active=true`),
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
                      onClick={() => {
                        setSelected(item);
                        setQty(1);
                        setNote('');
                      }}
                      className={`p-3 rounded-xl border-2 text-left transition-all ${
                        selected?.id === item.id
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                      }`}
                    >
                      <div className="font-medium text-sm text-gray-800 truncate">{item.name}</div>
                      <div className="text-xs text-blue-600 font-semibold mt-1">{fmt(item.priceCents)}</div>
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
              <span className="text-blue-600 font-bold">{fmt(selected.priceCents * qty)}</span>
            </div>
            <div className="flex gap-3">
              <div className="flex items-center border rounded-xl overflow-hidden">
                <button
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  className="px-4 py-2 text-lg font-bold text-gray-600 hover:bg-gray-100"
                >
                  −
                </button>
                <span className="px-4 py-2 font-bold text-lg w-12 text-center">{qty}</span>
                <button
                  onClick={() => setQty((q) => q + 1)}
                  className="px-4 py-2 text-lg font-bold text-gray-600 hover:bg-gray-100"
                >
                  +
                </button>
              </div>
              <input
                type="text"
                placeholder="Special instructions..."
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="flex-1 px-3 py-2 border rounded-xl text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <button
              onClick={() => {
                onAdd(selected, qty, note);
                setSelected(null);
                setNote('');
                setQty(1);
              }}
              className="w-full py-3 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-5 h-5" />
              Add {qty}× {selected.name}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Order Panel ──────────────────────────────────────────────────────────────

interface OrderPanelProps {
  table: Table;
  businessId: string;
  storeId: string;
  onClose: () => void;
  onRefresh: () => void;
}

function OrderPanel({ table, businessId, storeId, onClose, onRefresh }: OrderPanelProps) {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const [showPicker, setShowPicker] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [payError, setPayError] = useState<string | null>(null);
  const [pendingItems, setPendingItems] = useState<Array<{
    itemId: string; name: string; quantity: number; unitPriceCents: number; specialInstructions?: string;
  }>>([]);

  // Fetch order details if table is occupied
  const { data: order, isLoading: orderLoading, refetch: refetchOrder } = useQuery<HospOrder | null>({
    queryKey: ['hosp-order', table.id],
    queryFn: async () => {
      if (!table.currentOrderId) return null;
      return api.get<HospOrder>(`/hospitality/orders/${table.currentOrderId}`);
    },
    enabled: !!table.currentOrderId,
    refetchInterval: 15000,
  });

  // Create order
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

  // Add items to existing order
  const addItems = useMutation({
    mutationFn: (vars: { orderId: string; items: typeof pendingItems }) =>
      api.post(`/hospitality/orders/${vars.orderId}/items`, { items: vars.items }),
    onSuccess: () => {
      setPendingItems([]);
      void refetchOrder();
      void qc.invalidateQueries({ queryKey: ['tables'] });
    },
  });

  // Remove item
  const removeItem = useMutation({
    mutationFn: (vars: { orderId: string; itemId: string }) =>
      api.delete(`/hospitality/orders/${vars.orderId}/items?itemIds=${vars.itemId}`),
    onSuccess: () => void refetchOrder(),
  });

  // Send KOT
  const sendKOT = useMutation({
    mutationFn: (vars: { orderId: string; type: string }) =>
      api.post(`/hospitality/orders/${vars.orderId}/kot`, { type: vars.type }),
    onSuccess: () => {
      void refetchOrder();
      void qc.invalidateQueries({ queryKey: ['kds'] });
    },
  });

  // Request bill
  const requestBill = useMutation({
    mutationFn: (orderId: string) =>
      api.post(`/hospitality/orders/${orderId}/request-bill`, {}),
    onSuccess: () => {
      void refetchOrder();
      void qc.invalidateQueries({ queryKey: ['tables'] });
      onRefresh();
    },
  });

  // Checkout (payment)
  const checkout = useMutation({
    mutationFn: (payments: Array<{ method: string; amountCents: number; reference?: string }>) => {
      if (!order) throw new Error('No order');
      const items = order.items.map((i) => ({
        itemId: i.itemId,
        name: i.name,
        quantity: i.quantity,
        unitPriceCents: i.unitPriceCents,
      }));
      return api.post('/sales/checkout', {
        storeId,
        businessId,
        cashierId: user?.id ?? '',
        type: 'DINE_IN',
        priceLevel: 'STANDARD',
        orderId: order.id,
        items,
        payments,
      });
    },
    onSuccess: () => {
      setShowPayment(false);
      setPayError(null);
      void qc.invalidateQueries({ queryKey: ['tables'] });
      onRefresh();
      onClose();
    },
    onError: (err) => {
      setPayError(err instanceof Error ? err.message : 'Payment failed');
    },
  });

  const activeOrder = order;
  const allItems = [
    ...(activeOrder?.items ?? []),
    ...pendingItems.map((p) => ({ ...p, id: `pending-${p.itemId}`, kotSent: false })),
  ];
  const subtotal = allItems.reduce((s, i) => s + i.unitPriceCents * i.quantity, 0);
  const hasPendingItems = pendingItems.length > 0;

  function handleAddFromPicker(item: MenuItem, qty: number, note: string) {
    setPendingItems((prev) => {
      const existing = prev.find((p) => p.itemId === item.id && !p.specialInstructions && !note);
      if (existing) {
        return prev.map((p) => p === existing ? { ...p, quantity: p.quantity + qty } : p);
      }
      return [...prev, {
        itemId: item.id,
        name: item.name,
        quantity: qty,
        unitPriceCents: item.priceCents,
        specialInstructions: note || undefined,
      }];
    });
    setShowPicker(false);
  }

  async function handleSendKOT() {
    if (!activeOrder && pendingItems.length === 0) return;

    // If no order exists yet, create one first then add items
    if (!activeOrder) {
      const newOrder = await createOrder.mutateAsync();
      if (pendingItems.length > 0) {
        await addItems.mutateAsync({ orderId: newOrder.id, items: pendingItems });
        await sendKOT.mutateAsync({ orderId: newOrder.id, type: 'NEW_ORDER' });
      }
      return;
    }

    // Add pending items first, then send KOT
    if (pendingItems.length > 0) {
      await addItems.mutateAsync({ orderId: activeOrder.id, items: pendingItems });
      await sendKOT.mutateAsync({ orderId: activeOrder.id, type: 'ADDITION' });
    } else {
      await sendKOT.mutateAsync({ orderId: activeOrder.id, type: 'NEW_ORDER' });
    }
  }

  const isBusy = createOrder.isPending || addItems.isPending || sendKOT.isPending ||
    requestBill.isPending || checkout.isPending;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
      <div className="fixed right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl z-50 flex flex-col">
        {/* Header */}
        <div className="px-5 py-4 border-b bg-gray-50">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-bold text-gray-800">Table {table.number}</h2>
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
            <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-200">
              <X className="w-5 h-5 text-gray-500" />
            </button>
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
              <p className="text-gray-400 text-sm">No items yet</p>
              <p className="text-gray-400 text-xs mt-1">Add items to start the order</p>
            </div>
          ) : (
            <>
              {/* Sent items (from order) */}
              {activeOrder?.items.map((item) => (
                <div key={item.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-gray-800">{item.quantity}×</span>
                      <span className="text-sm text-gray-700 truncate">{item.name}</span>
                      <Check className="w-3 h-3 text-green-500 flex-shrink-0" aria-label="Sent to kitchen" />
                    </div>
                    {item.specialInstructions && (
                      <p className="text-xs text-amber-600 mt-0.5 ml-6">{item.specialInstructions}</p>
                    )}
                  </div>
                  <span className="text-sm font-bold text-gray-800">
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
              ))}

              {/* Pending items (not yet sent) */}
              {pendingItems.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-amber-700">{item.quantity}×</span>
                      <span className="text-sm text-amber-800 truncate">{item.name}</span>
                      <span className="text-xs bg-amber-200 text-amber-700 px-1.5 py-0.5 rounded">pending</span>
                    </div>
                    {item.specialInstructions && (
                      <p className="text-xs text-amber-600 mt-0.5 ml-6">{item.specialInstructions}</p>
                    )}
                  </div>
                  <span className="text-sm font-bold text-amber-800">
                    {fmt(item.unitPriceCents * item.quantity)}
                  </span>
                  <button
                    onClick={() => setPendingItems((prev) => prev.filter((_, i) => i !== idx))}
                    className="p-1 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
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

          {/* Add Items */}
          <button
            onClick={() => setShowPicker(true)}
            className="w-full py-3 border-2 border-dashed border-blue-300 text-blue-600 hover:bg-blue-50 rounded-xl font-medium text-sm flex items-center justify-center gap-2 transition-colors"
          >
            <Plus className="w-4 h-4" />
            Add Items
          </button>

          {/* Send KOT */}
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

          {/* Request Bill */}
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

          {/* Take Payment */}
          {activeOrder && (table.status === 'OCCUPIED' || table.status === 'BILL_REQUESTED') && (
            <button
              onClick={() => { setPayError(null); setShowPayment(true); }}
              disabled={isBusy}
              className="w-full py-3.5 bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white rounded-xl font-bold flex items-center justify-center gap-2 transition-colors"
            >
              <ArrowRight className="w-5 h-5" />
              Take Payment — {fmt(activeOrder.totalCents)}
            </button>
          )}

          {/* KOT status info */}
          {activeOrder?.kots && activeOrder.kots.length > 0 && (
            <div className="text-xs text-gray-400 text-center">
              {activeOrder.kots.length} KOT(s) sent •{' '}
              Last: {activeOrder.kots[activeOrder.kots.length - 1].status}
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

      {showPayment && activeOrder && (
        <PaymentModal
          totalCents={activeOrder.totalCents}
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
}

function KDSView({ storeId, onClose }: KDSViewProps) {
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
                  key={kds.kotId}
                  className={`rounded-xl border-2 p-4 ${
                    kds.kotStatus === 'READY' ? 'border-green-500 bg-green-900/20' :
                    isOld ? 'border-red-500 bg-red-900/20 animate-pulse' :
                    'border-orange-400 bg-orange-900/20'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <div>
                      <span className="text-white font-bold text-lg">T{kds.tableNumber}</span>
                      <span className="ml-2 text-xs text-gray-400">
                        {new Date(kds.createdAt).toLocaleTimeString('en-KE', {
                          hour: '2-digit', minute: '2-digit',
                        })}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {isOld && (
                        <span className="text-xs text-red-400 font-bold">{age}m</span>
                      )}
                      <span className={`text-xs px-2 py-1 rounded-full font-semibold ${
                        kds.kotStatus === 'READY' ? 'bg-green-600 text-white' :
                        kds.kotStatus === 'IN_PROGRESS' ? 'bg-orange-500 text-white' :
                        'bg-gray-600 text-gray-200'
                      }`}>
                        {kds.kotStatus}
                      </span>
                    </div>
                  </div>

                  <div className="space-y-2 mb-4">
                    {kds.items.map((item, idx) => (
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
                    {kds.kotStatus === 'PENDING' && (
                      <button
                        onClick={() => updateKOT.mutate({ kotId: kds.kotId, status: 'IN_PROGRESS' })}
                        className="flex-1 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Start
                      </button>
                    )}
                    {kds.kotStatus === 'IN_PROGRESS' && (
                      <button
                        onClick={() => updateKOT.mutate({ kotId: kds.kotId, status: 'READY' })}
                        className="flex-1 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Ready
                      </button>
                    )}
                    {kds.kotStatus === 'READY' && (
                      <button
                        onClick={() => updateKOT.mutate({ kotId: kds.kotId, status: 'SERVED' })}
                        className="flex-1 py-2 bg-blue-500 hover:bg-blue-600 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        Served
                      </button>
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
  const [selectedTable, setSelectedTable] = useState<Table | null>(null);
  const [showKDS, setShowKDS] = useState(false);
  const [filterStatus, setFilterStatus] = useState<Table['status'] | 'ALL'>('ALL');

  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';

  const { data: tables = [], isLoading, refetch } = useQuery<Table[]>({
    queryKey: ['tables', storeId],
    queryFn: () => api.get<Table[]>(`/hospitality/tables?storeId=${storeId}`),
    enabled: !!storeId,
    refetchInterval: 30000,
  });

  const createTable = useMutation({
    mutationFn: (data: { number: string; capacity: number; floor?: string }) =>
      api.post('/hospitality/tables', { ...data, businessId, storeId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['tables'] }),
  });

  const filtered = filterStatus === 'ALL' ? tables : tables.filter((t) => t.status === filterStatus);

  const stats = {
    available: tables.filter((t) => t.status === 'AVAILABLE').length,
    occupied: tables.filter((t) => t.status === 'OCCUPIED').length,
    billRequested: tables.filter((t) => t.status === 'BILL_REQUESTED').length,
    reserved: tables.filter((t) => t.status === 'RESERVED').length,
  };

  function handleAddTable() {
    const number = window.prompt('Table number/name (e.g. 1, A1, Terrace-1):');
    if (!number?.trim()) return;
    const capStr = window.prompt('Seating capacity:', '4');
    const capacity = parseInt(capStr ?? '4', 10);
    if (!capacity || capacity < 1) return;
    const floor = window.prompt('Floor/section (optional, press Enter to skip):') || undefined;
    createTable.mutate({ number: number.trim(), capacity, floor: floor?.trim() || undefined });
  }

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Table Management</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {stats.available} available • {stats.occupied} occupied
              {stats.billRequested > 0 && ` • ${stats.billRequested} bill requested`}
              {stats.reserved > 0 && ` • ${stats.reserved} reserved`}
            </p>
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
              onClick={() => setShowKDS(true)}
              className="flex items-center gap-2 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white rounded-lg font-medium transition-colors"
            >
              <ChefHat className="w-4 h-4" />
              KDS
            </button>
            <button
              onClick={handleAddTable}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              Add Table
            </button>
          </div>
        </div>

        {/* Status filter tabs */}
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
      </div>

      {/* Table Grid */}
      <div className="flex-1 overflow-y-auto p-6">
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
              onClick={handleAddTable}
              className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-medium transition-colors"
            >
              Add First Table
            </button>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            No {filterStatus.toLowerCase().replace('_', ' ')} tables
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
            {filtered.map((table) => (
              <button
                key={table.id}
                onClick={() => setSelectedTable(table)}
                className={`relative p-4 rounded-2xl border-2 transition-all hover:shadow-lg active:scale-95 ${
                  TABLE_COLORS[table.status]
                }`}
              >
                {/* Status dot */}
                <div className={`absolute top-3 right-3 w-2.5 h-2.5 rounded-full ${TABLE_DOTS[table.status]}`} />

                <div className="text-center">
                  <div className="text-2xl font-black mb-1">T{table.number}</div>
                  <div className="text-xs opacity-70 flex items-center justify-center gap-1">
                    <Users className="w-3 h-3" />
                    {table.capacity}
                  </div>
                  {table.floor && (
                    <div className="text-xs opacity-60 mt-0.5">{table.floor}</div>
                  )}
                  {table.status === 'BILL_REQUESTED' && (
                    <div className="mt-2 bg-yellow-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
                      BILL
                    </div>
                  )}
                  {table.status === 'OCCUPIED' && (
                    <div className="mt-2 flex items-center justify-center gap-1">
                      <Clock className="w-3 h-3 opacity-60" />
                      <span className="text-xs opacity-60">Active</span>
                    </div>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Order Panel */}
      {selectedTable && (
        <OrderPanel
          table={selectedTable}
          businessId={businessId}
          storeId={storeId}
          onClose={() => setSelectedTable(null)}
          onRefresh={() => {
            void qc.invalidateQueries({ queryKey: ['tables'] });
            setSelectedTable(null);
          }}
        />
      )}

      {/* KDS View */}
      {showKDS && (
        <KDSView storeId={storeId} onClose={() => setShowKDS(false)} />
      )}
    </div>
  );
}

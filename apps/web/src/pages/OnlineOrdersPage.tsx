import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { toast } from 'sonner';
import { ShoppingBag, MapPin, Phone, Clock, CheckCircle, XCircle, Bike, PackageCheck } from 'lucide-react';

interface OrderItem { id: string; name: string; quantity: number; unitPriceCents: number; totalCents: number }
interface OnlineOrder {
  id: string;
  orderNumber: string;
  status: string;
  fulfillmentType: 'DELIVERY' | 'PICKUP';
  paymentStatus: string;
  customerName: string;
  customerPhone?: string;
  deliveryAddress: string;
  totalCents: number;
  etaMinutes?: number;
  createdAt: string;
  notes?: string;
  items: OrderItem[];
}

const KES = (c: number) => `KES ${(c / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;

const STATUS_STYLE: Record<string, string> = {
  PENDING: 'bg-amber-100 text-amber-700',
  CONFIRMED: 'bg-indigo-100 text-indigo-700',
  READY: 'bg-blue-100 text-blue-700',
  ASSIGNED: 'bg-purple-100 text-purple-700',
  IN_TRANSIT: 'bg-orange-100 text-orange-700',
  DELIVERED: 'bg-green-100 text-green-700',
  CANCELLED: 'bg-gray-100 text-gray-500',
  REJECTED: 'bg-red-100 text-red-700',
};

export default function OnlineOrdersPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const qc = useQueryClient();
  const [tab, setTab] = useState<'ACTIVE' | 'ALL'>('ACTIVE');

  const { data: orders = [], isLoading } = useQuery<OnlineOrder[]>({
    queryKey: ['online-orders', businessId],
    queryFn: () => api.get<OnlineOrder[]>(`/delivery?businessId=${businessId}&channel=PORTAL`),
    enabled: !!businessId,
    refetchInterval: 15_000,
  });

  const patch = useMutation({
    mutationFn: ({ id, body }: { id: string; body: Record<string, unknown> }) =>
      api.patch(`/delivery/${id}`, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['online-orders', businessId] }),
    onError: (e: unknown) => toast.error((e as Error)?.message ?? 'Update failed'),
  });

  const ACTIVE = ['PENDING', 'CONFIRMED', 'READY', 'ASSIGNED', 'IN_TRANSIT'];
  const visible = tab === 'ACTIVE' ? orders.filter((o) => ACTIVE.includes(o.status)) : orders;

  function accept(o: OnlineOrder) {
    const eta = window.prompt(`ETA in minutes for ${o.orderNumber}?`, '30');
    if (eta === null) return;
    patch.mutate({ id: o.id, body: { status: 'CONFIRMED', etaMinutes: Number(eta) || undefined } });
    toast.success(`Order ${o.orderNumber} accepted`);
  }
  function reject(o: OnlineOrder) {
    const reason = window.prompt(`Reason for rejecting ${o.orderNumber}?`, '');
    if (reason === null) return;
    patch.mutate({ id: o.id, body: { status: 'REJECTED', rejectionReason: reason } });
  }
  function setStatus(o: OnlineOrder, status: string) {
    patch.mutate({ id: o.id, body: { status } });
  }

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-2 mb-1">
        <ShoppingBag className="w-6 h-6 text-indigo-600" />
        <h1 className="text-2xl font-bold dark:text-white">Online Orders</h1>
      </div>
      <p className="text-sm text-gray-500 mb-4">Self-service orders placed by customers from the app.</p>

      <div className="flex gap-2 mb-4">
        {(['ACTIVE', 'ALL'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-1.5 rounded-full text-sm font-medium ${tab === t ? 'bg-indigo-600 text-white' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300'}`}
          >
            {t === 'ACTIVE' ? 'Active' : 'All'}
          </button>
        ))}
      </div>

      {isLoading ? (
        <p className="text-gray-500">Loading…</p>
      ) : visible.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <ShoppingBag className="w-12 h-12 mx-auto mb-2 opacity-40" />
          <p>No {tab === 'ACTIVE' ? 'active ' : ''}online orders.</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {visible.map((o) => (
            <div key={o.id} className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold dark:text-white">{o.orderNumber}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${STATUS_STYLE[o.status] ?? 'bg-gray-100 text-gray-600'}`}>{o.status}</span>
                    <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${o.paymentStatus === 'PAID' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{o.paymentStatus}</span>
                  </div>
                  <div className="text-xs text-gray-500 mt-0.5 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1">{o.fulfillmentType === 'PICKUP' ? <PackageCheck className="w-3 h-3" /> : <Bike className="w-3 h-3" />}{o.fulfillmentType}</span>
                    <span>·</span>
                    <span>{new Date(o.createdAt).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                </div>
                <span className="font-bold text-indigo-600">{KES(o.totalCents)}</span>
              </div>

              <div className="text-sm dark:text-gray-200 mb-2">
                <div className="font-medium">{o.customerName}</div>
                {o.customerPhone && <div className="text-xs text-gray-500 flex items-center gap-1"><Phone className="w-3 h-3" />{o.customerPhone}</div>}
                {o.fulfillmentType === 'DELIVERY' && o.deliveryAddress !== 'PICKUP' && (
                  <div className="text-xs text-gray-500 flex items-center gap-1"><MapPin className="w-3 h-3" />{o.deliveryAddress}</div>
                )}
              </div>

              <ul className="text-sm border-t border-gray-100 dark:border-gray-800 pt-2 mb-3 space-y-0.5">
                {o.items.map((it) => (
                  <li key={it.id} className="flex justify-between text-gray-700 dark:text-gray-300">
                    <span>{it.quantity}× {it.name}</span>
                    <span>{KES(it.totalCents)}</span>
                  </li>
                ))}
              </ul>
              {o.etaMinutes ? <div className="text-xs text-gray-500 mb-2 flex items-center gap-1"><Clock className="w-3 h-3" />ETA {o.etaMinutes} min</div> : null}

              <div className="flex flex-wrap gap-2">
                {o.status === 'PENDING' && (
                  <>
                    <button onClick={() => accept(o)} className="flex items-center gap-1 px-3 py-1.5 bg-indigo-600 text-white rounded-lg text-sm font-medium hover:bg-indigo-700"><CheckCircle className="w-4 h-4" />Accept</button>
                    <button onClick={() => reject(o)} className="flex items-center gap-1 px-3 py-1.5 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100"><XCircle className="w-4 h-4" />Reject</button>
                  </>
                )}
                {o.status === 'CONFIRMED' && o.fulfillmentType === 'PICKUP' && (
                  <button onClick={() => setStatus(o, 'READY')} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">Mark Ready</button>
                )}
                {o.status === 'CONFIRMED' && o.fulfillmentType === 'DELIVERY' && (
                  <button onClick={() => setStatus(o, 'IN_TRANSIT')} className="px-3 py-1.5 bg-orange-600 text-white rounded-lg text-sm font-medium hover:bg-orange-700">Out for delivery</button>
                )}
                {(o.status === 'READY' || o.status === 'IN_TRANSIT' || o.status === 'ASSIGNED') && (
                  <button onClick={() => setStatus(o, 'DELIVERED')} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700">Mark {o.fulfillmentType === 'PICKUP' ? 'Collected' : 'Delivered'}</button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

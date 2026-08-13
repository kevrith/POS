import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, Clock, CheckCircle, Truck, Phone, Package } from 'lucide-react';
import { api } from '../lib/api';

interface DeliveryTracking {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  deliveryAddress: string;
  status: string;
  scheduledAt: string;
  pickedUpAt?: string;
  deliveredAt?: string;
  estimatedDeliveryAt?: string;
  driverLocations: Array<{
    lat: number;
    lng: number;
    timestamp: string;
  }>;
  trackingUrl: string;
}

/** A position stops being "live" once the driver's app has been quiet this long. */
const LIVE_WITHIN_MS = 2 * 60 * 1000;

function timeAgo(iso: string): string {
  const mins = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'yesterday' : `${days}d ago`;
}

const statusConfig = {
  PENDING: { label: 'Order Confirmed', color: 'bg-blue-500', icon: Package },
  ASSIGNED: { label: 'Driver Assigned', color: 'bg-yellow-500', icon: Truck },
  ARRIVING: { label: 'Driver Arriving', color: 'bg-orange-500', icon: MapPin },
  DELIVERED: { label: 'Delivered', color: 'bg-green-500', icon: CheckCircle },
  RESCHEDULED: { label: 'Rescheduled', color: 'bg-gray-500', icon: Clock },
};

export default function DeliveryTrackingPage() {
  const { orderNumber } = useParams<{ orderNumber: string }>();
  const [delivery, setDelivery] = useState<DeliveryTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!orderNumber) return;

    const fetchDelivery = async () => {
      try {
        const response = await api.get<DeliveryTracking>(`/delivery/orders/${orderNumber}/track`);
        setDelivery(response);
      } catch (err) {
        setError('Delivery order not found');
      } finally {
        setLoading(false);
      }
    };

    fetchDelivery();

    // Poll for updates every 30 seconds
    const interval = setInterval(fetchDelivery, 30000);
    return () => clearInterval(interval);
  }, [orderNumber]);

  const formatTime = (dateString: string) => {
    return new Date(dateString).toLocaleString('en-KE', {
      hour: '2-digit',
      minute: '2-digit',
      day: 'numeric',
      month: 'short',
    });
  };

  const getEstimatedArrival = () => {
    if (!delivery?.estimatedDeliveryAt) return 'Calculating...';
    
    const now = new Date();
    const estimated = new Date(delivery.estimatedDeliveryAt);
    const diffMinutes = Math.ceil((estimated.getTime() - now.getTime()) / (1000 * 60));
    
    if (diffMinutes <= 0) return 'Arriving now';
    if (diffMinutes < 60) return `${diffMinutes} minutes`;
    
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-600">Loading delivery information...</p>
        </div>
      </div>
    );
  }

  if (error || !delivery) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">Order Not Found</h1>
          <p className="text-gray-600">{error || 'The delivery order could not be found.'}</p>
        </div>
      </div>
    );
  }

  const currentStatus = statusConfig[delivery.status as keyof typeof statusConfig] || statusConfig.PENDING;
  const StatusIcon = currentStatus.icon;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-md mx-auto px-4 py-6">
          <div className="text-center">
            <h1 className="text-xl font-bold text-gray-900">Track Your Order</h1>
            <p className="text-sm text-gray-500 mt-1">Order #{delivery.orderNumber}</p>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-4 py-6 space-y-6">
        {/* Current Status */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 ${currentStatus.color} rounded-full flex items-center justify-center`}>
              <StatusIcon className="w-6 h-6 text-white" />
            </div>
            <div className="flex-1">
              <h2 className="font-semibold text-gray-900">{currentStatus.label}</h2>
              <p className="text-sm text-gray-500">
                {delivery.status === 'DELIVERED' && delivery.deliveredAt
                  ? `Delivered at ${formatTime(delivery.deliveredAt)}`
                  : delivery.status === 'ASSIGNED' && delivery.pickedUpAt
                  ? `Picked up at ${formatTime(delivery.pickedUpAt)}`
                  : `Estimated arrival: ${getEstimatedArrival()}`
                }
              </p>
            </div>
          </div>
        </div>

        {/* Delivery Details */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Delivery Details</h3>
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Delivery Address</p>
                <p className="text-sm text-gray-600">{delivery.deliveryAddress}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-gray-900">Contact</p>
                <p className="text-sm text-gray-600">{delivery.customerPhone}</p>
              </div>
            </div>
            {delivery.scheduledAt && (
              <div className="flex items-start gap-3">
                <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-gray-900">Scheduled Time</p>
                  <p className="text-sm text-gray-600">{formatTime(delivery.scheduledAt)}</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Progress Timeline */}
        <div className="bg-white rounded-2xl p-6 shadow-sm">
          <h3 className="font-semibold text-gray-900 mb-4">Order Progress</h3>
          <div className="space-y-4">
            {[
              { key: 'PENDING', label: 'Order Confirmed', time: delivery.scheduledAt },
              { key: 'ASSIGNED', label: 'Driver Assigned', time: delivery.pickedUpAt },
              { key: 'ARRIVING', label: 'Driver Arriving', time: null },
              { key: 'DELIVERED', label: 'Delivered', time: delivery.deliveredAt },
            ].map((step) => {
              const isCompleted = delivery.status === step.key || 
                (step.key === 'PENDING') ||
                (step.key === 'ASSIGNED' && ['ASSIGNED', 'ARRIVING', 'DELIVERED'].includes(delivery.status)) ||
                (step.key === 'ARRIVING' && ['ARRIVING', 'DELIVERED'].includes(delivery.status));
              
              const isCurrent = delivery.status === step.key;
              
              return (
                <div key={step.key} className="flex items-center gap-3">
                  <div className={`w-3 h-3 rounded-full ${
                    isCompleted ? 'bg-green-500' : 
                    isCurrent ? 'bg-blue-500' : 'bg-gray-300'
                  }`} />
                  <div className="flex-1">
                    <p className={`text-sm font-medium ${
                      isCompleted || isCurrent ? 'text-gray-900' : 'text-gray-500'
                    }`}>
                      {step.label}
                    </p>
                    {step.time && (
                      <p className="text-xs text-gray-500">{formatTime(step.time)}</p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Driver location (OpenStreetMap — no API key) */}
        {['ASSIGNED', 'IN_TRANSIT', 'ARRIVING'].includes(delivery.status) && delivery.driverLocations.length > 0 && (() => {
          const loc = delivery.driverLocations[0];
          const d = 0.006; // ~600m box around the driver
          const bbox = `${loc.lng - d},${loc.lat - d},${loc.lng + d},${loc.lat + d}`;
          const src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${loc.lat},${loc.lng}`;
          // The driver app only reports while it is open, so the newest fix can be
          // hours old. Calling that "Live" misleads the customer into waiting at the
          // door — show the age instead once it stops being current.
          const isLive = Date.now() - new Date(loc.timestamp).getTime() <= LIVE_WITHIN_MS;
          return (
            <div className="bg-white rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-gray-900">Driver Location</h3>
                {isLive ? (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-green-600">
                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse" /> Live
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-xs font-medium text-gray-500">
                    <span className="w-2 h-2 bg-gray-400 rounded-full" /> Last seen {timeAgo(loc.timestamp)}
                  </span>
                )}
              </div>
              <div className="rounded-lg overflow-hidden border border-gray-200">
                <iframe title="Driver location" src={src} className="w-full h-56" loading="lazy" />
              </div>
              <div className="flex items-center justify-between mt-2">
                <p className="text-xs text-gray-500">
                  {isLive
                    ? `Updated ${formatTime(loc.timestamp)}`
                    : `Position from ${formatTime(loc.timestamp)} — the driver's app is not reporting right now`}
                </p>
                <a href={`https://www.openstreetmap.org/?mlat=${loc.lat}&mlon=${loc.lng}#map=16/${loc.lat}/${loc.lng}`}
                  target="_blank" rel="noreferrer" className="text-xs text-blue-600 hover:underline">Open in maps →</a>
              </div>
            </div>
          );
        })()}

        {/* Contact Support */}
        <div className="bg-blue-50 rounded-2xl p-6">
          <h3 className="font-semibold text-gray-900 mb-2">Need Help?</h3>
          <p className="text-sm text-gray-600 mb-4">
            If you have any questions about your delivery, please contact our support team.
          </p>
          <button className="w-full bg-blue-600 text-white py-2.5 rounded-xl font-medium hover:bg-blue-700 transition-colors">
            Contact Support
          </button>
        </div>
      </div>
    </div>
  );
}
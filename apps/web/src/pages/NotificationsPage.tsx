import { useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { subscribeToEvent, SocketEvents } from '../lib/socket';
import {
  Bell, CheckCircle, AlertTriangle, Info, Trash2, CheckCheck,
  Package, Clock, ShieldAlert, CreditCard, DollarSign,
} from 'lucide-react';

interface Notification {
  id: string;
  type: string;
  priority: string;
  title: string;
  body: string;
  entityId?: string;
  entityType?: string;
  isRead: boolean;
  createdAt: string;
}

function getIcon(type: string) {
  switch (type) {
    case 'LOW_STOCK': return <Package className="w-5 h-5 text-orange-500" />;
    case 'EXPIRY_ALERT': return <Clock className="w-5 h-5 text-red-500" />;
    case 'ETIMS_FAILED': return <ShieldAlert className="w-5 h-5 text-red-600" />;
    case 'CREDIT_OVERDUE': return <CreditCard className="w-5 h-5 text-yellow-600" />;
    case 'EXPENSE_APPROVAL': return <DollarSign className="w-5 h-5 text-blue-500" />;
    case 'SUCCESS': return <CheckCircle className="w-5 h-5 text-green-600" />;
    case 'WARNING': return <AlertTriangle className="w-5 h-5 text-yellow-600" />;
    case 'ERROR': return <AlertTriangle className="w-5 h-5 text-red-600" />;
    default: return <Info className="w-5 h-5 text-blue-500" />;
  }
}

function timeAgo(dt: string) {
  const diff = Date.now() - new Date(dt).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export default function NotificationsPage() {
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';

  const { data: notifications = [], isLoading } = useQuery<Notification[]>({
    queryKey: ['notifications', businessId],
    queryFn: () => api.get<Notification[]>(`/notifications?businessId=${businessId}`),
    enabled: !!businessId,
    refetchInterval: 30000,
  });

  const markReadMutation = useMutation({
    mutationFn: (id: string) => api.patch(`/notifications/${id}/read`, {}),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications', businessId] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => api.post('/notifications/mark-all-read', { businessId }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications', businessId] }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/notifications/${id}`),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['notifications', businessId] }),
  });

  // Prepend new notifications in real-time without waiting for the 30s poll
  useEffect(() => {
    if (!businessId) return;
    return subscribeToEvent(SocketEvents.NOTIFICATION_CREATED, (data) => {
      qc.setQueryData<Notification[]>(['notifications', businessId], (prev = []) => {
        const incoming: Notification = {
          id: data.id as string,
          type: data.type as string,
          priority: data.priority as string,
          title: data.title as string,
          body: data.body as string,
          entityId: data.entityId as string | undefined,
          entityType: data.entityType as string | undefined,
          isRead: false,
          createdAt: data.createdAt as string,
        };
        // Avoid duplicates if a refetch also brings it in
        if (prev.some((n) => n.id === incoming.id)) return prev;
        return [incoming, ...prev];
      });
    });
  }, [businessId, qc]);

  const unreadCount = notifications.filter((n) => !n.isRead).length;
  const highPriorityUnread = notifications.filter((n) => !n.isRead && n.priority === 'HIGH').length;

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      <div className="bg-white dark:bg-gray-800 border-b dark:border-gray-700 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Bell className="w-6 h-6 text-gray-700 dark:text-gray-300" />
            {unreadCount > 0 && (
              <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-800 dark:text-white">Notifications</h1>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {unreadCount} unread
              {highPriorityUnread > 0 && (
                <span className="ml-2 text-red-600 font-medium">
                  · {highPriorityUnread} high priority
                </span>
              )}
            </p>
          </div>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={() => markAllReadMutation.mutate()}
            disabled={markAllReadMutation.isPending}
            className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium"
          >
            <CheckCheck className="w-4 h-4" />
            Mark all read
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {isLoading ? (
          <div className="text-center py-16 text-gray-400">Loading...</div>
        ) : notifications.length === 0 ? (
          <div className="text-center py-20">
            <Bell className="w-16 h-16 mx-auto text-gray-200 mb-4" />
            <p className="text-gray-400 text-lg font-medium">All caught up!</p>
            <p className="text-gray-400 text-sm mt-1">No notifications to display.</p>
          </div>
        ) : (
          <div className="space-y-2 max-w-2xl mx-auto">
            {notifications.map((n) => (
              <div
                key={n.id}
                className={`bg-white dark:bg-gray-800 rounded-xl border p-4 flex gap-3 transition-all ${
                  !n.isRead
                    ? 'border-blue-200 dark:border-blue-700 shadow-sm'
                    : 'border-gray-100 dark:border-gray-700 opacity-70'
                }`}
              >
                <div className="flex-shrink-0 mt-0.5">{getIcon(n.type)}</div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-semibold ${!n.isRead ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-400'}`}>
                          {n.title}
                        </p>
                        {!n.isRead && <span className="w-2 h-2 bg-blue-500 rounded-full" />}
                        {n.priority === 'HIGH' && (
                          <span className="text-xs px-1.5 py-0.5 rounded font-medium bg-red-100 text-red-700">
                            HIGH
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">{n.body}</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mt-2">
                    <span className="text-xs text-gray-400">{timeAgo(n.createdAt)}</span>
                    <div className="flex gap-1">
                      {!n.isRead && (
                        <button
                          onClick={() => markReadMutation.mutate(n.id)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                          title="Mark as read"
                        >
                          <CheckCircle className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <button
                        onClick={() => deleteMutation.mutate(n.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

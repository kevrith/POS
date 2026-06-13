export const Colors = {
  primary: '#EA580C',       // orange-600 — distinguishes the Agent app
  primaryLight: '#FB923C',
  primaryDark: '#9A3412',
  success: '#16A34A',
  warning: '#F59E0B',
  error: '#DC2626',
  info: '#2563EB',
  indigo: '#4F46E5',
  text: '#1C1917',
  textSecondary: '#78716C',
  background: '#FFF7ED',     // orange-50
  card: '#FFFFFF',
  border: '#FED7AA',         // orange-200
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  PENDING: '#F59E0B',
  CONFIRMED: '#2563EB',
  PACKED: '#7C3AED',
  DISPATCHED: '#F97316',
  DELIVERED: '#16A34A',
  CANCELLED: '#DC2626',
  REJECTED: '#DC2626',
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  PAID: '#16A34A',
  PARTIAL: '#F59E0B',
  UNPAID: '#DC2626',
};

export const PRIORITY_COLORS: Record<string, string> = {
  HIGH: '#DC2626',
  MEDIUM: '#F59E0B',
  NORMAL: '#16A34A',
};

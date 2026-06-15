// Pure helpers (safe to import anywhere, incl. tests / non-RN contexts).
export {
  parseNotificationData,
  resolveRoute,
  type NotificationData,
  type RouteMap,
} from './routing';

// Native client (requires expo-notifications/expo-device/expo-constants + react).
export {
  registerForPushNotificationsAsync,
  usePushNotifications,
  setupAndroidChannel,
  type UsePushOptions,
} from './client';

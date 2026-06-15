import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { parseNotificationData, NotificationData } from './routing';

// Foreground notifications still pop a banner + play a sound.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

/** Resolve the EAS projectId Expo needs to mint a push token. */
function getProjectId(): string | undefined {
  const anyConstants = Constants as unknown as {
    expoConfig?: { extra?: { eas?: { projectId?: string } } };
    easConfig?: { projectId?: string };
  };
  return anyConstants.expoConfig?.extra?.eas?.projectId ?? anyConstants.easConfig?.projectId;
}

/** Ensure the Android "default" channel exists (required for sound/heads-up). */
export async function setupAndroidChannel(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync('default', {
    name: 'Default',
    importance: Notifications.AndroidImportance.HIGH,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/**
 * Request permission and return the device's Expo push token (or null if denied,
 * running on a simulator, or no projectId configured). Send the returned token to
 * `POST /push/register` with the logged-in userId.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  if (!Device.isDevice) return null;
  await setupAndroidChannel();

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== 'granted') {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  if (status !== 'granted') return null;

  try {
    const projectId = getProjectId();
    const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
    return token.data ?? null;
  } catch {
    return null;
  }
}

export interface UsePushOptions {
  /** Called when the user taps a notification (or launches the app from one). */
  onTap?: (data: NotificationData) => void;
  /** Called when a notification arrives while the app is foregrounded. */
  onReceive?: (data: NotificationData) => void;
}

/**
 * Wires the foreground-received and tap listeners, and handles the cold-start
 * case (app opened by tapping a notification while killed). Call once near the
 * app root, after the router is ready.
 */
export function usePushNotifications(options: UsePushOptions = {}): void {
  const opts = useRef(options);
  opts.current = options;

  useEffect(() => {
    let handledColdStart = false;

    // Cold start: app launched by tapping a notification.
    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response && !handledColdStart) {
        handledColdStart = true;
        opts.current.onTap?.(parseNotificationData(response.notification.request.content.data));
      }
    });

    const receivedSub = Notifications.addNotificationReceivedListener((n) => {
      opts.current.onReceive?.(parseNotificationData(n.request.content.data));
    });
    const responseSub = Notifications.addNotificationResponseReceivedListener((r) => {
      opts.current.onTap?.(parseNotificationData(r.notification.request.content.data));
    });

    return () => {
      receivedSub.remove();
      responseSub.remove();
    };
  }, []);
}

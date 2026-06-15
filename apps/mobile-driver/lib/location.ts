import { useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import * as Location from 'expo-location';
import { driverApi } from './api';

/**
 * Broadcasts the driver's live position to the backend while the app is open and
 * the driver is logged in, so dispatch (and the customer's tracking page) can see
 * where they are. Foreground-only — no background-location permission needed.
 *
 * Posts to POST /delivery/driver-location, tagging the active delivery id when
 * one is supplied so the server can run its proximity / arrival check.
 */
export function useLocationBroadcast(driverId?: string, activeDeliveryId?: string): void {
  const activeRef = useRef(activeDeliveryId);
  activeRef.current = activeDeliveryId;

  useEffect(() => {
    if (!driverId) return;
    let sub: Location.LocationSubscription | null = null;
    let cancelled = false;

    async function start() {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted' || cancelled) return;

      sub = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.Balanced, timeInterval: 15_000, distanceInterval: 50 },
        (pos) => {
          // Fire-and-forget; a dropped ping is fine, the next one covers it.
          driverApi
            .post('/delivery/driver-location', {
              driverId,
              deliveryOrderId: activeRef.current,
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              heading: pos.coords.heading ?? undefined,
              speed: pos.coords.speed ?? undefined,
              accuracy: pos.coords.accuracy ?? undefined,
            })
            .catch(() => {});
        },
      );
    }

    void start();

    // Pause watching in the background, resume on return (saves battery).
    const appSub = AppState.addEventListener('change', (state) => {
      if (state === 'active' && !sub) void start();
      if (state !== 'active' && sub) {
        sub.remove();
        sub = null;
      }
    });

    return () => {
      cancelled = true;
      sub?.remove();
      appSub.remove();
    };
  }, [driverId]);
}

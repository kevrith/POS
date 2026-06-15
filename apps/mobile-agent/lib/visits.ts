import * as Location from 'expo-location';
import { enqueue, flushQueue, uuid } from './offline';

export type VisitOutcome = 'VISITED' | 'ORDERED' | 'NO_ANSWER' | 'DECLINED' | 'FOLLOW_UP';

/**
 * Log a customer visit ("check-in") with the agent's GPS position. Offline-first:
 * the visit is enqueued (with a captured location + offlineId) and flushed when
 * connectivity allows, so field check-ins are never lost in dead zones.
 */
export async function checkInVisit(opts: {
  customerId: string;
  customerName: string;
  businessId: string;
  agentId: string;
  outcome?: VisitOutcome;
  notes?: string;
}): Promise<void> {
  let gpsLat: number | undefined;
  let gpsLng: number | undefined;
  try {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      gpsLat = pos.coords.latitude;
      gpsLng = pos.coords.longitude;
    }
  } catch {
    /* GPS optional — log the visit anyway */
  }

  await enqueue({
    offlineId: uuid(),
    type: 'LOG_VISIT',
    path: `/field-sales/customers/${opts.customerId}/visits?businessId=${encodeURIComponent(opts.businessId)}`,
    body: {
      agentId: opts.agentId,
      outcome: opts.outcome ?? 'VISITED',
      notes: opts.notes,
      gpsLat,
      gpsLng,
    },
    label: `Check-in: ${opts.customerName}`,
  });
  void flushQueue();
}

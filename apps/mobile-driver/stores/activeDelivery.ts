import { create } from 'zustand';

/**
 * The delivery the driver is currently out on (status IN_TRANSIT). Set from the
 * delivery detail screen; read by the root layout so location pings are tagged
 * with the order id — which lets the server run its arrival/proximity check.
 */
interface ActiveDeliveryState {
  deliveryId: string | null;
  setActive: (id: string | null) => void;
}

export const useActiveDelivery = create<ActiveDeliveryState>((set) => ({
  deliveryId: null,
  setActive: (deliveryId) => set({ deliveryId }),
}));

import { getPendingSales, markSaleSynced } from './db';
import { mobileApi } from './api';

export async function processSyncQueue(): Promise<{ synced: number; failed: number }> {
  const pending = await getPendingSales();
  let synced = 0;
  let failed = 0;

  for (const sale of pending) {
    try {
      await mobileApi.post('/sales/checkout', sale.payload);
      await markSaleSynced(sale.offlineId);
      synced++;
    } catch {
      failed++;
    }
  }

  return { synced, failed };
}

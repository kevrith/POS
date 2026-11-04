/**
 * Client for the server print queue (`/print-jobs`).
 *
 * A LAN printer is queued instead of being written to directly: the API delivers at once when it can reach
 * the printer, and otherwise a print bridge (the desktop app on the shop network, see printBridge.ts) delivers
 * it. Every print, queued or made on this device, leaves a row the owner can see in Settings -> Printers.
 * Logging is best effort and never blocks or fails a print.
 */
import { toast } from 'sonner';
import api from './api';
import { useAuthStore } from '../stores/auth';
import { bytesToBase64 } from '@pos/print-core';

export type PrintJobKind = 'RECEIPT' | 'KOT' | 'BILL' | 'DRAWER' | 'TEST';
export type ClientPrintMethod = 'BROWSER' | 'USB' | 'BLUETOOTH' | 'SYSTEM' | 'STAR' | 'EPSON';

export interface PrintJobMeta {
  saleId?: string;
  refNumber?: string;
  copyNumber?: number;
  reason?: string;
}

export interface PrintJobSummary {
  id: string;
  kind: PrintJobKind;
  status: 'QUEUED' | 'SENDING' | 'SENT' | 'FAILED' | 'EXPIRED' | 'CANCELLED';
  method: string;
  printerId: string | null;
  saleId: string | null;
  refNumber: string | null;
  reason: string | null;
  copyNumber: number;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  sentAt: string | null;
}

function currentStoreId(): string {
  const storeId = useAuthStore.getState().user?.storeId;
  if (!storeId) throw new Error('No store is selected on this terminal');
  return storeId;
}

/**
 * Send bytes to a LAN printer through the queue. Resolves when the job is accepted: either the printer
 * has it, or it is waiting for the print station. Throws only when the server refuses the job.
 */
export async function queuePrint(printerId: string, kind: PrintJobKind, bytes: Uint8Array, meta: PrintJobMeta = {}): Promise<{ delivered: boolean }> {
  const res = await api.post<{ delivered: boolean; job: PrintJobSummary }>('/print-jobs', {
    storeId: currentStoreId(),
    printerId,
    kind,
    data: bytesToBase64(bytes),
    ...meta,
  });
  if (!res.delivered) {
    toast.info(
      kind === 'KOT'
        ? 'Kitchen ticket queued: the printer is not reachable from this device yet.'
        : 'Queued: the printer is not reachable from this device. It prints when the print station is online.',
      { id: `print-queued-${kind}` },
    );
  }
  return { delivered: res.delivered };
}

/** Record a print this device made itself. Never throws. */
export function logPrint(kind: PrintJobKind, method: ClientPrintMethod, ok: boolean, error?: string, meta: PrintJobMeta = {}): void {
  try {
    void api.post('/print-jobs/log', { storeId: currentStoreId(), kind, method, ok, error, ...meta }).catch(() => undefined);
  } catch {
    /* no store yet (login screen) or offline: the print itself must not fail because the log could not be written */
  }
}

/** How many times this sale's receipt has been printed on any device, or null when the server cannot be asked. */
export async function fetchReceiptCopy(saleId: string): Promise<number | null> {
  try {
    const res = await Promise.race([
      api.post<{ copyNumber: number }>('/print-jobs/receipt-copy', { saleId }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timeout')), 2500)),
    ]);
    return res.copyNumber;
  } catch {
    return null;
  }
}

export function listPrintJobs(storeId: string, status?: string): Promise<PrintJobSummary[]> {
  const q = new URLSearchParams({ storeId, limit: '30', ...(status ? { status } : {}) });
  return api.get<PrintJobSummary[]>(`/print-jobs?${q.toString()}`);
}

export const retryPrintJob = (id: string) => api.post<PrintJobSummary>(`/print-jobs/${id}/retry`, {});
export const cancelPrintJob = (id: string) => api.post<PrintJobSummary>(`/print-jobs/${id}/cancel`, {});

import { toast } from 'sonner';
import { printKOT, type KOTData, type KotPrintReport } from './printer';

const STATION_NAMES: Record<string, string> = { KOT_FOOD: 'Kitchen', KOT_DRINKS: 'Bar', KOT_DESSERTS: 'Dessert' };

/** Offer to print the ticket on this device instead. Used when a kitchen printer cannot be reached. */
export function toastKotFailure(station: string, error: string, kot: KOTData): void {
  const name = STATION_NAMES[station] ?? station;
  toast.error(`${name} ticket did not print: ${error}`, {
    duration: 20000,
    action: { label: 'Print here', onClick: () => printKOT(kot) },
  });
}

/** Tell the person about every kitchen ticket that did not reach its printer. A failed ticket is never silent. */
export function reportKotPrint(report: KotPrintReport): void {
  for (const f of report.failed) toastKotFailure(f.station, f.error, f.kot);
}

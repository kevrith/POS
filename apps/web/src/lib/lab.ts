import type { BadgeTone } from '../components/ui';

export type Flag = 'NORMAL' | 'LOW' | 'HIGH' | 'CRITICAL_LOW' | 'CRITICAL_HIGH' | 'ABNORMAL';
export type ParamKind = 'NUMERIC' | 'CHOICE' | 'TEXT';

export interface LabParameter {
  name: string; kind: ParamKind; unit?: string;
  low?: number; high?: number; lowF?: number; highF?: number; lowC?: number; highC?: number; critLow?: number; critHigh?: number;
  choices?: string[]; abnormal?: string[];
}

export interface LabValue { name: string; value: string; unit?: string; low?: number; high?: number; flag: Flag | null }

export type OrderStatus = 'ORDERED' | 'COLLECTED' | 'RESULTED' | 'VERIFIED' | 'CANCELLED';
export type ItemStatus = 'PENDING' | 'RESULTED' | 'VERIFIED';

export interface LabTest {
  id: string; name: string; code: string | null; category: string; specimen: string; parameters: LabParameter[];
  itemId: string | null; itemName: string | null; priceCents: number | null; turnaroundHours: number | null; isActive: boolean;
}

export interface LabItem {
  id: string; orderId: string; testId: string; testName: string; specimen: string; status: ItemStatus; parameters: LabParameter[]; results: LabValue[];
  comment: string | null; hasCritical: boolean; resultedBy: string | null; resultedById: string | null; resultedAt: string | null;
  verifiedBy: string | null; verifiedAt: string | null; amendedNote: string | null;
  criticalAckAt: string | null; criticalAckBy: string | null;
}

export interface LabOrder {
  id: string; orderNumber: string; status: OrderStatus; priority: 'NORMAL' | 'URGENT'; clinicalNotes: string | null; visitId: string; visitNumber: string | null;
  orderedByName: string; collectedByName: string | null; collectedAt: string | null; cancelReason: string | null; createdAt: string;
  patient: { id: string; name: string; patientNumber: string; sex: string | null; ageYears: number | null } | null;
  items: LabItem[];
  /** On the worklist only: when it should be done, and whether that time has passed. */
  dueAt?: string | null; overdue?: boolean;
}

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = { ORDERED: 'To collect', COLLECTED: 'In the lab', RESULTED: 'To release', VERIFIED: 'Released', CANCELLED: 'Cancelled' };
export const ORDER_STATUS_TONE: Record<OrderStatus, BadgeTone> = { ORDERED: 'neutral', COLLECTED: 'brand', RESULTED: 'warning', VERIFIED: 'success', CANCELLED: 'neutral' };

export const FLAG_LABEL: Record<Flag, string> = { NORMAL: 'Normal', LOW: 'Low', HIGH: 'High', CRITICAL_LOW: 'Critically low', CRITICAL_HIGH: 'Critically high', ABNORMAL: 'Abnormal' };

export const isCritical = (f: Flag | null) => f === 'CRITICAL_LOW' || f === 'CRITICAL_HIGH';

/** The colour class for a value: critical is loud, anything else outside normal is amber, normal is plain. */
export function flagClass(f: Flag | null): string {
  if (isCritical(f)) return 'font-bold text-red-700';
  if (f && f !== 'NORMAL') return 'font-semibold text-amber-700';
  return '';
}

/** "13 - 17 g/dL" for the range that applies to this patient, or an empty string for a test with none. */
export function rangeText(p: LabParameter, sex: string | null | undefined, ageYears?: number | null): string {
  const child = ageYears !== null && ageYears !== undefined && ageYears < 12 && (p.lowC !== undefined || p.highC !== undefined);
  const female = !child && sex === 'F' && (p.lowF !== undefined || p.highF !== undefined);
  const low = child ? p.lowC : female ? p.lowF : p.low;
  const high = child ? p.highC : female ? p.highF : p.high;
  const span = low !== undefined && high !== undefined ? `${low} - ${high}` : low !== undefined ? `at least ${low}` : high !== undefined ? `up to ${high}` : '';
  return span ? `${span}${p.unit ? ` ${p.unit}` : ''}` : '';
}

/** Does an order have a value that needs the doctor's attention now? */
export const orderHasCritical = (o: LabOrder) => o.items.some((i) => i.hasCritical && i.status !== 'PENDING');

/** A critical result nobody has acknowledged yet. */
export const needsAck = (i: LabItem) => i.hasCritical && i.status !== 'PENDING' && !i.criticalAckAt;

/** True when no specimen is taken (imaging): the step is the patient attending. */
export const noSpecimen = (o: LabOrder) => o.items.length > 0 && o.items.every((i) => i.specimen === 'NONE');

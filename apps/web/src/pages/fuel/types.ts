/** What the fuel screens read from the API. Fields the screens do not use are left out. */

export interface Grade {
  id: string;
  name: string;
  code: string;
  pricePerLitreCents: number;
  maxPricePerLitreCents: number | null;
  isActive: boolean;
}

export interface TankRef { id: string; tankNumber: number; label: string | null; currentLitres: number; gradeId: string }

export interface Nozzle {
  id: string;
  pumpId: string;
  nozzleNumber: number;
  gradeId: string;
  tankId: string | null;
  totalizerLitres: number;
  lastReadingAt: string | null;
  isActive: boolean;
  grade: Grade;
  tank?: TankRef | null;
}

export interface Pump {
  id: string;
  pumpNumber: number;
  label: string | null;
  status: string;
  gradeId: string;
  nozzles: Nozzle[];
}

export interface Tank {
  id: string;
  tankNumber: number;
  label: string | null;
  gradeId: string;
  capacityLitres: number;
  currentLitres: number;
  minLevelLitres: number;
  avgCostCents: number;
  grade: Grade;
  dippings: Array<{ litres: number; bookLitres: number | null; varianceLitres: number | null; recordedAt: string }>;
}

export interface ShiftAttendant {
  id: string;
  name: string;
  userId: string | null;
  nozzleIds: string[];
  expectedCashCents: number | null;
  declaredCashCents: number | null;
  cashVarianceCents: number | null;
}

export interface ShiftReading {
  id: string;
  pumpId: string;
  nozzleId: string | null;
  attendantId: string | null;
  openingLitres: number;
  closingLitres: number | null;
}

export interface Shift {
  id: string;
  cashierName: string;
  openedAt: string;
  closedAt: string | null;
  status: 'OPEN' | 'CLOSED';
  closedBy: string | null;
  closeNotes: string | null;
  readings: ShiftReading[];
  attendants: ShiftAttendant[];
}

export interface NozzleLine {
  readingId: string;
  nozzleId: string;
  attendantId: string | null;
  pumpNumber: number;
  nozzleNumber: number;
  gradeName: string;
  openingLitres: number;
  closingLitres: number | null;
  previousClosingLitres: number | null;
  openingNote: string | null;
  soldLitres: number;
  testLitres: number;
  voidedLitres: number;
  meterLitres: number | null;
  unrecordedLitres: number | null;
  expectedClosingLitres: number;
  flag: 'OK' | 'UNRECORDED' | 'OVER_RECORDED' | null;
  unrecordedValueCents: number | null;
}

export interface AttendantLine {
  attendantId: string;
  name: string;
  nozzleIds: string[];
  litres: number;
  revenueCents: number;
  transactions: number;
  byMethod: Record<string, number>;
  expectedCashCents: number;
  declaredCashCents: number | null;
  cashVarianceCents: number | null;
}

export interface ShiftSummary {
  shift: Shift;
  legacy: boolean;
  totalLitres: number;
  totalRevenueCents: number;
  totalTransactions: number;
  voidedCount: number;
  voidedLitres: number;
  byNozzle: NozzleLine[];
  byAttendant: AttendantLine[];
  byPayment: Array<{ method: string; count: number; totalCents: number }>;
  issues: { unrecordedNozzles: number; cashShortAttendants: number; meterGaps: number };
}

export interface FleetAccount {
  id: string;
  companyName: string;
  contactName: string | null;
  contactPhone: string | null;
  kraPin: string | null;
  creditLimitCents: number;
  balanceCents: number;
  isActive: boolean;
}

export const PAYMENT_METHODS = ['CASH', 'MPESA', 'CARD', 'FLEET', 'CREDIT'] as const;
export const PAYMENT_LABEL: Record<string, string> = { CASH: 'Cash', MPESA: 'M-Pesa', CARD: 'Card', FLEET: 'Fleet account', CREDIT: 'Customer credit' };

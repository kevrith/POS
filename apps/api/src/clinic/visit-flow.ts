import { BadRequestException } from '@nestjs/common';

export const VISIT_STATUSES = ['WAITING', 'TRIAGED', 'IN_CONSULTATION', 'READY_TO_BILL', 'COMPLETED', 'CANCELLED'] as const;
export type VisitStatus = (typeof VISIT_STATUSES)[number];
export const PRIORITIES = ['NORMAL', 'URGENT'] as const;
/** A visit still in progress: not finished and not abandoned. */
export const OPEN_STATUSES: readonly VisitStatus[] = ['WAITING', 'TRIAGED', 'IN_CONSULTATION', 'READY_TO_BILL'];

/** What each action needs the visit to be, and where it leaves it. */
const MOVES: Record<string, { from: readonly VisitStatus[]; to?: VisitStatus; refusal: string }> = {
  vitals: { from: ['WAITING', 'TRIAGED', 'IN_CONSULTATION'], to: undefined, refusal: 'Vitals can be taken until the visit is finished' },
  startConsultation: { from: ['WAITING', 'TRIAGED'], to: 'IN_CONSULTATION', refusal: 'Only a waiting patient can be taken in to the doctor' },
  consultation: { from: ['IN_CONSULTATION'], refusal: 'The consultation notes are written while the patient is with the doctor' },
  finishConsultation: { from: ['IN_CONSULTATION'], to: 'READY_TO_BILL', refusal: 'Only a patient who is with the doctor can be sent to billing' },
  charge: { from: ['WAITING', 'TRIAGED', 'IN_CONSULTATION', 'READY_TO_BILL'], refusal: 'Charges can be added until the visit is completed' },
  complete: { from: ['READY_TO_BILL'], to: 'COMPLETED', refusal: 'Only a visit that has finished its consultation can be completed and billed' },
  cancel: { from: ['WAITING', 'TRIAGED', 'IN_CONSULTATION', 'READY_TO_BILL'], to: 'CANCELLED', refusal: 'A completed or cancelled visit cannot be cancelled' },
  reopen: { from: ['READY_TO_BILL'], to: 'IN_CONSULTATION', refusal: 'Only a visit waiting to be billed can go back to the doctor' },
};

export type VisitAction = keyof typeof MOVES;

/** Throws when the visit is not in a state the action can start from; returns the status it moves to (undefined = unchanged). */
export function assertCan(action: VisitAction, status: string): VisitStatus | undefined {
  const move = MOVES[action];
  if (!move) throw new Error(`Unknown visit action ${String(action)}`);
  if (!(move.from as readonly string[]).includes(status)) throw new BadRequestException(move.refusal);
  return move.to;
}

/** The order the queue is seen in: urgent first, then whoever has waited longest. */
export function queueOrder<T extends { priority: string; createdAt: Date | string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority === 'URGENT' ? -1 : 1;
    return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
  });
}

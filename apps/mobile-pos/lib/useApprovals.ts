import { useMemo } from 'react';
import { useQuery, useQueries } from '@tanstack/react-query';
import { mobileApi } from './api';
import { useAuthStore } from '../stores/auth';
import { canApprove } from './roles';
import {
  mapExpense, mapLeave, mapAdvance, mapPurchaseOrder, sortApprovals, countByKind,
  type ApprovalItem,
  type RawExpense, type RawLeave, type RawAdvance, type RawPurchaseOrder,
} from './approvals';

interface BizUser { id: string; name: string }

/**
 * The four pending-approval sources, merged into one oldest-first list.
 *
 * Shared by the Approvals screen and the Manage hub's badge. Both mount the
 * same query keys, so react-query serves the badge from the screen's cache
 * instead of issuing a second round of requests.
 */
export function useApprovals() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const enabled = canApprove(user?.role) && !!businessId;

  // Expense rows carry only `submittedBy` (a user id) with no relation to join,
  // so names come from the business roster.
  const usersQ = useQuery<BizUser[]>({
    queryKey: ['business-users', businessId],
    queryFn: () => mobileApi.get<BizUser[]>(`/business/${businessId}/users`),
    enabled,
    staleTime: 10 * 60_000,
  });

  const sources = useQueries({
    queries: [
      {
        queryKey: ['approvals', 'expense', businessId],
        queryFn: () => mobileApi.get<RawExpense[]>(`/expenses?businessId=${businessId}&approvalStatus=PENDING`),
        enabled,
        staleTime: 30_000,
      },
      {
        // This endpoint already returns only PENDING rows.
        queryKey: ['approvals', 'leave', businessId],
        queryFn: () => mobileApi.get<RawLeave[]>(`/hr/leave?businessId=${businessId}`),
        enabled,
        staleTime: 30_000,
      },
      {
        queryKey: ['approvals', 'advance', businessId],
        queryFn: () => mobileApi.get<RawAdvance[]>(`/hr/salary-advances?businessId=${businessId}&status=PENDING`),
        enabled,
        staleTime: 30_000,
      },
      {
        // SUBMITTED is the "waiting on a manager" state; DRAFT is still being
        // written and APPROVED has already been decided.
        queryKey: ['approvals', 'po', businessId],
        queryFn: () => mobileApi.get<RawPurchaseOrder[]>(`/suppliers/purchase-orders?businessId=${businessId}&status=SUBMITTED`),
        enabled,
        staleTime: 30_000,
      },
    ],
  });

  const [expenseQ, leaveQ, advanceQ, poQ] = sources;

  const nameOf = useMemo(() => {
    const map = new Map((usersQ.data ?? []).map((u) => [u.id, u.name]));
    return (id: string | null | undefined) => (id ? map.get(id) : undefined);
  }, [usersQ.data]);

  const items: ApprovalItem[] = useMemo(
    () =>
      sortApprovals([
        ...(expenseQ.data ?? []).map((e) => mapExpense(e, nameOf)),
        ...(leaveQ.data ?? []).map(mapLeave),
        ...(advanceQ.data ?? []).map(mapAdvance),
        ...(poQ.data ?? []).map(mapPurchaseOrder),
      ]),
    [expenseQ.data, leaveQ.data, advanceQ.data, poQ.data, nameOf],
  );

  return {
    items,
    counts: countByKind(items),
    isLoading: sources.some((q) => q.isLoading),
    isRefetching: sources.some((q) => q.isRefetching),
    /** One dead source must not blank the inbox — the rest still render. */
    failedCount: sources.filter((q) => q.isError).length,
    refetchAll: () => sources.forEach((q) => void q.refetch()),
  };
}

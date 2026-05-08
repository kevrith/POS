import { useState } from 'react';
import { X, AlertTriangle, Lock, Minus, Plus } from 'lucide-react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface SaleItem {
  id: string;
  name: string;
  quantity: number;
  unitPriceCents: number;
  totalCents: number;
}

interface SaleDetail {
  id: string;
  receiptNumber: string;
  totalCents: number;
  items: SaleItem[];
}

interface VoidModalProps {
  saleId: string;
  receiptNumber: string;
  totalCents: number;
  businessId: string;
  userRole?: string;
  userId?: string;
  userName?: string;
  onSuccess: () => void;
  onClose: () => void;
}

const fmt = (cents: number) =>
  `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function VoidModal({
  saleId,
  receiptNumber,
  totalCents,
  businessId,
  userRole,
  userId,
  userName,
  onSuccess,
  onClose,
}: VoidModalProps) {
  const isSelfAuthorized = userRole === 'OWNER' || userRole === 'MANAGER';
  const [managerPin, setManagerPin] = useState('');
  const [reason, setReason] = useState('');
  const [voidType, setVoidType] = useState<'FULL_VOID' | 'LINE_ITEM_VOID'>('FULL_VOID');
  // Map of itemId -> quantity to void (0 = not selected)
  const [voidQuantities, setVoidQuantities] = useState<Record<string, number>>({});

  const { data: saleDetail, isLoading: loadingItems } = useQuery<SaleDetail>({
    queryKey: ['sale-detail', saleId],
    queryFn: () => api.get<SaleDetail>(`/sales/${saleId}?businessId=${businessId}`),
    enabled: voidType === 'LINE_ITEM_VOID',
  });

  function setQty(itemId: string, qty: number, maxQty: number) {
    setVoidQuantities(prev => ({ ...prev, [itemId]: Math.max(0, Math.min(qty, maxQty)) }));
  }

  const selectedItems = saleDetail?.items.filter(i => (voidQuantities[i.id] ?? 0) > 0) ?? [];

  const selectedTotal = selectedItems.reduce((s, i) => {
    const qty = voidQuantities[i.id] ?? 0;
    return s + i.unitPriceCents * qty;
  }, 0);

  const selectedCount = selectedItems.length;

  const voidMutation = useMutation({
    mutationFn: async () => {
      let managerId: string;

      if (isSelfAuthorized && userId) {
        managerId = userId;
      } else {
        const result = await api.post<{ userId: string; name: string }>(
          '/sales/verify-manager-pin',
          { pin: managerPin, businessId },
        );
        managerId = result.userId;
      }

      if (voidType === 'FULL_VOID') {
        return api.post(`/sales/${saleId}/void?businessId=${businessId}`, { managerId, reason });
      }

      const voidedItemQuantities = selectedItems.map(i => ({ itemId: i.id, quantity: voidQuantities[i.id]! }));
      const voidedItemIds = selectedItems.map(i => i.id);
      return api.post(`/sales/${saleId}/void?businessId=${businessId}`, {
        managerId, reason, voidedItemIds, voidedItemQuantities,
      });
    },
    onSuccess: () => { onSuccess(); onClose(); },
  });

  const canSubmit =
    (isSelfAuthorized || managerPin.length >= 4) &&
    reason.trim().length > 0 &&
    (voidType === 'FULL_VOID' || selectedCount > 0);
    reason.trim().length > 0 &&
    (voidType === 'FULL_VOID' || selectedCount > 0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-red-100 dark:border-red-900/30 bg-red-50 dark:bg-red-900/20 flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <h2 className="text-lg font-bold text-red-800 dark:text-red-300">Void Transaction</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors">
            <X className="w-5 h-5 text-red-600 dark:text-red-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Warning */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl p-4 text-sm text-yellow-800 dark:text-yellow-300">
            <p className="font-semibold mb-1">Warning: This action cannot be undone</p>
            <p className="text-xs">
              Inventory will be reversed and an audit trail created.
              {isSelfAuthorized
                ? ` Voiding as ${userName ?? 'Manager'} (${userRole?.toLowerCase()}).`
                : ' Manager PIN required to authorize.'}
            </p>
          </div>

          {/* Receipt info */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-1.5 text-sm border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Receipt:</span>
              <span className="font-semibold font-mono text-gray-900 dark:text-white">{receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Total:</span>
              <span className="font-semibold text-red-600 dark:text-red-400">{fmt(totalCents)}</span>
            </div>
          </div>

          {/* Void type */}
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Void Type</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setVoidType('FULL_VOID'); setVoidQuantities({}); }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border-2 transition-colors ${
                  voidType === 'FULL_VOID'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Full Void
              </button>
              <button
                onClick={() => setVoidType('LINE_ITEM_VOID')}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border-2 transition-colors ${
                  voidType === 'LINE_ITEM_VOID'
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Line-Item Void
              </button>
            </div>
          </div>

          {/* Item selection with quantity */}
          {voidType === 'LINE_ITEM_VOID' && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="bg-gray-50 dark:bg-gray-800 px-4 py-2.5 text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide border-b border-gray-100 dark:border-gray-700">
                Select Items & Quantities to Void
              </div>
              {loadingItems ? (
                <div className="p-5 text-center text-gray-400 dark:text-gray-500 text-sm">
                  <div className="w-5 h-5 border-2 border-red-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading items...
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {(saleDetail?.items ?? []).map(item => {
                    const voidQty = voidQuantities[item.id] ?? 0;
                    const isSelected = voidQty > 0;
                    const lineRefund = item.unitPriceCents * voidQty;
                    return (
                      <div
                        key={item.id}
                        className={`px-4 py-3 transition-colors ${isSelected ? 'bg-red-50 dark:bg-red-900/20' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}`}
                      >
                        <div className="flex items-center gap-3">
                          {/* Item info */}
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.name}</p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {item.quantity} in sale × {fmt(item.unitPriceCents)}
                            </p>
                          </div>
                          {/* Quantity stepper */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button
                              onClick={() => setQty(item.id, voidQty - 1, item.quantity)}
                              disabled={voidQty === 0}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className={`w-7 text-center text-sm font-bold ${isSelected ? 'text-red-600 dark:text-red-400' : 'text-gray-400 dark:text-gray-500'}`}>
                              {voidQty}
                            </span>
                            <button
                              onClick={() => setQty(item.id, voidQty + 1, item.quantity)}
                              disabled={voidQty >= item.quantity}
                              className="w-7 h-7 flex items-center justify-center rounded-lg border border-gray-300 dark:border-gray-600 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                          {/* Refund for this line */}
                          <span className={`text-sm font-bold w-20 text-right flex-shrink-0 ${isSelected ? 'text-red-600 dark:text-red-400' : 'text-gray-300 dark:text-gray-600'}`}>
                            {isSelected ? `-${fmt(lineRefund)}` : fmt(item.totalCents)}
                          </span>
                        </div>
                        {isSelected && voidQty < item.quantity && (
                          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1 ml-0">
                            Voiding {voidQty} of {item.quantity} — {item.quantity - voidQty} remain
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
              {selectedCount > 0 && (
                <div className="bg-red-50 dark:bg-red-900/30 px-4 py-2.5 flex justify-between text-sm font-semibold border-t border-red-100 dark:border-red-900/40">
                  <span className="text-red-700 dark:text-red-400">Voiding {selectedCount} line(s)</span>
                  <span className="text-red-700 dark:text-red-400">-{fmt(selectedTotal)}</span>
                </div>
              )}
            </div>
          )}

          {/* Manager PIN — only required for non-manager roles */}
          {isSelfAuthorized ? (
            <div className="flex items-center gap-3 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-xl">
              <div className="w-8 h-8 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center flex-shrink-0">
                <Lock className="w-4 h-4 text-green-600 dark:text-green-400" />
              </div>
              <div>
                <p className="text-sm font-semibold text-green-800 dark:text-green-300">Authorized as {userRole?.charAt(0) + (userRole?.slice(1).toLowerCase() ?? '')}</p>
                <p className="text-xs text-green-600 dark:text-green-400">{userName} — no PIN required</p>
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
                Manager PIN <span className="text-red-500">*</span>
              </label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  type="password"
                  value={managerPin}
                  onChange={(e) => setManagerPin(e.target.value)}
                  placeholder="Enter manager's 4–6 digit PIN"
                  maxLength={6}
                  className="w-full pl-10 pr-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
                  autoFocus
                />
              </div>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">Ask your manager or owner to enter their PIN</p>
            </div>
          )}

          {/* Reason */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Customer changed mind, Wrong item scanned, Pricing error..."
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none text-sm bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500"
            />
          </div>

          {voidMutation.error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
              {voidMutation.error instanceof Error ? voidMutation.error.message : 'Failed to void transaction'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 flex gap-3 flex-shrink-0 border-t border-gray-100 dark:border-gray-800">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => voidMutation.mutate()}
            disabled={!canSubmit || voidMutation.isPending}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {voidMutation.isPending ? 'Processing...' : (
              voidType === 'FULL_VOID'
                ? 'Void Full Sale'
                : selectedCount > 0
                ? `Void ${selectedCount} Line(s) — ${fmt(selectedTotal)}`
                : 'Select Items to Void'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

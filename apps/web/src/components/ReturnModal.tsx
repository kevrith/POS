import { useState } from 'react';
import { X, RotateCcw, DollarSign, CreditCard, Package } from 'lucide-react';
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

interface ReturnModalProps {
  saleId: string;
  receiptNumber: string;
  totalCents: number;
  customerId?: string;
  businessId: string;
  onSuccess: () => void;
  onClose: () => void;
}

const fmt = (cents: number) =>
  `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export default function ReturnModal({
  saleId,
  receiptNumber,
  totalCents,
  customerId,
  businessId,
  onSuccess,
  onClose,
}: ReturnModalProps) {
  const [reason, setReason] = useState('');
  const [refundMethod, setRefundMethod] = useState<'CASH' | 'STORE_CREDIT'>('CASH');
  const [returnType, setReturnType] = useState<'FULL' | 'PARTIAL'>('FULL');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const { data: saleDetail, isLoading: loadingItems } = useQuery<SaleDetail>({
    queryKey: ['sale-detail-return', saleId],
    queryFn: () => api.get<SaleDetail>(`/sales/${saleId}?businessId=${businessId}`),
    enabled: returnType === 'PARTIAL',
  });

  const toggleItem = (itemId: string) => {
    setSelectedItemIds(prev => {
      const next = new Set(prev);
      if (next.has(itemId)) next.delete(itemId);
      else next.add(itemId);
      return next;
    });
  };

  const selectedTotal = saleDetail?.items
    .filter(i => selectedItemIds.has(i.id))
    .reduce((s, i) => s + i.totalCents, 0) ?? 0;

  const refundAmount = returnType === 'FULL' ? totalCents : selectedTotal;

  const returnMutation = useMutation({
    mutationFn: async () => {
      return api.post(`/sales/${saleId}/return?businessId=${businessId}`, {
        reason,
        refundMethod,
        returnedItemIds: returnType === 'PARTIAL' ? Array.from(selectedItemIds) : undefined,
      });
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const canSubmit =
    reason.trim().length > 0 &&
    (returnType === 'FULL' || selectedItemIds.size > 0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-900 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-orange-100 dark:border-orange-900/30 bg-orange-50 dark:bg-orange-900/20 flex-shrink-0">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-orange-600 dark:text-orange-400" />
            <h2 className="text-lg font-bold text-orange-800 dark:text-orange-300">Return Sale</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-orange-100 dark:hover:bg-orange-900/40 transition-colors" aria-label="Close">
            <X className="w-5 h-5 text-orange-600 dark:text-orange-400" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Receipt info */}
          <div className="bg-gray-50 dark:bg-gray-800 rounded-xl p-4 space-y-1.5 text-sm border border-gray-100 dark:border-gray-700">
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Receipt:</span>
              <span className="font-semibold font-mono text-gray-900 dark:text-white">{receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500 dark:text-gray-400">Sale Total:</span>
              <span className="font-semibold text-gray-900 dark:text-white">{fmt(totalCents)}</span>
            </div>
            {returnType === 'PARTIAL' && refundAmount > 0 && (
              <div className="flex justify-between border-t border-gray-200 dark:border-gray-700 pt-1.5 mt-1.5">
                <span className="text-orange-600 dark:text-orange-400 font-semibold">Refund Amount:</span>
                <span className="font-bold text-orange-600 dark:text-orange-400">{fmt(refundAmount)}</span>
              </div>
            )}
          </div>

          {/* Return type */}
          <div>
            <p className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">Return Type</p>
            <div className="flex gap-2">
              <button
                onClick={() => { setReturnType('FULL'); setSelectedItemIds(new Set()); }}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border-2 transition-colors ${
                  returnType === 'FULL'
                    ? 'bg-orange-600 text-white border-orange-600'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Full Return
              </button>
              <button
                onClick={() => setReturnType('PARTIAL')}
                className={`flex-1 py-2.5 text-sm font-semibold rounded-xl border-2 transition-colors ${
                  returnType === 'PARTIAL'
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                }`}
              >
                Partial (Select Items)
              </button>
            </div>
          </div>

          {/* Item selection for partial return */}
          {returnType === 'PARTIAL' && (
            <div className="border border-gray-200 dark:border-gray-700 rounded-xl overflow-hidden">
              <div className="flex items-center gap-2 bg-gray-50 dark:bg-gray-800 px-4 py-2.5 border-b border-gray-100 dark:border-gray-700">
                <Package className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <span className="text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wide">Select Items to Return</span>
              </div>
              {loadingItems ? (
                <div className="p-5 text-center text-gray-400 dark:text-gray-500 text-sm">
                  <div className="w-5 h-5 border-2 border-orange-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
                  Loading items...
                </div>
              ) : (
                <div className="divide-y divide-gray-100 dark:divide-gray-700">
                  {(saleDetail?.items ?? []).map(item => (
                    <label
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-orange-50 dark:hover:bg-orange-900/20 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(item.id)}
                        onChange={() => toggleItem(item.id)}
                        className="w-4 h-4 text-orange-600 rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">{item.name}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          Qty: {item.quantity} × {fmt(item.unitPriceCents)}
                        </p>
                      </div>
                      <span className={`text-sm font-bold flex-shrink-0 ${
                        selectedItemIds.has(item.id) ? 'text-orange-600 dark:text-orange-400' : 'text-gray-700 dark:text-gray-300'
                      }`}>
                        {fmt(item.totalCents)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {selectedItemIds.size > 0 && (
                <div className="bg-orange-50 dark:bg-orange-900/20 px-4 py-2.5 flex justify-between text-sm font-semibold border-t border-orange-100 dark:border-orange-900/30">
                  <span className="text-orange-700 dark:text-orange-400">Returning {selectedItemIds.size} item(s)</span>
                  <span className="text-orange-700 dark:text-orange-400">{fmt(selectedTotal)}</span>
                </div>
              )}
            </div>
          )}

          {/* Refund method */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-2">
              Refund Method <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRefundMethod('CASH')}
                className={`flex items-center gap-2 p-3 border-2 rounded-xl transition-colors ${
                  refundMethod === 'CASH'
                    ? 'border-green-500 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                }`}
              >
                <DollarSign className="w-4 h-4 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold text-sm">Cash</div>
                  <div className="text-xs opacity-75">Immediate refund</div>
                </div>
              </button>

              <button
                onClick={() => setRefundMethod('STORE_CREDIT')}
                disabled={!customerId}
                className={`flex items-center gap-2 p-3 border-2 rounded-xl transition-colors ${
                  refundMethod === 'STORE_CREDIT'
                    ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-400'
                    : 'border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:border-gray-300 dark:hover:border-gray-500'
                } ${!customerId ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <CreditCard className="w-4 h-4 flex-shrink-0" />
                <div className="text-left">
                  <div className="font-semibold text-sm">Store Credit</div>
                  <div className="text-xs opacity-75">
                    {customerId ? 'Add to balance' : 'No customer'}
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Reason */}
          <div>
            <label className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">
              Reason for Return <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Defective product, Wrong item, Customer changed mind..."
              rows={3}
              className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 text-sm"
              autoFocus
            />
          </div>

          {returnMutation.error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl text-sm text-red-700 dark:text-red-400">
              {returnMutation.error instanceof Error
                ? returnMutation.error.message
                : 'Failed to process return'}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 pb-6 pt-3 flex gap-3 border-t border-gray-100 dark:border-gray-800 flex-shrink-0">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 dark:border-gray-600 rounded-xl text-gray-700 dark:text-gray-300 font-semibold hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => returnMutation.mutate()}
            disabled={!canSubmit || returnMutation.isPending}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {returnMutation.isPending ? 'Processing...' : (
              returnType === 'FULL'
                ? `Return All — ${fmt(totalCents)}`
                : selectedItemIds.size > 0
                ? `Return ${selectedItemIds.size} Item(s) — ${fmt(selectedTotal)}`
                : 'Select Items to Return'
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

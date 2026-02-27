import { useState } from 'react';
import { X, AlertTriangle, Lock, Minus } from 'lucide-react';
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
  onSuccess,
  onClose,
}: VoidModalProps) {
  const [managerPin, setManagerPin] = useState('');
  const [reason, setReason] = useState('');
  const [voidType, setVoidType] = useState<'FULL_VOID' | 'LINE_ITEM_VOID'>('FULL_VOID');
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());

  const { data: saleDetail } = useQuery<SaleDetail>({
    queryKey: ['sale-detail', saleId],
    queryFn: () => api.get<SaleDetail>(`/sales/${saleId}?businessId=${businessId}`),
    enabled: voidType === 'LINE_ITEM_VOID',
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

  const voidMutation = useMutation({
    mutationFn: async () => {
      const { userId } = await api.post<{ userId: string; name: string }>(
        '/sales/verify-manager-pin',
        { pin: managerPin, businessId },
      );
      return api.post(`/sales/${saleId}/void?businessId=${businessId}`, {
        managerId: userId,
        reason,
        voidedItemIds: voidType === 'LINE_ITEM_VOID' ? Array.from(selectedItemIds) : undefined,
      });
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const canSubmit =
    managerPin.length >= 4 &&
    reason.trim().length > 0 &&
    (voidType === 'FULL_VOID' || selectedItemIds.size > 0);

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-red-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-bold text-red-800">Void Transaction</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-red-100">
            <X className="w-5 h-5 text-red-600" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
            <p className="font-semibold mb-1">Warning: This action cannot be undone</p>
            <p>Inventory will be reversed and an audit trail created. Manager PIN required.</p>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 space-y-1.5 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-500">Receipt:</span>
              <span className="font-semibold">{receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-500">Total:</span>
              <span className="font-semibold text-red-600">{fmt(totalCents)}</span>
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Void Type</p>
            <div className="flex gap-2">
              <button
                onClick={() => setVoidType('FULL_VOID')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  voidType === 'FULL_VOID'
                    ? 'bg-red-600 text-white border-red-600'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Full Void
              </button>
              <button
                onClick={() => setVoidType('LINE_ITEM_VOID')}
                className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                  voidType === 'LINE_ITEM_VOID'
                    ? 'bg-orange-500 text-white border-orange-500'
                    : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                }`}
              >
                Line-Item Void
              </button>
            </div>
          </div>

          {voidType === 'LINE_ITEM_VOID' && (
            <div className="border rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 uppercase border-b">
                Select Items to Void
              </div>
              {!saleDetail ? (
                <div className="p-4 text-center text-gray-400 text-sm">Loading items...</div>
              ) : (
                <div className="divide-y">
                  {saleDetail.items.map(item => (
                    <label
                      key={item.id}
                      className="flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedItemIds.has(item.id)}
                        onChange={() => toggleItem(item.id)}
                        className="w-4 h-4 text-red-600 rounded"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-medium text-gray-800">{item.name}</p>
                        <p className="text-xs text-gray-500">
                          Qty: {item.quantity} × {fmt(item.unitPriceCents)}
                        </p>
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          selectedItemIds.has(item.id) ? 'text-red-600 line-through' : 'text-gray-700'
                        }`}
                      >
                        {fmt(item.totalCents)}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              {selectedItemIds.size > 0 && (
                <div className="bg-red-50 px-4 py-2 flex justify-between text-sm font-semibold border-t">
                  <span className="text-red-700">Voiding {selectedItemIds.size} item(s)</span>
                  <span className="text-red-700">-{fmt(selectedTotal)}</span>
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Manager PIN <span className="text-red-500">*</span>
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="password"
                value={managerPin}
                onChange={(e) => setManagerPin(e.target.value)}
                placeholder="Enter 4–6 digit PIN"
                maxLength={6}
                className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Customer changed mind, Wrong item scanned, Pricing error..."
              rows={3}
              className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none text-sm"
            />
          </div>

          {voidMutation.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {voidMutation.error instanceof Error ? voidMutation.error.message : 'Failed to void transaction'}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 pt-2 flex gap-3 flex-shrink-0 border-t">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => voidMutation.mutate()}
            disabled={!canSubmit || voidMutation.isPending}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {voidMutation.isPending ? 'Processing...' : (
              <span className="flex items-center justify-center gap-1.5">
                <Minus className="w-4 h-4" />
                {voidType === 'FULL_VOID' ? 'Void Full Sale' : `Void ${selectedItemIds.size} Item(s)`}
              </span>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { X, AlertTriangle, Lock } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';

interface VoidModalProps {
  saleId: string;
  receiptNumber: string;
  totalCents: number;
  businessId: string;
  onSuccess: () => void;
  onClose: () => void;
}

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
  const [voidType] = useState<'FULL_VOID'>('FULL_VOID'); // Line-item void TODO

  const voidMutation = useMutation({
    mutationFn: async () => {
      // Verify PIN first
      const { userId } = await api.post<{ userId: string; name: string }>(
        '/sales/verify-manager-pin',
        { pin: managerPin, businessId },
      );

      // Then void the sale
      return api.post(`/sales/${saleId}/void?businessId=${businessId}`, {
        managerId: userId,
        reason,
        voidType,
      });
    },
    onSuccess: () => {
      onSuccess();
      onClose();
    },
  });

  const formatKES = (cents: number) =>
    `KES ${(cents / 100).toLocaleString('en-KE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    })}`;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b bg-red-50">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            <h2 className="text-lg font-bold text-red-800">Void Transaction</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-red-100">
            <X className="w-5 h-5 text-red-600" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-yellow-800">
                <p className="font-semibold mb-1">Warning: This action cannot be undone</p>
                <p>
                  Voiding this transaction will reverse inventory movements and create an
                  audit trail. Manager authorization required.
                </p>
              </div>
            </div>
          </div>

          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Receipt:</span>
              <span className="font-semibold">{receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Amount:</span>
              <span className="font-semibold text-red-600">{formatKES(totalCents)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Type:</span>
              <span className="font-semibold">Full Void</span>
            </div>
          </div>

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
                placeholder="Enter 4-6 digit PIN"
                maxLength={6}
                className="w-full pl-10 pr-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                autoFocus
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Void <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Customer changed mind, Wrong item scanned, Pricing error..."
              rows={3}
              className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent resize-none"
            />
          </div>

          {voidMutation.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {voidMutation.error instanceof Error
                ? voidMutation.error.message
                : 'Failed to void transaction'}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => voidMutation.mutate()}
            disabled={!managerPin || !reason || voidMutation.isPending}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {voidMutation.isPending ? 'Voiding...' : 'Void Transaction'}
          </button>
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { X, RotateCcw, DollarSign, CreditCard } from 'lucide-react';
import { useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';

interface ReturnModalProps {
  saleId: string;
  receiptNumber: string;
  totalCents: number;
  customerId?: string;
  businessId: string;
  onSuccess: () => void;
  onClose: () => void;
}

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

  const returnMutation = useMutation({
    mutationFn: async () => {
      return api.post(`/sales/${saleId}/return?businessId=${businessId}`, {
        reason,
        refundMethod,
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
        <div className="flex items-center justify-between px-6 py-4 border-b bg-orange-50">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-5 h-5 text-orange-600" />
            <h2 className="text-lg font-bold text-orange-800">Return Sale</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-orange-100">
            <X className="w-5 h-5 text-orange-600" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="bg-gray-50 rounded-lg p-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-gray-600">Receipt:</span>
              <span className="font-semibold">{receiptNumber}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Refund Amount:</span>
              <span className="font-semibold text-orange-600">{formatKES(totalCents)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Refund Method <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => setRefundMethod('CASH')}
                className={`flex items-center gap-2 p-3 border-2 rounded-lg transition-colors ${
                  refundMethod === 'CASH'
                    ? 'border-green-500 bg-green-50 text-green-700'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
              >
                <DollarSign className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-semibold text-sm">Cash</div>
                  <div className="text-xs opacity-75">Immediate refund</div>
                </div>
              </button>

              <button
                onClick={() => setRefundMethod('STORE_CREDIT')}
                disabled={!customerId}
                className={`flex items-center gap-2 p-3 border-2 rounded-lg transition-colors ${
                  refundMethod === 'STORE_CREDIT'
                    ? 'border-blue-500 bg-blue-50 text-blue-700'
                    : 'border-gray-200 hover:border-gray-300'
                } ${!customerId ? 'opacity-40 cursor-not-allowed' : ''}`}
              >
                <CreditCard className="w-5 h-5" />
                <div className="text-left">
                  <div className="font-semibold text-sm">Store Credit</div>
                  <div className="text-xs opacity-75">
                    {customerId ? 'Add to balance' : 'No customer'}
                  </div>
                </div>
              </button>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reason for Return <span className="text-red-500">*</span>
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="e.g., Defective product, Wrong item, Customer changed mind..."
              rows={3}
              className="w-full px-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-orange-500 focus:border-transparent resize-none"
              autoFocus
            />
          </div>

          {returnMutation.error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {returnMutation.error instanceof Error
                ? returnMutation.error.message
                : 'Failed to process return'}
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
            onClick={() => returnMutation.mutate()}
            disabled={!reason || returnMutation.isPending}
            className="flex-1 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold rounded-lg disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {returnMutation.isPending ? 'Processing...' : 'Process Return'}
          </button>
        </div>
      </div>
    </div>
  );
}

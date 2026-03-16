import { useState } from 'react';
import { X, AlertTriangle } from 'lucide-react';
import { api } from '../../lib/api';
import type { CartItem } from '../../stores/pos';

function formatKES(cents: number) {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface Props {
  item: CartItem;
  userRole?: string;
  businessId: string;
  onApply: (itemId: string, priceCents: number) => void;
  onCancel: () => void;
}

export default function PriceOverrideModal({ item, userRole, businessId, onApply, onCancel }: Props) {
  const [priceInput, setPriceInput] = useState((item.unitPriceCents / 100).toFixed(2));
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  const handleApply = async () => {
    const newPrice = Math.round(parseFloat(priceInput) * 100);
    if (!newPrice || newPrice <= 0) { setError('Enter a valid price'); return; }
    if (userRole === 'CASHIER') {
      if (!pin) { setError('Manager PIN required'); return; }
      setPending(true);
      try {
        await api.post('/auth/verify-pin', { businessId, pin, role: 'MANAGER' });
      } catch {
        setError('Invalid manager PIN');
        setPending(false);
        return;
      }
      setPending(false);
    }
    onApply(item.id, newPrice);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Override Price</h2>
          <button onClick={onCancel} className="p-1 rounded hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>
        <p className="text-sm text-gray-600 mb-3">
          <span className="font-medium">{item.name}</span>
          <span className="ml-2 text-gray-400">Current: {formatKES(item.unitPriceCents)}</span>
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">New Price (KES)</label>
            <input
              type="number"
              min="0"
              step="1"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              className="w-full border rounded-xl px-4 py-3 text-xl font-bold focus:ring-2 focus:ring-amber-500"
              autoFocus
            />
          </div>
          {userRole === 'CASHIER' && (
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Manager PIN (required)</label>
              <input
                type="password"
                maxLength={6}
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                placeholder="Enter manager PIN"
                className="w-full border rounded-xl px-4 py-2.5 focus:ring-2 focus:ring-amber-500"
              />
            </div>
          )}
          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              {error}
            </p>
          )}
        </div>
        <div className="flex gap-3 mt-5">
          <button
            onClick={onCancel}
            className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-700 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleApply()}
            disabled={pending}
            className="flex-1 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold disabled:opacity-40"
          >
            {pending ? 'Verifying…' : 'Apply Override'}
          </button>
        </div>
      </div>
    </div>
  );
}

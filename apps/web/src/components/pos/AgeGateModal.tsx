import { ShieldAlert } from 'lucide-react';
import type { ApiItem } from '../../stores/pos';

interface Props {
  item: ApiItem;
  onConfirm: () => void;
  onCancel: () => void;
}

export default function AgeGateModal({ item, onConfirm, onCancel }: Props) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl text-center">
        <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
          <ShieldAlert className="w-8 h-8 text-red-600" />
        </div>
        <h2 className="text-xl font-bold text-gray-900 mb-1">Age Verification Required</h2>
        <p className="text-gray-500 text-sm mb-4">
          <span className="font-semibold">{item.name}</span> is restricted to customers aged{' '}
          <span className="font-bold text-red-600">{item.minAgeYears ?? 18}+</span> only.
        </p>
        <p className="text-xs text-gray-400 mb-5">
          By confirming, you verify that the customer is of legal age and accepts responsibility for this sale.
        </p>
        <div className="flex gap-3">
          <button
            onClick={onCancel}
            className="flex-1 py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="flex-1 py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold"
          >
            Confirm {item.minAgeYears ?? 18}+ ✓
          </button>
        </div>
      </div>
    </div>
  );
}

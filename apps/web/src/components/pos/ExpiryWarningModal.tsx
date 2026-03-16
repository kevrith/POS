import { AlertTriangle } from 'lucide-react';

interface ExpiryWarning {
  itemId: string;
  name: string;
  status: string;
  expiryDate?: string;
}

interface Props {
  warnings: ExpiryWarning[];
  onClose: () => void;
  onProceed: () => void;
}

export default function ExpiryWarningModal({ warnings, onClose, onProceed }: Props) {
  const hasExpired = warnings.some((w) => w.status === 'EXPIRED');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 bg-orange-100 rounded-full flex items-center justify-center flex-shrink-0">
            <AlertTriangle className="w-5 h-5 text-orange-600" />
          </div>
          <div>
            <h3 className="font-bold text-gray-900">Expiry Warning</h3>
            <p className="text-sm text-gray-500">Some items have expiry issues</p>
          </div>
        </div>
        <div className="space-y-2 mb-5">
          {warnings.map((w) => (
            <div
              key={w.itemId}
              className={`flex items-center gap-2 p-2.5 rounded-lg text-sm ${
                w.status === 'EXPIRED' ? 'bg-red-50 text-red-700' : 'bg-orange-50 text-orange-700'
              }`}
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <div>
                <span className="font-medium">{w.name}</span>
                <span className="ml-1 text-xs">
                  {w.status === 'EXPIRED'
                    ? `EXPIRED ${w.expiryDate ? new Date(w.expiryDate).toLocaleDateString() : ''}`
                    : `Expires ${w.expiryDate ? new Date(w.expiryDate).toLocaleDateString() : 'soon'}`}
                </span>
              </div>
            </div>
          ))}
        </div>
        {hasExpired ? (
          <div className="space-y-2">
            <p className="text-xs text-red-600 text-center">Expired items cannot be sold. Remove them from cart first.</p>
            <button
              onClick={onClose}
              className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
            >
              Go Back to Cart
            </button>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={onProceed}
              className="flex-1 py-2.5 bg-orange-500 text-white rounded-xl font-medium hover:bg-orange-600"
            >
              Sell Anyway
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

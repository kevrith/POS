import { X, PlayCircle, Trash2, Clock, ShoppingCart } from 'lucide-react';
import type { HeldSale } from '../stores/pos';

function formatKES(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

interface HeldSalesModalProps {
  heldSales: HeldSale[];
  onResume: (id: string) => void;
  onDiscard: (id: string) => void;
  onClose: () => void;
}

export default function HeldSalesModal({
  heldSales,
  onResume,
  onDiscard,
  onClose,
}: HeldSalesModalProps) {
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Held Sales</h2>
            <p className="text-xs text-gray-500">{heldSales.length}/10 slots used</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100" aria-label="Close">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {heldSales.length === 0 ? (
            <div className="text-center py-12 text-gray-400">
              <ShoppingCart className="w-10 h-10 mx-auto mb-3 opacity-20" />
              <p>No held sales</p>
              <p className="text-xs mt-1">Press F5 to hold the current cart</p>
            </div>
          ) : (
            <div className="space-y-3">
              {heldSales.map((held) => {
                const total = held.cart.reduce((s, i) => s + i.totalCents, 0);
                const time = new Date(held.createdAt).toLocaleTimeString('en-KE', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                return (
                  <div key={held.id} className="border rounded-xl p-4 hover:bg-gray-50 transition-colors">
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <p className="font-semibold text-gray-800">{held.label}</p>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            {time}
                          </span>
                          <span>{held.cart.length} items</span>
                          {held.customerName && <span>· {held.customerName}</span>}
                          <span className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600">{held.priceLevel}</span>
                        </div>
                      </div>
                      <span className="font-bold text-blue-600">{formatKES(total)}</span>
                    </div>
                    <div className="text-xs text-gray-400 mb-3 truncate">
                      {held.cart.map((i) => i.name).join(', ')}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => onResume(held.id)}
                        className="flex-1 flex items-center justify-center gap-2 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
                      >
                        <PlayCircle className="w-4 h-4" />
                        Resume
                      </button>
                      <button
                        onClick={() => onDiscard(held.id)}
                        className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg text-sm font-medium transition-colors" aria-label="Delete">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import { useState } from 'react';
import { usePOSStore } from '../stores/pos.store';
import { formatKES } from '@pos/shared';
import PaymentModal from '../components/PaymentModal';
import { createSale } from '../api/sales';

export default function POSScreen() {
  const { cart, priceLevel, removeItem, updateQuantity, clearCart, getSubtotal } = usePOSStore();
  const [showPayment, setShowPayment] = useState(false);
  const [processing, setProcessing] = useState(false);

  const subtotal = getSubtotal();
  const serviceCharge = Math.round(subtotal * 0.1);
  const vat = Math.round(subtotal * 0.16);
  const total = subtotal + serviceCharge + vat;

  const handleCheckout = async (payments: Array<{ method: string; amountCents: number; reference?: string }>) => {
    setProcessing(true);
    try {
      await createSale('business-id', {
        storeId: 'store-id',
        cashierId: 'user-id',
        type: 'NORMAL',
        priceLevel,
        items: cart.map(item => ({ itemId: item.itemId, quantity: item.quantity })),
        payments,
      });
      
      clearCart();
      setShowPayment(false);
      alert('Sale completed successfully!');
    } catch (error) {
      alert('Sale failed. Please try again.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="flex h-screen">
      <div className="flex-1 bg-gray-100 p-4">
        <input type="text" placeholder="Search items..." className="w-full px-4 py-2 border rounded-lg mb-4" />
        <div className="grid grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
            <button key={i} className="bg-white p-4 rounded-lg shadow hover:shadow-lg">
              <div className="text-sm font-medium">Item {i}</div>
              <div className="text-xs text-gray-500">KES 100</div>
            </button>
          ))}
        </div>
      </div>

      <div className="w-96 bg-white border-l flex flex-col">
        <div className="p-4 border-b">
          <h2 className="text-xl font-bold">Cart</h2>
          <select value={priceLevel} className="mt-2 w-full px-3 py-2 border rounded">
            <option value="RETAIL">Retail</option>
            <option value="WHOLESALE">Wholesale</option>
            <option value="VIP">VIP</option>
          </select>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {cart.length === 0 ? (
            <div className="text-center text-gray-400 mt-8">Cart is empty</div>
          ) : (
            cart.map((item) => (
              <div key={item.itemId} className="mb-3 p-3 bg-gray-50 rounded">
                <div className="flex justify-between items-start mb-2">
                  <span className="font-medium">{item.name}</span>
                  <button onClick={() => removeItem(item.itemId)} className="text-red-500 text-sm">×</button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button onClick={() => updateQuantity(item.itemId, item.quantity - 1)} className="w-8 h-8 bg-gray-200 rounded">-</button>
                    <span className="w-12 text-center">{item.quantity}</span>
                    <button onClick={() => updateQuantity(item.itemId, item.quantity + 1)} className="w-8 h-8 bg-gray-200 rounded">+</button>
                  </div>
                  <span className="font-medium">{formatKES(item.totalCents)}</span>
                </div>
              </div>
            ))
          )}
        </div>

        <div className="border-t p-4 space-y-2">
          <div className="flex justify-between text-sm">
            <span>Subtotal:</span>
            <span>{formatKES(subtotal)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>Service (10%):</span>
            <span>{formatKES(serviceCharge)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span>VAT (16%):</span>
            <span>{formatKES(vat)}</span>
          </div>
          <div className="flex justify-between text-lg font-bold border-t pt-2">
            <span>TOTAL:</span>
            <span>{formatKES(total)}</span>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-4">
            <button onClick={clearCart} className="px-4 py-3 bg-gray-200 rounded-lg hover:bg-gray-300">Clear</button>
            <button
              onClick={() => setShowPayment(true)}
              disabled={cart.length === 0 || processing}
              className="px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {processing ? 'Processing...' : 'Checkout'}
            </button>
          </div>
        </div>
      </div>

      {showPayment && (
        <PaymentModal
          totalCents={total}
          onComplete={handleCheckout}
          onCancel={() => setShowPayment(false)}
        />
      )}
    </div>
  );
}

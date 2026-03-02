import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';

interface LoyaltyResult {
  customerName: string;
  phone: string;
  loyaltyPoints: number;
  tier: string;
  tierName: string;
  lastPurchase: string | null;
  totalSpentCents: number;
}

interface MenuItem {
  id: string;
  name: string;
  description?: string;
  retailPriceCents: number;
  category: string;
}

interface MenuCategory {
  category: string;
  items: MenuItem[];
}

interface BusinessInfo {
  name: string;
  posMode?: string;
}

const TIER_COLORS: Record<string, string> = {
  BRONZE: 'bg-amber-700 text-white',
  SILVER: 'bg-gray-400 text-white',
  GOLD: 'bg-yellow-500 text-white',
  PLATINUM: 'bg-indigo-600 text-white',
};

export default function CustomerPortalPage() {
  const [searchParams] = useSearchParams();
  const businessId = searchParams.get('b') || '';

  const [business, setBusiness] = useState<BusinessInfo | null>(null);
  const [phone, setPhone] = useState('');
  const [loyaltyResult, setLoyaltyResult] = useState<LoyaltyResult | null>(null);
  const [loyaltyError, setLoyaltyError] = useState('');
  const [lookingUp, setLookingUp] = useState(false);

  const [menu, setMenu] = useState<MenuCategory[]>([]);
  const [menuLoading, setMenuLoading] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>('');

  useEffect(() => {
    if (!businessId) return;
    // Fetch menu and business info
    setMenuLoading(true);
    api.get(`/portal/menu?businessId=${businessId}`)
      .then((data: any) => {
        setBusiness(data.business);
        setMenu(data.categories || []);
        if (data.categories?.length > 0) {
          setActiveCategory(data.categories[0].category);
        }
      })
      .catch(() => {})
      .finally(() => setMenuLoading(false));
  }, [businessId]);

  async function handleLoyaltyLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!phone.trim()) return;
    setLookingUp(true);
    setLoyaltyError('');
    setLoyaltyResult(null);
    try {
      const result = await api.post('/portal/loyalty-lookup', { phone: phone.trim(), businessId }) as LoyaltyResult;
      setLoyaltyResult(result);
    } catch (err: any) {
      setLoyaltyError(err?.message || 'Customer not found. Please check your phone number.');
    } finally {
      setLookingUp(false);
    }
  }

  function formatKES(cents: number) {
    return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }

  if (!businessId) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-700 mb-2">Customer Portal</h1>
          <p className="text-gray-500">No business ID provided. Please use the link given by your merchant.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-indigo-50 to-white">
      {/* Header */}
      <header className="bg-indigo-600 text-white shadow-md">
        <div className="max-w-2xl mx-auto px-4 py-5 text-center">
          <h1 className="text-2xl font-bold">{business?.name || 'Customer Portal'}</h1>
          <p className="text-indigo-200 text-sm mt-1">Welcome! Check your loyalty points or browse our offerings.</p>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8 space-y-10">
        {/* Section 1: Loyalty Points Lookup */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 p-6">
          <h2 className="text-lg font-semibold text-gray-800 mb-1">Check Your Loyalty Points</h2>
          <p className="text-sm text-gray-500 mb-4">Enter the phone number you use when shopping with us.</p>

          <form onSubmit={handleLoyaltyLookup} className="flex gap-2">
            <input
              type="tel"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="e.g. 0712345678"
              className="flex-1 border border-gray-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <button
              type="submit"
              disabled={lookingUp || !phone.trim()}
              className="bg-indigo-600 text-white px-5 py-2 rounded-lg text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
            >
              {lookingUp ? 'Checking…' : 'Check'}
            </button>
          </form>

          {loyaltyError && (
            <div className="mt-3 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              {loyaltyError}
            </div>
          )}

          {loyaltyResult && (
            <div className="mt-4 p-4 bg-indigo-50 border border-indigo-100 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-800 text-lg">{loyaltyResult.customerName}</p>
                  <p className="text-gray-500 text-sm">{loyaltyResult.phone}</p>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-bold ${TIER_COLORS[loyaltyResult.tier] || 'bg-gray-200 text-gray-700'}`}>
                  {loyaltyResult.tierName || loyaltyResult.tier}
                </span>
              </div>

              <div className="flex items-center gap-6 pt-1">
                <div className="text-center">
                  <p className="text-3xl font-bold text-indigo-600">{loyaltyResult.loyaltyPoints.toLocaleString()}</p>
                  <p className="text-xs text-gray-500 mt-1">Points Balance</p>
                </div>
                <div className="text-center">
                  <p className="text-xl font-semibold text-gray-700">{formatKES(loyaltyResult.totalSpentCents)}</p>
                  <p className="text-xs text-gray-500 mt-1">Total Spent</p>
                </div>
                {loyaltyResult.lastPurchase && (
                  <div className="text-center">
                    <p className="text-sm font-medium text-gray-700">
                      {new Date(loyaltyResult.lastPurchase).toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">Last Purchase</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </section>

        {/* Section 2: Menu / Product Catalogue */}
        <section className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-800">
              {business?.posMode === 'HOSPITALITY' ? 'Our Menu' : 'Our Products'}
            </h2>
          </div>

          {menuLoading ? (
            <div className="py-12 text-center text-gray-400 text-sm">Loading…</div>
          ) : menu.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">No items available at this time.</div>
          ) : (
            <>
              {/* Category tabs */}
              <div className="flex gap-2 px-6 py-3 overflow-x-auto border-b border-gray-100 bg-gray-50">
                {menu.map(cat => (
                  <button
                    key={cat.category}
                    onClick={() => setActiveCategory(cat.category)}
                    className={`flex-shrink-0 px-4 py-1.5 rounded-full text-sm font-medium transition-colors ${
                      activeCategory === cat.category
                        ? 'bg-indigo-600 text-white'
                        : 'bg-white border border-gray-200 text-gray-600 hover:border-indigo-300'
                    }`}
                  >
                    {cat.category}
                  </button>
                ))}
              </div>

              {/* Items grid */}
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4">
                  {(menu.find(c => c.category === activeCategory)?.items || []).map(item => (
                    <div key={item.id} className="border border-gray-100 rounded-xl p-4 hover:shadow-sm transition-shadow">
                      <p className="font-medium text-gray-800 text-sm leading-snug">{item.name}</p>
                      {item.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{item.description}</p>
                      )}
                      <p className="mt-2 text-indigo-600 font-bold text-sm">{formatKES(item.retailPriceCents)}</p>
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </section>

        <footer className="text-center text-xs text-gray-400 pb-4">
          Powered by Kastra POS &copy; {new Date().getFullYear()}
        </footer>
      </main>
    </div>
  );
}

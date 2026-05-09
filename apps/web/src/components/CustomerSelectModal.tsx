import { useState, useEffect, useRef } from 'react';
import { X, Search, User, Plus, Phone, Star, Sparkles } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  loyaltyPoints?: number;
  creditLimitCents?: number;
  outstandingBalanceCents?: number;
}

interface CustomerSelectModalProps {
  businessId: string;
  onSelect: (id: string, name: string) => void;
  onClose: () => void;
}

/** Returns true if the string looks like a phone number (mostly digits, optional +/spaces) */
function looksLikePhone(s: string): boolean {
  return /^[+\d\s\-()]{7,}$/.test(s.trim());
}

export default function CustomerSelectModal({
  businessId,
  onSelect,
  onClose,
}: CustomerSelectModalProps) {
  const [search, setSearch] = useState('');
  const [autoSelected, setAutoSelected] = useState(false);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers', businessId, search],
    queryFn: () =>
      api.get<Customer[]>(
        `/businesses/${businessId}/customers${
          search ? `?search=${encodeURIComponent(search)}` : ''
        }`,
      ),
    enabled: !!businessId,
  });

  const isPhoneSearch = looksLikePhone(search);
  const exactMatch =
    isPhoneSearch && customers.length === 1 ? customers[0] : null;

  // Auto-select after 1.2 s when there's an exact phone match
  useEffect(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    setAutoSelected(false);

    if (exactMatch) {
      autoTimer.current = setTimeout(() => {
        setAutoSelected(true);
        // Give the "Welcome back" banner a moment to be visible, then select
        setTimeout(() => {
          onSelect(exactMatch.id, exactMatch.name);
          onClose();
        }, 800);
      }, 1200);
    }

    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
  }, [exactMatch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold text-gray-800">Select Customer</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 border-b">
          <div className="relative">
            {isPhoneSearch ? (
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-blue-400" />
            ) : (
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            )}
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm text-gray-900 placeholder-gray-400 bg-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        {/* ── Welcome back banner ── */}
        {exactMatch && (
          <div
            className={`mx-4 mt-4 rounded-xl border-2 p-4 flex items-center gap-4 transition-all
              ${autoSelected
                ? 'border-green-400 bg-green-50 shadow-lg scale-[1.01]'
                : 'border-blue-300 bg-blue-50'
              }`}
          >
            <div className={`w-12 h-12 rounded-full flex items-center justify-center text-xl font-bold flex-shrink-0
              ${autoSelected ? 'bg-green-200 text-green-800' : 'bg-blue-200 text-blue-800'}`}>
              {exactMatch.name.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5">
                <Sparkles className={`w-3.5 h-3.5 ${autoSelected ? 'text-green-600' : 'text-blue-500'}`} />
                <p className={`text-xs font-semibold uppercase tracking-wide ${autoSelected ? 'text-green-700' : 'text-blue-600'}`}>
                  {autoSelected ? 'Selecting…' : 'Welcome back!'}
                </p>
              </div>
              <p className="text-lg font-bold text-gray-900 truncate">{exactMatch.name}</p>
              {exactMatch.phone && (
                <p className="text-xs text-gray-500">{exactMatch.phone}</p>
              )}
              {(exactMatch.loyaltyPoints ?? 0) > 0 && (
                <div className="flex items-center gap-1 mt-0.5">
                  <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                  <span className="text-xs text-amber-700 font-medium">
                    {exactMatch.loyaltyPoints} loyalty pts
                  </span>
                </div>
              )}
            </div>
            <button
              onClick={() => { onSelect(exactMatch.id, exactMatch.name); onClose(); }}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm font-semibold text-white transition-colors
                ${autoSelected ? 'bg-green-600' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              Select
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : customers.length === 0 && !isLoading ? (
            <div className="text-center py-8 text-gray-400">
              <User className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No customers found</p>
              {isPhoneSearch && (
                <p className="text-xs mt-1 text-gray-400">
                  New phone — add them below
                </p>
              )}
            </div>
          ) : (
            /* Hide list when banner is showing to keep focus on the match */
            !exactMatch && (
              <div className="space-y-2">
                {customers.map((customer) => (
                  <button
                    key={customer.id}
                    onClick={() => {
                      onSelect(customer.id, customer.name);
                      onClose();
                    }}
                    className="w-full text-left p-3 rounded-lg border hover:border-blue-400 hover:bg-blue-50 transition-colors"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium text-gray-800 truncate">{customer.name}</div>
                        {customer.phone && (
                          <div className="text-xs text-gray-500 mt-0.5">{customer.phone}</div>
                        )}
                      </div>
                      {(customer.loyaltyPoints ?? 0) > 0 && (
                        <span className="flex items-center gap-0.5 text-xs text-amber-700 font-medium flex-shrink-0">
                          <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
                          {customer.loyaltyPoints} pts
                        </span>
                      )}
                    </div>
                    {customer.outstandingBalanceCents && customer.outstandingBalanceCents > 0 && (
                      <div className="text-xs text-orange-600 mt-1">
                        Outstanding: KES {(customer.outstandingBalanceCents / 100).toFixed(2)}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )
          )}
        </div>

        <div className="p-4 border-t">
          <button
            onClick={onClose}
            className="w-full py-2 border border-gray-300 rounded-lg text-gray-700 font-medium hover:bg-gray-50 flex items-center justify-center gap-2"
          >
            <Plus className="w-4 h-4" />
            New Customer
          </button>
        </div>
      </div>
    </div>
  );
}

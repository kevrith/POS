import { useState } from 'react';
import { X, Search, User, Plus } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  creditLimitCents?: number;
  outstandingBalanceCents?: number;
}

interface CustomerSelectModalProps {
  businessId: string;
  onSelect: (id: string, name: string) => void;
  onClose: () => void;
}

export default function CustomerSelectModal({
  businessId,
  onSelect,
  onClose,
}: CustomerSelectModalProps) {
  const [search, setSearch] = useState('');

  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ['customers', businessId, search],
    queryFn: () =>
      api.get<Customer[]>(
        `/customers?businessId=${businessId}${
          search ? `&search=${encodeURIComponent(search)}` : ''
        }`,
      ),
    enabled: !!businessId,
  });

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
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or phone..."
              className="w-full pl-9 pr-4 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              autoFocus
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading...</div>
          ) : customers.length === 0 ? (
            <div className="text-center py-8 text-gray-400">
              <User className="w-10 h-10 mx-auto mb-2 opacity-20" />
              <p className="text-sm">No customers found</p>
            </div>
          ) : (
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
                  <div className="font-medium text-gray-800">{customer.name}</div>
                  {customer.phone && (
                    <div className="text-xs text-gray-500 mt-0.5">{customer.phone}</div>
                  )}
                  {customer.outstandingBalanceCents && customer.outstandingBalanceCents > 0 && (
                    <div className="text-xs text-orange-600 mt-1">
                      Outstanding: KES {(customer.outstandingBalanceCents / 100).toFixed(2)}
                    </div>
                  )}
                </button>
              ))}
            </div>
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

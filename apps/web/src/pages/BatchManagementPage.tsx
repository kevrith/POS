import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';

interface Batch {
  id: string;
  item: { name: string };
  lotNumber: string;
  expiryDate?: string;
  quantityRemaining: number;
  status: string;
}

export default function BatchManagementPage() {
  const [filter, setFilter] = useState<'all' | 'expiring' | 'expired'>('all');

  const { data: batches = [] } = useQuery({
    queryKey: ['batches'],
    queryFn: () => api.get<Batch[]>('/batch'),
  });

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const expiringBatches = batches.filter(
    (b) => b.expiryDate && new Date(b.expiryDate) <= thirtyDaysFromNow && new Date(b.expiryDate) > now
  );
  const expiredBatches = batches.filter((b) => b.expiryDate && new Date(b.expiryDate) <= now);

  const filteredBatches =
    filter === 'expiring'
      ? expiringBatches
      : filter === 'expired'
      ? expiredBatches
      : batches;

  const getExpiryStatus = (expiryDate?: string) => {
    if (!expiryDate) return null;
    const expiry = new Date(expiryDate);
    if (expiry <= now) return { label: 'EXPIRED', color: 'text-red-600 bg-red-50' };
    if (expiry <= thirtyDaysFromNow)
      return { label: 'EXPIRING SOON', color: 'text-yellow-600 bg-yellow-50' };
    return { label: 'GOOD', color: 'text-green-600 bg-green-50' };
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Batch & Expiry Management</h1>

      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded">
          <p className="text-sm text-blue-600 font-medium">Total Batches</p>
          <p className="text-2xl font-bold">{batches.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded">
          <p className="text-sm text-green-600 font-medium">Active</p>
          <p className="text-2xl font-bold">
            {batches.filter((b) => b.status === 'ACTIVE').length}
          </p>
        </div>
        <div className="bg-yellow-50 p-4 rounded">
          <p className="text-sm text-yellow-600 font-medium">Expiring Soon (30 days)</p>
          <p className="text-2xl font-bold">{expiringBatches.length}</p>
        </div>
        <div className="bg-red-50 p-4 rounded">
          <p className="text-sm text-red-600 font-medium">Expired</p>
          <p className="text-2xl font-bold">{expiredBatches.length}</p>
        </div>
      </div>

      <div className="bg-white rounded shadow mb-4">
        <div className="p-4 border-b flex gap-2">
          <button
            onClick={() => setFilter('all')}
            className={`px-4 py-2 rounded ${
              filter === 'all' ? 'bg-blue-600 text-white' : 'bg-gray-100'
            }`}
          >
            All Batches
          </button>
          <button
            onClick={() => setFilter('expiring')}
            className={`px-4 py-2 rounded ${
              filter === 'expiring' ? 'bg-yellow-600 text-white' : 'bg-gray-100'
            }`}
          >
            Expiring Soon ({expiringBatches.length})
          </button>
          <button
            onClick={() => setFilter('expired')}
            className={`px-4 py-2 rounded ${
              filter === 'expired' ? 'bg-red-600 text-white' : 'bg-gray-100'
            }`}
          >
            Expired ({expiredBatches.length})
          </button>
        </div>

        <table className="w-full">
          <thead className="bg-gray-50">
            <tr>
              <th className="text-left p-4">Item</th>
              <th className="text-left p-4">Lot Number</th>
              <th className="text-left p-4">Expiry Date</th>
              <th className="text-right p-4">Qty Remaining</th>
              <th className="text-center p-4">Status</th>
              <th className="text-center p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredBatches.map((batch) => {
              const expiryStatus = getExpiryStatus(batch.expiryDate);
              return (
                <tr key={batch.id} className="border-t hover:bg-gray-50">
                  <td className="p-4 font-medium">{batch.item.name}</td>
                  <td className="p-4 font-mono">{batch.lotNumber}</td>
                  <td className="p-4">
                    {batch.expiryDate ? new Date(batch.expiryDate).toLocaleDateString() : '-'}
                  </td>
                  <td className="p-4 text-right">{batch.quantityRemaining}</td>
                  <td className="p-4 text-center">
                    {expiryStatus && (
                      <span className={`px-2 py-1 rounded text-sm font-medium ${expiryStatus.color}`}>
                        {expiryStatus.label}
                      </span>
                    )}
                  </td>
                  <td className="p-4 text-center">
                    <button className="bg-blue-600 text-white px-3 py-1 rounded text-sm">
                      View History
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

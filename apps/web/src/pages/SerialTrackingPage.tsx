import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { Plus, Search, X } from 'lucide-react';

interface SerialRecord {
  id: string;
  item: { id: string; name: string };
  serialNumber: string;
  status: string;
  createdAt: string;
  sale?: { receiptNumber: string };
}

interface CatalogItem {
  id: string;
  name: string;
  type: string;
  trackSerials?: boolean;
}

function statusBadge(status: string) {
  switch (status) {
    case 'AVAILABLE':
      return 'bg-green-100 text-green-800';
    case 'SOLD':
      return 'bg-gray-100 text-gray-700';
    case 'RETURNED':
      return 'bg-yellow-100 text-yellow-800';
    case 'DEFECTIVE':
      return 'bg-red-100 text-red-700';
    default:
      return 'bg-gray-100 text-gray-600';
  }
}

export default function SerialTrackingPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';

  const [showForm, setShowForm] = useState(false);
  const [serialSearch, setSerialSearch] = useState('');
  const [filterItemId, setFilterItemId] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Form state
  const [selectedItemId, setSelectedItemId] = useState('');
  const [selectedItemName, setSelectedItemName] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [serialNumber, setSerialNumber] = useState('');

  const qc = useQueryClient();

  // ── Fetch all serials ──────────────────────────────────────────────────────
  const { data: serials = [], isLoading } = useQuery({
    queryKey: ['serials', businessId, filterItemId],
    queryFn: () =>
      api.get<SerialRecord[]>(
        `/serial?businessId=${businessId}${filterItemId ? `&itemId=${filterItemId}` : ''}`,
      ),
    enabled: !!businessId,
  });

  // ── Search by serial number ────────────────────────────────────────────────
  const { data: searchResult, isFetching: isSearching } = useQuery({
    queryKey: ['serial-search', businessId, serialSearch],
    queryFn: () =>
      api.get<SerialRecord>(`/serial/search?serialNumber=${encodeURIComponent(serialSearch)}&businessId=${businessId}`),
    enabled: !!businessId && serialSearch.length >= 4,
    retry: false,
  });

  // ── Fetch catalog items (for add form item picker) ─────────────────────────
  const { data: catalog = [] } = useQuery({
    queryKey: ['catalog-items', businessId, storeId],
    queryFn: () => api.get<CatalogItem[]>(`/items?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId,
  });

  const serializedItems = catalog.filter((c) => c.trackSerials);

  // ── Add serial ─────────────────────────────────────────────────────────────
  const addMutation = useMutation({
    mutationFn: () =>
      api.post(`/serial?businessId=${businessId}`, { itemId: selectedItemId, serialNumber }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['serials', businessId] });
      setShowForm(false);
      setSelectedItemId('');
      setSelectedItemName('');
      setSerialNumber('');
      setItemSearch('');
    },
  });

  // ── Derived data ───────────────────────────────────────────────────────────
  const displaySerials = serials.filter(
    (s) =>
      (!filterStatus || s.status === filterStatus) &&
      (!serialSearch ||
        s.serialNumber.toLowerCase().includes(serialSearch.toLowerCase())),
  );

  const availableCount = serials.filter((s) => s.status === 'AVAILABLE').length;
  const soldCount = serials.filter((s) => s.status === 'SOLD').length;

  // Unique items in serials list (for filter dropdown)
  const itemsInList = Array.from(
    new Map(serials.map((s) => [s.item.id, s.item])).values(),
  );

  const filteredItemSearch = serializedItems.filter(
    (c) =>
      c.name.toLowerCase().includes(itemSearch.toLowerCase()) &&
      c.id !== selectedItemId,
  );

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Serial / IMEI Tracking</h1>
        <button
          onClick={() => setShowForm(!showForm)}
          className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2"
        >
          <Plus size={20} /> Add Serial
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded">
          <p className="text-sm text-blue-600 font-medium">Total Serials</p>
          <p className="text-2xl font-bold">{serials.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded">
          <p className="text-sm text-green-600 font-medium">Available</p>
          <p className="text-2xl font-bold">{availableCount}</p>
        </div>
        <div className="bg-gray-50 p-4 rounded">
          <p className="text-sm text-gray-600 font-medium">Sold</p>
          <p className="text-2xl font-bold">{soldCount}</p>
        </div>
      </div>

      {/* Add serial form */}
      {showForm && (
        <div className="bg-white p-4 rounded shadow mb-6">
          <h2 className="font-bold mb-4">Add Serial / IMEI Number</h2>
          <div className="grid grid-cols-2 gap-4">
            {/* Item picker */}
            <div>
              <label className="block text-sm font-medium mb-1">Item</label>
              <div className="relative">
                <input
                  placeholder="Search serialized items…"
                  value={selectedItemId ? selectedItemName : itemSearch}
                  onChange={(e) => {
                    if (selectedItemId) {
                      setSelectedItemId('');
                      setSelectedItemName('');
                    }
                    setItemSearch(e.target.value);
                  }}
                  className="w-full border rounded p-2"
                />
                {selectedItemId && (
                  <button
                    className="absolute right-2 top-2.5 text-gray-400 hover:text-gray-600"
                    onClick={() => { setSelectedItemId(''); setSelectedItemName(''); setItemSearch(''); }}
                  >
                    <X size={16} />
                  </button>
                )}
                {!selectedItemId && itemSearch && filteredItemSearch.length > 0 && (
                  <div className="absolute z-10 bg-white border rounded shadow-lg w-full max-h-48 overflow-y-auto">
                    {filteredItemSearch.slice(0, 10).map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                        onClick={() => {
                          setSelectedItemId(c.id);
                          setSelectedItemName(c.name);
                          setItemSearch('');
                        }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
                {!selectedItemId && itemSearch && filteredItemSearch.length === 0 && (
                  <div className="absolute z-10 bg-white border rounded shadow-lg w-full p-3 text-sm text-gray-400">
                    No serialized items found
                  </div>
                )}
              </div>
            </div>

            {/* Serial number */}
            <div>
              <label className="block text-sm font-medium mb-1">Serial / IMEI Number</label>
              <input
                placeholder="e.g. IMEI357000000001234"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className="w-full border rounded p-2 font-mono"
              />
            </div>
          </div>

          <div className="flex gap-2 mt-4">
            <button
              onClick={() => addMutation.mutate()}
              disabled={!selectedItemId || !serialNumber || addMutation.isPending}
              className="bg-green-600 text-white px-4 py-2 rounded disabled:opacity-50"
            >
              {addMutation.isPending ? 'Saving…' : 'Add Serial'}
            </button>
            <button onClick={() => setShowForm(false)} className="bg-gray-300 px-4 py-2 rounded">
              Cancel
            </button>
          </div>
          {addMutation.isError && (
            <p className="text-red-600 mt-2 text-sm">{(addMutation.error as Error).message}</p>
          )}
        </div>
      )}

      {/* Filters + Search */}
      <div className="bg-white rounded shadow">
        <div className="p-4 border-b flex gap-3 flex-wrap">
          {/* Serial number search */}
          <div className="relative flex-1 min-w-48">
            <Search className="absolute left-3 top-2.5 text-gray-400" size={18} />
            <input
              placeholder="Search serial / IMEI…"
              value={serialSearch}
              onChange={(e) => setSerialSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border rounded text-sm"
            />
          </div>

          {/* Filter by item */}
          <select
            value={filterItemId}
            onChange={(e) => setFilterItemId(e.target.value)}
            className="border rounded p-2 text-sm"
          >
            <option value="">All Items</option>
            {itemsInList.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </select>

          {/* Filter by status */}
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border rounded p-2 text-sm"
          >
            <option value="">All Statuses</option>
            <option value="AVAILABLE">Available</option>
            <option value="SOLD">Sold</option>
            <option value="RETURNED">Returned</option>
            <option value="DEFECTIVE">Defective</option>
          </select>
        </div>

        {/* Serial number lookup result */}
        {serialSearch.length >= 4 && searchResult && (
          <div className="p-4 border-b bg-blue-50">
            <p className="text-sm font-medium text-blue-700 mb-1">Serial Lookup Result</p>
            <div className="flex gap-6 text-sm">
              <span><strong>Item:</strong> {searchResult.item.name}</span>
              <span><strong>Serial:</strong> <span className="font-mono">{searchResult.serialNumber}</span></span>
              <span>
                <strong>Status:</strong>{' '}
                <span className={`px-2 py-0.5 rounded text-xs ${statusBadge(searchResult.status)}`}>
                  {searchResult.status}
                </span>
              </span>
              {searchResult.sale && (
                <span><strong>Receipt:</strong> <span className="font-mono">{searchResult.sale.receiptNumber}</span></span>
              )}
            </div>
          </div>
        )}
        {serialSearch.length >= 4 && isSearching && (
          <div className="p-3 border-b text-sm text-gray-400">Searching…</div>
        )}

        {/* Table */}
        {isLoading ? (
          <div className="p-8 text-center text-gray-400">Loading…</div>
        ) : displaySerials.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            {serialSearch || filterItemId || filterStatus ? 'No serials match the filter' : 'No serial records yet'}
          </div>
        ) : (
          <table className="w-full">
            <thead className="bg-gray-50 text-sm">
              <tr>
                <th className="text-left p-4">Item</th>
                <th className="text-left p-4">Serial / IMEI</th>
                <th className="text-center p-4">Status</th>
                <th className="text-left p-4">Receipt</th>
                <th className="text-left p-4">Date Added</th>
              </tr>
            </thead>
            <tbody>
              {displaySerials.map((serial) => (
                <tr key={serial.id} className="border-t hover:bg-gray-50">
                  <td className="p-4 font-medium">{serial.item.name}</td>
                  <td className="p-4 font-mono text-sm">{serial.serialNumber}</td>
                  <td className="p-4 text-center">
                    <span className={`px-2 py-1 rounded text-xs ${statusBadge(serial.status)}`}>
                      {serial.status}
                    </span>
                  </td>
                  <td className="p-4 font-mono text-sm">{serial.sale?.receiptNumber || '—'}</td>
                  <td className="p-4 text-sm text-gray-600">
                    {new Date(serial.createdAt).toLocaleDateString('en-KE', {
                      day: '2-digit',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Count footer */}
        {displaySerials.length > 0 && (
          <div className="p-3 border-t text-sm text-gray-400 text-right">
            Showing {displaySerials.length} of {serials.length} records
          </div>
        )}
      </div>
    </div>
  );
}

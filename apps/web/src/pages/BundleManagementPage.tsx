import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { Plus, Package, Pencil, Trash2, X, Check } from 'lucide-react';

interface ComponentItem {
  id: string;
  name: string;
  retailPriceCents: number;
  costPriceCents?: number;
}

interface BundleComponent {
  componentItemId: string;
  quantity: number;
  componentItem: ComponentItem;
}

interface BundleItem {
  id: string;
  name: string;
  retailPriceCents: number;
  costPriceCents?: number;
  bundleComponents: BundleComponent[];
}

interface CatalogItem {
  id: string;
  name: string;
  type: string;
  retailPriceCents: number;
  costPriceCents?: number;
}

interface ComponentRow {
  itemId: string;
  itemName: string;
  retailPriceCents: number;
  quantity: number;
}

function formatKES(cents: number) {
  return `KES ${(cents / 100).toFixed(2)}`;
}

// ── Component editor modal ───────────────────────────────────────────────────
function ComponentsModal({
  bundle,
  catalog,
  businessId,
  onClose,
}: {
  bundle: BundleItem;
  catalog: CatalogItem[];
  businessId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<ComponentRow[]>(
    bundle.bundleComponents.map((bc) => ({
      itemId: bc.componentItemId,
      itemName: bc.componentItem.name,
      retailPriceCents: bc.componentItem.retailPriceCents,
      quantity: bc.quantity,
    })),
  );
  const [newItemId, setNewItemId] = useState('');
  const [newQty, setNewQty] = useState('');
  const [search, setSearch] = useState('');

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/bundle/${bundle.id}/components?businessId=${businessId}`, {
        components: rows.map((r) => ({ itemId: r.itemId, quantity: r.quantity })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bundles', businessId] });
      onClose();
    },
  });

  const available = catalog.filter(
    (c) =>
      c.type !== 'BUNDLE' &&
      c.name.toLowerCase().includes(search.toLowerCase()) &&
      !rows.find((r) => r.itemId === c.id),
  );

  const addRow = () => {
    const item = catalog.find((c) => c.id === newItemId);
    if (!item || !newQty) return;
    setRows([
      ...rows,
      { itemId: item.id, itemName: item.name, retailPriceCents: item.retailPriceCents, quantity: Number(newQty) },
    ]);
    setNewItemId('');
    setNewQty('');
    setSearch('');
  };

  const totalRetail = rows.reduce((s, r) => s + r.retailPriceCents * r.quantity, 0);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-bold text-lg">
            <Package size={20} className="inline mr-2 text-blue-600" />
            {bundle.name} — Components
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full mb-4">
            <thead className="bg-gray-50 text-sm">
              <tr>
                <th className="text-left p-2">Item</th>
                <th className="text-right p-2">Unit Price</th>
                <th className="text-right p-2">Qty</th>
                <th className="text-right p-2">Subtotal</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2 text-sm">{row.itemName}</td>
                  <td className="p-2 text-right text-sm text-gray-500">{formatKES(row.retailPriceCents)}</td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      min={1}
                      value={row.quantity}
                      onChange={(e) => {
                        const copy = [...rows];
                        copy[idx] = { ...copy[idx], quantity: Number(e.target.value) };
                        setRows(copy);
                      }}
                      className="w-16 border rounded p-1 text-right text-sm"
                    />
                  </td>
                  <td className="p-2 text-right text-sm font-medium">
                    {formatKES(row.retailPriceCents * row.quantity)}
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-4 text-center text-gray-400">
                    No components yet — add below
                  </td>
                </tr>
              )}
            </tbody>
            {rows.length > 0 && (
              <tfoot className="border-t">
                <tr>
                  <td colSpan={3} className="p-2 text-sm font-medium">
                    Combined Retail Value
                  </td>
                  <td className="p-2 text-right font-bold">{formatKES(totalRetail)}</td>
                  <td></td>
                </tr>
                {bundle.retailPriceCents > 0 && (
                  <tr>
                    <td colSpan={3} className="p-2 text-sm text-green-600">
                      Bundle Price (savings)
                    </td>
                    <td className="p-2 text-right text-green-600 font-bold">
                      {formatKES(bundle.retailPriceCents)}
                      {totalRetail > bundle.retailPriceCents && (
                        <span className="ml-2 text-xs">
                          ({formatKES(totalRetail - bundle.retailPriceCents)} off)
                        </span>
                      )}
                    </td>
                    <td></td>
                  </tr>
                )}
              </tfoot>
            )}
          </table>

          {/* Add component */}
          <div className="border rounded p-3 bg-gray-50">
            <p className="text-sm font-medium mb-2">Add Component</p>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  placeholder="Search item…"
                  value={search || (newItemId ? catalog.find((c) => c.id === newItemId)?.name : '')}
                  onChange={(e) => { setSearch(e.target.value); setNewItemId(''); }}
                  className="w-full border rounded p-2 text-sm"
                />
                {search && available.length > 0 && (
                  <div className="absolute z-10 bg-white border rounded shadow-lg w-full max-h-48 overflow-y-auto">
                    {available.slice(0, 10).map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                        onClick={() => { setNewItemId(c.id); setSearch(''); }}
                      >
                        <span>{c.name}</span>
                        <span className="ml-2 text-gray-400 text-xs">{formatKES(c.retailPriceCents)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="number"
                placeholder="Qty"
                min={1}
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                className="w-20 border rounded p-2 text-sm"
              />
              <button
                onClick={addRow}
                disabled={!newItemId || !newQty}
                className="bg-blue-600 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t flex justify-between items-center">
          <p className="text-sm text-gray-500">{rows.length} component{rows.length !== 1 ? 's' : ''}</p>
          <div className="flex gap-2">
            {rows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const autoPrice = rows.reduce((sum, row) => sum + row.retailPriceCents * row.quantity, 0);
                  api.patch(`/items/${bundle.id}`, { retailPriceCents: autoPrice })
                    .then(() => {
                      saveMutation.mutate();
                    })
                    .catch(() => {
                      saveMutation.mutate();
                    });
                }}
                disabled={saveMutation.isPending}
                className="text-sm text-blue-600 hover:text-blue-700 underline disabled:opacity-50"
              >
                Auto-calculate from components
              </button>
            )}
            <button onClick={onClose} className="bg-gray-200 px-4 py-2 rounded text-sm">
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm flex items-center gap-1 disabled:opacity-50"
            >
              <Check size={16} />
              {saveMutation.isPending ? 'Saving…' : 'Save Components'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create bundle modal ───────────────────────────────────────────────────────
function CreateBundleModal({
  bundles,
  catalog,
  businessId,
  onClose,
}: {
  bundles: BundleItem[];
  catalog: CatalogItem[];
  businessId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selectedItemId, setSelectedItemId] = useState('');
  const [rows, setRows] = useState<ComponentRow[]>([]);
  const [newItemId, setNewItemId] = useState('');
  const [newQty, setNewQty] = useState('');
  const [search, setSearch] = useState('');

  // Only exclude items that already have components defined — items with 0 components
  // can still be selected to have components added via this modal.
  const configuredIds = new Set(bundles.filter((b) => b.bundleComponents.length > 0).map((b) => b.id));
  const availableBundleItems = catalog.filter(
    (c) => c.type === 'BUNDLE' && !configuredIds.has(c.id),
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post(`/bundle?businessId=${businessId}`, {
        bundleItemId: selectedItemId,
        components: rows.map((r) => ({ itemId: r.itemId, quantity: r.quantity })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bundles', businessId] });
      onClose();
    },
  });

  const componentCatalog = catalog.filter((c) => c.type !== 'BUNDLE');
  const filtered = componentCatalog.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) &&
      !rows.find((r) => r.itemId === c.id),
  );

  const addRow = () => {
    const item = catalog.find((c) => c.id === newItemId);
    if (!item || !newQty) return;
    setRows([
      ...rows,
      { itemId: item.id, itemName: item.name, retailPriceCents: item.retailPriceCents, quantity: Number(newQty) },
    ]);
    setNewItemId('');
    setNewQty('');
    setSearch('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-bold text-lg">Create New Bundle</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Bundle Item (must be type BUNDLE)</label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full border rounded p-2"
            >
              <option value="">— Select bundle item —</option>
              {availableBundleItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name} — {formatKES(item.retailPriceCents)}
                </option>
              ))}
            </select>
            {availableBundleItems.length === 0 && (
              <p className="text-sm text-amber-600 mt-1">
                All BUNDLE-type items already have components. Use "Edit Components" on the card below to modify them, or create a new item with type "Bundle" in Inventory first.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">Components</label>
            <table className="w-full mb-3 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="text-left p-2">Item</th>
                  <th className="text-right p-2">Qty</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2">{row.itemName}</td>
                    <td className="p-2 text-right">{row.quantity}</td>
                    <td className="p-2">
                      <button onClick={() => setRows(rows.filter((_, i) => i !== idx))} className="text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border rounded p-3 bg-gray-50 flex gap-2">
              <div className="flex-1 relative">
                <input
                  placeholder="Search item…"
                  value={search || (newItemId ? catalog.find((c) => c.id === newItemId)?.name : '')}
                  onChange={(e) => { setSearch(e.target.value); setNewItemId(''); }}
                  className="w-full border rounded p-2 text-sm"
                />
                {search && filtered.length > 0 && (
                  <div className="absolute z-10 bg-white border rounded shadow-lg w-full max-h-40 overflow-y-auto">
                    {filtered.slice(0, 10).map((c) => (
                      <button
                        key={c.id}
                        className="w-full text-left px-3 py-2 hover:bg-gray-50 text-sm"
                        onClick={() => { setNewItemId(c.id); setSearch(''); }}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <input
                type="number"
                placeholder="Qty"
                min={1}
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                className="w-20 border rounded p-2 text-sm"
              />
              <button
                onClick={addRow}
                disabled={!newItemId || !newQty}
                className="bg-blue-600 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
              >
                <Plus size={16} />
              </button>
            </div>
          </div>
        </div>

        <div className="p-4 border-t flex justify-between items-center">
          <div>
            {selectedItemId && rows.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  const autoPrice = rows.reduce((sum, row) => sum + row.retailPriceCents * row.quantity, 0);
                  api.patch(`/items/${selectedItemId}`, { retailPriceCents: autoPrice }).catch(() => {});
                }}
                className="text-sm text-blue-600 hover:text-blue-700 underline"
              >
                Auto-calculate from components
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button onClick={onClose} className="bg-gray-200 px-4 py-2 rounded text-sm">
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={!selectedItemId || rows.length === 0 || saveMutation.isPending}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Creating…' : 'Create Bundle'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function BundleManagementPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';

  const [editingBundle, setEditingBundle] = useState<BundleItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: bundles = [], isLoading } = useQuery({
    queryKey: ['bundles', businessId],
    queryFn: () => api.get<BundleItem[]>(`/bundle?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['catalog-items', businessId, storeId],
    queryFn: () => api.get<CatalogItem[]>(`/items?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId,
  });

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Bundle / Kit Management</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2"
        >
          <Plus size={20} /> New Bundle
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded">
          <p className="text-sm text-blue-600 font-medium">Total Bundles</p>
          <p className="text-2xl font-bold">{bundles.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded">
          <p className="text-sm text-green-600 font-medium">With Components Defined</p>
          <p className="text-2xl font-bold">{bundles.filter((b) => b.bundleComponents.length > 0).length}</p>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading bundles…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {bundles.map((bundle) => {
            const totalComponentRetail = bundle.bundleComponents.reduce(
              (s, bc) => s + bc.componentItem.retailPriceCents * bc.quantity,
              0,
            );
            const savings = totalComponentRetail - bundle.retailPriceCents;

            return (
              <div key={bundle.id} className="bg-white p-4 rounded shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <Package size={20} className="text-blue-600" />
                      {bundle.name}
                    </h3>
                    <div className="flex gap-4 mt-1 text-sm text-gray-600">
                      <span>Bundle Price: {formatKES(bundle.retailPriceCents)}</span>
                      {totalComponentRetail > 0 && (
                        <>
                          <span className="text-gray-400">
                            Combined: {formatKES(totalComponentRetail)}
                          </span>
                          {savings > 0 && (
                            <span className="text-green-600 font-medium">
                              Saves {formatKES(savings)}
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingBundle(bundle)}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm flex items-center gap-1"
                  >
                    <Pencil size={14} /> Edit Components
                  </button>
                </div>

                {bundle.bundleComponents.length > 0 ? (
                  <div className="border-t pt-3">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-2">Component</th>
                          <th className="text-right p-2">Qty</th>
                          <th className="text-right p-2">Unit Price</th>
                          <th className="text-right p-2">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {bundle.bundleComponents.map((bc, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{bc.componentItem.name}</td>
                            <td className="p-2 text-right">{bc.quantity}</td>
                            <td className="p-2 text-right text-gray-500">
                              {formatKES(bc.componentItem.retailPriceCents)}
                            </td>
                            <td className="p-2 text-right font-medium">
                              {formatKES(bc.componentItem.retailPriceCents * bc.quantity)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="border-t pt-3 text-sm text-amber-600">
                    No components defined yet. Click "Edit Components" to add.
                  </div>
                )}
              </div>
            );
          })}

          {bundles.length === 0 && (
            <div className="bg-white p-8 rounded shadow text-center text-gray-500">
              <Package size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="mb-2">No bundles configured yet.</p>
              <p className="text-sm text-gray-400">
                First create items with type "Bundle" in Inventory, then click "New Bundle" above.
              </p>
            </div>
          )}
        </div>
      )}

      {editingBundle && (
        <ComponentsModal
          bundle={editingBundle}
          catalog={catalog}
          businessId={businessId}
          onClose={() => setEditingBundle(null)}
        />
      )}

      {showCreate && (
        <CreateBundleModal
          bundles={bundles}
          catalog={catalog}
          businessId={businessId}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

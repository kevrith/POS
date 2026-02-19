import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus,
  Search,
  X,
  Package,
  TrendingUp,
  TrendingDown,
  ChevronDown,
  Loader2,
  RotateCcw,
  Eye,
} from 'lucide-react';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Category {
  id?: string;
  name: string;
  color?: string;
}

interface InventoryItem {
  id: string;
  name: string;
  barcode?: string;
  type: string;
  retailPriceCents: number;
  wholesalePriceCents?: number;
  vipPriceCents?: number;
  costPriceCents?: number;
  trackStock: boolean;
  currentStock: number;
  reorderPoint?: number;
  unit?: string;
  vatApplicable: boolean;
  category?: Category;
}

interface StockMovement {
  id: string;
  type: string;
  quantity: number;
  createdAt: string;
  saleId?: string;
  source: string;
  notes?: string;
}

interface BatchItem {
  id: string;
  itemName: string;
  lotNumber?: string;
  receivedDate: string;
  expiryDate?: string;
  qtyReceived: number;
  qtyRemaining: number;
  status: string;
  supplier?: string;
  itemId: string;
}

interface CreateItemPayload {
  name: string;
  barcode: string;
  categoryName: string;
  type: string;
  retailPriceCents: number;
  wholesalePriceCents: number;
  vipPriceCents: number;
  costPriceCents: number;
  trackStock: boolean;
  initialStock: number;
  unit: string;
  vatApplicable: boolean;
  businessId: string;
  storeId?: string;
}

interface AdjustmentPayload {
  itemId: string;
  storeId: string;
  quantity: number;
  reason: string;
  notes: string;
}

type ActiveTab = 'items' | 'movements' | 'expiry' | 'batches';
type ExpiryFilter = 'all' | 'expiring_soon' | 'expired';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmt(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', { minimumFractionDigits: 2 })}`;
}

function daysUntilExpiry(dateStr: string): number {
  return Math.floor((new Date(dateStr).getTime() - Date.now()) / 86400000);
}

const ITEM_TYPES = ['PRODUCT', 'SERVICE', 'WEIGHTED', 'BUNDLE', 'RECIPE'];

function typeBadgeColor(type: string): string {
  switch (type) {
    case 'PRODUCT':
      return 'bg-blue-100 text-blue-800';
    case 'SERVICE':
      return 'bg-purple-100 text-purple-800';
    case 'WEIGHTED':
      return 'bg-yellow-100 text-yellow-800';
    case 'BUNDLE':
      return 'bg-green-100 text-green-800';
    case 'RECIPE':
      return 'bg-orange-100 text-orange-800';
    default:
      return 'bg-gray-100 text-gray-700';
  }
}

function movementBadge(type: string): string {
  if (type.includes('SALE') || type.includes('OUT') || type.includes('WRITE')) {
    return 'bg-red-100 text-red-700';
  }
  if (type.includes('RECEIVE') || type.includes('IN') || type.includes('ADJUSTMENT')) {
    return 'bg-green-100 text-green-700';
  }
  return 'bg-gray-100 text-gray-600';
}

function stockColor(item: InventoryItem): string {
  if (!item.trackStock) return 'text-gray-400';
  if (item.currentStock === 0) return 'text-red-600 font-semibold';
  if (item.reorderPoint !== undefined && item.currentStock <= item.reorderPoint) {
    return 'text-yellow-600 font-semibold';
  }
  return 'text-gray-800';
}

// ---------------------------------------------------------------------------
// Add Item Modal
// ---------------------------------------------------------------------------

interface AddItemModalProps {
  businessId: string;
  storeId?: string;
  categories: Category[];
  onClose: () => void;
}

function AddItemModal({ businessId, storeId, categories, onClose }: AddItemModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: '',
    barcode: '',
    categoryName: '',
    type: 'PRODUCT',
    retailPrice: '',
    wholesalePrice: '',
    vipPrice: '',
    costPrice: '',
    trackStock: true,
    initialStock: '',
    unit: 'pcs',
    vatApplicable: false,
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (payload: CreateItemPayload) => api.post<InventoryItem>('/items', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Name is required'); return; }
    const retailPriceCents = Math.round(parseFloat(form.retailPrice) * 100);
    if (!retailPriceCents || retailPriceCents <= 0) { setError('Valid retail price required'); return; }

    mutation.mutate({
      name: form.name.trim(),
      barcode: form.barcode.trim(),
      categoryName: form.categoryName.trim(),
      type: form.type,
      retailPriceCents,
      wholesalePriceCents: Math.round(parseFloat(form.wholesalePrice || '0') * 100),
      vipPriceCents: Math.round(parseFloat(form.vipPrice || '0') * 100),
      costPriceCents: Math.round(parseFloat(form.costPrice || '0') * 100),
      trackStock: form.trackStock,
      initialStock: form.trackStock ? parseInt(form.initialStock) || 0 : 0,
      unit: form.unit,
      vatApplicable: form.vatApplicable,
      businessId,
      storeId,
    });
  }

  function field(label: string, children: React.ReactNode) {
    return (
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">{label}</label>
        {children}
      </div>
    );
  }

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Add New Item</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {field('Name *', <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} placeholder="Item name" required />)}
            {field('Barcode', <input type="text" value={form.barcode} onChange={(e) => setForm(f => ({ ...f, barcode: e.target.value }))} className={inputCls} placeholder="Scan or type barcode" />)}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('Category', (
              <div className="relative">
                <input
                  type="text"
                  list="categories-list"
                  value={form.categoryName}
                  onChange={(e) => setForm(f => ({ ...f, categoryName: e.target.value }))}
                  className={inputCls}
                  placeholder="Select or type new category"
                />
                <datalist id="categories-list">
                  {categories.map((c) => <option key={c.name} value={c.name} />)}
                </datalist>
              </div>
            ))}
            {field('Type', (
              <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('Retail Price (KES) *', <input type="number" min="0" step="0.01" value={form.retailPrice} onChange={(e) => setForm(f => ({ ...f, retailPrice: e.target.value }))} className={inputCls} placeholder="0.00" required />)}
            {field('Wholesale Price (KES)', <input type="number" min="0" step="0.01" value={form.wholesalePrice} onChange={(e) => setForm(f => ({ ...f, wholesalePrice: e.target.value }))} className={inputCls} placeholder="0.00" />)}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('VIP Price (KES)', <input type="number" min="0" step="0.01" value={form.vipPrice} onChange={(e) => setForm(f => ({ ...f, vipPrice: e.target.value }))} className={inputCls} placeholder="0.00" />)}
            {field('Cost Price (KES)', <input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => setForm(f => ({ ...f, costPrice: e.target.value }))} className={inputCls} placeholder="0.00" />)}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('Unit', (
              <select value={form.unit} onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))} className={inputCls}>
                {['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'pair', 'set', 'dozen'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            ))}
            {form.trackStock && field('Initial Stock', <input type="number" min="0" value={form.initialStock} onChange={(e) => setForm(f => ({ ...f, initialStock: e.target.value }))} className={inputCls} placeholder="0" />)}
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.trackStock} onChange={(e) => setForm(f => ({ ...f, trackStock: e.target.checked }))} className="w-4 h-4 rounded text-blue-600" />
              <span className="text-sm text-gray-700">Track Stock</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.vatApplicable} onChange={(e) => setForm(f => ({ ...f, vatApplicable: e.target.checked }))} className="w-4 h-4 rounded text-blue-600" />
              <span className="text-sm text-gray-700">VAT Applicable</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {mutation.isPending ? 'Adding…' : 'Add Item'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Edit Item Modal
// ---------------------------------------------------------------------------

interface EditItemModalProps {
  item: InventoryItem;
  categories: Category[];
  onClose: () => void;
}

function EditItemModal({ item, categories, onClose }: EditItemModalProps) {
  const qc = useQueryClient();
  const [form, setForm] = useState({
    name: item.name,
    barcode: item.barcode ?? '',
    categoryName: item.category?.name ?? '',
    type: item.type,
    retailPrice: (item.retailPriceCents / 100).toString(),
    wholesalePrice: item.wholesalePriceCents ? (item.wholesalePriceCents / 100).toString() : '',
    vipPrice: item.vipPriceCents ? (item.vipPriceCents / 100).toString() : '',
    costPrice: item.costPriceCents ? (item.costPriceCents / 100).toString() : '',
    unit: item.unit ?? 'pcs',
    vatApplicable: item.vatApplicable,
    trackStock: item.trackStock,
  });
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (payload: Partial<CreateItemPayload>) =>
      api.patch<InventoryItem>(`/items/${item.id}`, payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    mutation.mutate({
      name: form.name.trim(),
      barcode: form.barcode.trim(),
      categoryName: form.categoryName.trim(),
      type: form.type,
      retailPriceCents: Math.round(parseFloat(form.retailPrice) * 100),
      wholesalePriceCents: Math.round(parseFloat(form.wholesalePrice || '0') * 100),
      vipPriceCents: Math.round(parseFloat(form.vipPrice || '0') * 100),
      costPriceCents: Math.round(parseFloat(form.costPrice || '0') * 100),
      unit: form.unit,
      vatApplicable: form.vatApplicable,
      trackStock: form.trackStock,
    });
  }

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Edit Item — {item.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
              <input type="text" value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className={inputCls} required /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Barcode</label>
              <input type="text" value={form.barcode} onChange={(e) => setForm(f => ({ ...f, barcode: e.target.value }))} className={inputCls} /></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
              <input type="text" list="edit-categories-list" value={form.categoryName} onChange={(e) => setForm(f => ({ ...f, categoryName: e.target.value }))} className={inputCls} />
              <datalist id="edit-categories-list">
                {categories.map((c) => <option key={c.name} value={c.name} />)}
              </datalist>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Type</label>
              <select value={form.type} onChange={(e) => setForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Retail Price (KES)</label>
              <input type="number" min="0" step="0.01" value={form.retailPrice} onChange={(e) => setForm(f => ({ ...f, retailPrice: e.target.value }))} className={inputCls} required /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Wholesale Price (KES)</label>
              <input type="number" min="0" step="0.01" value={form.wholesalePrice} onChange={(e) => setForm(f => ({ ...f, wholesalePrice: e.target.value }))} className={inputCls} /></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">VIP Price (KES)</label>
              <input type="number" min="0" step="0.01" value={form.vipPrice} onChange={(e) => setForm(f => ({ ...f, vipPrice: e.target.value }))} className={inputCls} /></div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Cost Price (KES)</label>
              <input type="number" min="0" step="0.01" value={form.costPrice} onChange={(e) => setForm(f => ({ ...f, costPrice: e.target.value }))} className={inputCls} /></div>
          </div>

          <div><label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
            <select value={form.unit} onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))} className={inputCls}>
              {['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'pair', 'set', 'dozen'].map(u => <option key={u} value={u}>{u}</option>)}
            </select>
          </div>

          <div className="flex gap-6">
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.trackStock} onChange={(e) => setForm(f => ({ ...f, trackStock: e.target.checked }))} className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-700">Track Stock</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input type="checkbox" checked={form.vatApplicable} onChange={(e) => setForm(f => ({ ...f, vatApplicable: e.target.checked }))} className="w-4 h-4 rounded" />
              <span className="text-sm text-gray-700">VAT Applicable</span>
            </label>
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stock Adjustment Modal
// ---------------------------------------------------------------------------

interface AdjustStockModalProps {
  item: InventoryItem;
  storeId?: string;
  onClose: () => void;
}

function AdjustStockModal({ item, storeId, onClose }: AdjustStockModalProps) {
  const qc = useQueryClient();
  const [quantity, setQuantity] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState('');

  const mutation = useMutation({
    mutationFn: (payload: AdjustmentPayload) => api.post<{ ok: boolean }>('/inventory/adjustment', payload),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['items'] });
      qc.invalidateQueries({ queryKey: ['movements'] });
      onClose();
    },
    onError: (err: Error) => setError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const qty = parseInt(quantity);
    if (isNaN(qty) || qty === 0) { setError('Enter a non-zero quantity'); return; }
    mutation.mutate({
      itemId: item.id,
      storeId: storeId ?? '',
      quantity: qty,
      reason: 'ADJUSTMENT',
      notes: notes.trim(),
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Adjust Stock — {item.name}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="w-5 h-5" /></button>
        </div>

        <p className="text-sm text-gray-500 mb-4">
          Current stock: <span className="font-semibold text-gray-800">{item.currentStock} {item.unit ?? 'pcs'}</span>
        </p>

        {error && <div className="mb-3 px-3 py-2 bg-red-50 text-red-700 rounded text-sm">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Quantity Change <span className="text-gray-400 font-normal">(use negative to decrease)</span>
            </label>
            <input
              type="number"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="+10 or -5"
              required
            />
            {quantity && !isNaN(parseInt(quantity)) && (
              <p className="text-xs text-gray-500 mt-1">
                New stock will be: <span className="font-semibold">{item.currentStock + parseInt(quantity)} {item.unit ?? 'pcs'}</span>
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={2}
              placeholder="Reason for adjustment"
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 border rounded-lg hover:bg-gray-50">Cancel</button>
            <button type="submit" disabled={mutation.isPending} className="px-4 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
              {mutation.isPending ? 'Saving…' : 'Apply Adjustment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Items Tab
// ---------------------------------------------------------------------------

interface ItemsTabProps {
  businessId: string;
  storeId?: string;
}

function ItemsTab({ businessId, storeId }: ItemsTabProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);

  const params = new URLSearchParams({
    businessId,
    ...(storeId ? { storeId } : {}),
    ...(search ? { search } : {}),
  });

  const { data: items = [], isLoading } = useQuery<InventoryItem[]>({
    queryKey: ['items', businessId, storeId, search],
    queryFn: () => api.get<InventoryItem[]>(`/items?${params.toString()}`),
    enabled: !!businessId,
  });

  const categories: Category[] = Array.from(
    new Map(
      items
        .filter((i) => i.category)
        .map((i) => [i.category!.name, i.category!])
    ).values()
  );

  const filtered = items.filter((item) => {
    if (categoryFilter && item.category?.name !== categoryFilter) return false;
    if (typeFilter && item.type !== typeFilter) return false;
    return true;
  });

  return (
    <div>
      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-4">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border rounded-lg pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Search items…"
          />
        </div>

        <div className="relative">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="border rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
          >
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c.name} value={c.name}>{c.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        <div className="relative">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="border rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
          >
            <option value="">All Types</option>
            {ITEM_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>

        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Add Item
        </button>
      </div>

      {/* Table */}
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex items-center justify-center text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading items…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package className="w-10 h-10 text-gray-200 mx-auto mb-2" />
            <p className="text-gray-500">No items found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Name', 'Barcode', 'Category', 'Type', 'Retail Price', 'Stock', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <p className="font-medium text-gray-900">{item.name}</p>
                      {item.vatApplicable && <span className="text-xs text-blue-500">VAT</span>}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.barcode ?? '—'}</td>
                    <td className="px-4 py-3">
                      {item.category ? (
                        <span
                          className="inline-flex items-center px-2 py-0.5 rounded text-xs"
                          style={{ backgroundColor: item.category.color ? `${item.category.color}20` : '#f3f4f6', color: item.category.color ?? '#374151' }}
                        >
                          {item.category.name}
                        </span>
                      ) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${typeBadgeColor(item.type)}`}>
                        {item.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium">{fmt(item.retailPriceCents)}</td>
                    <td className="px-4 py-3">
                      {item.trackStock ? (
                        <span className={stockColor(item)}>
                          {item.currentStock} {item.unit ?? 'pcs'}
                          {item.currentStock === 0 && <span className="ml-1 text-xs">(Out)</span>}
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">Not tracked</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <button onClick={() => setEditItem(item)} className="text-xs text-blue-600 hover:text-blue-800 font-medium">Edit</button>
                        {item.trackStock && (
                          <button onClick={() => setAdjustItem(item)} className="text-xs text-orange-600 hover:text-orange-800 font-medium flex items-center gap-1">
                            <RotateCcw className="w-3 h-3" />
                            Adjust
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <AddItemModal businessId={businessId} storeId={storeId} categories={categories} onClose={() => setShowAdd(false)} />}
      {editItem && <EditItemModal item={editItem} categories={categories} onClose={() => setEditItem(null)} />}
      {adjustItem && <AdjustStockModal item={adjustItem} storeId={storeId} onClose={() => setAdjustItem(null)} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Stock Movements Tab
// ---------------------------------------------------------------------------

interface MovementsTabProps {
  businessId: string;
  storeId?: string;
}

function MovementsTab({ businessId, storeId }: MovementsTabProps) {
  const [selectedItemId, setSelectedItemId] = useState('');

  const { data: items = [] } = useQuery<InventoryItem[]>({
    queryKey: ['items', businessId, storeId, ''],
    queryFn: () => api.get<InventoryItem[]>(`/items?businessId=${businessId}${storeId ? `&storeId=${storeId}` : ''}`),
    enabled: !!businessId,
  });

  const { data: movements = [], isLoading } = useQuery<StockMovement[]>({
    queryKey: ['movements', selectedItemId, storeId],
    queryFn: () =>
      api.get<StockMovement[]>(`/inventory/movements/${selectedItemId}${storeId ? `?storeId=${storeId}` : ''}`),
    enabled: !!selectedItemId,
  });

  return (
    <div>
      <div className="mb-4">
        <label className="block text-sm font-medium text-gray-700 mb-1">Select Item</label>
        <div className="relative w-72">
          <select
            value={selectedItemId}
            onChange={(e) => setSelectedItemId(e.target.value)}
            className="w-full border rounded-lg pl-3 pr-8 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none"
          >
            <option value="">Choose an item…</option>
            {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
          <ChevronDown className="absolute right-2.5 top-2.5 w-4 h-4 text-gray-400 pointer-events-none" />
        </div>
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {!selectedItemId ? (
          <div className="p-12 text-center text-gray-400">Select an item to view movements</div>
        ) : isLoading ? (
          <div className="p-12 flex items-center justify-center text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading movements…
          </div>
        ) : movements.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No movements recorded for this item</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Date', 'Type', 'Quantity', 'Reference', 'Source', 'Notes'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {movements.map((mv) => (
                  <tr key={mv.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                      {new Date(mv.createdAt).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${movementBadge(mv.type)}`}>
                        {mv.type}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`flex items-center gap-1 font-medium ${mv.quantity > 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {mv.quantity > 0 ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                        {mv.quantity > 0 ? '+' : ''}{mv.quantity}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-blue-600">{mv.saleId ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{mv.source}</td>
                    <td className="px-4 py-3 text-gray-500">{mv.notes ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Expiry Tab
// ---------------------------------------------------------------------------

interface ExpiryTabProps {
  batches: BatchItem[];
  isLoading: boolean;
}

function ExpiryTab({ batches, isLoading }: ExpiryTabProps) {
  const [filter, setFilter] = useState<ExpiryFilter>('all');
  const qc = useQueryClient();

  const writeOffMutation = useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean }>(`/batch/${id}/recall`, { reason: 'WRITE_OFF' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batches'] }),
  });

  const itemsWithExpiry = batches.filter((b) => b.expiryDate);

  const filtered = itemsWithExpiry.filter((b) => {
    const days = daysUntilExpiry(b.expiryDate!);
    if (filter === 'expired') return days < 0;
    if (filter === 'expiring_soon') return days >= 0 && days <= 30;
    return true;
  });

  return (
    <div>
      {/* Filter buttons */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'all', label: 'All' },
          { key: 'expiring_soon', label: 'Expiring Soon (30 days)' },
          { key: 'expired', label: 'Expired' },
        ] as Array<{ key: ExpiryFilter; label: string }>).map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              filter === f.key
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-12 flex items-center justify-center text-gray-400 gap-2">
            <Loader2 className="w-5 h-5 animate-spin" />
            Loading expiry data…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">No items match this filter</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Item Name', 'Batch / Lot', 'Expiry Date', 'Days Left', 'Qty Remaining', 'Supplier', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((b) => {
                  const days = daysUntilExpiry(b.expiryDate!);
                  return (
                    <tr key={b.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 font-medium text-gray-900">{b.itemName}</td>
                      <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.lotNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(b.expiryDate!).toLocaleDateString('en-KE')}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`font-semibold ${days < 0 ? 'text-red-600' : days <= 30 ? 'text-amber-600' : 'text-green-600'}`}>
                          {days < 0 ? `${Math.abs(days)}d ago` : `${days}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3">{b.qtyRemaining}</td>
                      <td className="px-4 py-3 text-gray-500">{b.supplier ?? '—'}</td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => writeOffMutation.mutate(b.id)}
                          disabled={writeOffMutation.isPending}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                        >
                          Write Off
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Batches Tab
// ---------------------------------------------------------------------------

interface BatchesTabProps {
  batches: BatchItem[];
  isLoading: boolean;
}

function BatchesTab({ batches, isLoading }: BatchesTabProps) {
  const qc = useQueryClient();

  const recallMutation = useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean }>(`/batch/${id}/recall`, { reason: 'RECALL' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batches'] }),
  });

  function batchStatusColor(status: string): string {
    switch (status) {
      case 'ACTIVE': return 'bg-green-100 text-green-800';
      case 'EXPIRED': return 'bg-red-100 text-red-800';
      case 'RECALLED': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-700';
    }
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {isLoading ? (
        <div className="p-12 flex items-center justify-center text-gray-400 gap-2">
          <Loader2 className="w-5 h-5 animate-spin" />
          Loading batches…
        </div>
      ) : batches.length === 0 ? (
        <div className="p-12 text-center text-gray-400">No batches recorded</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                {['Item Name', 'Lot Number', 'Received', 'Expiry', 'Qty Received', 'Qty Remaining', 'Status', 'Actions'].map(h => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {batches.map((b) => (
                <tr key={b.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3 font-medium text-gray-900">{b.itemName}</td>
                  <td className="px-4 py-3 font-mono text-xs text-gray-500">{b.lotNumber ?? '—'}</td>
                  <td className="px-4 py-3 text-gray-500">
                    {new Date(b.receivedDate).toLocaleDateString('en-KE')}
                  </td>
                  <td className="px-4 py-3 text-gray-500">
                    {b.expiryDate ? new Date(b.expiryDate).toLocaleDateString('en-KE') : '—'}
                  </td>
                  <td className="px-4 py-3">{b.qtyReceived}</td>
                  <td className="px-4 py-3">{b.qtyRemaining}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${batchStatusColor(b.status)}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <button className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1">
                        <Eye className="w-3 h-3" />
                        View Sales
                      </button>
                      {b.status === 'ACTIVE' && (
                        <button
                          onClick={() => recallMutation.mutate(b.id)}
                          disabled={recallMutation.isPending}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                        >
                          Recall
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export default function InventoryPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId;

  const [activeTab, setActiveTab] = useState<ActiveTab>('items');

  const { data: batches = [], isLoading: batchesLoading } = useQuery<BatchItem[]>({
    queryKey: ['batches', businessId],
    queryFn: () => api.get<BatchItem[]>(`/batch/list?businessId=${businessId}`),
    enabled: !!businessId && (activeTab === 'expiry' || activeTab === 'batches'),
  });

  const tabs: Array<{ key: ActiveTab; label: string }> = [
    { key: 'items', label: 'Items' },
    { key: 'movements', label: 'Stock Movements' },
    { key: 'expiry', label: 'Expiry' },
    { key: 'batches', label: 'Batches' },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Inventory</h1>
          <p className="text-sm text-gray-500 mt-0.5">Manage items, stock levels and batches</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`px-5 py-2.5 text-sm font-medium transition-colors ${
              activeTab === tab.key
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'items' && <ItemsTab businessId={businessId} storeId={storeId} />}
      {activeTab === 'movements' && <MovementsTab businessId={businessId} storeId={storeId} />}
      {activeTab === 'expiry' && <ExpiryTab batches={batches} isLoading={batchesLoading} />}
      {activeTab === 'batches' && <BatchesTab batches={batches} isLoading={batchesLoading} />}
    </div>
  );
}

import { useState, useRef, useCallback } from 'react';
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
  Sliders,
  Trash2,
  Download,
  Upload,
  Printer,
  CheckCircle,
  AlertCircle,
  Camera,
} from 'lucide-react';
import { BrowserMultiFormatReader } from '@zxing/browser';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { downloadZPL } from '../lib/printer';

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
  isActive?: boolean;
  imageUrl?: string;
  allergens?: string; // JSON array string
  reorderQty?: number;
  binLocation?: string;
  sku?: string;
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
  prepTimeMinutes?: number;
  businessId: string;
  storeId?: string;
  imageUrl?: string;
  allergens?: string;
  reorderQty?: number;
}

interface ItemVariant {
  id: string;
  itemId: string;
  name: string;
  sku?: string;
  barcode?: string;
  retailPriceCents: number;
  wholesalePriceCents?: number;
  costPriceCents?: number;
  attributes: string; // JSON string
}

interface AdjustmentPayload {
  itemId: string;
  storeId: string;
  businessId: string;
  quantity: number;
  type: string;
  notes: string;
}

type ActiveTab = 'items' | 'movements' | 'expiry' | 'batches' | 'low-stock';

// ---------------------------------------------------------------------------
// Category suggestions by posMode
// ---------------------------------------------------------------------------
const CATEGORY_SUGGESTIONS: Record<string, string[]> = {
  RETAIL:      ['Clothing', 'Electronics', 'Food', 'Beverages', 'Household', 'Stationery', 'Beauty', 'Sports'],
  HARDWARE:    ['Electrical', 'Plumbing', 'Paint', 'Timber', 'Cement', 'Steel', 'Hardware', 'Tools'],
  AGROVET:     ['Fertilizers', 'Seeds', 'Pesticides', 'Veterinary', 'Animal Feeds', 'Agrochemicals', 'Irrigation'],
  CLINIC:      ['Prescription Drugs', 'OTC Medicines', 'Medical Supplies', 'Lab Supplies'],
  HOSPITALITY: ['Food', 'Beverages', 'Desserts', 'Spirits', 'Wine', 'Soft Drinks'],
};
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

function downloadCsv(filename: string, rows: string[][]) {
  const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Add Item Modal
// ---------------------------------------------------------------------------

interface AddItemModalProps {
  businessId: string;
  storeId?: string;
  categories: Category[];
  posMode?: string;
  onClose: () => void;
}

function AddItemModal({ businessId, storeId, categories, posMode, onClose }: AddItemModalProps) {
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
    prepTimeMinutes: 5,
  });
  const [error, setError] = useState('');
  const addItemVideoRef = useRef<HTMLVideoElement>(null);
  const [showAddItemCamera, setShowAddItemCamera] = useState(false);
  const [addItemCameraError, setAddItemCameraError] = useState('');

  const startAddItemCamera = useCallback(async (setter: (v: string) => void) => {
    setAddItemCameraError('');
    setShowAddItemCamera(true);
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    if (!addItemVideoRef.current) return;
    try {
      const reader = new BrowserMultiFormatReader();
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      addItemVideoRef.current.srcObject = stream;
      await addItemVideoRef.current.play();
      reader.decodeFromStream(stream, addItemVideoRef.current, (result) => {
        if (result) {
          stream.getTracks().forEach(t => t.stop());
          setShowAddItemCamera(false);
          setter(result.getText());
        }
      });
    } catch (e) {
      setAddItemCameraError(e instanceof Error ? e.message : 'Camera access denied');
    }
  }, []);

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
      prepTimeMinutes: form.prepTimeMinutes,
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
            {field('Barcode', (
              <div className="flex gap-2">
                <input type="text" value={form.barcode} onChange={(e) => setForm(f => ({ ...f, barcode: e.target.value }))} className={inputCls} placeholder="Scan or type barcode" />
                <button
                  type="button"
                  onClick={() => void startAddItemCamera(v => setForm(f => ({ ...f, barcode: v })))}
                  className="px-2 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg flex-shrink-0"
                  title="Scan barcode with camera"
                >
                  <Camera className="w-4 h-4 text-gray-600" />
                </button>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4">
            {field('Category', (
              <div>
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
                    {categories.map((c, i) => <option key={c.name ?? i} value={c.name} />)}
                  </datalist>
                </div>
                {(() => {
                  const suggestions = CATEGORY_SUGGESTIONS[posMode ?? 'RETAIL'] ?? CATEGORY_SUGGESTIONS['RETAIL'];
                  return (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {suggestions.map(s => (
                        <button
                          key={s}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, categoryName: s }))}
                          className="text-xs px-2 py-0.5 rounded-full border border-gray-300 text-gray-600 hover:bg-blue-50 hover:border-blue-400 hover:text-blue-700 transition-colors"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  );
                })()}
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

          <div className="grid grid-cols-2 gap-4">
            {field('Prep Time (minutes)', <input type="number" min="1" value={form.prepTimeMinutes} onChange={(e) => setForm(f => ({ ...f, prepTimeMinutes: parseInt(e.target.value) || 5 }))} className={inputCls} placeholder="5" />)}
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

      {showAddItemCamera && (
        <div className="fixed inset-0 bg-black/90 flex flex-col items-center justify-center z-50 p-4">
          <button onClick={() => setShowAddItemCamera(false)} className="absolute top-4 right-4 text-white p-2 hover:bg-gray-700 rounded">
            <X className="w-6 h-6" />
          </button>
          <div className="w-full max-w-md aspect-video bg-black rounded-lg border-2 border-blue-400 overflow-hidden">
            <video ref={addItemVideoRef} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          </div>
          {addItemCameraError && <p className="text-red-400 text-sm mt-2">{addItemCameraError}</p>}
          <p className="text-white text-sm mt-3">Scan item barcode</p>
        </div>
      )}
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
    prepTimeMinutes: (item as any).prepTimeMinutes ?? 5,
    imageUrl: item.imageUrl ?? '',
    allergens: (() => { try { return JSON.parse(item.allergens ?? '[]') as string[]; } catch { return [] as string[]; } })(),
    reorderQty: item.reorderQty ?? 1,
    binLocation: item.binLocation ?? '',
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
      prepTimeMinutes: form.prepTimeMinutes,
      imageUrl: form.imageUrl.trim() || undefined,
      allergens: JSON.stringify(form.allergens),
      reorderQty: form.reorderQty,
      binLocation: form.binLocation.trim() || undefined,
    } as Partial<CreateItemPayload>);
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
                {categories.map((c, i) => <option key={c.name ?? i} value={c.name} />)}
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

          <div className="grid grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Unit</label>
              <select value={form.unit} onChange={(e) => setForm(f => ({ ...f, unit: e.target.value }))} className={inputCls}>
                {['pcs', 'kg', 'g', 'litre', 'ml', 'box', 'pack', 'pair', 'set', 'dozen'].map(u => <option key={u} value={u}>{u}</option>)}
              </select>
            </div>
            <div><label className="block text-sm font-medium text-gray-700 mb-1">Prep Time (minutes)</label>
              <input type="number" min="1" value={form.prepTimeMinutes} onChange={(e) => setForm(f => ({ ...f, prepTimeMinutes: parseInt(e.target.value) || 5 }))} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
              <input type="url" value={form.imageUrl} onChange={(e) => setForm(f => ({ ...f, imageUrl: e.target.value }))} className={inputCls} placeholder="https://..." />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Reorder Qty</label>
              <input type="number" min="1" value={form.reorderQty} onChange={(e) => setForm(f => ({ ...f, reorderQty: parseInt(e.target.value) || 1 }))} className={inputCls} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Bin / Shelf Location</label>
              <input type="text" value={form.binLocation} onChange={(e) => setForm(f => ({ ...f, binLocation: e.target.value }))} className={inputCls} placeholder="e.g. A-12, Shelf 3" />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Allergens</label>
            <div className="flex flex-wrap gap-2">
              {(['GLUTEN', 'NUTS', 'DAIRY', 'EGGS', 'SOY', 'FISH', 'SHELLFISH', 'SESAME'] as const).map((allergen) => (
                <label key={allergen} className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.allergens.includes(allergen)}
                    onChange={(e) => setForm(f => ({
                      ...f,
                      allergens: e.target.checked
                        ? [...f.allergens, allergen]
                        : f.allergens.filter(a => a !== allergen),
                    }))}
                    className="w-3.5 h-3.5 rounded"
                  />
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    form.allergens.includes(allergen) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'
                  }`}>{allergen}</span>
                </label>
              ))}
            </div>
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
  businessId: string;
  storeId?: string;
  onClose: () => void;
}

function AdjustStockModal({ item, businessId, storeId, onClose }: AdjustStockModalProps) {
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
      businessId,
      quantity: qty,
      type: 'ADJUSTMENT',
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

// ---------------------------------------------------------------------------
// Variants Modal
// ---------------------------------------------------------------------------

interface VariantsModalProps {
  item: InventoryItem;
  businessId: string;
  onClose: () => void;
}

function VariantsModal({ item, businessId, onClose }: VariantsModalProps) {
  const qc = useQueryClient();
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: '', sku: '', barcode: '', retailPrice: '', costPrice: '', color: '', size: '' });
  const [formError, setFormError] = useState('');

  const { data: variants = [], isLoading } = useQuery<ItemVariant[]>({
    queryKey: ['variants', item.id],
    queryFn: () => api.get<ItemVariant[]>(`/items/${item.id}/variants?businessId=${businessId}`),
  });

  const addMutation = useMutation({
    mutationFn: (payload: unknown) => api.post(`/items/${item.id}/variants?businessId=${businessId}`, payload),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['variants', item.id] }); setShowAdd(false); setForm({ name: '', sku: '', barcode: '', retailPrice: '', costPrice: '', color: '', size: '' }); },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (variantId: string) => api.delete(`/items/${item.id}/variants/${variantId}?businessId=${businessId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['variants', item.id] }),
  });

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setFormError('Name is required'); return; }
    const retailPriceCents = Math.round(parseFloat(form.retailPrice) * 100);
    if (!retailPriceCents || retailPriceCents <= 0) { setFormError('Valid retail price required'); return; }
    const attributes: Record<string, string> = {};
    if (form.color.trim()) attributes['color'] = form.color.trim();
    if (form.size.trim()) attributes['size'] = form.size.trim();
    addMutation.mutate({
      name: form.name.trim(),
      sku: form.sku.trim() || undefined,
      barcode: form.barcode.trim() || undefined,
      retailPriceCents,
      costPriceCents: form.costPrice ? Math.round(parseFloat(form.costPrice) * 100) : undefined,
      attributes,
    });
  }

  const inputCls = 'w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-5 border-b">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">Variants — {item.name}</h2>
            <p className="text-xs text-gray-500 mt-0.5">Manage size, color, or other attribute variants</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X className="w-5 h-5" /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-gray-400 gap-2">
              <Loader2 className="w-5 h-5 animate-spin" /> Loading variants…
            </div>
          ) : variants.length === 0 && !showAdd ? (
            <div className="text-center py-8 text-gray-400">
              <Sliders className="w-8 h-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No variants yet</p>
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  {['Name', 'SKU', 'Barcode', 'Attributes', 'Retail Price', ''].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {variants.map((v) => {
                  const attrs = (() => { try { return JSON.parse(v.attributes) as Record<string,string>; } catch { return {}; } })();
                  return (
                    <tr key={v.id} className="hover:bg-gray-50">
                      <td className="px-3 py-2 font-medium">{v.name}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{v.sku ?? '—'}</td>
                      <td className="px-3 py-2 font-mono text-xs text-gray-500">{v.barcode ?? '—'}</td>
                      <td className="px-3 py-2">
                        {Object.entries(attrs).map(([k, val]) => (
                          <span key={k} className="inline-flex items-center bg-gray-100 text-gray-700 text-xs px-1.5 py-0.5 rounded mr-1">
                            {k}: {val}
                          </span>
                        ))}
                      </td>
                      <td className="px-3 py-2">{fmt(v.retailPriceCents)}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => deleteMutation.mutate(v.id)}
                          className="text-red-400 hover:text-red-600 p-1"
                          title="Delete variant"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}

          {showAdd && (
            <form onSubmit={handleAdd} className="border rounded-xl p-4 bg-gray-50 space-y-3">
              <h3 className="text-sm font-semibold text-gray-700">Add Variant</h3>
              {formError && <p className="text-xs text-red-600">{formError}</p>}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Name *</label>
                  <input className={inputCls} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Large Red" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Retail Price (KES) *</label>
                  <input className={inputCls} type="number" min="0" step="0.01" value={form.retailPrice} onChange={(e) => setForm({ ...form, retailPrice: e.target.value })} />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">SKU</label>
                  <input className={inputCls} value={form.sku} onChange={(e) => setForm({ ...form, sku: e.target.value })} placeholder="Optional" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Barcode</label>
                  <input className={inputCls} value={form.barcode} onChange={(e) => setForm({ ...form, barcode: e.target.value })} placeholder="Optional" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Color</label>
                  <input className={inputCls} value={form.color} onChange={(e) => setForm({ ...form, color: e.target.value })} placeholder="e.g. Red" />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Size</label>
                  <input className={inputCls} value={form.size} onChange={(e) => setForm({ ...form, size: e.target.value })} placeholder="e.g. XL" />
                </div>
              </div>
              <div className="flex gap-2 pt-1">
                <button type="submit" disabled={addMutation.isPending} className="bg-blue-600 text-white px-4 py-1.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50">
                  {addMutation.isPending ? 'Saving…' : 'Add Variant'}
                </button>
                <button type="button" onClick={() => setShowAdd(false)} className="text-sm text-gray-500 hover:text-gray-700 px-3 py-1.5">Cancel</button>
              </div>
            </form>
          )}
        </div>

        <div className="p-4 border-t flex justify-between">
          <button
            onClick={() => { setShowAdd(true); setFormError(''); }}
            className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-800"
          >
            <Plus className="w-4 h-4" /> Add Variant
          </button>
          <button onClick={onClose} className="bg-gray-100 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-200">
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// CSV Import Modal
// ---------------------------------------------------------------------------

function CsvImportModal({ businessId, storeId, onClose, onSuccess }: {
  businessId: string;
  storeId: string;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [csvText, setCsvText] = useState('');
  const [preview, setPreview] = useState<Array<Record<string, string>>>([]);
  const [result, setResult] = useState<{ imported: number; failed: number } | null>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'done'>('upload');

  function parseCsv(text: string): Array<Record<string, string>> {
    const lines = text.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    return lines.slice(1).map(line => {
      const vals = line.split(',').map(v => v.trim().replace(/"/g, ''));
      const obj: Record<string, string> = {};
      headers.forEach((h, i) => { obj[h] = vals[i] ?? ''; });
      return obj;
    });
  }

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      setCsvText(text);
      setPreview(parseCsv(text));
      setStep('preview');
    };
    reader.readAsText(file);
  }

  const importMutation = useMutation({
    mutationFn: () => {
      const rows = preview.map(r => ({
        name: r.name ?? r.Name ?? '',
        category: r.category ?? r.Category ?? undefined,
        retailPrice: parseFloat(r.retailPrice ?? r.retail_price ?? r['Retail Price'] ?? '0'),
        costPrice: r.costPrice ? parseFloat(r.costPrice) : undefined,
        barcode: r.barcode ?? r.Barcode ?? undefined,
        currentStock: r.currentStock ? parseInt(r.currentStock) : undefined,
        expiryDate: r.expiryDate ?? r.expiry_date ?? undefined,
        lotNumber: r.lotNumber ?? r.lot_number ?? undefined,
      })).filter(r => r.name);
      return api.post<{ imported: number; failed: number }>('/items/import-csv', { businessId, storeId, rows });
    },
    onSuccess: (data) => {
      setResult(data);
      setStep('done');
    },
  });

  const sampleCsv = `name,category,retailPrice,costPrice,barcode,currentStock
Bread,Food,50,30,1234567890,100
Milk 500ml,Drinks,65,45,0987654321,50
Sugar 1kg,Food,130,90,,200`;

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">Import Items from CSV</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {step === 'upload' && (
            <div className="space-y-4">
              <div className="bg-blue-50 rounded-lg p-4 text-sm text-blue-800">
                <p className="font-semibold mb-2">CSV Format</p>
                <p className="mb-2">Required: <strong>name</strong>, <strong>retailPrice</strong></p>
                <p>Optional: category, costPrice, barcode, currentStock, expiryDate (YYYY-MM-DD), lotNumber</p>
              </div>
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center">
                <Upload className="w-10 h-10 mx-auto text-gray-400 mb-3" />
                <p className="text-gray-600 mb-2">Upload CSV file</p>
                <input type="file" accept=".csv,.txt" onChange={handleFile} className="hidden" id="csv-file" />
                <label htmlFor="csv-file" className="cursor-pointer px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700">
                  Choose File
                </label>
              </div>
              <div>
                <p className="text-xs text-gray-500 mb-2">Or paste CSV directly:</p>
                <textarea
                  value={csvText}
                  onChange={(e) => { setCsvText(e.target.value); setPreview(parseCsv(e.target.value)); }}
                  rows={6}
                  placeholder={sampleCsv}
                  className="w-full px-3 py-2 border rounded-lg text-xs font-mono resize-none"
                />
                {preview.length > 0 && (
                  <button onClick={() => setStep('preview')} className="mt-2 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium">
                    Preview {preview.length} rows
                  </button>
                )}
              </div>
              <button
                onClick={() => { setCsvText(sampleCsv); setPreview(parseCsv(sampleCsv)); setStep('preview'); }}
                className="text-sm text-blue-600 underline"
              >
                Load sample data
              </button>
            </div>
          )}

          {step === 'preview' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-700">{preview.length} rows to import</p>
                <button onClick={() => setStep('upload')} className="text-sm text-blue-600">← Back</button>
              </div>
              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs">
                  <thead className="bg-gray-50">
                    <tr>
                      {preview[0] && Object.keys(preview[0]).map(k => (
                        <th key={k} className="px-3 py-2 text-left font-medium text-gray-500">{k}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {preview.slice(0, 10).map((row, i) => (
                      <tr key={i} className={!row.name ? 'bg-red-50' : ''}>
                        {Object.values(row).map((v, j) => (
                          <td key={j} className="px-3 py-2 text-gray-700">{v}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {preview.length > 10 && (
                  <p className="px-3 py-2 text-xs text-gray-400">...and {preview.length - 10} more rows</p>
                )}
              </div>
              {importMutation.error && (
                <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">
                  {importMutation.error instanceof Error ? importMutation.error.message : 'Import failed'}
                </div>
              )}
            </div>
          )}

          {step === 'done' && result && (
            <div className="text-center py-8">
              <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
              <p className="text-2xl font-bold text-gray-800">{result.imported} items imported</p>
              {result.failed > 0 && (
                <p className="text-sm text-red-600 mt-1">{result.failed} rows failed</p>
              )}
              <button onClick={() => { onSuccess(); onClose(); }} className="mt-6 px-6 py-2 bg-green-600 text-white rounded-lg font-medium">
                Done
              </button>
            </div>
          )}
        </div>

        {step === 'preview' && (
          <div className="px-6 pb-6 pt-2 border-t flex gap-3">
            <button onClick={onClose} className="flex-1 py-2.5 border rounded-lg text-gray-700 font-medium">
              Cancel
            </button>
            <button
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || preview.length === 0}
              className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-lg disabled:opacity-40"
            >
              {importMutation.isPending ? 'Importing...' : `Import ${preview.length} Items`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Barcode Label Modal
// ---------------------------------------------------------------------------

function BarcodeLabelModal({ items, onClose }: { items: Array<{ id: string; name: string; barcode?: string; retailPriceCents: number }>; onClose: () => void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set(items.slice(0, 10).map(i => i.id)));
  const [cols, setCols] = useState(3);
  const [showPrice, setShowPrice] = useState(true);

  function printLabels() {
    const win = window.open('', '_blank');
    if (!win) return;
    const selectedItems = items.filter(i => selected.has(i.id));
    const labelHtml = selectedItems.map(item => `
      <div style="width:${100/cols}%; display:inline-block; padding:4px; box-sizing:border-box; text-align:center; border:1px solid #ddd; font-family:monospace;">
        <svg id="bc-${item.id}" style="width:100%;height:50px;"></svg>
        <div style="font-size:10px;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${item.name}</div>
        ${showPrice ? `<div style="font-size:12px;font-weight:bold">KES ${(item.retailPriceCents/100).toFixed(2)}</div>` : ''}
        <div style="font-size:9px;color:#666">${item.barcode ?? ''}</div>
      </div>
    `).join('');
    win.document.write(`
      <html><head><title>Barcode Labels</title>
      <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
      </head><body>
      <div style="padding:10mm;">${labelHtml}</div>
      <script>
        window.onload = function() {
          ${selectedItems.filter(i=>i.barcode).map(i => `try { JsBarcode("#bc-${i.id}", "${i.barcode}", {width:1.5,height:40,displayValue:false,margin:2}); } catch(e){}`).join('\n')}
          setTimeout(()=>window.print(), 500);
        };
      <\/script>
      </body></html>
    `);
    win.document.close();
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-xl shadow-2xl flex flex-col max-h-[90vh]">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold">Print Barcode Labels</h2>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-gray-100"><X className="w-5 h-5" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-4">
          <div className="flex gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Columns per row</label>
              <select value={cols} onChange={e => setCols(parseInt(e.target.value))} className="px-3 py-2 border rounded-lg text-sm">
                {[2,3,4,5,6].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <label className="flex items-center gap-2 cursor-pointer mt-5">
              <input type="checkbox" checked={showPrice} onChange={e => setShowPrice(e.target.checked)} className="rounded" />
              <span className="text-sm">Show price</span>
            </label>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-medium text-gray-700">Select items ({selected.size}/{items.length})</p>
              <div className="flex gap-2">
                <button onClick={() => setSelected(new Set(items.map(i=>i.id)))} className="text-xs text-blue-600">All</button>
                <button onClick={() => setSelected(new Set())} className="text-xs text-gray-500">None</button>
              </div>
            </div>
            <div className="border rounded-lg divide-y max-h-64 overflow-y-auto">
              {items.map(item => (
                <label key={item.id} className="flex items-center gap-3 px-4 py-2.5 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={selected.has(item.id)}
                    onChange={() => setSelected(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; })}
                    className="rounded"
                  />
                  <div className="flex-1">
                    <p className="text-sm font-medium">{item.name}</p>
                    {item.barcode && <p className="text-xs text-gray-400 font-mono">{item.barcode}</p>}
                  </div>
                  <span className="text-sm text-gray-600">KES {(item.retailPriceCents/100).toFixed(2)}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className="px-6 pb-6 pt-2 border-t flex gap-3 flex-wrap">
          <button onClick={onClose} className="flex-1 py-2.5 border rounded-lg text-gray-700 font-medium">Cancel</button>
          <button
            onClick={printLabels}
            disabled={selected.size === 0}
            className="flex-1 py-2.5 bg-blue-600 text-white font-bold rounded-lg disabled:opacity-40"
          >
            Print {selected.size} Labels
          </button>
          <button
            onClick={() => {
              const selectedItems = items.filter(i => selected.has(i.id) && i.barcode);
              selectedItems.forEach(item => {
                downloadZPL({ itemName: item.name, barcode: item.barcode!, priceCents: item.retailPriceCents });
              });
              if (selectedItems.length === 0) alert('No items with barcodes selected');
            }}
            disabled={selected.size === 0}
            className="flex-1 py-2.5 bg-gray-800 text-white font-bold rounded-lg disabled:opacity-40 text-sm"
            title="Download ZPL files for Zebra thermal printers"
          >
            ↓ ZPL (Zebra)
          </button>
        </div>
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
  posMode?: string;
}

function ItemsTab({ businessId, storeId, posMode }: ItemsTabProps) {
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [editItem, setEditItem] = useState<InventoryItem | null>(null);
  const [adjustItem, setAdjustItem] = useState<InventoryItem | null>(null);
  const [variantItem, setVariantItem] = useState<InventoryItem | null>(null);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [showBarcodeModal, setShowBarcodeModal] = useState(false);
  const qc = useQueryClient();

  const toggleActiveMutation = useMutation({
    mutationFn: (item: InventoryItem) =>
      api.patch(`/items/${item.id}/toggle-active?businessId=${businessId}`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['items'] }),
  });

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
    if (search && !item.name.toLowerCase().includes(search.toLowerCase()) &&
        !(item.barcode ?? '').toLowerCase().includes(search.toLowerCase())) return false;
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
            {categories.map((c, i) => <option key={c.name ?? i} value={c.name}>{c.name}</option>)}
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
          onClick={() => downloadCsv(`inventory-${new Date().toISOString().split('T')[0]}.csv`, [
            ['Name', 'Category', 'Barcode', 'Retail Price', 'Cost Price', 'Stock', 'Type'],
            ...items.map(i => [i.name, i.category?.name ?? '', i.barcode ?? '', (i.retailPriceCents/100).toFixed(2), ((i.costPriceCents ?? 0)/100).toFixed(2), String(i.currentStock ?? 0), i.type])
          ])}
          className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          <Download className="w-4 h-4" />
          Export
        </button>
        <button
          onClick={() => setShowBarcodeModal(true)}
          className="flex items-center gap-1.5 px-3 py-2 border rounded-lg text-sm text-gray-600 hover:bg-gray-50"
        >
          <Printer className="w-4 h-4" />
          Labels
        </button>
        <button
          onClick={() => setShowCsvImport(true)}
          className="flex items-center gap-1.5 px-3 py-2 border border-green-300 text-green-700 rounded-lg text-sm font-medium hover:bg-green-50"
        >
          <Upload className="w-4 h-4" />
          Import CSV
        </button>
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
                  {['Name', 'Barcode', 'Category', 'Type', 'Retail Price', 'Stock', 'Bin', 'Status', 'Actions'].map(h => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((item) => {
                  const allergenList: string[] = (() => { try { return JSON.parse(item.allergens ?? '[]') as string[]; } catch { return []; } })();
                  return (
                  <tr key={item.id} className={`hover:bg-gray-50 transition-colors ${item.isActive === false ? 'opacity-60' : ''}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {item.imageUrl && (
                          <img src={item.imageUrl} alt={item.name} className="w-8 h-8 rounded object-cover flex-shrink-0" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                        )}
                        <div>
                          <p className="font-medium text-gray-900">{item.name}</p>
                          {item.vatApplicable && <span className="text-xs text-blue-500 mr-1">VAT</span>}
                          {allergenList.length > 0 && (
                            <div className="flex flex-wrap gap-0.5 mt-0.5">
                              {allergenList.map(a => (
                                <span key={a} className="text-[10px] px-1.5 py-0.5 rounded-full bg-red-100 text-red-700 font-medium">{a}</span>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
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
                    <td className="px-4 py-3 font-mono text-xs text-gray-500">{item.binLocation ?? '—'}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => toggleActiveMutation.mutate(item)}
                        disabled={toggleActiveMutation.isPending}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold transition-colors ${
                          item.isActive === false
                            ? 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                            : 'bg-green-100 text-green-700 hover:bg-green-200'
                        }`}
                        title={item.isActive === false ? 'Click to activate' : 'Click to deactivate'}
                      >
                        {item.isActive === false ? 'Inactive' : 'Active'}
                      </button>
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
                        <button onClick={() => setVariantItem(item)} className="text-xs text-purple-600 hover:text-purple-800 font-medium flex items-center gap-1">
                          <Sliders className="w-3 h-3" />
                          Variants
                        </button>
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showAdd && <AddItemModal businessId={businessId} storeId={storeId} categories={categories} posMode={posMode} onClose={() => setShowAdd(false)} />}
      {editItem && <EditItemModal item={editItem} categories={categories} onClose={() => setEditItem(null)} />}
      {adjustItem && <AdjustStockModal item={adjustItem} businessId={businessId} storeId={storeId} onClose={() => setAdjustItem(null)} />}
      {variantItem && <VariantsModal item={variantItem} businessId={businessId} onClose={() => setVariantItem(null)} />}
      {showCsvImport && (
        <CsvImportModal
          businessId={businessId}
          storeId={storeId ?? ''}
          onClose={() => setShowCsvImport(false)}
          onSuccess={() => qc.invalidateQueries({ queryKey: ['items'] })}
        />
      )}
      {showBarcodeModal && (
        <BarcodeLabelModal
          items={items}
          onClose={() => setShowBarcodeModal(false)}
        />
      )}
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
  businessId: string;
  alertDays?: number;
}

function ExpiryTab({ batches, isLoading, businessId, alertDays = 30 }: ExpiryTabProps) {
  const [filter, setFilter] = useState<ExpiryFilter>('all');
  const qc = useQueryClient();

  const writeOffMutation = useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean }>(`/businesses/${businessId}/batch/${id}/recall`, { reason: 'WRITE_OFF' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['batches'] }),
  });

  const itemsWithExpiry = batches.filter((b) => b.expiryDate);

  const expiringSoonCount = itemsWithExpiry.filter((b) => {
    const d = daysUntilExpiry(b.expiryDate!);
    return d >= 0 && d <= alertDays;
  }).length;
  const expiredCount = itemsWithExpiry.filter((b) => daysUntilExpiry(b.expiryDate!) < 0).length;

  const filtered = itemsWithExpiry.filter((b) => {
    const days = daysUntilExpiry(b.expiryDate!);
    if (filter === 'expired') return days < 0;
    if (filter === 'expiring_soon') return days >= 0 && days <= alertDays;
    return true;
  });

  return (
    <div>
      {/* Alert banner when items need attention */}
      {(expiredCount > 0 || expiringSoonCount > 0) && (
        <div className={`mb-4 p-3 rounded-xl border flex items-center gap-3 text-sm font-medium ${
          expiredCount > 0 ? 'bg-red-50 border-red-200 text-red-800' : 'bg-amber-50 border-amber-200 text-amber-800'
        }`}>
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {expiredCount > 0 && <span>{expiredCount} batch{expiredCount > 1 ? 'es' : ''} <strong>expired</strong></span>}
          {expiredCount > 0 && expiringSoonCount > 0 && <span className="opacity-40">·</span>}
          {expiringSoonCount > 0 && <span>{expiringSoonCount} batch{expiringSoonCount > 1 ? 'es' : ''} expiring within <strong>{alertDays} days</strong></span>}
        </div>
      )}
      {/* Filter buttons */}
      <div className="flex gap-2 mb-4">
        {([
          { key: 'all', label: 'All' },
          { key: 'expiring_soon', label: `Expiring Soon (${alertDays}d)` },
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
  businessId: string;
}

function BatchesTab({ batches, isLoading, businessId }: BatchesTabProps) {
  const qc = useQueryClient();

  const recallMutation = useMutation({
    mutationFn: (id: string) => api.post<{ ok: boolean }>(`/businesses/${businessId}/batch/${id}/recall`, { reason: 'RECALL' }),
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

  const { data: settings } = useQuery<{ expiryAlertDays?: number; posMode?: string }>({
    queryKey: ['business-settings', businessId],
    queryFn: () => api.get(`/business/${businessId}/settings`),
    enabled: !!businessId,
  });
  const alertDays = settings?.expiryAlertDays ?? 30;
  const posMode = settings?.posMode ?? 'RETAIL';

  const { data: lowStockItems = [], isLoading: lowStockLoading } = useQuery<InventoryItem[]>({
    queryKey: ['low-stock', businessId, storeId],
    queryFn: () => api.get<InventoryItem[]>(`/items/low-stock?businessId=${businessId}${storeId ? `&storeId=${storeId}` : ''}`),
    enabled: !!businessId && activeTab === 'low-stock',
  });

  const { data: batches = [], isLoading: batchesLoading } = useQuery<BatchItem[]>({
    queryKey: ['batches', businessId],
    queryFn: () => api.get<BatchItem[]>(`/businesses/${businessId}/batch`),
    enabled: !!businessId && (activeTab === 'expiry' || activeTab === 'batches'),
  });

  // Count batches needing attention for the tab badge
  const expiryAlertCount = batches.filter((b) => {
    if (!b.expiryDate) return false;
    const days = daysUntilExpiry(b.expiryDate);
    return days <= alertDays;
  }).length;

  const tabs: Array<{ key: ActiveTab; label: string; badge?: number }> = [
    { key: 'items', label: 'Items' },
    { key: 'movements', label: 'Stock Movements' },
    { key: 'expiry', label: 'Expiry', badge: expiryAlertCount || undefined },
    { key: 'batches', label: 'Batches' },
    { key: 'low-stock', label: 'Low Stock', badge: lowStockItems.length || undefined },
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
            className={`px-5 py-2.5 text-sm font-medium transition-colors flex items-center gap-1.5 ${
              activeTab === tab.key
                ? 'text-blue-600 border-b-2 border-blue-600 -mb-px'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
            {tab.badge !== undefined && tab.badge > 0 && (
              <span className="bg-amber-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full leading-none">
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {activeTab === 'items' && <ItemsTab businessId={businessId} storeId={storeId} posMode={posMode} />}
      {activeTab === 'movements' && <MovementsTab businessId={businessId} storeId={storeId} />}
      {activeTab === 'expiry' && <ExpiryTab batches={batches} isLoading={batchesLoading} businessId={businessId} alertDays={alertDays} />}
      {activeTab === 'batches' && <BatchesTab batches={batches} isLoading={batchesLoading} businessId={businessId} />}
      {activeTab === 'low-stock' && <LowStockTab items={lowStockItems} isLoading={lowStockLoading} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Low Stock Tab
// ---------------------------------------------------------------------------

function LowStockTab({ items, isLoading }: { items: InventoryItem[]; isLoading: boolean }) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 text-gray-400">
        <CheckCircle className="w-10 h-10 mx-auto mb-3 text-green-400" />
        <p className="font-medium">No low stock items</p>
        <p className="text-sm mt-1">All tracked items are above their reorder level.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500 mb-3">{items.length} item{items.length !== 1 ? 's' : ''} need restocking</p>
      <div className="border rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-4 py-3 font-medium text-gray-600">Item</th>
              <th className="px-4 py-3 font-medium text-gray-600">Category</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-center">Current Stock</th>
              <th className="px-4 py-3 font-medium text-gray-600 text-center">Reorder Level</th>
              <th className="px-4 py-3 font-medium text-gray-600">Stock Level</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item) => {
              const pct = item.reorderPoint && item.reorderPoint > 0
                ? Math.min(100, Math.round((item.currentStock / item.reorderPoint) * 100))
                : 0;
              const isOut = item.currentStock === 0;
              return (
                <tr key={item.id} className={`border-t ${isOut ? 'bg-red-50' : 'bg-amber-50'}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{item.name}</td>
                  <td className="px-4 py-3 text-gray-500">{item.category?.name ?? '—'}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`font-bold ${isOut ? 'text-red-600' : 'text-amber-700'}`}>
                      {item.currentStock} {item.unit ?? 'pcs'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center text-gray-600">{item.reorderPoint ?? 0} {item.unit ?? 'pcs'}</td>
                  <td className="px-4 py-3 w-40">
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className={`h-2 rounded-full ${isOut ? 'bg-red-500' : 'bg-amber-500'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-400 mt-0.5 block">{pct}% of reorder level</span>
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

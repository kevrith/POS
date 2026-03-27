import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { Plus, ChefHat, Pencil, Trash2, X, Check } from 'lucide-react';

interface IngredientItem {
  id: string;
  name: string;
  costPriceCents?: number;
  weightUnit?: string;
  unitWeightGrams?: number;
}

interface RecipeIngredient {
  ingredientItemId: string;
  quantityGrams: number;
  ingredientItem: IngredientItem;
}

interface RecipeItem {
  id: string;
  name: string;
  retailPriceCents: number;
  costPriceCents?: number;
  recipeIngredients: RecipeIngredient[];
}

interface CatalogItem {
  id: string;
  name: string;
  type: string;
  costPriceCents?: number;
}

interface IngredientRow {
  itemId: string;
  itemName: string;
  quantityGrams: number;
}

function formatKES(cents: number) {
  return `KES ${(cents / 100).toFixed(2)}`;
}

function calcCost(ingredients: IngredientRow[], catalog: CatalogItem[]) {
  return ingredients.reduce((sum, row) => {
    const item = catalog.find((c) => c.id === row.itemId);
    if (!item?.costPriceCents) return sum;
    const costPerGram = item.costPriceCents / 1000; // assume 1kg = 1000g cost
    return sum + Math.round(costPerGram * row.quantityGrams);
  }, 0);
}

// ── Ingredient editor modal ───────────────────────────────────────────────────
function IngredientsModal({
  recipe,
  catalog,
  businessId,
  onClose,
}: {
  recipe: RecipeItem;
  catalog: CatalogItem[];
  businessId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [rows, setRows] = useState<IngredientRow[]>(
    recipe.recipeIngredients.map((ri) => ({
      itemId: ri.ingredientItemId,
      itemName: ri.ingredientItem.name,
      quantityGrams: ri.quantityGrams,
    })),
  );
  const [newItemId, setNewItemId] = useState('');
  const [newQty, setNewQty] = useState('');
  const [search, setSearch] = useState('');

  const saveMutation = useMutation({
    mutationFn: () =>
      api.put(`/recipe/${recipe.id}/ingredients?businessId=${businessId}`, {
        ingredients: rows.map((r) => ({ itemId: r.itemId, quantityGrams: r.quantityGrams })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes', businessId] });
      onClose();
    },
  });

  const filtered = catalog.filter(
    (c) =>
      c.type !== 'BUNDLE' &&
      c.name.toLowerCase().includes(search.toLowerCase()) &&
      !rows.find((r) => r.itemId === c.id),
  );

  const addRow = () => {
    const item = catalog.find((c) => c.id === newItemId);
    if (!item || !newQty) return;
    setRows([...rows, { itemId: item.id, itemName: item.name, quantityGrams: Number(newQty) }]);
    setNewItemId('');
    setNewQty('');
    setSearch('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-bold text-lg">
            <ChefHat size={20} className="inline mr-2 text-blue-600" />
            {recipe.name} — Ingredients
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        {/* Ingredient rows */}
        <div className="flex-1 overflow-y-auto p-4">
          <table className="w-full mb-4">
            <thead className="bg-gray-50 text-sm">
              <tr>
                <th className="text-left p-2">Ingredient</th>
                <th className="text-right p-2">Grams</th>
                <th className="p-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, idx) => (
                <tr key={idx} className="border-t">
                  <td className="p-2">{row.itemName}</td>
                  <td className="p-2 text-right">
                    <input
                      type="number"
                      min={1}
                      value={row.quantityGrams}
                      onChange={(e) => {
                        const copy = [...rows];
                        copy[idx] = { ...copy[idx], quantityGrams: Number(e.target.value) };
                        setRows(copy);
                      }}
                      className="w-24 border rounded p-1 text-right"
                    />
                    <span className="ml-1 text-gray-500">g</span>
                  </td>
                  <td className="p-2">
                    <button
                      onClick={() => setRows(rows.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={3} className="p-4 text-center text-gray-400">
                    No ingredients yet — add below
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          {/* Add ingredient row */}
          <div className="border rounded p-3 bg-gray-50">
            <p className="text-sm font-medium mb-2">Add Ingredient</p>
            <div className="flex gap-2">
              <div className="flex-1 relative">
                <input
                  placeholder="Search ingredient…"
                  value={search || (newItemId ? catalog.find((c) => c.id === newItemId)?.name : '')}
                  onChange={(e) => { setSearch(e.target.value); setNewItemId(''); }}
                  className="w-full border rounded p-2 text-sm"
                />
                {search && filtered.length > 0 && (
                  <div className="absolute z-10 bg-white border rounded shadow-lg w-full max-h-48 overflow-y-auto">
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
              <div className="flex items-center border rounded overflow-hidden">
                <input
                  type="number"
                  placeholder="Grams"
                  min={1}
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                  className="w-24 p-2 text-sm outline-none"
                />
                <span className="px-2 bg-gray-50 text-gray-500 text-sm border-l">g</span>
              </div>
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

        {/* Footer */}
        <div className="p-4 border-t flex justify-between items-center">
          <p className="text-sm text-gray-500">
            {rows.length} ingredient{rows.length !== 1 ? 's' : ''}
          </p>
          <div className="flex gap-2">
            <button onClick={onClose} className="bg-gray-200 px-4 py-2 rounded text-sm">
              Cancel
            </button>
            <button
              onClick={() => saveMutation.mutate()}
              disabled={saveMutation.isPending}
              className="bg-green-600 text-white px-4 py-2 rounded text-sm flex items-center gap-1 disabled:opacity-50"
            >
              <Check size={16} />
              {saveMutation.isPending ? 'Saving…' : 'Save Ingredients'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Create recipe modal ───────────────────────────────────────────────────────
function CreateRecipeModal({
  recipeItems,
  catalog,
  businessId,
  onClose,
}: {
  recipeItems: RecipeItem[];
  catalog: CatalogItem[];
  businessId: string;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [selectedItemId, setSelectedItemId] = useState('');
  const [rows, setRows] = useState<IngredientRow[]>([]);
  const [newItemId, setNewItemId] = useState('');
  const [newQty, setNewQty] = useState('');
  const [search, setSearch] = useState('');

  const existingIds = new Set(recipeItems.map((r) => r.id));
  const availableRecipeItems = (catalog as CatalogItem[]).filter(
    (c) => c.type === 'RECIPE' && !existingIds.has(c.id),
  );

  const saveMutation = useMutation({
    mutationFn: () =>
      api.post(`/recipe?businessId=${businessId}`, {
        recipeItemId: selectedItemId,
        ingredients: rows.map((r) => ({ itemId: r.itemId, quantityGrams: r.quantityGrams })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recipes', businessId] });
      onClose();
    },
  });

  const ingredientCatalog = catalog.filter((c) => c.type !== 'BUNDLE');
  const filtered = ingredientCatalog.filter(
    (c) =>
      c.name.toLowerCase().includes(search.toLowerCase()) &&
      !rows.find((r) => r.itemId === c.id),
  );

  const addRow = () => {
    const item = catalog.find((c) => c.id === newItemId);
    if (!item || !newQty) return;
    setRows([...rows, { itemId: item.id, itemName: item.name, quantityGrams: Number(newQty) }]);
    setNewItemId('');
    setNewQty('');
    setSearch('');
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded shadow-lg w-full max-w-2xl max-h-[85vh] flex flex-col">
        <div className="p-4 border-b flex justify-between items-center">
          <h2 className="font-bold text-lg">Create New Recipe</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Pick recipe item */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-1">Recipe Item (must be type RECIPE)</label>
            <select
              value={selectedItemId}
              onChange={(e) => setSelectedItemId(e.target.value)}
              className="w-full border rounded p-2"
            >
              <option value="">— Select recipe item —</option>
              {availableRecipeItems.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
            {availableRecipeItems.length === 0 && (
              <p className="text-sm text-amber-600 mt-1">
                No unused RECIPE-type items. Create items with type "Recipe" in Inventory first.
              </p>
            )}
          </div>

          {/* Ingredients */}
          <div className="mb-4">
            <label className="block text-sm font-medium mb-2">Ingredients</label>
            <table className="w-full mb-3">
              <thead className="bg-gray-50 text-sm">
                <tr>
                  <th className="text-left p-2">Ingredient</th>
                  <th className="text-right p-2">Grams</th>
                  <th className="p-2"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => (
                  <tr key={idx} className="border-t">
                    <td className="p-2 text-sm">{row.itemName}</td>
                    <td className="p-2 text-right text-sm">{row.quantityGrams}g</td>
                    <td className="p-2">
                      <button onClick={() => setRows(rows.filter((_, i) => i !== idx))} className="text-red-400">
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="border rounded p-3 bg-gray-50">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <input
                    placeholder="Search ingredient…"
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
                <div className="flex items-center border rounded overflow-hidden">
                  <input
                    type="number"
                    placeholder="Grams"
                    min={1}
                    value={newQty}
                    onChange={(e) => setNewQty(e.target.value)}
                    className="w-24 p-2 text-sm outline-none"
                  />
                  <span className="px-2 bg-gray-50 text-gray-500 text-sm border-l">g</span>
                </div>
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
        </div>

        <div className="p-4 border-t flex justify-end gap-2">
          <button onClick={onClose} className="bg-gray-200 px-4 py-2 rounded text-sm">
            Cancel
          </button>
          <button
            onClick={() => saveMutation.mutate()}
            disabled={!selectedItemId || rows.length === 0 || saveMutation.isPending}
            className="bg-green-600 text-white px-4 py-2 rounded text-sm disabled:opacity-50"
          >
            {saveMutation.isPending ? 'Creating…' : 'Create Recipe'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RecipeManagementPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const storeId = user?.storeId ?? '';

  const [editingRecipe, setEditingRecipe] = useState<RecipeItem | null>(null);
  const [showCreate, setShowCreate] = useState(false);

  const { data: recipes = [], isLoading } = useQuery({
    queryKey: ['recipes', businessId],
    queryFn: () => api.get<RecipeItem[]>(`/recipe?businessId=${businessId}`),
    enabled: !!businessId,
  });

  const { data: catalog = [] } = useQuery({
    queryKey: ['catalog-items', businessId, storeId],
    queryFn: () => api.get<CatalogItem[]>(`/items?businessId=${businessId}&storeId=${storeId}`),
    enabled: !!businessId,
  });

  const formatKESLocal = (cents: number) => formatKES(cents);

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">Recipe / BOM Management</h1>
        <button
          onClick={() => setShowCreate(true)}
          className="bg-blue-600 text-white px-4 py-2 rounded flex items-center gap-2"
        >
          <Plus size={20} /> New Recipe
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-blue-50 p-4 rounded">
          <p className="text-sm text-blue-600 font-medium">Total Recipes</p>
          <p className="text-2xl font-bold">{recipes.length}</p>
        </div>
        <div className="bg-green-50 p-4 rounded">
          <p className="text-sm text-green-600 font-medium">With Ingredients Defined</p>
          <p className="text-2xl font-bold">{recipes.filter((r) => r.recipeIngredients.length > 0).length}</p>
        </div>
      </div>

      {/* Recipe cards */}
      {isLoading ? (
        <div className="text-center py-12 text-gray-400">Loading recipes…</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {recipes.map((recipe) => {
            const ingredientRows: IngredientRow[] = recipe.recipeIngredients.map((ri) => ({
              itemId: ri.ingredientItemId,
              itemName: ri.ingredientItem.name,
              quantityGrams: ri.quantityGrams,
            }));
            const costCents = calcCost(ingredientRows, catalog);

            return (
              <div key={recipe.id} className="bg-white p-4 rounded shadow">
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="text-lg font-bold flex items-center gap-2">
                      <ChefHat size={20} className="text-blue-600" />
                      {recipe.name}
                    </h3>
                    <div className="flex gap-4 mt-1 text-sm text-gray-600">
                      <span>Selling: {formatKESLocal(recipe.retailPriceCents)}</span>
                      {costCents > 0 && (
                        <>
                          <span>Cost: {formatKESLocal(costCents)}</span>
                          <span className="text-green-600 font-medium">
                            Margin: {formatKESLocal(recipe.retailPriceCents - costCents)}
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => setEditingRecipe(recipe)}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm flex items-center gap-1"
                  >
                    <Pencil size={14} /> Edit Ingredients
                  </button>
                </div>

                {recipe.recipeIngredients.length > 0 ? (
                  <div className="border-t pt-3">
                    <table className="w-full text-sm">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="text-left p-2">Ingredient</th>
                          <th className="text-right p-2">Quantity</th>
                        </tr>
                      </thead>
                      <tbody>
                        {recipe.recipeIngredients.map((ing, idx) => (
                          <tr key={idx} className="border-t">
                            <td className="p-2">{ing.ingredientItem.name}</td>
                            <td className="p-2 text-right">{ing.quantityGrams}g</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="border-t pt-3 text-sm text-amber-600 flex items-center gap-1">
                    No ingredients defined yet. Click "Edit Ingredients" to add.
                  </div>
                )}
              </div>
            );
          })}

          {recipes.length === 0 && (
            <div className="bg-white p-8 rounded shadow text-center text-gray-500">
              <ChefHat size={48} className="mx-auto mb-4 text-gray-300" />
              <p className="mb-2">No recipes configured yet.</p>
              <p className="text-sm text-gray-400">
                First create items with type "Recipe" in Inventory, then click "New Recipe" above.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Edit ingredients modal */}
      {editingRecipe && (
        <IngredientsModal
          recipe={editingRecipe}
          catalog={catalog}
          businessId={businessId}
          onClose={() => setEditingRecipe(null)}
        />
      )}

      {/* Create recipe modal */}
      {showCreate && (
        <CreateRecipeModal
          recipeItems={recipes}
          catalog={catalog}
          businessId={businessId}
          onClose={() => setShowCreate(false)}
        />
      )}
    </div>
  );
}

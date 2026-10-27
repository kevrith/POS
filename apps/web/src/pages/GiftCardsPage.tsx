import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import {
  Gift,
  Plus,
  X,
  Search,
  CheckCircle,
  AlertCircle,
  ArrowUpCircle,
  CreditCard,
} from 'lucide-react';
import { formatKES } from '@pos/shared';

interface GiftCard {
  id: string;
  code: string;
  initialValueCents: number;
  balanceCents: number;
  status: 'ACTIVE' | 'EXHAUSTED' | 'SUSPENDED';
  purchasedBy: string | null;
  createdAt: string;
}

function IssueCardModal({
  businessId,
  onClose,
}: {
  businessId: string;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');
  const [purchasedBy, setPurchasedBy] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/gift-cards', {
        businessId,
        initialValueCents: Math.round(Number(amount) * 100),
        purchasedBy: purchasedBy || undefined,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
      onClose();
    },
  });

  const quickAmounts = [500, 1000, 2000, 5000, 10000];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">Issue Gift Card</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Amount (KES) *</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {quickAmounts.map((a) => (
                <button
                  key={a}
                  onClick={() => setAmount(String(a))}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    amount === String(a)
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'border-gray-200 text-gray-600 hover:border-blue-300'
                  }`}
                >
                  {formatKES(a * 100)}
                </button>
              ))}
            </div>
            <input
              type="number"
              min={0}
              step={0.5}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Custom amount"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Purchased By (optional)
            </label>
            <input
              type="text"
              value={purchasedBy}
              onChange={(e) => setPurchasedBy(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Customer name"
            />
          </div>

          <p className="text-xs text-gray-400">
            A unique code will be auto-generated for this gift card
          </p>

          {mutation.isError && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 p-3 rounded-lg">
              <AlertCircle className="w-4 h-4" />
              Failed to issue gift card
            </div>
          )}
        </div>

        <div className="flex gap-3 p-5 border-t">
          <button
            onClick={onClose}
            className="flex-1 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!amount || Number(amount) <= 0 || mutation.isPending}
            className="flex-1 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Issuing...' : 'Issue Card'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TopUpModal({
  card,
  onClose,
}: {
  card: GiftCard;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(`/gift-cards/${card.code}/top-up`, {
        amountCents: Math.round(Number(amount) * 100),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['gift-cards'] });
      onClose();
    },
  });

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm">
        <div className="flex items-center justify-between p-5 border-b">
          <h3 className="text-lg font-semibold">Top Up — {card.code}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="bg-gray-50 rounded-lg p-3">
            <p className="text-xs text-gray-500">Current Balance</p>
            <p className="text-xl font-bold text-gray-900">{formatKES(card.balanceCents)}</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Top-up Amount (KES)</label>
            <input
              type="number"
              min={0}
              step={0.5}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
              placeholder="Amount to add"
            />
          </div>
        </div>

        <div className="flex gap-3 p-5 border-t">
          <button
            onClick={onClose}
            className="flex-1 py-2 border rounded-lg text-sm font-medium text-gray-600 hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={() => mutation.mutate()}
            disabled={!amount || Number(amount) <= 0 || mutation.isPending}
            className="flex-1 py-2 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 disabled:opacity-50"
          >
            {mutation.isPending ? 'Adding...' : 'Add Balance'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Balance Check ─────────────────────────────────────────────────────────────

function BalanceChecker() {
  const [code, setCode] = useState('');
  const [result, setResult] = useState<GiftCard | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const check = async () => {
    if (!code.trim()) return;
    setLoading(true);
    setError('');
    setResult(null);
    try {
      const data = await api.get<GiftCard>(`/gift-cards/${code.trim().toUpperCase()}`);
      setResult(data);
    } catch {
      setError('Gift card not found or invalid code');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white rounded-xl border p-5">
      <h3 className="font-semibold mb-3">Check Balance</h3>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          onKeyDown={(e) => e.key === 'Enter' && check()}
          className="flex-1 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono uppercase"
          placeholder="Enter gift card code"
        />
        <button
          onClick={check}
          disabled={loading || !code.trim()}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
        >
          <Search className="w-4 h-4" />
          Check
        </button>
      </div>

      {result && (
        <div className="mt-3 p-3 bg-green-50 border border-green-100 rounded-lg">
          <div className="flex items-center gap-2 mb-1">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="font-medium text-green-700">Valid Card</span>
            <span
              className={`text-xs px-2 py-0.5 rounded-full ${
                result.status === 'ACTIVE'
                  ? 'bg-green-100 text-green-700'
                  : 'bg-red-100 text-red-600'
              }`}
            >
              {result.status}
            </span>
          </div>
          <p className="text-sm text-gray-700">
            Balance: <strong>{formatKES(result.balanceCents)}</strong> of{' '}
            {formatKES(result.initialValueCents)}
          </p>
        </div>
      )}

      {error && (
        <div className="mt-3 flex items-center gap-2 text-red-600 text-sm">
          <AlertCircle className="w-4 h-4" />
          {error}
        </div>
      )}
    </div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function GiftCardsPage() {
  const user = useAuthStore((s) => s.user);
  const businessId = user?.businessId ?? '';
  const [showIssue, setShowIssue] = useState(false);
  const [toppingUp, setToppingUp] = useState<GiftCard | null>(null);
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'EXHAUSTED'>('ALL');
  const [search, setSearch] = useState('');

  const { data: cards = [], isLoading } = useQuery<GiftCard[]>({
    queryKey: ['gift-cards', businessId, statusFilter],
    queryFn: () =>
      api.get(
        `/gift-cards?businessId=${businessId}${statusFilter !== 'ALL' ? `&status=${statusFilter}` : ''}`,
      ),
    enabled: !!businessId,
  });

  const filtered = cards.filter(
    (c) =>
      !search ||
      c.code.toLowerCase().includes(search.toLowerCase()) ||
      (c.purchasedBy ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  const totalValue = cards.reduce((sum, c) => sum + c.initialValueCents, 0);
  const totalBalance = cards.reduce((sum, c) => sum + c.balanceCents, 0);
  const activeCards = cards.filter((c) => c.status === 'ACTIVE').length;

  const STATUS_COLORS: Record<string, string> = {
    ACTIVE: 'bg-green-100 text-green-700',
    EXHAUSTED: 'bg-gray-100 text-gray-500',
    SUSPENDED: 'bg-red-100 text-red-600',
  };

  return (
    <div className="p-3 sm:p-6 max-w-4xl">
      <div className="flex flex-wrap gap-3 items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Gift Cards</h1>
          <p className="text-sm text-gray-500 mt-1">Issue and manage store gift cards</p>
        </div>
        <button
          onClick={() => setShowIssue(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700"
        >
          <Plus className="w-4 h-4" />
          Issue Card
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-gray-500">Total Cards</p>
          <p className="text-2xl font-bold text-gray-900">{cards.length}</p>
          <p className="text-xs text-gray-400 mt-1">{activeCards} active</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-gray-500">Total Issued Value</p>
          <p className="text-2xl font-bold text-blue-600">{formatKES(totalValue)}</p>
        </div>
        <div className="bg-white rounded-xl border p-4">
          <p className="text-sm text-gray-500">Outstanding Balance</p>
          <p className="text-2xl font-bold text-green-600">{formatKES(totalBalance)}</p>
        </div>
      </div>

      {/* Balance Checker */}
      <div className="mb-6">
        <BalanceChecker />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-4">
        <div className="flex gap-2">
          {(['ALL', 'ACTIVE', 'EXHAUSTED'] as const).map((s) => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium capitalize transition-colors ${
                statusFilter === s
                  ? 'bg-blue-100 text-blue-700'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {s === 'ALL' ? 'All' : s.charAt(0) + s.slice(1).toLowerCase()}
            </button>
          ))}
        </div>
        <div className="relative flex-1 max-w-xs">
          <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by code..."
            className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Cards List */}
      {isLoading ? (
        <div className="text-center py-16 text-gray-400">Loading gift cards...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 bg-white rounded-xl border">
          <Gift className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          <p className="text-gray-500 font-medium">No gift cards found</p>
          <button
            onClick={() => setShowIssue(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700"
          >
            Issue First Card
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-xl border divide-y">
          {filtered.map((card) => {
            const usedPercent =
              card.initialValueCents > 0
                ? ((card.initialValueCents - card.balanceCents) / card.initialValueCents) * 100
                : 0;

            return (
              <div key={card.id} className="p-4 flex items-center gap-4">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center flex-shrink-0">
                  <CreditCard className="w-5 h-5 text-blue-600" />
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-semibold text-sm">{card.code}</span>
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        STATUS_COLORS[card.status] ?? 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {card.status}
                    </span>
                    {card.purchasedBy && (
                      <span className="text-xs text-gray-400">— {card.purchasedBy}</span>
                    )}
                  </div>

                  <div className="flex items-center gap-3 mt-1.5">
                    <div className="flex-1 bg-gray-100 rounded-full h-1.5 max-w-[120px]">
                      <div
                        className="bg-blue-500 h-1.5 rounded-full"
                        style={{ width: `${100 - usedPercent}%` }}
                      />
                    </div>
                    <span className="text-xs text-gray-500">
                      {formatKES(card.balanceCents)} remaining of{' '}
                      {formatKES(card.initialValueCents)}
                    </span>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-400">
                    {new Date(card.createdAt).toLocaleDateString('en-KE')}
                  </p>
                  {card.status === 'ACTIVE' && (
                    <button
                      onClick={() => setToppingUp(card)}
                      className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-green-700 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100"
                    >
                      <ArrowUpCircle className="w-3.5 h-3.5" />
                      Top Up
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showIssue && (
        <IssueCardModal businessId={businessId} onClose={() => setShowIssue(false)} />
      )}
      {toppingUp && (
        <TopUpModal card={toppingUp} onClose={() => setToppingUp(null)} />
      )}
    </div>
  );
}

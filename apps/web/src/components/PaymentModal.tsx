import { useState, useEffect, useRef } from 'react';
import { X, DollarSign, Smartphone, CreditCard, Scissors, AlertCircle, Loader2, CheckCircle, Gift } from 'lucide-react';
import { api } from '../lib/api';

function formatKES(cents: number): string {
  return `KES ${(cents / 100).toLocaleString('en-KE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

type PaymentMethod = 'CASH' | 'MPESA_STK' | 'MPESA_QR' | 'SPLIT' | 'GIFT_CARD';

interface GiftCard {
  code: string;
  currentBalanceCents: number;
  status: string;
}
type StkStatus = 'idle' | 'sending' | 'waiting' | 'paid' | 'failed';

interface PaymentEntry {
  method: string;
  amountCents: number;
  reference?: string;
}

interface PaymentModalProps {
  totalCents: number;
  onComplete: (payments: PaymentEntry[]) => void;
  onCancel: () => void;
  isProcessing?: boolean;
  error?: string | null;
}

const QUICK_CASH = [50, 100, 200, 500, 1000, 2000, 5000] as const;

export default function PaymentModal({
  totalCents,
  onComplete,
  onCancel,
  isProcessing = false,
  error,
}: PaymentModalProps) {
  const [method, setMethod] = useState<PaymentMethod>('CASH');
  const [cashInput, setCashInput] = useState('');
  const [mpesaPhone, setMpesaPhone] = useState('');
  const [stkStatus, setStkStatus] = useState<StkStatus>('idle');
  const [stkError, setStkError] = useState('');
  const [checkoutRequestId, setCheckoutRequestId] = useState('');
  const [splitLegs, setSplitLegs] = useState<PaymentEntry[]>([]);
  const [splitMethod, setSplitMethod] = useState<'CASH' | 'MPESA_STK'>('CASH');
  const [splitAmount, setSplitAmount] = useState('');
  const [splitPhone, setSplitPhone] = useState('');
  const [gcCode, setGcCode] = useState('');
  const [gcCard, setGcCard] = useState<GiftCard | null>(null);
  const [gcError, setGcError] = useState('');
  const [gcLookingUp, setGcLookingUp] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const cashCents = Math.round(parseFloat(cashInput || '0') * 100);
  const changeCents = cashCents - totalCents;
  const splitPaidCents = splitLegs.reduce((s, l) => s + l.amountCents, 0);
  const splitRemainingCents = totalCents - splitPaidCents;
  const splitLegCents = Math.round(parseFloat(splitAmount || '0') * 100);

  useEffect(() => {
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(reqId: string) {
    let attempts = 0;
    pollRef.current = setInterval(async () => {
      attempts++;
      try {
        const res = await api.get<{ status: 'pending' | 'paid' | 'failed'; resultDesc: string }>(
          `/payments/mpesa/stk-status/${reqId}`,
        );
        if (res.status === 'paid') {
          stopPolling();
          setStkStatus('paid');
          // Brief pause so user sees "Paid" before completing
          setTimeout(() => {
            onComplete([{ method: 'MPESA_STK', amountCents: totalCents, reference: reqId }]);
          }, 800);
        } else if (res.status === 'failed') {
          stopPolling();
          setStkStatus('failed');
          setStkError(res.resultDesc || 'Payment declined or timed out');
        }
      } catch {
        // Network error — keep polling
      }
      // Give up after 2 minutes (40 × 3s)
      if (attempts >= 40) {
        stopPolling();
        setStkStatus('failed');
        setStkError('Payment timed out. Please try again.');
      }
    }, 3000);
  }

  async function handleMpesa() {
    const phone = mpesaPhone.replace(/\s/g, '');
    if (phone.length < 9) return;
    setStkStatus('sending');
    setStkError('');
    try {
      const res = await api.post<{ checkoutRequestId: string }>('/payments/mpesa/stk-push', {
        phone,
        amountCents: totalCents,
        reference: `POS-${Date.now()}`,
      });
      setCheckoutRequestId(res.checkoutRequestId);
      setStkStatus('waiting');
      startPolling(res.checkoutRequestId);
    } catch (err) {
      setStkStatus('failed');
      setStkError(err instanceof Error ? err.message : 'Failed to send STK push');
    }
  }

  function cancelMpesa() {
    stopPolling();
    setStkStatus('idle');
    setStkError('');
    setCheckoutRequestId('');
  }

  function handleCash() {
    if (cashCents < totalCents) return;
    onComplete([{ method: 'CASH', amountCents: totalCents }]);
  }

  function handleQR() {
    onComplete([{ method: 'MPESA_QR', amountCents: totalCents }]);
  }

  async function lookupGiftCard() {
    const code = gcCode.trim().toUpperCase();
    if (!code) return;
    setGcLookingUp(true);
    setGcError('');
    setGcCard(null);
    try {
      const card = await api.get<GiftCard>(`/gift-cards/${code}`);
      if (card.status !== 'ACTIVE') { setGcError('This gift card is not active'); return; }
      setGcCard(card);
    } catch (err) {
      setGcError(err instanceof Error ? err.message : 'Gift card not found');
    } finally {
      setGcLookingUp(false);
    }
  }

  function handleGiftCard() {
    if (!gcCard) return;
    const payAmount = Math.min(gcCard.currentBalanceCents, totalCents);
    onComplete([{ method: 'GIFT_CARD', amountCents: payAmount, reference: gcCode.trim().toUpperCase() }]);
  }

  function addSplitLeg() {
    if (splitLegCents <= 0 || splitLegCents > splitRemainingCents) return;
    if (splitMethod === 'MPESA_STK' && splitPhone.replace(/\s/g, '').length < 9) return;
    setSplitLegs([
      ...splitLegs,
      {
        method: splitMethod,
        amountCents: splitLegCents,
        reference: splitMethod === 'MPESA_STK' ? splitPhone : undefined,
      },
    ]);
    setSplitAmount('');
    setSplitPhone('');
  }

  function removeSplitLeg(idx: number) {
    setSplitLegs(splitLegs.filter((_, i) => i !== idx));
  }

  const tabs: Array<{ id: PaymentMethod; label: string; Icon: typeof DollarSign }> = [
    { id: 'CASH', label: 'Cash', Icon: DollarSign },
    { id: 'MPESA_STK', label: 'M-Pesa', Icon: Smartphone },
    { id: 'MPESA_QR', label: 'QR', Icon: CreditCard },
    { id: 'GIFT_CARD', label: 'Gift Card', Icon: Gift },
    { id: 'SPLIT', label: 'Split', Icon: Scissors },
  ];

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-bold text-gray-800">Payment</h2>
            <div className="text-2xl font-bold text-blue-600">{formatKES(totalCents)}</div>
          </div>
          <button onClick={onCancel} className="p-2 rounded-full hover:bg-gray-100">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        <div className="flex border-b">
          {tabs.map(({ id, label, Icon }) => (
            <button
              key={id}
              onClick={() => { setMethod(id); cancelMpesa(); }}
              className={`flex-1 py-3 text-xs font-medium transition-colors flex flex-col items-center gap-1 ${
                method === id
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              {label}
            </button>
          ))}
        </div>

        <div className="p-6">
          {error && (
            <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          {/* ── CASH ── */}
          {method === 'CASH' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Cash Received (KES)
                </label>
                <input
                  type="number"
                  value={cashInput}
                  onChange={(e) => setCashInput(e.target.value)}
                  placeholder="0"
                  className="w-full px-4 py-3 border rounded-xl text-xl font-bold focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  autoFocus
                />
              </div>
              <div className="flex flex-wrap gap-2">
                {QUICK_CASH.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => setCashInput(String(amt))}
                    className={`px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      cashCents === amt * 100
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                    }`}
                  >
                    {amt}
                  </button>
                ))}
                <button
                  onClick={() => setCashInput(String(totalCents / 100))}
                  className="px-3 py-1.5 rounded-lg text-sm border border-blue-300 text-blue-600 hover:bg-blue-50"
                >
                  Exact
                </button>
              </div>
              {cashCents > 0 && (
                <div className="bg-gray-50 rounded-xl p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600">Total</span>
                    <span className="font-medium">{formatKES(totalCents)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600">Received</span>
                    <span className="font-medium">{formatKES(cashCents)}</span>
                  </div>
                  <div
                    className={`flex justify-between font-bold border-t pt-2 text-base ${
                      changeCents >= 0 ? 'text-green-600' : 'text-red-600'
                    }`}
                  >
                    <span>Change</span>
                    <span>{formatKES(Math.max(0, changeCents))}</span>
                  </div>
                </div>
              )}
              <button
                onClick={handleCash}
                disabled={cashCents < totalCents || isProcessing}
                className="w-full py-3.5 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl disabled:opacity-40 transition-colors"
              >
                {isProcessing ? 'Processing…' : 'Confirm Cash Payment'}
              </button>
            </div>
          )}

          {/* ── M-PESA STK ── */}
          {method === 'MPESA_STK' && (
            <div className="space-y-4">
              {stkStatus === 'idle' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Customer Phone Number
                    </label>
                    <input
                      type="tel"
                      value={mpesaPhone}
                      onChange={(e) => setMpesaPhone(e.target.value)}
                      placeholder="0712 345 678"
                      className="w-full px-4 py-3 border rounded-xl text-lg font-semibold focus:ring-2 focus:ring-green-500 focus:border-transparent"
                      autoFocus
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Customer will receive an STK push on their phone
                    </p>
                  </div>
                  <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-800">
                    Amount: <span className="font-bold">{formatKES(totalCents)}</span>
                  </div>
                  <button
                    onClick={() => void handleMpesa()}
                    disabled={mpesaPhone.replace(/\s/g, '').length < 9}
                    className="w-full py-3.5 bg-green-600 hover:bg-green-700 text-white font-bold rounded-xl disabled:opacity-40 transition-colors"
                  >
                    Send M-Pesa Request
                  </button>
                </>
              )}

              {stkStatus === 'sending' && (
                <div className="text-center py-8">
                  <Loader2 className="w-10 h-10 text-green-500 animate-spin mx-auto mb-3" />
                  <p className="font-semibold text-gray-700">Sending STK Push...</p>
                </div>
              )}

              {stkStatus === 'waiting' && (
                <div className="text-center py-6 space-y-4">
                  <div className="relative">
                    <Loader2 className="w-12 h-12 text-green-500 animate-spin mx-auto" />
                  </div>
                  <div>
                    <p className="font-semibold text-gray-800 text-lg">Waiting for payment</p>
                    <p className="text-sm text-gray-500 mt-1">
                      Check: <span className="font-medium">{mpesaPhone}</span>
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Ref: {checkoutRequestId.slice(0, 20)}...
                    </p>
                  </div>
                  <p className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg p-3">
                    Customer should enter their M-Pesa PIN to complete payment
                  </p>
                  <button
                    onClick={cancelMpesa}
                    className="text-sm text-gray-500 underline hover:text-gray-700"
                  >
                    Cancel request
                  </button>
                </div>
              )}

              {stkStatus === 'paid' && (
                <div className="text-center py-8 space-y-3">
                  <CheckCircle className="w-14 h-14 text-green-500 mx-auto" />
                  <p className="font-bold text-green-700 text-xl">Payment Received!</p>
                  <p className="text-sm text-gray-500">{formatKES(totalCents)} via M-Pesa</p>
                </div>
              )}

              {stkStatus === 'failed' && (
                <div className="space-y-4">
                  <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                    <AlertCircle className="w-4 h-4 flex-shrink-0" />
                    {stkError}
                  </div>
                  <button
                    onClick={cancelMpesa}
                    className="w-full py-3 border border-gray-300 rounded-xl text-gray-700 font-medium hover:bg-gray-50"
                  >
                    Try Again
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── M-PESA QR ── */}
          {method === 'MPESA_QR' && (
            <div className="space-y-4 text-center">
              <div className="bg-teal-50 border-2 border-dashed border-teal-300 rounded-xl p-8">
                <div className="text-5xl mb-3">📲</div>
                <p className="text-sm text-teal-700 font-medium">QR code will display here</p>
                <p className="text-xs text-teal-600 mt-1">Customer scans with M-Pesa app</p>
              </div>
              <div className="text-lg font-bold text-gray-800">{formatKES(totalCents)}</div>
              <button
                onClick={handleQR}
                disabled={isProcessing}
                className="w-full py-3.5 bg-teal-600 hover:bg-teal-700 text-white font-bold rounded-xl disabled:opacity-40 transition-colors"
              >
                {isProcessing ? 'Generating…' : 'Generate QR Code'}
              </button>
            </div>
          )}

          {/* ── GIFT CARD ── */}
          {method === 'GIFT_CARD' && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Gift Card Code</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={gcCode}
                    onChange={(e) => { setGcCode(e.target.value.toUpperCase()); setGcCard(null); setGcError(''); }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void lookupGiftCard(); }}
                    placeholder="GC-XXXX-XXXX"
                    className="flex-1 px-4 py-3 border rounded-xl text-lg font-mono uppercase tracking-wider focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    autoFocus
                  />
                  <button
                    onClick={() => void lookupGiftCard()}
                    disabled={gcLookingUp || !gcCode.trim()}
                    className="px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-medium disabled:opacity-40"
                  >
                    {gcLookingUp ? <Loader2 className="w-5 h-5 animate-spin" /> : 'Check'}
                  </button>
                </div>
              </div>

              {gcError && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
                  <AlertCircle className="w-4 h-4 flex-shrink-0" />
                  {gcError}
                </div>
              )}

              {gcCard && (
                <div className="space-y-3">
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Card Balance</span>
                      <span className="font-bold text-purple-700 text-base">{formatKES(gcCard.currentBalanceCents)}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-600">Sale Total</span>
                      <span className="font-medium">{formatKES(totalCents)}</span>
                    </div>
                    {gcCard.currentBalanceCents < totalCents && (
                      <div className="flex justify-between text-sm border-t pt-2">
                        <span className="text-orange-600 font-medium">Remaining to pay</span>
                        <span className="text-orange-600 font-bold">{formatKES(totalCents - gcCard.currentBalanceCents)}</span>
                      </div>
                    )}
                    {gcCard.currentBalanceCents >= totalCents && (
                      <div className="flex justify-between text-sm border-t pt-2">
                        <span className="text-green-600 font-medium">Remaining balance after</span>
                        <span className="text-green-600 font-bold">{formatKES(gcCard.currentBalanceCents - totalCents)}</span>
                      </div>
                    )}
                  </div>

                  {gcCard.currentBalanceCents < totalCents ? (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg p-3">
                      Insufficient balance. Partial payment of {formatKES(gcCard.currentBalanceCents)} will be applied — pay the remainder via another method.
                    </p>
                  ) : null}

                  <button
                    onClick={handleGiftCard}
                    disabled={isProcessing}
                    className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl disabled:opacity-40 transition-colors"
                  >
                    {isProcessing
                      ? 'Processing…'
                      : gcCard.currentBalanceCents >= totalCents
                        ? 'Pay with Gift Card'
                        : `Apply ${formatKES(gcCard.currentBalanceCents)} from Gift Card`}
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ── SPLIT ── */}
          {method === 'SPLIT' && (
            <div className="space-y-4">
              <div className="flex justify-between text-sm font-medium">
                <span className="text-gray-600">Total: {formatKES(totalCents)}</span>
                <span className={splitRemainingCents <= 0 ? 'text-green-600' : 'text-orange-600'}>
                  Remaining: {formatKES(Math.max(0, splitRemainingCents))}
                </span>
              </div>
              {splitLegs.map((leg, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 text-sm"
                >
                  <span className="font-medium">{leg.method}</span>
                  {leg.reference && (
                    <span className="text-gray-500 text-xs">{leg.reference}</span>
                  )}
                  <div className="flex items-center gap-2">
                    <span className="font-bold">{formatKES(leg.amountCents)}</span>
                    <button
                      onClick={() => removeSplitLeg(idx)}
                      className="text-red-400 hover:text-red-600"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
              {splitRemainingCents > 0 && (
                <div className="border rounded-xl p-4 space-y-3">
                  <div className="flex gap-2">
                    {(['CASH', 'MPESA_STK'] as const).map((m) => (
                      <button
                        key={m}
                        onClick={() => setSplitMethod(m)}
                        className={`flex-1 py-2 rounded-lg text-sm font-medium border ${
                          splitMethod === m
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-white text-gray-700'
                        }`}
                      >
                        {m === 'CASH' ? 'Cash' : 'M-Pesa'}
                      </button>
                    ))}
                  </div>
                  <input
                    type="number"
                    value={splitAmount}
                    onChange={(e) => setSplitAmount(e.target.value)}
                    placeholder={`Amount (max ${(splitRemainingCents / 100).toFixed(0)})`}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                  {splitMethod === 'MPESA_STK' && (
                    <input
                      type="tel"
                      value={splitPhone}
                      onChange={(e) => setSplitPhone(e.target.value)}
                      placeholder="Phone: 0712345678"
                      className="w-full px-3 py-2 border rounded-lg text-sm"
                    />
                  )}
                  <button
                    onClick={addSplitLeg}
                    disabled={splitLegCents <= 0 || splitLegCents > splitRemainingCents}
                    className="w-full py-2 bg-gray-700 hover:bg-gray-800 text-white rounded-lg text-sm font-medium disabled:opacity-40"
                  >
                    Add Payment
                  </button>
                </div>
              )}
              <button
                onClick={() => onComplete(splitLegs)}
                disabled={splitPaidCents < totalCents || isProcessing}
                className="w-full py-3.5 bg-purple-600 hover:bg-purple-700 text-white font-bold rounded-xl disabled:opacity-40 transition-colors"
              >
                {isProcessing ? 'Processing…' : 'Complete Split Payment'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

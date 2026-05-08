import { X, Zap, Check } from 'lucide-react';
import { SubscriptionTier } from '@pos/shared';

interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureName: string;
  requiredTier: SubscriptionTier;
  currentTier: SubscriptionTier;
}

const TIER_PRICES: Record<SubscriptionTier, { monthly: number; annual: number }> = {
  [SubscriptionTier.FREE]: { monthly: 0, annual: 0 },
  [SubscriptionTier.STARTER]: { monthly: 2999, annual: 29990 },
  [SubscriptionTier.PRO]: { monthly: 7999, annual: 79990 },
  [SubscriptionTier.ENTERPRISE]: { monthly: 0, annual: 0 }, // Custom pricing
};

const TIER_BENEFITS: Record<SubscriptionTier, string[]> = {
  [SubscriptionTier.FREE]: [],
  [SubscriptionTier.STARTER]: [
    'Unlimited transactions',
    'Up to 500 items',
    'Batch tracking',
    'Hospitality mode (20 tables)',
    '2 field sales agents',
    'Basic loyalty program',
    'Gift cards',
    'Advanced reports',
  ],
  [SubscriptionTier.PRO]: [
    'Everything in STARTER',
    'Unlimited items',
    'Serial number tracking',
    'Multi-store (up to 5)',
    '10 field sales agents',
    'Advanced loyalty tiers',
    'QuickBooks & Xero sync',
    'API keys & webhooks',
    'Full payroll (PAYE, NHIF, NSSF)',
    'Custom roles',
  ],
  [SubscriptionTier.ENTERPRISE]: [
    'Everything in PRO',
    'Unlimited stores',
    'Franchise management',
    'Unlimited field agents',
    'Dedicated account manager',
    'Custom integrations',
    'SLA guarantee',
    'Priority support',
  ],
};

export default function UpgradeModal({
  isOpen,
  onClose,
  featureName,
  requiredTier,
  currentTier,
}: UpgradeModalProps) {
  if (!isOpen) return null;

  const pricing = TIER_PRICES[requiredTier];
  const benefits = TIER_BENEFITS[requiredTier];
  const isEnterprise = requiredTier === SubscriptionTier.ENTERPRISE;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-y-auto animate-scale-in">
        {/* Header */}
        <div className="relative bg-gradient-to-br from-blue-600 to-indigo-700 px-6 py-8 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1 hover:bg-white/20 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
          
          <div className="flex items-center gap-3 mb-2">
            <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center">
              <Zap className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <h2 className="text-2xl font-black">Upgrade Required</h2>
              <p className="text-blue-100 text-sm">Unlock premium features</p>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Feature locked message */}
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
            <p className="text-sm text-amber-900 dark:text-amber-200">
              <span className="font-bold">{featureName}</span> is available on the{' '}
              <span className="font-bold">{requiredTier}</span> plan and above.
            </p>
            <p className="text-xs text-amber-700 dark:text-amber-300 mt-1">
              You're currently on the <span className="font-semibold">{currentTier}</span> plan.
            </p>
          </div>

          {/* Pricing */}
          {!isEnterprise ? (
            <div className="text-center py-4">
              <div className="inline-flex items-baseline gap-1">
                <span className="text-sm text-gray-500">KES</span>
                <span className="text-4xl font-black text-gray-900 dark:text-white">
                  {(pricing.monthly / 100).toLocaleString()}
                </span>
                <span className="text-sm text-gray-500">/month</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                or KES {(pricing.annual / 100).toLocaleString()}/year (save 17%)
              </p>
            </div>
          ) : (
            <div className="text-center py-4">
              <p className="text-2xl font-black text-gray-900 dark:text-white">Custom Pricing</p>
              <p className="text-sm text-gray-500 mt-1">Tailored to your business needs</p>
            </div>
          )}

          {/* Benefits */}
          <div>
            <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300 uppercase tracking-wider mb-3">
              What's included
            </h3>
            <div className="space-y-2">
              {benefits.map((benefit, idx) => (
                <div key={idx} className="flex items-start gap-2">
                  <Check className="w-4 h-4 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-sm text-gray-700 dark:text-gray-300">{benefit}</span>
                </div>
              ))}
            </div>
          </div>

          {/* CTA */}
          <div className="flex gap-3">
            {isEnterprise ? (
              <a
                href="mailto:sales@kastrapos.co.ke?subject=Enterprise Plan Inquiry"
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-bold text-center hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
              >
                Contact Sales
              </a>
            ) : (
              <button
                onClick={() => {
                  window.location.href = `/settings/subscription?upgrade=${requiredTier}`;
                }}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-6 py-3 rounded-xl font-bold hover:from-blue-700 hover:to-indigo-700 transition-all shadow-lg hover:shadow-xl"
              >
                Upgrade to {requiredTier}
              </button>
            )}
            <button
              onClick={onClose}
              className="px-6 py-3 border border-gray-200 dark:border-gray-700 rounded-xl font-semibold text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Footer note */}
          <p className="text-xs text-center text-gray-400">
            30-day money-back guarantee · Cancel anytime · No credit card required for trial
          </p>
        </div>
      </div>
    </div>
  );
}

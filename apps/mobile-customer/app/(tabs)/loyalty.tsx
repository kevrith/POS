import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { apiPost, formatKES } from '../../lib/api';
import { useSessionStore } from '../../stores/session';
import { Colors } from '../../constants/theme';

// Shape returned by POST /portal/loyalty-lookup
interface LoyaltyLookupResponse {
  found: boolean;
  customerId?: string;
  customerName?: string;
  points?: number;
  tier?: { name: string; color: string } | null;
  lastPurchase?: string | null;
  recentPurchases?: Array<{
    receiptNumber?: string;
    totalCents: number;
    createdAt: string;
  }>;
}

const DEFAULT_TIER_CONFIG: Record<string, { color: string; label: string; icon: string }> = {
  BRONZE: { color: '#CD7F32', label: 'Bronze', icon: 'medal' },
  SILVER: { color: '#A8A9AD', label: 'Silver', icon: 'medal' },
  GOLD: { color: '#FFD700', label: 'Gold', icon: 'trophy' },
  PLATINUM: { color: '#E5E4E2', label: 'Platinum', icon: 'diamond' },
};

function getTierConfig(tier: { name: string; color: string } | null | undefined) {
  if (!tier) return { color: '#CD7F32', label: 'Bronze', icon: 'medal' };
  // Try to match by name to get icon, but use API color
  const key = tier.name.toUpperCase();
  const preset = DEFAULT_TIER_CONFIG[key];
  return {
    color: tier.color ?? preset?.color ?? Colors.primary,
    label: tier.name,
    icon: preset?.icon ?? 'star',
  };
}

export default function LoyaltyScreen() {
  const businessId = useSessionStore((s) => s.businessId);
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<LoyaltyLookupResponse | null>(null);

  async function checkPoints() {
    if (!phone.trim()) {
      Alert.alert('Phone Required', 'Please enter your phone number.');
      return;
    }
    setLoading(true);
    try {
      const result = await apiPost<LoyaltyLookupResponse>('/portal/loyalty-lookup', {
        phone: phone.trim(),
        businessId,
      });
      if (!result.found) {
        Alert.alert('Not Found', 'No loyalty account found for this phone number.');
        setData(null);
      } else {
        setData(result);
      }
    } catch (err: any) {
      Alert.alert('Error', err.message ?? 'Could not look up loyalty points.');
      setData(null);
    } finally {
      setLoading(false);
    }
  }

  const tierConfig = getTierConfig(data?.tier);

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.headerBar}>
        <Text style={styles.headerTitle}>Loyalty Program</Text>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Input Section */}
        <View style={styles.inputCard}>
          <Text style={styles.inputLabel}>Enter your phone number</Text>
          <Text style={styles.inputSub}>Check your loyalty points and rewards tier</Text>
          <View style={styles.inputRow}>
            <View style={styles.prefixBox}>
              <Text style={styles.prefixText}>+254</Text>
            </View>
            <TextInput
              style={styles.phoneInput}
              value={phone}
              onChangeText={setPhone}
              placeholder="7XX XXX XXX"
              keyboardType="phone-pad"
              maxLength={12}
              placeholderTextColor={Colors.textSecondary}
              returnKeyType="search"
              onSubmitEditing={checkPoints}
            />
          </View>
          <TouchableOpacity
            style={[styles.checkBtn, loading && { opacity: 0.7 }]}
            onPress={checkPoints}
            disabled={loading}
            activeOpacity={0.85}
          >
            {loading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="search" size={18} color="#FFFFFF" />
                <Text style={styles.checkBtnText}>Check Points</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {data && data.found && (
          <>
            {/* Customer Info Card */}
            <View style={styles.card}>
              <View style={styles.customerHeader}>
                <View style={styles.avatarCircle}>
                  <Text style={styles.avatarText}>
                    {(data.customerName ?? 'C').charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.customerInfo}>
                  <Text style={styles.customerName}>{data.customerName ?? 'Customer'}</Text>
                  <Text style={styles.customerPhone}>{phone}</Text>
                </View>
                {/* Tier Badge */}
                {data.tier && (
                  <View
                    style={[
                      styles.tierBadge,
                      { backgroundColor: tierConfig.color + '20', borderColor: tierConfig.color },
                    ]}
                  >
                    <Ionicons name={tierConfig.icon as any} size={14} color={tierConfig.color} />
                    <Text style={[styles.tierText, { color: tierConfig.color }]}>
                      {tierConfig.label}
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.divider} />

              {/* Points Display */}
              <View style={styles.pointsBox}>
                <Ionicons name="star" size={32} color={Colors.warning} />
                <View>
                  <Text style={styles.pointsValue}>
                    {(data.points ?? 0).toLocaleString()}
                  </Text>
                  <Text style={styles.pointsLabel}>Loyalty Points</Text>
                </View>
              </View>

              {data.lastPurchase && (
                <View style={styles.lastPurchaseRow}>
                  <Ionicons name="time-outline" size={14} color={Colors.textSecondary} />
                  <Text style={styles.lastPurchaseText}>
                    Last purchase:{' '}
                    {new Date(data.lastPurchase).toLocaleDateString('en-KE', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric',
                    })}
                  </Text>
                </View>
              )}
            </View>

            {/* Recent Purchases */}
            {data.recentPurchases && data.recentPurchases.length > 0 && (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Recent Purchases</Text>
                {data.recentPurchases.slice(0, 5).map((purchase, idx) => (
                  <View key={idx} style={styles.saleRow}>
                    <View style={styles.saleLeft}>
                      <Ionicons name="receipt-outline" size={18} color={Colors.primary} />
                      <View>
                        <Text style={styles.saleReceipt}>
                          {purchase.receiptNumber ?? `Purchase ${idx + 1}`}
                        </Text>
                        <Text style={styles.saleDate}>
                          {new Date(purchase.createdAt).toLocaleDateString('en-KE', {
                            day: 'numeric',
                            month: 'short',
                          })}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.saleAmount}>
                      {formatKES(purchase.totalCents)}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </>
        )}

        {!data && !loading && (
          <View style={styles.infoBox}>
            <Ionicons name="information-circle-outline" size={32} color={Colors.primary} />
            <Text style={styles.infoTitle}>How Loyalty Works</Text>
            <Text style={styles.infoText}>
              Earn points on every purchase. Redeem them for discounts on future orders.
              Higher tiers unlock bigger rewards!
            </Text>
            <View style={styles.tierRow}>
              {Object.entries(DEFAULT_TIER_CONFIG).map(([key, cfg]) => (
                <View key={key} style={styles.tierItem}>
                  <Ionicons name={cfg.icon as any} size={20} color={cfg.color} />
                  <Text style={[styles.tierItemText, { color: cfg.color }]}>{cfg.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  headerBar: {
    backgroundColor: Colors.card,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerTitle: { fontSize: 20, fontWeight: '700', color: Colors.text },
  content: { padding: 16, gap: 16, paddingBottom: 32 },
  inputCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  inputLabel: { fontSize: 17, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  inputSub: { fontSize: 13, color: Colors.textSecondary, marginBottom: 16 },
  inputRow: { flexDirection: 'row', marginBottom: 14, gap: 8 },
  prefixBox: {
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    justifyContent: 'center',
  },
  prefixText: { fontSize: 15, color: Colors.text, fontWeight: '600' },
  phoneInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    color: Colors.text,
    backgroundColor: Colors.background,
  },
  checkBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  checkBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
  card: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    gap: 10,
  },
  customerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatarCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  customerInfo: { flex: 1 },
  customerName: { fontSize: 16, fontWeight: '700', color: Colors.text },
  customerPhone: { fontSize: 13, color: Colors.textSecondary },
  tierBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  tierText: { fontSize: 12, fontWeight: '700' },
  divider: { height: 1, backgroundColor: Colors.border },
  pointsBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: Colors.warning + '10',
    borderRadius: 12,
    padding: 14,
  },
  pointsValue: { fontSize: 28, fontWeight: '800', color: Colors.text },
  pointsLabel: { fontSize: 13, color: Colors.textSecondary },
  lastPurchaseRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  lastPurchaseText: { fontSize: 12, color: Colors.textSecondary },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: Colors.text, marginBottom: 4 },
  saleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  saleLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  saleReceipt: { fontSize: 13, fontWeight: '600', color: Colors.text },
  saleDate: { fontSize: 11, color: Colors.textSecondary },
  saleAmount: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  infoBox: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    gap: 10,
  },
  infoTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  infoText: {
    fontSize: 13,
    color: Colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  tierRow: { flexDirection: 'row', gap: 16, marginTop: 8 },
  tierItem: { alignItems: 'center', gap: 4 },
  tierItemText: { fontSize: 12, fontWeight: '600' },
});

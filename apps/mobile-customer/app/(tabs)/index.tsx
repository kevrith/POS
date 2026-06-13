import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { apiGet } from '../../lib/api';
import { useSessionStore } from '../../stores/session';
import { Colors } from '../../constants/theme';

interface PortalMenuItem {
  id: string;
  name: string;
  retailPriceCents: number;
  category?: string;
}

interface PortalCategory {
  name: string;
  items: PortalMenuItem[];
}

interface PortalMenuResponse {
  business: {
    id?: string;
    name: string;
    address?: string;
  } | null;
  categories: PortalCategory[];
}

const QUICK_ACTIONS = [
  {
    label: 'Browse Menu',
    icon: 'restaurant' as const,
    href: '/(tabs)/menu',
    color: Colors.primary,
  },
  {
    label: 'Loyalty Points',
    icon: 'star' as const,
    href: '/(tabs)/loyalty',
    color: Colors.warning,
  },
  {
    label: 'My Orders',
    icon: 'cube' as const,
    href: '/(tabs)/orders',
    color: Colors.success,
  },
];

export default function HomeScreen() {
  const router = useRouter();
  const sessionBusinessId = useSessionStore((s) => s.businessId);
  const restore = useSessionStore((s) => s.restore);

  useEffect(() => {
    restore();
  }, []);

  const { data, isLoading } = useQuery<PortalMenuResponse>({
    queryKey: ['portal-menu', sessionBusinessId],
    queryFn: () => apiGet(`/portal/menu?businessId=${sessionBusinessId}`),
    staleTime: 5 * 60 * 1000,
  });

  // Flatten all items from all categories for the featured items section
  const allItems: PortalMenuItem[] = (data?.categories ?? []).flatMap((c) => c.items);

  const today = new Date().toLocaleDateString('en-KE', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View>
            {isLoading ? (
              <ActivityIndicator color={Colors.primaryLight} />
            ) : (
              <Text style={styles.businessName}>
                {data?.business?.name ?? 'Welcome'}
              </Text>
            )}
            <Text style={styles.dateText}>{today}</Text>
          </View>
          <View style={styles.logoContainer}>
            <Ionicons name="storefront" size={32} color="#FFFFFF" />
          </View>
        </View>

        {/* Welcome Banner */}
        <View style={styles.banner}>
          <Ionicons name="hand-left" size={24} color={Colors.primary} />
          <View style={styles.bannerText}>
            <Text style={styles.bannerTitle}>Hello, valued customer!</Text>
            <Text style={styles.bannerSub}>
              Browse our menu and place your order below.
            </Text>
          </View>
        </View>

        {/* Quick Actions */}
        <Text style={styles.sectionTitle}>Quick Actions</Text>
        <View style={styles.actionsGrid}>
          {QUICK_ACTIONS.map((action) => (
            <TouchableOpacity
              key={action.label}
              style={[styles.actionCard, { borderLeftColor: action.color }]}
              onPress={() => router.push(action.href as any)}
              activeOpacity={0.7}
            >
              <View style={[styles.actionIcon, { backgroundColor: action.color + '20' }]}>
                <Ionicons name={action.icon} size={28} color={action.color} />
              </View>
              <Text style={styles.actionLabel}>{action.label}</Text>
              <Ionicons name="chevron-forward" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          ))}
        </View>

        {/* Categories Summary */}
        {data && data.categories.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Our Menu</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/menu' as any)}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.categoriesGrid}>
              {data.categories.slice(0, 4).map((cat) => (
                <TouchableOpacity
                  key={cat.name}
                  style={styles.categoryCard}
                  onPress={() => router.push('/(tabs)/menu' as any)}
                  activeOpacity={0.8}
                >
                  <View style={styles.categoryIcon}>
                    <Ionicons name="fast-food" size={22} color={Colors.primary} />
                  </View>
                  <Text style={styles.categoryName} numberOfLines={1}>
                    {cat.name}
                  </Text>
                  <Text style={styles.categoryCount}>
                    {cat.items.length} item{cat.items.length !== 1 ? 's' : ''}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* Featured Items */}
        {allItems.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Popular Items</Text>
              <TouchableOpacity onPress={() => router.push('/(tabs)/menu' as any)}>
                <Text style={styles.seeAll}>See All</Text>
              </TouchableOpacity>
            </View>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              {allItems.slice(0, 6).map((item) => (
                <View key={item.id} style={styles.featuredCard}>
                  <View style={styles.featuredIcon}>
                    <Ionicons name="fast-food" size={32} color={Colors.primary} />
                  </View>
                  <Text style={styles.featuredName} numberOfLines={2}>
                    {item.name}
                  </Text>
                  <Text style={styles.featuredPrice}>
                    KES {(item.retailPriceCents / 100).toLocaleString('en-KE', {
                      minimumFractionDigits: 2,
                    })}
                  </Text>
                </View>
              ))}
            </ScrollView>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.primary },
  container: { flex: 1, backgroundColor: Colors.background },
  content: { paddingBottom: 24 },
  header: {
    backgroundColor: Colors.primary,
    padding: 24,
    paddingTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  businessName: {
    fontSize: 22,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  dateText: {
    fontSize: 13,
    color: 'rgba(255,255,255,0.8)',
  },
  logoContainer: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.card,
    margin: 16,
    marginTop: -8,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
  },
  bannerText: { flex: 1 },
  bannerTitle: { fontSize: 16, fontWeight: '600', color: Colors.text },
  bannerSub: { fontSize: 13, color: Colors.textSecondary, marginTop: 2 },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: Colors.text,
    paddingHorizontal: 16,
    marginTop: 16,
    marginBottom: 12,
  },
  seeAll: { fontSize: 14, color: Colors.primary, fontWeight: '600' },
  actionsGrid: { paddingHorizontal: 16, gap: 10 },
  actionCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    borderLeftWidth: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
    gap: 12,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionLabel: {
    flex: 1,
    fontSize: 15,
    fontWeight: '600',
    color: Colors.text,
  },
  categoriesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 12,
    gap: 10,
  },
  categoryCard: {
    width: '47%',
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    gap: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  categoryIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryName: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
  },
  categoryCount: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  featuredCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    marginLeft: 16,
    width: 130,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  featuredIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary + '15',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
    alignSelf: 'center',
  },
  featuredName: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.text,
    textAlign: 'center',
    marginBottom: 4,
  },
  featuredPrice: {
    fontSize: 12,
    color: Colors.primary,
    fontWeight: '700',
    textAlign: 'center',
  },
});

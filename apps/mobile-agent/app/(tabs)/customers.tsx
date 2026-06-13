/**
 * Customers — searchable list of the agent's shops, with a button to
 * register a new customer and quick actions (order / call).
 */
import {
  View, Text, TextInput, StyleSheet, SafeAreaView, FlatList,
  TouchableOpacity, ActivityIndicator, RefreshControl, Linking,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { agentApi, formatKES } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { useCartStore } from '../../stores/cart';
import { Colors } from '../../constants/theme';

interface Customer {
  id: string;
  name: string;
  phone: string;
  shopCode: string | null;
  shopType: string | null;
  balanceCents: number | null;
  creditLimitCents: number;
  route?: { name: string; color: string | null } | null;
}

export default function CustomersScreen() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const setCustomer = useCartStore((s) => s.setCustomer);
  const businessId = user?.businessId ?? '';
  const agentId = user?.id ?? '';
  const [search, setSearch] = useState('');

  const { data, isLoading, isRefetching, refetch } = useQuery<Customer[]>({
    queryKey: ['agent-customers', agentId, businessId, search],
    queryFn: () => agentApi.get<Customer[]>(
      `/field-sales/customers?agentId=${agentId}&businessId=${businessId}${search ? `&search=${encodeURIComponent(search)}` : ''}`,
    ),
    enabled: !!agentId && !!businessId,
  });

  function startOrder(c: Customer) {
    setCustomer(c.id, c.name);
    router.push('/(tabs)/order');
  }

  return (
    <SafeAreaView style={st.safe}>
      <View style={st.header}>
        <Text style={st.title}>Customers</Text>
        <TouchableOpacity style={st.addBtn} onPress={() => router.push('/customer-register')}>
          <Ionicons name="add" size={18} color="#FFF" />
          <Text style={st.addBtnText}>New</Text>
        </TouchableOpacity>
      </View>

      <View style={st.searchWrap}>
        <Ionicons name="search" size={18} color={Colors.textSecondary} />
        <TextInput
          style={st.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="Search name, phone or shop code"
          placeholderTextColor={Colors.textSecondary}
          autoCapitalize="none"
        />
        {search.length > 0 && (
          <TouchableOpacity onPress={() => setSearch('')}>
            <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={data ?? []}
        keyExtractor={(c) => c.id}
        refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={Colors.primary} />}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        ListEmptyComponent={
          isLoading ? <ActivityIndicator color={Colors.primary} style={{ marginTop: 24 }} /> : (
            <View style={st.empty}>
              <Ionicons name="storefront-outline" size={40} color={Colors.textSecondary} />
              <Text style={st.emptyText}>No customers found.</Text>
              <Text style={st.emptySub}>Tap “New” to register your first shop.</Text>
            </View>
          )
        }
        renderItem={({ item }) => {
          const owes = item.balanceCents != null && item.balanceCents < 0 ? Math.abs(item.balanceCents) : 0;
          return (
            <View style={st.card}>
              <View style={st.avatar}><Text style={st.avatarText}>{item.name.charAt(0).toUpperCase()}</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={st.name} numberOfLines={1}>{item.name}</Text>
                <Text style={st.meta}>{item.shopCode ?? '—'} · {item.phone}</Text>
                {owes > 0 && <Text style={st.owes}>Owes {formatKES(owes)}</Text>}
              </View>
              <View style={st.cardActions}>
                <TouchableOpacity style={st.iconBtn} onPress={() => startOrder(item)}>
                  <Ionicons name="cart" size={18} color={Colors.primary} />
                </TouchableOpacity>
                <TouchableOpacity style={st.iconBtn} onPress={() => Linking.openURL(`tel:${item.phone}`)}>
                  <Ionicons name="call" size={18} color={Colors.success} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
      />
    </SafeAreaView>
  );
}

const st = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, paddingBottom: 8 },
  title: { fontSize: 22, fontWeight: '800', color: Colors.text },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: Colors.primary, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10 },
  addBtnText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  searchWrap: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8,
    backgroundColor: Colors.card, borderRadius: 12, borderWidth: 1, borderColor: Colors.border, paddingHorizontal: 12,
  },
  searchInput: { flex: 1, paddingVertical: 11, fontSize: 15, color: Colors.text },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.card, borderRadius: 14,
    padding: 12, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  avatarText: { fontSize: 18, fontWeight: '800', color: Colors.primary },
  name: { fontSize: 15, fontWeight: '700', color: Colors.text },
  meta: { fontSize: 12, color: Colors.textSecondary, marginTop: 1 },
  owes: { fontSize: 12, color: Colors.error, fontWeight: '600', marginTop: 2 },
  cardActions: { flexDirection: 'row', gap: 6 },
  iconBtn: { width: 38, height: 38, borderRadius: 10, backgroundColor: Colors.background, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: Colors.border },
  empty: { alignItems: 'center', padding: 40, gap: 6 },
  emptyText: { fontSize: 15, fontWeight: '600', color: Colors.text },
  emptySub: { fontSize: 13, color: Colors.textSecondary },
});

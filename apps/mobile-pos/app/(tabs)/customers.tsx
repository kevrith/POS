import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Modal,
  ScrollView,
  RefreshControl,
  TextInput,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { mobileApi, formatKES } from '../../lib/api';
import { useAuthStore } from '../../stores/auth';
import { useActiveStore } from '../../lib/useActiveStore';
import { useCartStore } from '../../stores/cart';
import { Colors } from '../../constants/theme';
import { useRouter } from 'expo-router';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  loyaltyPoints: number;
  totalSpentCents?: number;
  createdAt?: string;
}

interface CustomersResponse {
  data: Customer[];
  total: number;
}

export default function CustomersScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { user } = useAuthStore();
  const setCustomer = useCartStore((s) => s.setCustomer);

  const { businessId } = useActiveStore();

  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');

  const { data, isLoading, refetch, isRefetching } = useQuery<CustomersResponse>({
    queryKey: ['customers', businessId, search],
    queryFn: () =>
      mobileApi.get<CustomersResponse>(
        `/businesses/${businessId}/customers?search=${encodeURIComponent(search)}&limit=50`
      ),
    staleTime: 30_000,
  });

  const customers = data?.data ?? (Array.isArray(data) ? (data as Customer[]) : []);

  const createMutation = useMutation({
    mutationFn: (body: { name: string; phone?: string; email?: string }) =>
      mobileApi.post(`/businesses/${businessId}/customers`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customers', businessId] });
      setShowAddModal(false);
      setNewName('');
      setNewPhone('');
      setNewEmail('');
    },
    onError: (err: any) => {
      Alert.alert('Error', err.message ?? 'Failed to create customer.');
    },
  });

  function handleAdd() {
    if (!newName.trim()) {
      Alert.alert('Required', 'Customer name is required.');
      return;
    }
    createMutation.mutate({
      name: newName.trim(),
      phone: newPhone.trim() || undefined,
      email: newEmail.trim() || undefined,
    });
  }

  function handleSelectForPOS(customer: Customer) {
    setCustomer(customer.id, customer.name);
    Alert.alert(
      'Customer Selected',
      `${customer.name} has been added to the current cart.`,
      [
        { text: 'Stay Here', style: 'cancel' },
        { text: 'Go to POS', onPress: () => router.push('/(tabs)/pos') },
      ]
    );
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Text style={styles.headerTitle}>Customers</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => setShowAddModal(true)}>
            <Ionicons name="person-add" size={18} color="#FFFFFF" />
            <Text style={styles.addBtnText}>New</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.searchBox}>
          <Ionicons name="search" size={16} color={Colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or phone..."
            placeholderTextColor={Colors.textSecondary}
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')} accessibilityRole="button" accessibilityLabel="Clear" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={Colors.primary} />
        </View>
      ) : (
        <FlatList
          data={customers}
          keyExtractor={(c) => c.id}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} colors={[Colors.primary]} />}
          renderItem={({ item: customer }) => (
            <TouchableOpacity style={styles.customerCard} onPress={() => setSelectedCustomer(customer)} activeOpacity={0.8}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{customer.name.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.customerInfo}>
                <Text style={styles.customerName}>{customer.name}</Text>
                {customer.phone ? (
                  <Text style={styles.customerSub}>{customer.phone}</Text>
                ) : null}
                {customer.email ? (
                  <Text style={styles.customerSub}>{customer.email}</Text>
                ) : null}
              </View>
              <View style={styles.loyaltyWrap}>
                <Ionicons name="star" size={12} color={Colors.warning} />
                <Text style={styles.loyaltyText}>{customer.loyaltyPoints ?? 0} pts</Text>
              </View>
            </TouchableOpacity>
          )}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={48} color={Colors.border} />
              <Text style={styles.emptyText}>No customers found</Text>
              <TouchableOpacity style={styles.addEmptyBtn} onPress={() => setShowAddModal(true)}>
                <Text style={styles.addEmptyText}>Add First Customer</Text>
              </TouchableOpacity>
            </View>
          }
        />
      )}

      {/* Customer Detail Modal */}
      <Modal visible={!!selectedCustomer} animationType="slide" presentationStyle="pageSheet">
        {selectedCustomer && (
          <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Customer Details</Text>
              <TouchableOpacity onPress={() => setSelectedCustomer(null)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView contentContainerStyle={styles.modalContent}>
              {/* Profile */}
              <View style={styles.profileCard}>
                <View style={styles.avatarLarge}>
                  <Text style={styles.avatarLargeText}>{selectedCustomer.name.charAt(0).toUpperCase()}</Text>
                </View>
                <Text style={styles.profileName}>{selectedCustomer.name}</Text>
                {selectedCustomer.phone ? (
                  <Text style={styles.profileSub}>{selectedCustomer.phone}</Text>
                ) : null}
                {selectedCustomer.email ? (
                  <Text style={styles.profileSub}>{selectedCustomer.email}</Text>
                ) : null}
              </View>

              {/* Stats */}
              <View style={styles.statsRow}>
                <View style={styles.statCard}>
                  <Ionicons name="star" size={20} color={Colors.warning} />
                  <Text style={styles.statValue}>{selectedCustomer.loyaltyPoints ?? 0}</Text>
                  <Text style={styles.statLabel}>Loyalty Points</Text>
                </View>
                {selectedCustomer.totalSpentCents !== undefined && (
                  <View style={styles.statCard}>
                    <Ionicons name="cash-outline" size={20} color={Colors.success} />
                    <Text style={styles.statValue}>{formatKES(selectedCustomer.totalSpentCents)}</Text>
                    <Text style={styles.statLabel}>Total Spent</Text>
                  </View>
                )}
              </View>

              {/* Actions */}
              <TouchableOpacity
                style={styles.actionBtn}
                onPress={() => {
                  setSelectedCustomer(null);
                  handleSelectForPOS(selectedCustomer);
                }}
              >
                <Ionicons name="bag" size={20} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Add to Current Sale</Text>
              </TouchableOpacity>
            </ScrollView>
          </SafeAreaView>
        )}
      </Modal>

      {/* Add Customer Modal */}
      <Modal visible={showAddModal} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView edges={['top']} style={{ flex: 1, backgroundColor: Colors.background }}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>New Customer</Text>
            <TouchableOpacity onPress={() => setShowAddModal(false)} accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={24} color={Colors.text} />
            </TouchableOpacity>
          </View>
          <ScrollView contentContainerStyle={styles.modalContent}>
            <View style={styles.formCard}>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Name *</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="person-outline" size={16} color={Colors.textSecondary} />
                  <TextInput
                    style={styles.input}
                    value={newName}
                    onChangeText={setNewName}
                    placeholder="Full name"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Phone</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="call-outline" size={16} color={Colors.textSecondary} />
                  <TextInput
                    style={styles.input}
                    value={newPhone}
                    onChangeText={setNewPhone}
                    placeholder="+254 7XX XXX XXX"
                    keyboardType="phone-pad"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>
              <View style={styles.fieldGroup}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={16} color={Colors.textSecondary} />
                  <TextInput
                    style={styles.input}
                    value={newEmail}
                    onChangeText={setNewEmail}
                    placeholder="email@example.com"
                    keyboardType="email-address"
                    autoCapitalize="none"
                    placeholderTextColor={Colors.textSecondary}
                  />
                </View>
              </View>

              <TouchableOpacity
                style={[styles.saveBtn, createMutation.isPending && { opacity: 0.7 }]}
                onPress={handleAdd}
                disabled={createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <>
                    <Ionicons name="checkmark" size={20} color="#FFFFFF" />
                    <Text style={styles.saveBtnText}>Save Customer</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    backgroundColor: Colors.card,
    padding: 12,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  headerTitle: { fontSize: 20, fontWeight: '800', color: Colors.text },
  addBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.primary,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    gap: 5,
  },
  addBtnText: { color: '#FFFFFF', fontSize: 13, fontWeight: '600' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 10,
    gap: 6,
    height: 38,
  },
  searchInput: { flex: 1, fontSize: 13, color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12, paddingTop: 60 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  addEmptyBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 20,
    paddingVertical: 10,
    marginTop: 4,
  },
  addEmptyText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  list: { padding: 12, gap: 10, paddingBottom: 24 },
  customerCard: {
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 18, fontWeight: '700', color: Colors.primary },
  customerInfo: { flex: 1, gap: 2 },
  customerName: { fontSize: 14, fontWeight: '700', color: Colors.text },
  customerSub: { fontSize: 12, color: Colors.textSecondary },
  loyaltyWrap: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  loyaltyText: { fontSize: 12, color: Colors.warning, fontWeight: '600' },

  // Modal
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
    backgroundColor: Colors.card,
  },
  modalTitle: { fontSize: 17, fontWeight: '700', color: Colors.text },
  modalContent: { padding: 16, gap: 16, paddingBottom: 40 },
  profileCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    gap: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  avatarLarge: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  avatarLargeText: { fontSize: 28, fontWeight: '800', color: Colors.primary },
  profileName: { fontSize: 18, fontWeight: '800', color: Colors.text },
  profileSub: { fontSize: 13, color: Colors.textSecondary },
  statsRow: { flexDirection: 'row', gap: 12 },
  statCard: {
    flex: 1,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  statValue: { fontSize: 16, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textSecondary, textAlign: 'center' },
  actionBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 12,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  actionBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },

  // Form
  formCard: {
    backgroundColor: Colors.card,
    borderRadius: 16,
    padding: 16,
    gap: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  fieldGroup: { gap: 6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: Colors.background,
  },
  input: { flex: 1, paddingVertical: 11, fontSize: 14, color: Colors.text },
  saveBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingVertical: 13,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  saveBtnText: { color: '#FFFFFF', fontSize: 15, fontWeight: '700' },
});

import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { mobileApi, formatKES } from '../lib/api';
import { Colors } from '../constants/theme';

interface Customer {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  loyaltyPoints?: number;
  outstandingBalanceCents?: number;
  creditLimitCents?: number;
}

interface Props {
  visible: boolean;
  businessId: string;
  onSelect: (id: string, name: string) => void;
  onClose: () => void;
}

function looksLikePhone(s: string) {
  return /^[+\d\s\-()]{7,}$/.test(s.trim());
}

export default function CustomerPickerModal({ visible, businessId, onSelect, onClose }: Props) {
  const [search, setSearch] = useState('');
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [autoSelecting, setAutoSelecting] = useState(false);

  const { data, isLoading } = useQuery<{ data: Customer[] } | Customer[]>({
    queryKey: ['customers-picker', businessId, search],
    queryFn: () =>
      mobileApi.get<{ data: Customer[] } | Customer[]>(
        `/businesses/${businessId}/customers?search=${encodeURIComponent(search)}&limit=30`
      ),
    enabled: visible && !!businessId,
    staleTime: 30_000,
  });

  const customers: Customer[] = Array.isArray(data)
    ? data
    : (data as any)?.data ?? [];

  const isPhone = looksLikePhone(search);
  const exactMatch = isPhone && customers.length === 1 ? customers[0] : null;

  // Auto-select after 1.2 s on exact phone match
  useEffect(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    setAutoSelecting(false);
    if (!exactMatch) return;
    autoTimer.current = setTimeout(() => {
      setAutoSelecting(true);
      setTimeout(() => {
        onSelect(exactMatch.id, exactMatch.name);
        onClose();
        setSearch('');
        setAutoSelecting(false);
      }, 700);
    }, 1200);
    return () => { if (autoTimer.current) clearTimeout(autoTimer.current); };
  }, [exactMatch?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(c: Customer) {
    onSelect(c.id, c.name);
    onClose();
    setSearch('');
  }

  function handleClose() {
    onClose();
    setSearch('');
    setAutoSelecting(false);
    if (autoTimer.current) clearTimeout(autoTimer.current);
  }

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView edges={['top']} style={styles.safe}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Select Customer</Text>
          <TouchableOpacity onPress={handleClose}>
            <Ionicons name="close" size={24} color={Colors.text} />
          </TouchableOpacity>
        </View>

        {/* Search */}
        <View style={styles.searchWrap}>
          <Ionicons
            name={isPhone ? 'call-outline' : 'search'}
            size={16}
            color={isPhone ? Colors.primary : Colors.textSecondary}
          />
          <TextInput
            style={styles.searchInput}
            value={search}
            onChangeText={setSearch}
            placeholder="Search by name or phone…"
            placeholderTextColor={Colors.textSecondary}
            autoFocus
          />
          {search ? (
            <TouchableOpacity onPress={() => setSearch('')}>
              <Ionicons name="close-circle" size={16} color={Colors.textSecondary} />
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Auto-select banner */}
        {exactMatch && (
          <View style={[styles.banner, autoSelecting && styles.bannerGreen]}>
            <View style={[styles.bannerAvatar, autoSelecting && styles.bannerAvatarGreen]}>
              <Text style={[styles.bannerAvatarText, autoSelecting && { color: '#166534' }]}>
                {exactMatch.name.charAt(0).toUpperCase()}
              </Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.bannerLabel, autoSelecting && { color: '#166534' }]}>
                {autoSelecting ? 'Selecting…' : 'Welcome back!'}
              </Text>
              <Text style={styles.bannerName}>{exactMatch.name}</Text>
              {exactMatch.phone ? <Text style={styles.bannerSub}>{exactMatch.phone}</Text> : null}
              {(exactMatch.loyaltyPoints ?? 0) > 0 && (
                <View style={styles.ptsRow}>
                  <Ionicons name="star" size={11} color={Colors.warning} />
                  <Text style={styles.ptsText}>{exactMatch.loyaltyPoints} pts</Text>
                </View>
              )}
            </View>
            <TouchableOpacity style={styles.bannerBtn} onPress={() => handleSelect(exactMatch)}>
              <Text style={styles.bannerBtnText}>Select</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* List */}
        {isLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={Colors.primary} />
          </View>
        ) : (
          <FlatList
            data={exactMatch ? [] : customers}
            keyExtractor={(c) => c.id}
            contentContainerStyle={styles.list}
            renderItem={({ item: c }) => (
              <TouchableOpacity style={styles.row} onPress={() => handleSelect(c)} activeOpacity={0.75}>
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{c.name.charAt(0).toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.name}>{c.name}</Text>
                  {c.phone ? <Text style={styles.sub}>{c.phone}</Text> : null}
                  {(c.outstandingBalanceCents ?? 0) > 0 && (
                    <Text style={styles.outstanding}>
                      Outstanding: {formatKES(c.outstandingBalanceCents!)}
                    </Text>
                  )}
                </View>
                {(c.loyaltyPoints ?? 0) > 0 && (
                  <View style={styles.ptsRow}>
                    <Ionicons name="star" size={12} color={Colors.warning} />
                    <Text style={styles.ptsText}>{c.loyaltyPoints} pts</Text>
                  </View>
                )}
              </TouchableOpacity>
            )}
            ListEmptyComponent={
              !exactMatch ? (
                <View style={styles.center}>
                  <Ionicons name="people-outline" size={40} color={Colors.border} />
                  <Text style={styles.emptyText}>
                    {search ? 'No customers found' : 'Type to search'}
                  </Text>
                </View>
              ) : null
            }
          />
        )}

        {/* No customer option */}
        <View style={styles.footer}>
          <TouchableOpacity style={styles.skipBtn} onPress={() => { onSelect('', ''); handleClose(); }}>
            <Ionicons name="person-remove-outline" size={16} color={Colors.textSecondary} />
            <Text style={styles.skipText}>No customer (walk-in)</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.card,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  title: { fontSize: 17, fontWeight: '700', color: Colors.text },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    margin: 12,
    paddingHorizontal: 12,
    gap: 8,
    backgroundColor: Colors.card,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 10,
    height: 42,
  },
  searchInput: { flex: 1, fontSize: 14, color: Colors.text },
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    margin: 12,
    marginTop: 0,
    padding: 14,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#93C5FD',
    borderRadius: 14,
  },
  bannerGreen: { backgroundColor: '#F0FDF4', borderColor: '#86EFAC' },
  bannerAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#BFDBFE',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerAvatarGreen: { backgroundColor: '#BBF7D0' },
  bannerAvatarText: { fontSize: 20, fontWeight: '800', color: '#1D4ED8' },
  bannerLabel: { fontSize: 11, fontWeight: '700', color: Colors.primary, textTransform: 'uppercase' },
  bannerName: { fontSize: 16, fontWeight: '800', color: Colors.text },
  bannerSub: { fontSize: 12, color: Colors.textSecondary },
  bannerBtn: {
    backgroundColor: Colors.primary,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  bannerBtnText: { color: '#FFFFFF', fontWeight: '700', fontSize: 13 },
  list: { padding: 12, gap: 8, paddingBottom: 20 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: Colors.card,
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: Colors.primary + '20',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: { fontSize: 16, fontWeight: '700', color: Colors.primary },
  name: { fontSize: 14, fontWeight: '600', color: Colors.text },
  sub: { fontSize: 12, color: Colors.textSecondary },
  outstanding: { fontSize: 11, color: Colors.warning, fontWeight: '600' },
  ptsRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  ptsText: { fontSize: 12, color: Colors.warning, fontWeight: '600' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 10, paddingTop: 40 },
  emptyText: { color: Colors.textSecondary, fontSize: 14 },
  footer: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: Colors.border,
    backgroundColor: Colors.card,
  },
  skipBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  skipText: { fontSize: 14, color: Colors.textSecondary },
});

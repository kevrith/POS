import { useMemo, useState } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi, formatKES } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { canApprove } from '../lib/roles';
import { useApprovals } from '../lib/useApprovals';
import {
  daysWaiting, APPROVAL_ENDPOINTS, decisionBody, KIND_LABELS,
  type ApprovalItem, type ApprovalKind,
} from '../lib/approvals';
import { Colors } from '../constants/theme';

const KIND_ICON: Record<ApprovalKind, keyof typeof Ionicons.glyphMap> = {
  expense: 'receipt-outline',
  leave: 'calendar-outline',
  advance: 'cash-outline',
  po: 'document-text-outline',
};

const KIND_COLOR: Record<ApprovalKind, string> = {
  expense: '#DB2777',
  leave: '#0D9488',
  advance: '#F59E0B',
  po: '#0EA5E9',
};

type FilterKind = ApprovalKind | 'all';

/**
 * One inbox for everything waiting on a manager.
 *
 * The web app scatters these across four pages (Expenses, HR, Payroll,
 * Suppliers); on a phone that is four places to forget to look. Pulling them
 * into a single oldest-first list is the whole point — an owner opens this,
 * clears it, and knows nothing is blocked.
 */
export default function ApprovalsScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const isApprover = canApprove(user?.role);

  const [filter, setFilter] = useState<FilterKind>('all');
  const [busyId, setBusyId] = useState<string | null>(null);

  const { items, counts, isLoading, isRefetching, failedCount, refetchAll } = useApprovals();
  const visible = useMemo(
    () => (filter === 'all' ? items : items.filter((i) => i.kind === filter)),
    [items, filter],
  );

  const decideMut = useMutation({
    mutationFn: ({ item, approve }: { item: ApprovalItem; approve: boolean }) => {
      const path = approve
        ? APPROVAL_ENDPOINTS[item.kind].approve(item.id)
        : APPROVAL_ENDPOINTS[item.kind].reject(item.id);
      return mobileApi.patch(path, decisionBody(item.kind, approve, user?.id ?? ''));
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['approvals'] });
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['purchase-orders'] });
      qc.invalidateQueries({ queryKey: ['leave'] });
    },
    onError: (e: any) => Alert.alert('Could not update', e?.message ?? 'Please try again.'),
    onSettled: () => setBusyId(null),
  });

  function decide(item: ApprovalItem, approve: boolean) {
    const money = item.amountCents !== undefined ? `\n${formatKES(item.amountCents)}` : '';
    Alert.alert(
      approve ? `Approve ${KIND_LABELS[item.kind].toLowerCase()}?` : `Reject ${KIND_LABELS[item.kind].toLowerCase()}?`,
      `${item.title}${money}\nRequested by ${item.who}`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: approve ? 'Approve' : 'Reject',
          style: approve ? 'default' : 'destructive',
          onPress: () => { setBusyId(item.id); decideMut.mutate({ item, approve }); },
        },
      ],
    );
  }

  if (!isApprover) {
    return (
      <SafeAreaView edges={['top']} style={s.safe}>
        <Header onBack={() => router.back()} count={0} />
        <View style={s.center}>
          <Ionicons name="lock-closed-outline" size={34} color={Colors.textSecondary} />
          <Text style={s.emptyTitle}>Managers only</Text>
          <Text style={s.emptySub}>Approving requests needs an owner or manager account.</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <Header onBack={() => router.back()} count={items.length} />

      <View style={s.filterRow}>
        {(['all', 'expense', 'leave', 'advance', 'po'] as FilterKind[]).map((f) => {
          const n = f === 'all' ? items.length : counts[f];
          return (
            <TouchableOpacity
              key={f}
              style={[s.filterChip, filter === f && s.filterChipActive]}
              onPress={() => setFilter(f)}
            >
              <Text style={[s.filterText, filter === f && { color: '#FFF' }]}>
                {f === 'all' ? 'All' : KIND_LABELS[f]}{n > 0 ? ` ${n}` : ''}
              </Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetchAll} colors={[Colors.primary]} />}
        >
          {failedCount > 0 && (
            <View style={s.warnBanner}>
              <Ionicons name="warning-outline" size={16} color={Colors.warning} />
              <Text style={s.warnText}>
                {failedCount} of 4 lists could not load. Pull to retry — the rest are shown below.
              </Text>
            </View>
          )}

          {visible.length === 0 ? (
            <View style={s.center}>
              <Ionicons name="checkmark-done-circle-outline" size={44} color={Colors.success} />
              <Text style={s.emptyTitle}>All clear</Text>
              <Text style={s.emptySub}>Nothing is waiting on you right now.</Text>
            </View>
          ) : (
            visible.map((item) => {
              const waiting = daysWaiting(item.whenISO);
              const busy = busyId === item.id;
              return (
                <View key={`${item.kind}-${item.id}`} style={s.card}>
                  <View style={s.cardTop}>
                    <View style={[s.kindIcon, { backgroundColor: KIND_COLOR[item.kind] + '18' }]}>
                      <Ionicons name={KIND_ICON[item.kind]} size={18} color={KIND_COLOR[item.kind]} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.title}>{item.title}</Text>
                      <Text style={s.subtitle} numberOfLines={2}>{item.subtitle}</Text>
                    </View>
                    {item.amountCents !== undefined && (
                      <Text style={s.amount}>{formatKES(item.amountCents)}</Text>
                    )}
                  </View>

                  <View style={s.metaRow}>
                    <Text style={s.meta}>{item.who}</Text>
                    <Text style={s.metaDot}>·</Text>
                    <Text style={[s.meta, waiting >= 3 && { color: Colors.warning, fontWeight: '700' }]}>
                      {waiting === 0 ? 'Today' : `${waiting} day${waiting === 1 ? '' : 's'} waiting`}
                    </Text>
                  </View>

                  <View style={s.actionRow}>
                    <TouchableOpacity
                      style={[s.actionBtn, s.rejectBtn]}
                      onPress={() => decide(item, false)}
                      disabled={busy}
                    >
                      <Ionicons name="close" size={16} color={Colors.error} />
                      <Text style={[s.actionText, { color: Colors.error }]}>Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.actionBtn, s.approveBtn]}
                      onPress={() => decide(item, true)}
                      disabled={busy}
                    >
                      {busy ? <ActivityIndicator color="#FFF" size="small" /> : (
                        <><Ionicons name="checkmark" size={16} color="#FFF" /><Text style={[s.actionText, { color: '#FFF' }]}>Approve</Text></>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Header({ onBack, count }: { onBack: () => void; count: number }) {
  return (
    <View style={s.header}>
      <TouchableOpacity onPress={onBack} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Ionicons name="arrow-back" size={22} color={Colors.text} />
      </TouchableOpacity>
      <View style={s.headerCenter}>
        <Text style={s.headerTitle}>Approvals</Text>
        {count > 0 && <View style={s.badge}><Text style={s.badgeText}>{count}</Text></View>}
      </View>
      <View style={{ width: 30 }} />
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  headerCenter: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  backBtn: { padding: 4, minWidth: 30 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  badge: { minWidth: 22, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: Colors.error, justifyContent: 'center', alignItems: 'center' },
  badgeText: { color: '#FFF', fontSize: 11, fontWeight: '800' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 60 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: Colors.text, marginTop: 6 },
  emptySub: { fontSize: 13, color: Colors.textSecondary, textAlign: 'center', paddingHorizontal: 30 },
  filterRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border, flexWrap: 'wrap' },
  filterChip: { paddingHorizontal: 11, paddingVertical: 7, borderRadius: 999, backgroundColor: Colors.background },
  filterChipActive: { backgroundColor: Colors.primary },
  filterText: { fontSize: 12, fontWeight: '600', color: Colors.textSecondary },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  warnBanner: { flexDirection: 'row', gap: 8, alignItems: 'center', backgroundColor: Colors.warning + '14', borderRadius: 10, padding: 12 },
  warnText: { flex: 1, fontSize: 12, color: Colors.text, lineHeight: 17 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, gap: 8 },
  cardTop: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  kindIcon: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  subtitle: { fontSize: 13, color: Colors.textSecondary, marginTop: 2, lineHeight: 18 },
  amount: { fontSize: 15, fontWeight: '800', color: Colors.text },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  meta: { fontSize: 12, color: Colors.textSecondary },
  metaDot: { fontSize: 12, color: Colors.border },
  actionRow: { flexDirection: 'row', gap: 10, marginTop: 2 },
  actionBtn: { flex: 1, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, paddingVertical: 10, borderRadius: 10 },
  approveBtn: { backgroundColor: Colors.success },
  rejectBtn: { backgroundColor: Colors.error + '14' },
  actionText: { fontSize: 13, fontWeight: '700' },
});

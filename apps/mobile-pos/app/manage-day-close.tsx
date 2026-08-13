import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert, Share, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi, formatKES } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { canManage } from '../lib/roles';
import {
  formatXReadingText,
  formatZReportText,
  parseAmountToCents,
  varianceLabel,
  varianceTone,
  type XReading,
  type ZReport,
  type DrawerSummary,
} from '../lib/dayClose';
import { Colors } from '../constants/theme';

interface ActiveSession {
  id: string;
  cashierId: string;
  cashierName: string;
  tillNumber?: number | null;
  openingBalanceCents: number;
  openedAt: string;
  expectedCashCents: number;
  summary: DrawerSummary;
}

/**
 * End-of-day screen: the X reading (mid-shift, drawer stays open) and the Z
 * report (closes the drawer and burns a fiscal sequence number).
 *
 * Managers additionally see every OTHER till open in the store — the oversight
 * half of the same screen, so an owner can spot an un-closed drawer without
 * walking to each terminal.
 */
export default function DayCloseScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const cashierId = user?.id ?? '';
  const { businessId, storeId, stores } = useActiveStore();
  const isManager = canManage(user?.role);
  const storeName = stores.find((s) => s.id === storeId)?.name ?? 'Store';

  const [counting, setCounting] = useState(false);
  const [countInput, setCountInput] = useState('');
  const [zResult, setZResult] = useState<ZReport | null>(null);

  const xQ = useQuery<XReading>({
    queryKey: ['x-report', businessId, storeId, cashierId],
    queryFn: () =>
      mobileApi.get<XReading>(
        `/reports/x-report?businessId=${businessId}&storeId=${storeId}&cashierId=${cashierId}`,
      ),
    enabled: !!businessId && !!storeId && !!cashierId,
    staleTime: 15_000,
  });

  const sessionsQ = useQuery<ActiveSession[]>({
    queryKey: ['active-sessions', storeId],
    queryFn: () => mobileApi.get<ActiveSession[]>(`/cash-drawer/active-sessions?storeId=${storeId}`),
    enabled: isManager && !!storeId,
    staleTime: 30_000,
  });

  const zMut = useMutation({
    mutationFn: (closingBalanceCents: number) =>
      mobileApi.post<ZReport>('/reports/z-report', {
        businessId,
        storeId,
        cashierId,
        closingBalanceCents,
      }),
    onSuccess: (res) => {
      setZResult(res);
      setCounting(false);
      setCountInput('');
      // The drawer is now CLOSED — every screen reading session state is stale.
      qc.invalidateQueries({ queryKey: ['x-report'] });
      qc.invalidateQueries({ queryKey: ['cash-drawer'] });
      qc.invalidateQueries({ queryKey: ['active-sessions'] });
    },
    onError: (e: any) =>
      Alert.alert('Could not close the day', e?.message ?? 'No open cash drawer session.'),
  });

  function submitZ() {
    const cents = parseAmountToCents(countInput);
    if (cents === null) {
      Alert.alert('Enter the counted cash', 'Type the total cash counted in the drawer, e.g. 12500');
      return;
    }
    const expected = xQ.data?.summary?.expectedClosingCents ?? 0;
    const variance = cents - expected;
    // A Z report is irreversible — it closes the drawer and burns a fiscal
    // sequence number — so confirm, and surface the variance BEFORE committing.
    Alert.alert(
      'Close the day?',
      `Counted ${formatKES(cents)} against an expected ${formatKES(expected)}.\n\n` +
        `${varianceLabel(variance)} ${formatKES(Math.abs(variance))}.\n\n` +
        'This closes the till and cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Close day', style: 'destructive', onPress: () => zMut.mutate(cents) },
      ],
    );
  }

  async function shareX() {
    if (!xQ.data) return;
    await Share.share({ message: formatXReadingText(xQ.data, storeName, user?.name ?? 'Cashier') }).catch(() => {});
  }

  async function shareZ() {
    if (!zResult) return;
    await Share.share({ message: formatZReportText(zResult, storeName, user?.name ?? 'Cashier') }).catch(() => {});
  }

  const x = xQ.data;
  const summary = x?.summary ?? null;
  const hasOpenSession = !!x?.session && !!summary;

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Day Close</Text>
        <View style={{ width: 30 }} />
      </View>

      {xQ.isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView
          contentContainerStyle={s.content}
          refreshControl={
            <RefreshControl
              refreshing={xQ.isRefetching || sessionsQ.isRefetching}
              onRefresh={() => { void xQ.refetch(); if (isManager) void sessionsQ.refetch(); }}
              colors={[Colors.primary]}
            />
          }
        >
          {/* ── Z result ── */}
          {zResult && (
            <View style={[s.card, { borderWidth: 1, borderColor: varianceTone(zResult.varianceCents) === 'balanced' ? Colors.success : Colors.warning }]}>
              <Text style={s.zNumber}>{zResult.zReportNumber}</Text>
              <Text style={s.cardTitle}>Day closed</Text>
              <Row label="Transactions" value={String(zResult.totalSales)} />
              <Row label="Total revenue" value={formatKES(zResult.totalRevenueCents)} />
              <View style={s.divider} />
              <Row label="Expected cash" value={formatKES(zResult.expectedCashCents)} />
              <Row label="Counted cash" value={formatKES(zResult.closingBalanceCents)} />
              <Row
                label={varianceLabel(zResult.varianceCents)}
                value={`${zResult.varianceCents >= 0 ? '+' : '-'}${formatKES(Math.abs(zResult.varianceCents))}`}
                valueColor={varianceTone(zResult.varianceCents) === 'balanced' ? Colors.success : Colors.error}
                bold
              />
              <TouchableOpacity style={s.btn} onPress={shareZ}>
                <Ionicons name="share-outline" size={18} color="#FFF" />
                <Text style={s.btnText}>Share Z Report</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setZResult(null)}>
                <Text style={s.cancelText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── No open till ── */}
          {!zResult && !hasOpenSession && (
            <View style={s.card}>
              <View style={s.iconWrap}><Ionicons name="file-tray-outline" size={26} color={Colors.textSecondary} /></View>
              <Text style={s.cardTitle}>No open till</Text>
              <Text style={s.cardSub}>
                Open your shift on the Cash Drawer screen before taking an X reading or closing the day.
              </Text>
              <TouchableOpacity style={s.btn} onPress={() => router.push('/cash-drawer')}>
                <Text style={s.btnText}>Go to Cash Drawer</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ── X reading ── */}
          {!zResult && hasOpenSession && summary && (
            <>
              <View style={s.card}>
                <View style={s.rowBetween}>
                  <Text style={s.cardTitle}>X Reading</Text>
                  <TouchableOpacity onPress={shareX} style={s.shareChip}>
                    <Ionicons name="share-outline" size={15} color={Colors.primary} />
                    <Text style={s.shareChipText}>Share</Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.cardSub}>Live totals. The drawer stays open.</Text>

                <Row label="Sales" value={String(summary.salesCount)} />
                <Row label="Gross sales" value={formatKES(summary.totalSalesCents)} />
                <Row label="VAT" value={formatKES(summary.totalVatCents)} />

                <View style={s.divider} />
                {summary.paymentBreakdown.length === 0 ? (
                  <Text style={s.muted}>No payments taken yet this shift.</Text>
                ) : (
                  summary.paymentBreakdown.map((p) => (
                    <Row key={p.method} label={`${p.method} (${p.count})`} value={formatKES(p.amountCents)} />
                  ))
                )}

                <View style={s.divider} />
                <Row label="Opening float" value={formatKES(x!.session!.openingBalanceCents)} />
                <Row label="Cash sales" value={formatKES(summary.cashSalesCents)} />
                {summary.cashRefundsCents > 0 && (
                  <Row label="Cash refunds" value={`-${formatKES(summary.cashRefundsCents)}`} />
                )}
                {summary.expensesCents > 0 && (
                  <Row label="Cash paid out" value={`-${formatKES(summary.expensesCents)}`} />
                )}
                <Row label="Expected in drawer" value={formatKES(summary.expectedClosingCents)} bold />
              </View>

              {/* ── Z close ── */}
              {!counting ? (
                <TouchableOpacity style={[s.btn, s.dangerBtn]} onPress={() => setCounting(true)}>
                  <Ionicons name="lock-closed" size={18} color="#FFF" />
                  <Text style={s.btnText}>Close Day (Z Report)</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.card}>
                  <Text style={s.cardTitle}>Count the drawer</Text>
                  <Text style={s.cardSub}>
                    Count every note and coin, then enter the total. The Z report closes the till and
                    cannot be reversed.
                  </Text>
                  <Text style={s.label}>Counted cash (KES)</Text>
                  <TextInput
                    style={s.input}
                    value={countInput}
                    onChangeText={setCountInput}
                    keyboardType="numeric"
                    placeholder="0.00"
                    placeholderTextColor={Colors.textSecondary}
                    autoFocus
                  />
                  <TouchableOpacity
                    style={[s.btn, s.dangerBtn, zMut.isPending && { opacity: 0.7 }]}
                    onPress={submitZ}
                    disabled={zMut.isPending}
                  >
                    {zMut.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>Review & Close</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => { setCounting(false); setCountInput(''); }}>
                    <Text style={s.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
              )}
            </>
          )}

          {/* ── Manager oversight: other open tills ── */}
          {isManager && (
            <>
              <Text style={s.sectionTitle}>Open Tills</Text>
              {sessionsQ.isLoading ? (
                <ActivityIndicator color={Colors.primary} style={{ marginTop: 8 }} />
              ) : (sessionsQ.data ?? []).length === 0 ? (
                <View style={s.card}>
                  <Text style={s.muted}>Every till in {storeName} is closed.</Text>
                </View>
              ) : (
                (sessionsQ.data ?? []).map((sess) => (
                  <View key={sess.id} style={s.card}>
                    <View style={s.rowBetween}>
                      <View style={s.rowInline}>
                        <View style={s.liveDot} />
                        <Text style={s.tillName}>{sess.cashierName}</Text>
                      </View>
                      {sess.tillNumber ? <Text style={s.tillBadge}>Till #{sess.tillNumber}</Text> : null}
                    </View>
                    <Row
                      label="Open since"
                      value={new Date(sess.openedAt).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                    />
                    <Row label="Sales" value={String(sess.summary?.salesCount ?? 0)} />
                    <Row label="Taken" value={formatKES(sess.summary?.totalSalesCents ?? 0)} />
                    <Row label="Expected cash" value={formatKES(sess.expectedCashCents)} bold />
                    {sess.cashierId === cashierId && <Text style={s.thisIsYou}>This is your till</Text>}
                  </View>
                ))
              )}
            </>
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Row({ label, value, valueColor, bold }: { label: string; value: string; valueColor?: string; bold?: boolean }) {
  return (
    <View style={s.row}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, bold && { fontWeight: '800', fontSize: 15 }, valueColor ? { color: valueColor } : null]}>
        {value}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4, minWidth: 30 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 14, paddingBottom: 40 },
  card: { backgroundColor: Colors.card, borderRadius: 16, padding: 18, gap: 6 },
  iconWrap: { width: 48, height: 48, borderRadius: 24, backgroundColor: Colors.border, justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  cardSub: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 4 },
  zNumber: { fontSize: 12, fontWeight: '700', color: Colors.primary, letterSpacing: 0.5 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '700', color: Colors.text, backgroundColor: Colors.background },
  btn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 10 },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  dangerBtn: { backgroundColor: Colors.error },
  cancelBtn: { paddingVertical: 10, alignItems: 'center' },
  cancelText: { color: Colors.textSecondary, fontSize: 14 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowInline: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  rowLabel: { fontSize: 13, color: Colors.textSecondary, flex: 1 },
  rowValue: { fontSize: 14, fontWeight: '600', color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 6 },
  muted: { fontSize: 13, color: Colors.textSecondary },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 8 },
  shareChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: Colors.primary + '14' },
  shareChipText: { fontSize: 12, fontWeight: '700', color: Colors.primary },
  liveDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.success },
  tillName: { fontSize: 15, fontWeight: '700', color: Colors.text },
  tillBadge: { fontSize: 11, fontWeight: '700', color: Colors.textSecondary },
  thisIsYou: { fontSize: 11, color: Colors.primary, fontWeight: '600', marginTop: 4 },
});

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi, formatKES } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { Colors } from '../constants/theme';

interface Session {
  id: string;
  openingBalanceCents: number;
  openedAt: string;
  status: string;
  tillNumber?: number | null;
}
interface CloseResult {
  expectedBalanceCents: number;
  closingBalanceCents: number;
  varianceCents: number;
}

export default function CashDrawerScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const cashierId = user?.id ?? '';
  const { storeId } = useActiveStore();

  const [openingInput, setOpeningInput] = useState('');
  const [countInput, setCountInput] = useState('');
  const [closing, setClosing] = useState(false); // showing the close (count) form
  const [result, setResult] = useState<CloseResult | null>(null);

  const { data: session, isLoading, refetch } = useQuery<Session | null>({
    queryKey: ['cash-drawer', cashierId, storeId],
    queryFn: () => mobileApi.get<Session | null>(`/cash-drawer/current/${cashierId}/${storeId}`),
    enabled: !!cashierId && !!storeId,
  });

  const openMut = useMutation({
    mutationFn: () =>
      mobileApi.post('/cash-drawer/open', { storeId, openingBalanceCents: Math.round((parseFloat(openingInput) || 0) * 100) }),
    onSuccess: () => { setOpeningInput(''); qc.invalidateQueries({ queryKey: ['cash-drawer'] }); void refetch(); },
    onError: (e: any) => Alert.alert('Error', e?.message ?? 'Could not open the shift.'),
  });

  const closeMut = useMutation({
    mutationFn: () =>
      mobileApi.patch<CloseResult>(`/cash-drawer/${session!.id}/close`, {
        closingBalanceCents: Math.round((parseFloat(countInput) || 0) * 100),
      }),
    onSuccess: (res) => {
      setResult(res);
      setClosing(false);
      setCountInput('');
      qc.invalidateQueries({ queryKey: ['cash-drawer'] });
      void refetch();
    },
    onError: (e: any) => Alert.alert('Error', e?.message ?? 'Could not close the shift.'),
  });

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Cash Drawer</Text>
        <View style={{ width: 30 }} />
      </View>

      {isLoading ? (
        <View style={s.center}><ActivityIndicator size="large" color={Colors.primary} /></View>
      ) : (
        <ScrollView contentContainerStyle={s.content}>
          {/* Close result */}
          {result && (
            <View style={[s.card, { borderColor: Math.abs(result.varianceCents) > 0 ? Colors.warning : Colors.success, borderWidth: 1 }]}>
              <Text style={s.cardTitle}>Shift closed</Text>
              <Row label="Expected in drawer" value={formatKES(result.expectedBalanceCents)} />
              <Row label="Counted" value={formatKES(result.closingBalanceCents)} />
              <View style={s.divider} />
              <Row
                label={result.varianceCents === 0 ? 'Balanced' : result.varianceCents > 0 ? 'Over' : 'Short'}
                value={`${result.varianceCents >= 0 ? '+' : '-'}${formatKES(Math.abs(result.varianceCents))}`}
                valueColor={result.varianceCents === 0 ? Colors.success : Colors.error}
                bold
              />
              <TouchableOpacity style={[s.btn, { marginTop: 12 }]} onPress={() => setResult(null)}>
                <Text style={s.btnText}>Done</Text>
              </TouchableOpacity>
            </View>
          )}

          {!result && !session && (
            <View style={s.card}>
              <View style={s.iconWrap}><Ionicons name="lock-open-outline" size={28} color={Colors.primary} /></View>
              <Text style={s.cardTitle}>Open your shift</Text>
              <Text style={s.cardSub}>Count the cash float in the drawer and enter the amount to start your shift.</Text>
              <Text style={s.label}>Opening float (KES)</Text>
              <TextInput style={s.input} value={openingInput} onChangeText={setOpeningInput} keyboardType="numeric" placeholder="0.00" placeholderTextColor={Colors.textSecondary} />
              <TouchableOpacity style={[s.btn, openMut.isPending && { opacity: 0.7 }]} onPress={() => openMut.mutate()} disabled={openMut.isPending}>
                {openMut.isPending ? <ActivityIndicator color="#FFF" /> : <><Ionicons name="lock-open" size={18} color="#FFF" /><Text style={s.btnText}>Open Shift</Text></>}
              </TouchableOpacity>
            </View>
          )}

          {!result && session && (
            <>
              <View style={s.card}>
                <View style={s.statusRow}>
                  <View style={s.liveDot} />
                  <Text style={s.statusText}>Shift open</Text>
                </View>
                <Row label="Opened" value={new Date(session.openedAt).toLocaleString('en-KE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} />
                <Row label="Opening float" value={formatKES(session.openingBalanceCents)} />
                {session.tillNumber ? <Row label="Till" value={`#${session.tillNumber}`} /> : null}
              </View>

              {!closing ? (
                <TouchableOpacity style={[s.btn, s.closeBtn]} onPress={() => setClosing(true)}>
                  <Ionicons name="lock-closed" size={18} color="#FFF" />
                  <Text style={s.btnText}>Close Shift</Text>
                </TouchableOpacity>
              ) : (
                <View style={s.card}>
                  <Text style={s.cardTitle}>Count the drawer</Text>
                  <Text style={s.cardSub}>Count all the cash in the drawer and enter the total. We'll show the over/short after.</Text>
                  <Text style={s.label}>Counted cash (KES)</Text>
                  <TextInput style={s.input} value={countInput} onChangeText={setCountInput} keyboardType="numeric" placeholder="0.00" placeholderTextColor={Colors.textSecondary} autoFocus />
                  <TouchableOpacity style={[s.btn, s.closeBtn, closeMut.isPending && { opacity: 0.7 }]} onPress={() => closeMut.mutate()} disabled={closeMut.isPending}>
                    {closeMut.isPending ? <ActivityIndicator color="#FFF" /> : <Text style={s.btnText}>Submit & Close</Text>}
                  </TouchableOpacity>
                  <TouchableOpacity style={s.cancelBtn} onPress={() => { setClosing(false); setCountInput(''); }}>
                    <Text style={s.cancelText}>Cancel</Text>
                  </TouchableOpacity>
                </View>
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
      <Text style={[s.rowValue, bold && { fontWeight: '800', fontSize: 16 }, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4, minWidth: 30 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { padding: 16, gap: 14 },
  card: { backgroundColor: Colors.card, borderRadius: 16, padding: 18, gap: 8 },
  iconWrap: { width: 52, height: 52, borderRadius: 26, backgroundColor: Colors.primary + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  cardTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  cardSub: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19, marginBottom: 6 },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 4 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, fontWeight: '700', color: Colors.text, backgroundColor: Colors.background },
  btn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8 },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  closeBtn: { backgroundColor: Colors.error },
  cancelBtn: { paddingVertical: 10, alignItems: 'center' },
  cancelText: { color: Colors.textSecondary, fontSize: 14 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.success },
  statusText: { fontSize: 15, fontWeight: '700', color: Colors.success },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 5 },
  rowLabel: { fontSize: 13, color: Colors.textSecondary },
  rowValue: { fontSize: 14, fontWeight: '600', color: Colors.text },
  divider: { height: 1, backgroundColor: Colors.border, marginVertical: 4 },
});

import { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, ScrollView,
  Alert, Modal, RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { mobileApi, formatKES } from '../lib/api';
import { useAuthStore } from '../stores/auth';
import { useActiveStore } from '../lib/useActiveStore';
import { parseAmountToCents } from '../lib/dayClose';
import {
  findMyEmployee, shiftHours, formatDuration, totalHours, todaysEntries,
  normalizeStatus, validateLeaveRequest, LEAVE_TYPES,
  type ClockStatus, type TimeEntry, type EmployeeRow, type LeaveRow, type AdvanceRow,
} from '../lib/hr';
import { Colors } from '../constants/theme';

const STATUS_COLOR: Record<string, string> = {
  PENDING: Colors.warning,
  APPROVED: Colors.success,
  REJECTED: Colors.error,
};

type Sheet = 'none' | 'leave' | 'advance';

/**
 * "My HR" — the self-service half, available to every role including cashiers
 * and waiters, who never see the Manage tab.
 *
 * Clock in/out is the reason this screen exists: a phone in a pocket beats a
 * shared terminal at the counter, and it is the one HR action every member of
 * staff performs twice a day.
 */
export default function MyHrScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const userId = user?.id ?? '';
  const { businessId, storeId } = useActiveStore();

  const [sheet, setSheet] = useState<Sheet>('none');
  const [leaveType, setLeaveType] = useState(LEAVE_TYPES[0]);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [leaveReason, setLeaveReason] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceReason, setAdvanceReason] = useState('');

  const statusQ = useQuery<ClockStatus>({
    queryKey: ['clock-status', userId, businessId],
    queryFn: () => mobileApi.get<ClockStatus>(`/hr/time-entries/status?businessId=${businessId}&userId=${userId}`),
    enabled: !!userId && !!businessId,
    staleTime: 20_000,
  });

  const entriesQ = useQuery<TimeEntry[]>({
    queryKey: ['time-entries', userId, businessId],
    queryFn: () => mobileApi.get<TimeEntry[]>(`/hr/time-entries?businessId=${businessId}&userId=${userId}`),
    enabled: !!userId && !!businessId,
    staleTime: 60_000,
  });

  // Leave and advances are keyed by Employee.id, not userId — resolve it once.
  const employeesQ = useQuery<EmployeeRow[]>({
    queryKey: ['hr-employees', businessId],
    queryFn: () => mobileApi.get<EmployeeRow[]>(`/hr/employees?businessId=${businessId}`),
    enabled: !!businessId,
    staleTime: 10 * 60_000,
  });
  const myEmployee = findMyEmployee(employeesQ.data, userId);

  const leavesQ = useQuery<LeaveRow[]>({
    queryKey: ['my-leave', myEmployee?.id],
    queryFn: () => mobileApi.get<LeaveRow[]>(`/hr/leave/${myEmployee!.id}`),
    enabled: !!myEmployee?.id,
    staleTime: 60_000,
  });

  const advancesQ = useQuery<AdvanceRow[]>({
    queryKey: ['my-advances', businessId, myEmployee?.id],
    queryFn: () => mobileApi.get<AdvanceRow[]>(`/hr/salary-advances?businessId=${businessId}&employeeId=${myEmployee!.id}`),
    enabled: !!businessId && !!myEmployee?.id,
    staleTime: 60_000,
  });

  const clockMut = useMutation({
    mutationFn: (action: 'clock-in' | 'clock-out') =>
      mobileApi.post(`/hr/time-entries/${action}`, { userId, businessId, storeId }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clock-status'] });
      qc.invalidateQueries({ queryKey: ['time-entries'] });
      qc.invalidateQueries({ queryKey: ['attendance-board'] });
    },
    onError: (e: any) => Alert.alert('Could not update the clock', e?.message ?? 'Please try again.'),
  });

  const leaveMut = useMutation({
    mutationFn: () =>
      mobileApi.post('/hr/leave', {
        employeeId: myEmployee!.id,
        type: leaveType,
        startDate: startDate.trim(),
        endDate: endDate.trim(),
        reason: leaveReason.trim() || undefined,
      }),
    onSuccess: () => {
      setSheet('none'); setStartDate(''); setEndDate(''); setLeaveReason('');
      qc.invalidateQueries({ queryKey: ['my-leave'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      Alert.alert('Sent', 'Your leave request is with a manager.');
    },
    onError: (e: any) => Alert.alert('Could not send', e?.message ?? 'Please try again.'),
  });

  const advanceMut = useMutation({
    mutationFn: (amountCents: number) =>
      mobileApi.post('/hr/salary-advances', {
        businessId,
        employeeId: myEmployee!.id,
        amountCents,
        reason: advanceReason.trim(),
      }),
    onSuccess: () => {
      setSheet('none'); setAdvanceAmount(''); setAdvanceReason('');
      qc.invalidateQueries({ queryKey: ['my-advances'] });
      qc.invalidateQueries({ queryKey: ['approvals'] });
      Alert.alert('Sent', 'Your advance request is with a manager.');
    },
    onError: (e: any) => Alert.alert('Could not send', e?.message ?? 'Please try again.'),
  });

  function submitLeave() {
    const problem = validateLeaveRequest(startDate, endDate);
    if (problem) { Alert.alert('Check the dates', problem); return; }
    leaveMut.mutate();
  }

  function submitAdvance() {
    const cents = parseAmountToCents(advanceAmount);
    if (cents === null || cents === 0) { Alert.alert('Enter an amount', 'How much do you need?'); return; }
    if (!advanceReason.trim()) { Alert.alert('Add a reason', 'Managers approve advances faster with a reason.'); return; }
    advanceMut.mutate(cents);
  }

  const status = statusQ.data;
  const entries = entriesQ.data ?? [];
  const today = todaysEntries(entries);
  const weekHours = totalHours(entries.slice(0, 20));

  return (
    <SafeAreaView edges={['top']} style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>My HR</Text>
        <View style={{ width: 30 }} />
      </View>

      <ScrollView
        contentContainerStyle={s.content}
        refreshControl={
          <RefreshControl
            refreshing={statusQ.isRefetching || entriesQ.isRefetching}
            onRefresh={() => { void statusQ.refetch(); void entriesQ.refetch(); void leavesQ.refetch(); }}
            colors={[Colors.primary]}
          />
        }
      >
        {/* ── Clock ── */}
        <View style={[s.clockCard, status?.isClockedIn && { borderColor: Colors.success, borderWidth: 1 }]}>
          {statusQ.isLoading ? (
            <ActivityIndicator color={Colors.primary} />
          ) : status?.isClockedIn ? (
            <>
              <View style={s.liveRow}>
                <View style={s.liveDot} />
                <Text style={s.liveText}>On shift</Text>
              </View>
              <Text style={s.bigTime}>{formatDuration(status.clockedInSince ?? '')}</Text>
              <Text style={s.since}>
                Since {new Date(status.clockedInSince ?? '').toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
              </Text>
              <TouchableOpacity
                style={[s.clockBtn, { backgroundColor: Colors.error }]}
                onPress={() => clockMut.mutate('clock-out')}
                disabled={clockMut.isPending}
              >
                {clockMut.isPending ? <ActivityIndicator color="#FFF" /> : (
                  <><Ionicons name="log-out-outline" size={20} color="#FFF" /><Text style={s.clockBtnText}>Clock Out</Text></>
                )}
              </TouchableOpacity>
            </>
          ) : (
            <>
              <Ionicons name="time-outline" size={34} color={Colors.textSecondary} />
              <Text style={s.offText}>Not on shift</Text>
              <TouchableOpacity
                style={[s.clockBtn, { backgroundColor: Colors.success }]}
                onPress={() => clockMut.mutate('clock-in')}
                disabled={clockMut.isPending}
              >
                {clockMut.isPending ? <ActivityIndicator color="#FFF" /> : (
                  <><Ionicons name="log-in-outline" size={20} color="#FFF" /><Text style={s.clockBtnText}>Clock In</Text></>
                )}
              </TouchableOpacity>
            </>
          )}
        </View>

        <View style={s.statsRow}>
          <View style={s.statCard}>
            <Text style={s.statValue}>{today.length}</Text>
            <Text style={s.statLabel}>Shifts today</Text>
          </View>
          <View style={s.statCard}>
            <Text style={s.statValue}>{weekHours}h</Text>
            <Text style={s.statLabel}>Recent hours</Text>
          </View>
        </View>

        {/* ── No employee record ── */}
        {!employeesQ.isLoading && !myEmployee && (
          <View style={s.card}>
            <Text style={s.muted}>
              Leave and advances need an HR record. Ask an owner to add you under Staff & HR on the
              web app — clocking in works either way.
            </Text>
          </View>
        )}

        {/* ── Leave ── */}
        {myEmployee && (
          <>
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>My Leave</Text>
              <TouchableOpacity onPress={() => setSheet('leave')}>
                <Text style={s.link}>Request</Text>
              </TouchableOpacity>
            </View>
            {(leavesQ.data ?? []).length === 0 ? (
              <View style={s.card}><Text style={s.muted}>No leave requests yet.</Text></View>
            ) : (
              (leavesQ.data ?? []).slice(0, 5).map((l) => (
                <View key={l.id} style={s.card}>
                  <View style={s.rowBetween}>
                    <Text style={s.rowTitle}>{l.type}</Text>
                    <View style={[s.pill, { backgroundColor: (STATUS_COLOR[normalizeStatus(l.status)]) + '1A' }]}>
                      <Text style={[s.pillText, { color: STATUS_COLOR[normalizeStatus(l.status)] }]}>
                        {normalizeStatus(l.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.meta}>
                    {new Date(l.startDate).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })}
                    {' → '}
                    {new Date(l.endDate).toLocaleDateString('en-KE', { day: '2-digit', month: 'short' })}
                  </Text>
                  {l.reason ? <Text style={s.meta}>{l.reason}</Text> : null}
                </View>
              ))
            )}

            {/* ── Advances ── */}
            <View style={s.sectionHead}>
              <Text style={s.sectionTitle}>Salary Advances</Text>
              <TouchableOpacity onPress={() => setSheet('advance')}>
                <Text style={s.link}>Request</Text>
              </TouchableOpacity>
            </View>
            {(advancesQ.data ?? []).length === 0 ? (
              <View style={s.card}><Text style={s.muted}>No advance requests yet.</Text></View>
            ) : (
              (advancesQ.data ?? []).slice(0, 5).map((a) => (
                <View key={a.id} style={s.card}>
                  <View style={s.rowBetween}>
                    <Text style={s.rowTitle}>{formatKES(a.amountCents)}</Text>
                    <View style={[s.pill, { backgroundColor: (STATUS_COLOR[normalizeStatus(a.status)] ?? Colors.textSecondary) + '1A' }]}>
                      <Text style={[s.pillText, { color: STATUS_COLOR[normalizeStatus(a.status)] ?? Colors.textSecondary }]}>
                        {a.status}
                      </Text>
                    </View>
                  </View>
                  <Text style={s.meta}>{a.reason}</Text>
                </View>
              ))
            )}
          </>
        )}

        {/* ── Recent shifts ── */}
        <Text style={s.sectionTitle}>Recent Shifts</Text>
        {entries.length === 0 ? (
          <View style={s.card}><Text style={s.muted}>No shifts recorded yet.</Text></View>
        ) : (
          entries.slice(0, 8).map((e) => (
            <View key={e.id} style={s.card}>
              <View style={s.rowBetween}>
                <Text style={s.rowTitle}>
                  {new Date(e.clockIn).toLocaleDateString('en-KE', { weekday: 'short', day: '2-digit', month: 'short' })}
                </Text>
                <Text style={s.hours}>{shiftHours(e)}h</Text>
              </View>
              <Text style={s.meta}>
                {new Date(e.clockIn).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })}
                {' → '}
                {e.clockOut
                  ? new Date(e.clockOut).toLocaleTimeString('en-KE', { hour: '2-digit', minute: '2-digit' })
                  : 'still on shift'}
              </Text>
            </View>
          ))
        )}
      </ScrollView>

      {/* ── Request sheets ── */}
      <Modal visible={sheet !== 'none'} animationType="slide" transparent onRequestClose={() => setSheet('none')}>
        <View style={s.modalBackdrop}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{sheet === 'leave' ? 'Request Leave' : 'Request Advance'}</Text>
              <TouchableOpacity onPress={() => setSheet('none')} accessibilityRole="button" accessibilityLabel="Close" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="close" size={24} color={Colors.text} />
              </TouchableOpacity>
            </View>

            {sheet === 'leave' ? (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
                <Text style={s.label}>Type</Text>
                <View style={s.chipWrap}>
                  {LEAVE_TYPES.map((t) => (
                    <TouchableOpacity key={t} style={[s.chip, leaveType === t && s.chipActive]} onPress={() => setLeaveType(t)}>
                      <Text style={[s.chipText, leaveType === t && { color: '#FFF' }]}>{t}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={s.label}>From</Text>
                <TextInput style={s.input} value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textSecondary} />

                <Text style={s.label}>To</Text>
                <TextInput style={s.input} value={endDate} onChangeText={setEndDate} placeholder="YYYY-MM-DD" placeholderTextColor={Colors.textSecondary} />

                <Text style={s.label}>Reason</Text>
                <TextInput style={s.input} value={leaveReason} onChangeText={setLeaveReason} placeholder="Optional" placeholderTextColor={Colors.textSecondary} />
              </ScrollView>
            ) : (
              <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 420 }}>
                <Text style={s.label}>Amount (KES)</Text>
                <TextInput style={s.input} value={advanceAmount} onChangeText={setAdvanceAmount} keyboardType="numeric" placeholder="0.00" placeholderTextColor={Colors.textSecondary} autoFocus />

                <Text style={s.label}>Reason</Text>
                <TextInput style={s.input} value={advanceReason} onChangeText={setAdvanceReason} placeholder="e.g. School fees" placeholderTextColor={Colors.textSecondary} />
              </ScrollView>
            )}

            <TouchableOpacity
              style={[s.btn, (leaveMut.isPending || advanceMut.isPending) && { opacity: 0.7 }]}
              onPress={sheet === 'leave' ? submitLeave : submitAdvance}
              disabled={leaveMut.isPending || advanceMut.isPending}
            >
              {(leaveMut.isPending || advanceMut.isPending) ? <ActivityIndicator color="#FFF" /> : (
                <Text style={s.btnText}>Send Request</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 12, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border },
  backBtn: { padding: 4, minWidth: 30 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  content: { padding: 16, gap: 10, paddingBottom: 40 },
  clockCard: { backgroundColor: Colors.card, borderRadius: 18, padding: 24, alignItems: 'center', gap: 6 },
  liveRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  liveDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: Colors.success },
  liveText: { fontSize: 14, fontWeight: '700', color: Colors.success },
  bigTime: { fontSize: 38, fontWeight: '800', color: Colors.text },
  since: { fontSize: 13, color: Colors.textSecondary },
  offText: { fontSize: 16, fontWeight: '700', color: Colors.textSecondary, marginTop: 4 },
  clockBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 999, marginTop: 12, minWidth: 190 },
  clockBtnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
  statsRow: { flexDirection: 'row', gap: 10 },
  statCard: { flex: 1, backgroundColor: Colors.card, borderRadius: 14, padding: 14, alignItems: 'center', gap: 2 },
  statValue: { fontSize: 19, fontWeight: '800', color: Colors.text },
  statLabel: { fontSize: 11, color: Colors.textSecondary },
  sectionHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 },
  sectionTitle: { fontSize: 12, fontWeight: '700', color: Colors.textSecondary, textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 12 },
  link: { fontSize: 13, fontWeight: '700', color: Colors.primary, marginTop: 12 },
  card: { backgroundColor: Colors.card, borderRadius: 14, padding: 14, gap: 4 },
  rowBetween: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowTitle: { fontSize: 14, fontWeight: '700', color: Colors.text },
  hours: { fontSize: 14, fontWeight: '700', color: Colors.primary },
  meta: { fontSize: 12, color: Colors.textSecondary },
  muted: { fontSize: 13, color: Colors.textSecondary, lineHeight: 19 },
  pill: { paddingHorizontal: 9, paddingVertical: 4, borderRadius: 999 },
  pillText: { fontSize: 10, fontWeight: '800' },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: Colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 32 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  modalTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: Colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: Colors.text, backgroundColor: Colors.background },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.background, borderWidth: 1, borderColor: Colors.border },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 11, fontWeight: '600', color: Colors.text },
  btn: { backgroundColor: Colors.primary, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#FFF', fontSize: 15, fontWeight: '700' },
});

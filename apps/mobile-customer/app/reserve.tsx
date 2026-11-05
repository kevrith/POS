import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { apiPost } from '../lib/api';
import { useSessionStore } from '../stores/session';
import { Colors } from '../constants/theme';

const HOURS = [12, 13, 14, 15, 17, 18, 19, 20, 21];

/** Build an ISO timestamp for the chosen day (0 = today, 1 = tomorrow) at `hour`. */
function slotToIso(dayOffset: 0 | 1, hour: number): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

export default function ReserveScreen() {
  const router = useRouter();
  const businessId = useSessionStore((s) => s.businessId);
  const sessionName = useSessionStore((s) => s.customerName);
  const sessionPhone = useSessionStore((s) => s.phone);

  const [name, setName] = useState(sessionName ?? '');
  const [phone, setPhone] = useState(sessionPhone ?? '');
  const [partySize, setPartySize] = useState(2);
  const [day, setDay] = useState<0 | 1>(0);
  const [hour, setHour] = useState<number | null>(null);
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);

  // Hide past hours when "Today" is selected.
  const nowHour = new Date().getHours();
  const hours = day === 0 ? HOURS.filter((h) => h > nowHour) : HOURS;

  async function submit() {
    if (!name.trim()) return Alert.alert('Required', 'Please enter your name.');
    if (!phone.trim()) return Alert.alert('Required', 'Please enter your phone number.');
    if (hour == null) return Alert.alert('Required', 'Please pick a time.');
    setLoading(true);
    try {
      const res = await apiPost<{ tableNumber: string; reservationTime: string }>('/portal/reserve', {
        businessId,
        customerName: name.trim(),
        phone: phone.trim(),
        partySize,
        reservationTime: slotToIso(day, hour),
        notes: notes.trim() || undefined,
      });
      Alert.alert(
        'Table reserved',
        `Table ${res.tableNumber} is booked for ${partySize} on ${new Date(res.reservationTime).toLocaleString('en-KE')}.`,
        [{ text: 'Done', onPress: () => router.back() }],
      );
    } catch (e: any) {
      Alert.alert('Could not reserve', e?.message ?? 'No tables available at that time. Try another slot.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <SafeAreaView edges={['top']} style={styles.safe}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} style={styles.back} accessibilityRole="button" accessibilityLabel="Back" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Ionicons name="arrow-back" size={22} color={Colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Reserve a Table</Text>
        <View style={{ width: 30 }} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.card}>
            <Text style={styles.label}>Your Name</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Full name" placeholderTextColor={Colors.textSecondary} />
            <Text style={styles.label}>Phone</Text>
            <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+254 7XX XXX XXX" keyboardType="phone-pad" placeholderTextColor={Colors.textSecondary} />

            <Text style={styles.label}>Party Size</Text>
            <View style={styles.partyRow}>
              <TouchableOpacity style={styles.partyBtn} onPress={() => setPartySize((p) => Math.max(1, p - 1))} accessibilityRole="button" accessibilityLabel="Decrease" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="remove" size={20} color={Colors.primary} />
              </TouchableOpacity>
              <Text style={styles.partyValue}>{partySize}</Text>
              <TouchableOpacity style={styles.partyBtn} onPress={() => setPartySize((p) => Math.min(20, p + 1))} accessibilityRole="button" accessibilityLabel="Add" hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
                <Ionicons name="add" size={20} color={Colors.primary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Day</Text>
            <View style={styles.dayRow}>
              {([0, 1] as const).map((d) => (
                <TouchableOpacity key={d} style={[styles.dayChip, day === d && styles.chipActive]} onPress={() => { setDay(d); setHour(null); }}>
                  <Text style={[styles.chipText, day === d && { color: '#FFF' }]}>{d === 0 ? 'Today' : 'Tomorrow'}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>Time</Text>
            {hours.length === 0 ? (
              <Text style={styles.muted}>No more slots today — try tomorrow.</Text>
            ) : (
              <View style={styles.hourGrid}>
                {hours.map((h) => (
                  <TouchableOpacity key={h} style={[styles.hourChip, hour === h && styles.chipActive]} onPress={() => setHour(h)}>
                    <Text style={[styles.chipText, hour === h && { color: '#FFF' }]}>{h}:00</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}

            <Text style={styles.label}>Notes (optional)</Text>
            <TextInput style={[styles.input, styles.multiline]} value={notes} onChangeText={setNotes} placeholder="e.g. window seat, birthday" placeholderTextColor={Colors.textSecondary} multiline />
          </View>

          <TouchableOpacity style={[styles.submit, loading && { opacity: 0.7 }]} onPress={submit} disabled={loading}>
            {loading ? <ActivityIndicator color="#FFF" /> : (
              <>
                <Ionicons name="calendar" size={18} color="#FFF" />
                <Text style={styles.submitText}>Confirm Reservation</Text>
              </>
            )}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 14, backgroundColor: Colors.card, borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  back: { padding: 2 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: Colors.text },
  content: { padding: 16, gap: 16, paddingBottom: 40 },
  card: {
    backgroundColor: Colors.card, borderRadius: 16, padding: 16, gap: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 3, elevation: 1,
  },
  label: { fontSize: 13, fontWeight: '600', color: Colors.text, marginTop: 8 },
  input: {
    borderWidth: 1, borderColor: Colors.border, borderRadius: 10,
    paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, color: Colors.text, backgroundColor: Colors.background,
  },
  multiline: { minHeight: 56, textAlignVertical: 'top' },
  partyRow: { flexDirection: 'row', alignItems: 'center', gap: 20, alignSelf: 'flex-start' },
  partyBtn: {
    width: 40, height: 40, borderRadius: 20, borderWidth: 1, borderColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  partyValue: { fontSize: 22, fontWeight: '800', color: Colors.text, minWidth: 30, textAlign: 'center' },
  dayRow: { flexDirection: 'row', gap: 10 },
  dayChip: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', backgroundColor: Colors.background },
  hourGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  hourChip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: Colors.border, backgroundColor: Colors.background },
  chipActive: { backgroundColor: Colors.primary, borderColor: Colors.primary },
  chipText: { fontSize: 14, fontWeight: '600', color: Colors.text },
  muted: { fontSize: 13, color: Colors.textSecondary, fontStyle: 'italic' },
  submit: {
    backgroundColor: Colors.primary, borderRadius: 14, paddingVertical: 15,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
  },
  submitText: { color: '#FFF', fontSize: 16, fontWeight: '700' },
});

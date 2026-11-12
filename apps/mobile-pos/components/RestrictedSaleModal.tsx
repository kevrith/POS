import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Modal, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { approvalBody, approvalReady, canApproveAlone, type RestrictedApprovalInput, type RestrictedFound } from '../lib/restricted';

/**
 * Shown when the till refuses a prescription-only or controlled medicine. The right way is to dispense it from a prescription;
 * this is the way round, for a manager's decision. It is recorded, and a controlled drug goes on the register.
 */
export default function RestrictedSaleModal({ found, role, busy, onCancel, onApprove }: {
  found: RestrictedFound[]; role?: string | null; busy?: boolean; onCancel: () => void; onApprove: (a: RestrictedApprovalInput) => void;
}) {
  const [a, setA] = useState<RestrictedApprovalInput>({ reason: '' });
  const controlled = found.some((f) => f.controlled);
  const alone = canApproveAlone(role);
  const ready = approvalReady(a, role, controlled);
  const set = (k: keyof RestrictedApprovalInput) => (v: string) => setA((s) => ({ ...s, [k]: v }));
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.backdrop}>
        <View style={styles.card}>
          <ScrollView keyboardShouldPersistTaps="handled">
            <Text style={styles.title}>Needs a prescription</Text>
            <Text style={styles.body}>{found.map((f) => f.name).join(', ')} {found.length > 1 ? 'are' : 'is'} prescription-only{controlled ? ' or controlled' : ''}. Dispense from Prescriptions, or have a manager approve a sale without one. This is recorded.</Text>
            <Text style={styles.label}>Why is it being sold without a prescription?</Text>
            <TextInput style={styles.input} value={a.reason} onChangeText={set('reason')} placeholder="Reason" accessibilityLabel="Reason" multiline />
            {!alone && (
              <>
                <Text style={styles.label}>Manager PIN</Text>
                <TextInput style={styles.input} value={a.managerPin ?? ''} onChangeText={set('managerPin')} placeholder="PIN" accessibilityLabel="Manager PIN" secureTextEntry keyboardType="number-pad" maxLength={8} />
              </>
            )}
            {controlled && (
              <>
                <Text style={styles.label}>Sold to (goes on the controlled drugs register)</Text>
                <TextInput style={styles.input} value={a.patientName ?? ''} onChangeText={set('patientName')} placeholder="Full name" accessibilityLabel="Sold to" />
                <TextInput style={styles.input} value={a.patientIdNumber ?? ''} onChangeText={set('patientIdNumber')} placeholder="ID number (optional)" accessibilityLabel="ID number" />
                <TextInput style={styles.input} value={a.prescriberName ?? ''} onChangeText={set('prescriberName')} placeholder="Prescriber (optional)" accessibilityLabel="Prescriber" />
              </>
            )}
          </ScrollView>
          <View style={styles.row}>
            <TouchableOpacity style={[styles.btn, styles.cancel]} onPress={onCancel} accessibilityRole="button"><Text style={styles.cancelText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.btn, styles.ok, !ready && styles.disabled]} disabled={!ready || busy} onPress={() => onApprove(approvalBody(a))} accessibilityRole="button">
              {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.okText}>Approve and sell</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 16 },
  card: { backgroundColor: '#fff', borderRadius: 14, padding: 16, maxHeight: '90%' },
  title: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 6 },
  body: { fontSize: 14, color: '#374151', marginBottom: 10 },
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginTop: 8, marginBottom: 4 },
  input: { borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, marginBottom: 6 },
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  btn: { flex: 1, height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  cancel: { backgroundColor: '#F3F4F6' }, cancelText: { color: '#374151', fontWeight: '600' },
  ok: { backgroundColor: '#B91C1C' }, okText: { color: '#fff', fontWeight: '700' },
  disabled: { opacity: 0.4 },
});
